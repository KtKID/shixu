# task-server-overview · 开发清单

> spec: docs/spec/sync-archive/spec.md
> 创建: 2026-09-11

**状态**：`[ ] ⏳` 未开始 / `[ ] ▶️` 进行中 / `[x] 🟢` 验证通过 / `[!] 🔴` 验证失败

覆盖 feat05（账号卡显示服务器概览，3 场景）。方案：pull 响应带账号有效收藏总数（避免新增独立计数端点），扩展端存库内 meta 供账号卡显示。依赖 task-account-libraries 的库内 meta 表。

| #   | 任务                                                                                                                                                                  | 场景回指                   | 涉及文件                                                                                  | 风险 | 状态   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- | ---- | ------ |
| T1  | shared：SyncPullResponseSchema 增 `bookmarksTotal`（非负整数，当前账号未删除收藏总数）；更新 zod 测试                                                                 | feat05 场景1               | packages/shared/src/sync.ts, packages/shared/src/sync.test.ts                             | None | [x] 🟢 |
| T2  | server：pull 路由按当前账号统计未删除收藏数填充 `bookmarksTotal`（索引 `bookmarks_user_url_idx` 可用则用，不新建索引）                                                | feat05 场景1               | apps/server/src/routes/sync.ts                                                            | None | [x] 🟢 |
| T3  | 扩展端：pull 成功后把 `bookmarksTotal` 存入当前库 meta；AccountCard 在「上次同步」旁显示「服务器上共 N 条收藏」；从未同步不显示该行；服务器连不上时保留最近一次成功值 | feat05 场景1, 场景2, 场景3 | apps/extension/src/db/sync.ts, apps/extension/src/components/settings/AccountCard.tsx     | None | [x] 🟢 |
| T4  | smoke：注册 → 推送书签 → pull 断言 `bookmarksTotal` 与推送数一致；AccountCard 显示用例（显示/从未同步不显示）                                                         | feat05 场景1, 场景2        | apps/server/scripts/smoke.ts, apps/extension/src/components/settings/AccountCard.test.tsx | None | [x] 🟢 |

## 影响文件树

```text
x-threadpick/
├── packages/shared/src/sync.ts                            M  # PullResponse 增 bookmarksTotal
├── packages/shared/src/sync.test.ts                       M  # schema 用例
├── apps/server/src/routes/sync.ts                         M  # pull 填充账号收藏总数
├── apps/extension/src/db/sync.ts                          M  # pull 后把总数存库内 meta
├── apps/extension/src/components/settings/AccountCard.tsx M  # 「服务器上共 N 条收藏」显示行
├── apps/extension/src/components/settings/AccountCard.test.tsx  M  # 显示/隐藏用例
└── apps/server/scripts/smoke.ts                           M  # 断言 pull 返回总数
```
