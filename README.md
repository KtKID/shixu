# 拾绪（x-threadpick）

个人上下文记忆层：多维书签浏览器扩展（Chrome MV3 + Firefox MV2），配自建同步后端。
核心理念：让用户敢放心关掉 Tab——Capture 摩擦足够低，Retrieval 足够强。

产品决策与技术约束见 [AGENTS.md](./AGENTS.md)，产品来源见 `docs/产品来源-名字思绪.md`，各功能需求见 `docs/spec/`。

## 结构

```text
apps/extension    # WXT + React + Dexie（本地 IndexedDB 为主库，offline-first）
apps/server       # Hono + Drizzle + SQLite（HTTP 同步/备份层，含管理 CLI）
packages/shared   # zod schema：前后端数据结构唯一真源
```

## 快速开始

```bash
pnpm install
pnpm check                 # typecheck + eslint + prettier（提交前必须通过）

# 后端
cd apps/server
cp .env.example .env       # 填 JWT_SECRET（openssl rand -hex 32）
pnpm db:push               # 建表
pnpm cli create-user you@example.com your-password   # 建号（也可在扩展设置页自助注册）
pnpm dev                   # http://127.0.0.1:60024

# 扩展（Chrome）
pnpm dev:ext               # 开发模式，自动打开浏览器加载 dist/chrome-mv3
pnpm build:ext             # 同时构建 Chrome MV3 + Firefox MV2
pnpm build:ext:firefox     # 仅 Firefox，产物 dist/firefox-mv2
pnpm pack:ext:firefox      # 打包 dist/x-threadpick.xpi（未签名，正式安装需 web-ext sign）

# 商店无账号版构建变体
pnpm build:ext -- --mode store   # 纯本地版（无账号/同步功能），供商店首发
```

## 当前项目状态（2026-09）

已完成：

- [x] 书签导入：读取浏览器书签树 → 搜索/勾选 → URL 规范化去重 → 入本地库（默认 Inbox）
- [x] 后端：auth（账号密码 + JWT 30 天 + 自助注册）+ sync（增量拉取/推送，last-write-wins，tombstone）+ CLI
- [x] 扩展端登录/注册与同步客户端：手动「同步收藏」+ 结果计数 + 按账号自动同步（写操作防抖触发）
- [x] 设置页：服务器连接、账号、分类维度（四维取值自定义）、快照存档、新标签页可选接管
- [x] 扩展主页：左侧导航 + 全部收藏列表 + 四维筛选 + 收藏时间筛选 + 搜索
- [x] Capture 面板：收藏当前页面（保存并关闭 Tab，一句话备注可选）
- [x] 同步状态与快照存档：云朵标记 + 汇总 + 按账号存档
- [x] 服务器心跳：background 每 5s 探测 `/healthz`，断连时图标打红色 badge，账号卡订阅心跳快照
- [x] 默认分类取值（办公场景预设）+ 扩展更名「拾绪」+ 商店无账号版构建变体

进行中 / 待做：

- [ ] 组合收藏（勾选标签页 · 组合备注 · 首页筛选 · 一键重新打开）——spec 已写，见 `docs/spec/bookmark-groups/`
- [ ] 动态 View（筛选条件 + 排序规则的保存入口）
- [ ] Resurface（浏览时相关旧收藏的图标 badge 提示）与语义检索——第二阶段，MVP 不上 AI/embedding
