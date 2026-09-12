# task-sync-status · dev-report

> task: docs/spec/sync-archive/tasks/task-sync-status/dev-checklist.md
> 创建: 2026-09-12

## 结果

- task 测试：109/109 🟢 全绿（5 个测试文件：sync-status 11、bookmark-filter 35、RecentSection 40、FiltersPanel 16、layout 7）
- 既有回归：本任务 5 个测试文件内既有用例（含 home 页 66 例既有行为）全部通过；全量回归由编排层统一执行（本阶段禁止全仓命令）
- 高风险行：0 行（checklist 全部行风险列为 None）
- 逐行状态：T1–T6 全部 🟢，每行均为「先红后绿」（红态均实际运行确认）

## 逐行结论

- **T1 🟢**：`lib/sync-status.ts` 新增三件套——`syncStateOf`（单条 updatedAt 与库 lastSyncAt 比较，ISO 串字典序，与 `db/sync.ts:48` 推送过滤同口径；lastSyncAt=null 视为全待同步）、`summarizeSync`（总数+待同步数）、`readSyncContext`（未登录 default 库 → `{tracked:false}` 无同步概念；登录 → tracked + email + 当前账号库 lastSyncAt）。单测 11 例覆盖 feat03 场景1/场景2、feat04 场景1/场景2 与未登录语境。
- **T2 🟢**：卡片 `.bmeta` 末尾渲染 `.sync-cloud`（login 态才渲染）；已同步 `.synced` 低对比度（--ink-faint）+ `title="已同步 · <账号邮箱>"`，待同步 `.pending` 强调色醒目；未登录零渲染。RecentSection.test 3 例新用例，既有 26 例不受影响。
- **T3 🟢**：页头副标题下新增 `.page-summary` 汇总行，整库口径（不随筛选/搜索变化）；文案「N 条收藏 · 已全部同步 / N 条收藏 · M 条待同步」，未登录只显示「N 条收藏」，空库沿用空态不出汇总行。RecentSection.test 5 例新用例。
- **T4 🟢**：登录态下用 Dexie `liveQuery` 订阅当前账号库 meta 表 lastSyncAt（Dexie 4.4.5 内置 BroadcastChannel，可感知 background 自动同步完成后的跨上下文写入）；同步失败不写 lastSyncAt → 云朵保持待同步不误报；未登录不订阅（default 库无同步概念）。RecentSection.test 3 例：写 lastSyncAt 后免刷新翻转（云朵+汇总行）、无关写入不误报、未登录无云朵。
- **T5 🟢**：`FilterSelection` 新增 `pendingOnly`（emptyFilter=false），`hasActiveFilter` 计入（标题「筛选结果 · N 条命中」与「清除全部筛选」自动复用）；`matchesFilter/applyFilter/countFacetValues` 增可选 `SyncFilterContext`（lastSyncAt），pendingOnly 只放行待同步条目，候选计数以 pendingOnly 为前提 scoped；FiltersPanel 顶部新增「同步｜待同步」行（仅登录渲染，点选/再点取消/aria-pressed 与 chips 一致）；RecentSection 空态分支新增「没有待同步的收藏，一切都已在服务器上」（pendingOnly 为唯一条件时）。测试 12 例新增（引擎 7 + 面板 5）+ 集成 3 例。
- **T6 🟢（部分移交）**：既有用例适配实际无需改动（`syncTracked` 为可选 prop，既有断言不受云朵/汇总影响，全部通过）；layout.test 新增云朵两态样式契约（synced 用 --ink-faint、pending 用 --accent-ink、两态互斥可区分）。**`pnpm check` 全绿 + 双构建未在本阶段执行**——按并行任务约束禁止全仓命令，由编排层统一执行（见下节）。

## 边界说明（如实记录）

- T5 行涉及文件只列 FiltersPanel.tsx 与 bookmark-filter.ts，但「点击后列表只显示待同步条目」的行为必须由 RecentSection 把 lastSyncAt 传给 `applyFilter`、把 tracked 传给 FiltersPanel 才能成立；RecentSection.tsx 本就是 T2–T4 的活动文件，此处为同一文件上的必要叠加，未超出 checklist 影响文件树。
- 汇总行/待同步筛选的「整库 N 条」在 feat04 场景3 的文案是「默认库条数」：实现按当前库书签总数取值，未登录时当前库即 default 库，语义一致。
- 本机测试环境为 jsdom + fake-indexeddb + fakeBrowser；liveQuery 跨上下文感知依赖 Dexie BroadcastChannel，真实 background（service worker/event page）写入的联动已由该机制保证，但未在真实浏览器里人工复验（构建与浏览器级验证随编排层门禁进行）。

## 回归

- 已执行：`pnpm --filter @x-threadpick/extension exec vitest run src/lib/sync-status.test.ts src/lib/bookmark-filter.test.ts src/entrypoints/home/sections/RecentSection.test.tsx src/entrypoints/home/FiltersPanel.test.tsx src/entrypoints/home/layout.test.ts` → 5 files / 109 tests 全绿。
- 未执行（按本阶段约束移交编排层统一执行）：`pnpm check`（typecheck/lint/format）、全量 vitest、Chrome/Firefox 双构建。工作区中另一任务的 home-nav-hash 改动（App.tsx / App.test.tsx）原样保留、未触碰。
