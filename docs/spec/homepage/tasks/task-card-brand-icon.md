# 收藏卡片改为品牌卡：站点小图标 + 域名行，替换大首字母色块

> spec: docs/spec/homepage/spec.md
> feat: feat04, feat07
> 创建: 2026-09-12

## ① 需求

### 功能方向

主页收藏卡片不再用「大首字母 + 随机色块」占据卡片顶部。改为：卡片正文第一行显示**站点小图标 + 来源域名**（品牌行），下面是标题、收藏时间、理由、标签。图标在用户收藏/导入后由脚本规则自动到原网站上取得，不需要用户做任何事；取不到图标的收藏用一个**小号**首字母色块代替（不再放大铺满）。

### 功能边界

- 做：收藏/导入后自动按规则链获取站点图标（解析网页里声明的图标地址，取尺寸最大的；取不到再试网站约定地址 `/favicon.ico`；都要验证真的是图片才算数）；图标地址随收藏一起保存、一起同步；主页「最近新增」「全部收藏」两个视图的卡片都改为品牌卡；图标加载失败时退回小首字母色块；已有收藏在打开主页时自动补取图标
- 不做：og:image 大封面卡、Paper 排版卡、收藏时截图（远期方向，见 docs/assets/卡片备选方案.html）；图标图片本身的存储/缓存（只存图标地址文本）；图标主色提取；popup 收藏面板里占位字母图标的改造；取图失败跨会话记住不再重试（仅本次运行内不重复抓）

### 不能破坏的不变量

- 卡片上标题、来源域名、收藏时间、理由、分类标签、同步云朵标记的展示不丢（feat04 场景2，首字母色块改为小尺寸兜底）
- 点击卡片仍在新标签页打开原网址（feat04 场景4）
- 升级前已入库的旧收藏（没有图标字段的记录）照常解析、展示、参与筛选搜索
- 导入与收藏面板保存的行为不变：取图标是后台异步补全，不阻塞、不影响成败计数
- 同步往返不丢图标地址；没有图标的收藏同步照常

## ② 测试用例（先写，此刻失败）

### unit

- shared_bookmark_legacy_parse：无 iconUrl 字段的旧版收藏记录解析成功且 iconUrl 为 null → 不变量（旧记录兼容）
- pick_icon_largest：HTML 声明多个尺寸图标时选尺寸最大的；无 sizes 声明的排最后 → 功能方向（取最大尺寸）
- pick_icon_resolve_relative：协议相对地址（`//cdn.x.com/a.png`）与相对路径（`/a.png`）都补全为绝对地址 → 功能方向
- pick_icon_none：页面没有图标声明时返回 null → 边界（空输入）
- resolve_icon_a1_hit：页面声明图标且验证是图片 → 返回该图标地址 → 功能方向
- resolve_icon_fallback_favicon_ico：页面无图标声明（或声明的图标验证失败，如返回 HTML 软 404）→ 退回 `/favicon.ico` 并验证 content-type 是图片 → 功能边界（规则链）
- resolve_icon_all_fail：页面抓取失败且 `/favicon.ico` 也非图片 → 返回 null → 边界（错误输入）
- ensure_icons_fill：缺图标的书签被回填 iconUrl 且 updatedAt 前移（参与同步）→ 功能方向（异步回填）
- ensure_icons_no_refetch：本次运行内取过但没取到的书签不重复抓取 → 功能边界（不重复抓）
- card_brand_line：有 iconUrl 的收藏卡片渲染图标 img + 域名行，无大首字母色块 → 功能方向（品牌卡渲染）
- card_fallback_tile：无 iconUrl 的收藏卡片渲染小首字母色块 + 域名行 → 功能边界（兜底）
- card_icon_error_fallback：图标加载失败（onError）时退回小首字母色块 → 功能边界（加载失败兜底）
- mount_triggers_icon_backfill：打开「最近新增」触发一轮图标回填 → 功能边界（已有收藏自动补取）

### smoke

- 导入一条真实网站书签（如 doubao.com）→ 稍后卡片出现该站真实图标；断网/死链书签 → 卡片显示小首字母色块 + 域名，其余信息完整

### e2e

不需要，依据：取图规则与渲染均由 vitest（jsdom + mock fetch + fake-indexeddb）覆盖，真实网站规则链已用探测脚本对 16 条真实收藏实测通过（/tmp/x-threadpick-imgtest，2026-09-12）；无跨进程用户链路风险

## ③ 技术实现

### 实现步骤

1. `packages/shared/src/bookmark.ts`：BookmarkSchema 加 `iconUrl: z.url().nullable().default(null)`（default 兼容升级前无此字段的旧记录）；createBookmark 新书签默认 `iconUrl: null`
2. `apps/server/src/db/schema.ts` + `mappers.ts`：bookmarks 表加 `icon_url` 可空列，出入库映射双向带上 iconUrl；`pnpm db:push` 应用到开发库（可空列，存量行无迁移）
3. `apps/extension/src/lib/page-icon.ts`（新建）：`pickIconFromHtml`（DOMParser 解析 link[rel~=icon]/apple-touch-icon，sizes 最大优先、无尺寸排后，地址相对页面补全）+ `resolvePageIcon`（A1 页面声明 → A2 约定路径 /favicon.ico，逐级 fetch 验证 content-type 为 image/*，8s 超时，非 http(s) 直接 null；fetch 可注入便于测试）
4. `apps/extension/src/db/icons.ts`（新建）：`ensureBookmarkIcons` 回填一轮——缺 iconUrl 的活跃收藏并发 3 补取，写回时 updatedAt 前移并 notifyLocalChange（走既有自动同步）；模块级 attempted 集合保证本次运行内不重复抓，`resetIconAttempts` 供测试隔离
5. `apps/extension/src/entrypoints/home/sections/RecentSection.tsx`：BookmarkCard 删除大首字母色块 .thumb，改为品牌行（BrandMark：iconUrl → 22px 站点图标，onError/无图标 → 22px 小首字母色块）+ 域名；meta 行只留时间与同步云朵；挂载后 fire-and-forget 触发回填、本轮有补上则重取列表刷新
6. `apps/extension/src/entrypoints/home/index.css`：删 .thumb 规则，加 .brandline/.brandicon/.brandtile/.bdomain（图标与小色块均 22px）
7. 触发接线：导入完成（ImportSection）与 Capture 保存成功（popup App）后 fire-and-forget 调 ensureBookmarkIcons，不阻塞主流程
8. 测试修正记录：①shared 新用例初版漏传 classification（schema 必填）导致误红，按既有用例模式补上；②icons 测试种子改用固定过去时间，updatedAt 前移断言不依赖时钟分辨率；③lint 规整：mock 改 Promise.resolve 风格、resolvePageIcon 的 fetch 参数收窄为 FetchLike 函数类型避免 as 断言；④第 4 步自检发现「onError 兜底」「挂载触发回填」两边界缺用例，补 card_icon_error_fallback 与 mount_triggers_icon_backfill 两条
9. 文档同步：`docs/spec/homepage/spec.md` feat04 场景2 卡片展示描述改为品牌卡；`AGENTS.md` 同步对象描述补 iconUrl

### 涉及文件

- packages/shared/src/bookmark.ts: BookmarkSchema 加 iconUrl（default null 兼容旧记录）+ createBookmark 默认值
- packages/shared/src/bookmark.test.ts: iconUrl 三个新用例（合法取值/旧记录兼容/新书签默认）
- apps/server/src/db/schema.ts: bookmarks 表加 icon_url 可空列
- apps/server/src/db/mappers.ts: rowToBookmark/bookmarkToRow 双向映射 iconUrl
- apps/extension/src/lib/page-icon.ts: 新建，图标规则链 A1→A2（解析 + 验证）
- apps/extension/src/lib/page-icon.test.ts: 新建，规则链 8 用例（最大尺寸/地址补全/空页面/软 404 降级/全失败/非 http）
- apps/extension/src/db/icons.ts: 新建，ensureBookmarkIcons 回填 + attempted 去重
- apps/extension/src/db/icons.test.ts: 新建，回填/不重复抓/跳过已有与墓碑 3 用例
- apps/extension/src/entrypoints/home/sections/RecentSection.tsx: 品牌卡渲染（BrandMark + 域名行）+ 挂载回填触发
- apps/extension/src/entrypoints/home/sections/RecentSection.test.tsx: 场景2 断言改品牌卡 + 有/无 iconUrl 两用例 + mock 回填模块
- apps/extension/src/entrypoints/home/index.css: 删 .thumb，加品牌行样式（≤22px）
- apps/extension/src/entrypoints/home/layout.test.ts: 布局契约改断 brandicon/brandtile ≤24px 且 .thumb 已移除
- apps/extension/src/entrypoints/home/sections/ImportSection.tsx: 导入后触发图标回填
- apps/extension/src/entrypoints/popup/App.tsx: Capture 保存后触发图标回填（面板 UI 未动）
- docs/spec/homepage/spec.md: feat04 场景2 卡片展示描述同步为品牌卡
- AGENTS.md: 同步对象描述补 iconUrl
- .prettierignore: 忽略自包含设计稿 docs/assets/卡片备选方案.html（base64 内嵌非手写格式）

## ④ 验证结果

### 测试输出

packages/shared（vitest run，含 iconUrl 3 新用例）：

```
 Test Files  8 passed (8)
      Tests  52 passed (52)
```

apps/extension（vitest run，含 page-icon 8、icons 3、RecentSection 品牌卡 4 新用例）：

```
 Test Files  25 passed (25)
      Tests  396 passed (396)
```

根 `pnpm check`（三包 typecheck + eslint --max-warnings 0 + prettier --check）：

```
apps/extension typecheck: Done
> eslint . --max-warnings 0
（无输出，0 问题）
All matched files use Prettier code style!
```

图标规则链真实网站实测（16 条可访问收藏，/tmp/x-threadpick-imgtest/scan.mjs，2026-09-12）：A1 命中 15、A2 命中 1、失败 0；图标已下载目检为正确品牌图标。

### 不变量回归

- 扩展既有测试全绿（396/396 含 feat04/05/06/07 视图、筛选、搜索、同步云朵、restore 真实链路）；卡片打开原网址（feat04 场景4）断言在 RecentSection.test.tsx 保持通过
- 服务端冒烟：`SMOKE OK: 注册 → 推送 3 条 → bookmarksTotal=3 一致 → 墓碑不计入验证通过`；`SMOKE OK: 注册 → 登录 → 重复注册 409 → 弱密码 400`
- 设置链路冒烟（干净库 + 独立实例 60099 端口）：`SETTINGS SMOKE OK: healthz 版本 → taxonomy seed/LWW → sync 并入 → 旧式 push 兼容`。说明：直接对开发库跑 smoke-settings 报「初始应为 epoch seed」是该账号 taxonomy 早前已被改动的存量脏数据所致，与本次改动无关，干净库验证通过
- 旧记录兼容：shared 用例「无 iconUrl 字段的旧版记录解析成功且默认 null」通过；server 旧行经可空列 + default(null) 解析，smoke 推送/拉取回归通过
- iconUrl 同步往返（独立实例 60098 + 干净库，真实 HTTP）：POST /sync 推送 `iconUrl: "https://kimi.com/icon-192.png"` 的书签 → `applied: { bookmarks: 1 }` → GET /sync 拉回 `pull iconUrl = https://kimi.com/icon-192.png`，往返不丢

### 结论

- [x] 所有需求点被测试覆盖
- [x] 所有测试真实跑过且通过
- [x] 实现在边界内
- [x] 不变量未破坏
