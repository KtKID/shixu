# x-threadpick

个人上下文记忆层：多维书签浏览器扩展（Chrome MV3 + Firefox），配自建同步后端。
核心理念：让用户敢放心关掉 Tab——Capture 摩擦足够低，Retrieval 足够强。

产品决策与技术约束见 [AGENTS.md](./AGENTS.md)，产品来源见 `docs/产品来源-名字思绪.md`。

## 结构

```text
apps/extension    # WXT + React + Dexie（本地 IndexedDB 为主库，offline-first）
apps/server       # Hono + Drizzle + SQLite（HTTP 同步/备份层）
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
pnpm cli create-user you@example.com your-password   # 建号
pnpm dev                   # http://127.0.0.1:8787

# 扩展（Chrome）
pnpm dev:ext               # 开发模式，自动打开浏览器加载 .output/chrome-mv3
pnpm build:ext             # 产物 .output/chrome-mv3，chrome://extensions 开发者模式加载
pnpm build:ext:firefox     # 产物 .output/firefox-mv2
```

## 当前切片状态

- [x] 读取浏览器书签树 → 搜索/勾选导入 → URL 规范化去重 → 入本地库（默认 Inbox）
- [x] 后端 auth（账号密码 + JWT 30 天）+ sync（增量拉取/推送，last-write-wins）+ CLI
- [ ] 扩展端登录与同步客户端
- [ ] 四维筛选 UI / 动态 View / Capture 弹窗
