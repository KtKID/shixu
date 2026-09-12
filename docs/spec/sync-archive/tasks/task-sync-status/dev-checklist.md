# task-sync-status · 开发清单

> spec: docs/spec/sync-archive/spec.md
> 创建: 2026-09-11

**状态**：`[ ] ⏳` 未开始 / `[ ] ▶️` 进行中 / `[x] 🟢` 验证通过 / `[!] 🔴` 验证失败

覆盖 feat03（收藏卡片显示云朵同步标记，5 场景）、feat04（收藏页汇总行，4 场景）、feat06（按「待同步」筛选，3 场景）。依赖 task-account-libraries 的「当前库 + 库内 lastSyncAt」。

| #   | 任务                                                                                                                                                                     | 场景回指                                       | 涉及文件                                                                                                                                                                                                                           | 风险 | 状态   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ |
| T1  | 新建同步状态推导：单条状态 = 该书签 updatedAt 与当前库 lastSyncAt 比较（已同步/待同步）；整库汇总（总数、待同步数）；未登录（default 库）返回无同步概念；配单测          | feat03 场景1, 场景2, feat04 场景1, 场景2       | apps/extension/src/lib/sync-status.ts, apps/extension/src/lib/sync-status.test.ts                                                                                                                                                  | None | [x] 🟢 |
| T2  | BookmarkCard 云朵标记：卡片来源信息行末尾、已同步为低对比度小符号 + 悬停「已同步 · <账号邮箱>」、待同步为醒目样式；未登录不渲染                                          | feat03 场景1, 场景2, 场景4                     | apps/extension/src/entrypoints/home/sections/RecentSection.tsx, apps/extension/src/entrypoints/home/index.css                                                                                                                      | None | [x] 🟢 |
| T3  | 收藏页头汇总行：「N 条收藏 · M 条待同步 / 已全部同步」；未登录只显示「N 条收藏」（默认库条数）；当前库为空沿用空态不显示汇总行                                           | feat04 场景1, 场景2, 场景3, 场景4              | apps/extension/src/entrypoints/home/sections/RecentSection.tsx, apps/extension/src/entrypoints/home/index.css                                                                                                                      | None | [x] 🟢 |
| T4  | 状态免刷新翻转：订阅当前库 lastSyncAt 变化（后台自动同步完成后），卡片与汇总行即时更新；同步失败时保持待同步不误报                                                       | feat03 场景3, 场景5                            | apps/extension/src/entrypoints/home/sections/RecentSection.tsx                                                                                                                                                                     | None | [x] 🟢 |
| T5  | FiltersPanel「待同步」入口：点击后列表只显示待同步条目（复用现有筛选结果标题与清除交互）；全部已同步时空态文案「没有待同步的收藏，一切都已在服务器上」；未登录不显示入口 | feat06 场景1, 场景2, 场景3                     | apps/extension/src/entrypoints/home/FiltersPanel.tsx, apps/extension/src/lib/bookmark-filter.ts                                                                                                                                    | None | [x] 🟢 |
| T6  | 测试与回归：RecentSection / FiltersPanel 既有用例适配 + 云朵、汇总、待同步筛选新用例；layout.test 增云朵两态样式契约；`pnpm check` 全绿 + 双构建                         | feat03 场景1-5, feat04 场景1-4, feat06 场景1-3 | apps/extension/src/entrypoints/home/sections/RecentSection.test.tsx, apps/extension/src/entrypoints/home/FiltersPanel.test.tsx, apps/extension/src/entrypoints/home/layout.test.ts, apps/extension/src/lib/bookmark-filter.test.ts | None | [x] 🟢 |

## 影响文件树

```text
x-threadpick/
├── apps/extension/src/lib/sync-status.ts                                U  # 新增：单条/汇总同步状态推导
├── apps/extension/src/lib/sync-status.test.ts                           U  # 新增：推导单测
├── apps/extension/src/entrypoints/home/sections/RecentSection.tsx       M  # 云朵标记、汇总行、免刷新订阅
├── apps/extension/src/entrypoints/home/FiltersPanel.tsx                 M  # 「待同步」筛选入口
├── apps/extension/src/entrypoints/home/index.css                        M  # 云朵两态 + 汇总行样式
├── apps/extension/src/lib/bookmark-filter.ts                            M  # 待同步筛选条件
├── apps/extension/src/lib/bookmark-filter.test.ts                       M  # 筛选用例
├── apps/extension/src/entrypoints/home/sections/RecentSection.test.tsx  M  # 云朵/汇总用例
├── apps/extension/src/entrypoints/home/FiltersPanel.test.tsx            M  # 入口显隐与空态用例
└── apps/extension/src/entrypoints/home/layout.test.ts                   M  # 云朵样式契约
```
