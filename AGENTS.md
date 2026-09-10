# AGENTS.md — x-threadpick 工作区指南

## 项目概述

浏览器书签扩展（代号 x-threadpick）。定位已从「多维书签管理器」演进为「个人上下文记忆层」：核心不是整理书签，而是让用户敢放心关掉 Tab——Capture 摩擦足够低，未来 Retrieval 足够强。

**同时支持 Chrome 和 Firefox**，并配自建后端：账号密码登录，同步 url + title + 摘要 + note + 分类属性。

## 仓库状态（2026-09）

- Monorepo 已初始化（pnpm workspaces），尚未 git 化。
- `packages/shared` — zod schema 唯一真源（Bookmark / View / auth / sync / normalizeUrl）。
- `apps/server` — Hono + Drizzle + better-sqlite3；auth（JWT 30 天）+ sync（增量拉推、LWW）+ CLI（`pnpm cli create-user|set-password`）+ 冒烟脚本（`pnpm smoke`）。better-sqlite3 驱动是**同步 API**，查询不加 await。
- `apps/extension` — WXT 0.21 + React + Dexie；已完成切片：popup 入口 + options 导入器（getTree 展平 → 搜索勾选 → 规范化去重 → 入库 Inbox）。React 集成包名是 `@wxt-dev/module-react`（非 @wxt-dev/react）。构建：`pnpm build:ext` / `build:ext:firefox`。
- 环境要求：Node ≥20；`pnpm check` 全绿是提交底线。
- 待做：扩展端登录 + 同步客户端 → 批量导入 → 四维筛选 → View → Capture 弹窗。

## 必读文档

- `docs/产品来源-名字思绪.md` — 产品来源与全部思路（Q&A 形式），含定位推演、竞品分析（Pinport / TagChoose / Bookmark Butler / FindMark）、MVP 范围。改动产品行为前先读它。

## 已确定的产品决策（实现时不要违背）

1. **一份数据 + 多维属性 + 动态视图**：同一 URL 只存一份，绝不通过复制到多个文件夹模拟多归属。
2. **分类模型：4 个类型化维度，不做自由多 tag**（2026-09 决策）：Topic（主题，多选）/ Type（形态，多选）/ Purpose（用途，多选）/ Status（状态，**单选，取值间无流转语义、互不关联**——2026-09 修订：取消「Inbox → Reading → Done」流转顺序概念，Status 就是一组只能单选的标签；**Inbox 是系统默认值，不可删除**，新收藏永远默认 Inbox，不存在「未设置」状态）。每个维度的取值用户可自定义（增删改名），但维度本身 MVP 固定这 4 个。是类型化的 facet，不是扁平 tag——这是与 Pinport 的核心区别。存储层统一为 typed attributes 模型（dimension → values[]），将来加维度或加「自由 tag」维度无需数据迁移。
3. **书签三层结构**：Source（URL/标题/摘要/作者）+ Classification（四维）+ Context（「为什么收藏」的一句话，最重要的一层，参与搜索）。
4. **View = 筛选条件 + 排序规则**，不是书签副本；删除视图只删入口，不删书签。
5. **收藏时零强制输入**：新收藏默认进 Inbox，四维属性允许后补；AI 只能从已有分类中建议，绝不静默覆盖或自动造新标签。
6. **核心动作是「保存并关闭 Tab」**（Cmd/Ctrl+Shift+S 弹出 Capture 面板，一句话可选输入，一键存完关页）。
7. **主动提示（Resurface）不弹窗**：发现当前页面与旧收藏相关时，只在扩展图标上显示 badge 数字，用户主动点开才展示。
8. **筛选交互规则**：跨维度默认 AND；同维度多选默认 OR（Topic 维度提供「全部满足」切换）；候选选项的计数按*其他维度*条件动态计算，已选选项永不消失；已选条件始终可见、可撤销。

## 技术约束

- **双浏览器**：Chrome（MV3）+ Firefox。用 WXT 框架一套代码两份构建（`wxt build --browser firefox`），它自动处理 background 差异（Firefox 是 event page 而非 service worker）。API 调用统一走 `webextension-polyfill` 风格的 `browser.*`。Side Panel 需按浏览器分叉：Chrome 用 `sidePanel` API，Firefox 用 `sidebar_action`。
- `chrome.bookmarks` / `browser.bookmarks` 是树形单父节点结构、无标签字段，且两个浏览器都有该 API → 原生书签**只作导入来源**（getTree + search）；多维属性与视图存扩展本地库并同步到后端。
- **前后端协议用 zod 定义**，schema 放 monorepo 共享包（如 `packages/shared`），前后端共用同一份类型，禁止两端各写一份。同步对象：bookmark（url / title / summary / note / 四维属性 / 时间戳）与 view。
- 认证：账号密码（email + password），JWT access/refresh token，token 存 `browser.storage.local`。**v1 只有账号密码**：不做 OAuth / 注册页 / 找回密码 / 邮箱验证；账号由 server 包 CLI 创建（`cli create-user` / `cli set-password`）；密码 argon2/bcrypt 哈希、JWT 密钥走环境变量、部署 HTTPS；access token 有效期放宽到 30 天，不做 refresh 轮换。
- **Backend 是普通 HTTP JSON API**（REST，Hono + Drizzle + SQLite），不是 CLI / GraphQL / gRPC；CLI 只作 server 包内部管理命令。**架构是 offline-first**：扩展本地 IndexedDB 是主库、日常读写全在本地，后端只是同步/备份层，挂了不影响使用。
- 同步对象带 `updatedAt` + 软删除 tombstone，客户端增量拉取（`?since=`）+ 推送本地变更，冲突 last-write-wins。
- URL 判重前必须规范化（剥 `utm_*` 等追踪参数、统一大小写域名）。
- **v1 无 File Storage**：同步对象全是结构化文本；页面快照属远期（届时对象存储 + DB 存引用）。
- MVP 不上 AI / embedding；语义检索与 Resurface 属于第二阶段。

## 开发规范（dev-ts：静态工具优先 + zod 唯一真源）

**原则：机器能判断的 → tsc / ESLint / Prettier 强制；机器难判的 → 本节文字。不重复静态工具已能查的规则。** 规范源：`/Volumes/machub_app/proj/skill-hub/dev-ts/`（SKILL.md + `assets/` 配置模板 + `references/rules.md`），脚手架初始化时按其「新项目接入」流程落地。

### 静态检查底座（初始化脚手架时必须配齐）

- tsconfig 基线：`strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noImplicitReturns`、`noFallthroughCasesInSwitch`、`noImplicitOverride`、`useUnknownInCatchVariables`、`noUnusedLocals`、`noUnusedParameters`、`forceConsistentCasingInFileNames`。不为通过编译而放松。
- ESLint Flat Config（`eslint.config.mjs`，复制自 skill assets，按项目调 ignores，如 WXT 的 `.wxt/**`、`.output/**`）：`recommendedTypeChecked` + `projectService: true`；强制 `no-explicit-any`、全套 `no-unsafe-*`、`no-unsafe-type-assertion`、`no-non-null-assertion`、`no-floating-promises`（ignoreVoid: false）、`no-misused-promises`、`switch-exhaustiveness-check`、`consistent-type-imports`；`reportUnusedDisableDirectives: 'error'`。
- 三个包（extension / server / shared）统一提供 `check` = `typecheck`（tsc --noEmit）+ `lint`（eslint . --max-warnings 0）+ `format:check`（prettier . --check），**提交前必须通过**。
- 检查失败优先改代码。禁止用 any / `as unknown as X` / 非空断言 `!` / eslint-disable / 关 strict 掩盖问题；确需豁免（典型：第三方无类型）最小范围 + 注明原因，能转 `unknown` 立即转。

### zod = 数据结构唯一真源（dev-ts 协议硬约束）

- schema 是契约：所有跨边界数据结构——API 请求/响应、同步协议、扩展本地存储记录——只在 `packages/shared` 用 zod 定义**一份**。
- 类型不手写第二遍：TS 类型一律 `z.infer<...>` 派生，禁止前后端手写同构 interface/type。
- **禁止手写消息解析**：不用 `typeof` 拼装、逐属性 if 校验、`as` 收窄冒充解析，一律 `schema.parse()` / `safeParse()`。数据出入系统边界（HTTP 响应、browser.storage / IndexedDB 读取、环境变量）必须运行时校验。
- **改协议改 schema**：字段增删改从 schema 出发，让类型与运行时校验一起变，不允许只改一边。
- 服务端 Drizzle 表对齐 shared schema（对外协议以 shared 为准），不引入第二份类型真源。

### 工程决策（静态工具难判）

- 互斥状态用 discriminated union，不用多个 boolean 拼合法状态。
- 异步：有依赖顺序 await；相互独立用 `Promise.all`；大量并发加并发限制；不无意串行化。
- 架构从简：简单类型 + 简单对象 + 函数 + 组合优先；无真实需求不加 Manager / Factory / 复杂继承 / 复杂泛型 / 万能 utils。
- 模块系统跟随各包构建配置（WXT / Node），不混用 `require` 与 `import`。

## MVP 范围

**第一个垂直切片（跑通链路）**：扩展读取浏览器书签 → 搜索/勾选**单个书签**导入 → 规范化 URL 去重 → 存本地库 → 展示 url + title + 空 summary + 空 note + Status=Inbox。用户不需要知道书签存放路径：`bookmarks.getTree()` 返回整棵树，UI 展平成可搜索列表（携带文件夹路径字符串）供勾选。

**之后按序**：批量/全量导入 → 登录 + 后端同步单条 → 四维筛选 → 保存动态 View → Capture 弹窗（保存并关闭 Tab）。先由作者本人 dogfood 几十条真实书签，验证：A) 四维模型是否符合找回习惯；B) 浏览时是否真的会想「我以前收藏过类似的吗」。

## 远期方向（不要提前实现，但架构上别堵死）

- Bookmark 与 Thought（纯想法记录）两个入口共享同一 Memory 底层（harness 可接本地/云服务）。
- 浏览时的主动上下文层：Save → Understand → 在未来合适的 Context 中 Resurface。
