# task-snapshot-archive · 开发清单

> spec: docs/spec/sync-archive/spec.md
> 创建: 2026-09-11

**状态**：`[ ] ⏳` 未开始 / `[ ] ▶️` 进行中 / `[x] 🟢` 验证通过 / `[!] 🔴` 验证失败

覆盖 feat07（手动创建快照存档，5 场景）、feat08（查看与管理快照列表，5 场景）、feat09（从快照恢复收藏库，3 场景）。快照按账号存服务器（v1 结构化文本入 SQLite，不涉对象存储）；恢复只作用于当前账号库。依赖 task-account-libraries。

| #   | 任务                                                                                                                                                                                                                                                                                         | 场景回指                                                             | 涉及文件                                                                                                                                               | 风险                                                                                                 | 状态   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------ |
| T1  | shared：快照协议 schema——列表项（id、savedAt、itemCount）、载荷（bookmarks 全量 + taxonomy + savedAt）、创建/列表/详情/删除的请求响应；index 导出；zod 测试                                                                                                                                  | feat07 场景1, feat08 场景1                                           | packages/shared/src/snapshot.ts, packages/shared/src/index.ts, packages/shared/src/snapshot.test.ts                                                    | None                                                                                                 | [x] 🟢 |
| T2  | server：snapshots 表（id / user_id / saved_at / item_count / payload JSON）+ 行映射；路由 POST 创建（含 0 条空档）、GET 列表（新到旧，仅 meta）、GET 详情（全量载荷）、DELETE 删除；创建时超 10 份自动淘汰最旧；挂载 `/snapshots`                                                            | feat07 场景1, 场景4, feat08 场景1, 场景3, 场景4                      | apps/server/src/db/schema.ts, apps/server/src/db/mappers.ts, apps/server/src/routes/snapshots.ts, apps/server/src/index.ts                             | None                                                                                                 | [x] 🟢 |
| T3  | 扩展 API 客户端：createSnapshot（当前库全部收藏 + 取值清单打包上传）、listSnapshots、getSnapshot、deleteSnapshot                                                                                                                                                                             | feat07 场景1, feat08 场景1, 场景3                                    | apps/extension/src/components/settings/api.ts                                                                                                          | None                                                                                                 | [x] 🟢 |
| T4  | SnapshotCard UI（挂在「网络连接」页账号卡下方）：「立即存档」按钮（进行中禁用、成功提示「已存档 N 条收藏」、失败提示不新增记录、未登录禁用 + 「登录后才能存档」）；列表（新到旧、时间/条数、恢复与删除操作、删除确认、不影响收藏库）；未登录不显示快照区                                     | feat07 场景1, 场景2, 场景3, 场景4, 场景5, feat08 场景1, 场景2, 场景5 | apps/extension/src/components/settings/SnapshotCard.tsx, apps/extension/src/components/settings/cards.css, apps/extension/src/entrypoints/home/App.tsx | None                                                                                                 | [x] 🟢 |
| T5  | 恢复流程：确认框（替换语义文案：本地库将被替换、快照后新增会被移除、变化会照常同步）→ restore 模块把当前账号库替换为快照内容（差集打墓碑、快照项与取值清单时间戳前移以保证 LWW 胜出）→ 触发同步 → 成功提示「已恢复至 <时间> 的存档」；快照保留可再次恢复；任一步失败本机保持恢复前状态并提示 | feat09 场景1, 场景2, 场景3                                           | apps/extension/src/db/restore.ts, apps/extension/src/components/settings/SnapshotCard.tsx                                                              | 高:整库覆盖属不可逆操作，失败路径必须停在原状态；验证需含模拟失败（断网）的恢复测试，不允许只有 unit | [x] 🟢 |
| T6  | 测试与回归：SnapshotCard 组件用例（按钮态/列表/确认框/未登录）；恢复流程测试（成功替换、失败保原、快照保留）；server smoke-snapshot（创建→列表→详情→删除→上限淘汰）；`pnpm check` 全绿 + 双构建                                                                                              | feat07 场景1-5, feat08 场景1-5, feat09 场景1-3                       | apps/extension/src/components/settings/SnapshotCard.test.tsx, apps/extension/src/db/restore.test.ts, apps/server/scripts/smoke-snapshot.ts             | None                                                                                                 | [x] 🟢 |

## 影响文件树

```text
x-threadpick/
├── packages/shared/src/snapshot.ts                        U  # 新增：快照协议 schema
├── packages/shared/src/snapshot.test.ts                   U  # 新增：schema 用例
├── packages/shared/src/index.ts                           M  # 导出 snapshot 模块
├── apps/server/src/db/schema.ts                           M  # snapshots 表（按账号）
├── apps/server/src/db/mappers.ts                          M  # 快照行映射
├── apps/server/src/routes/snapshots.ts                    U  # 新增：创建/列表/详情/删除 + 上限淘汰
├── apps/server/src/index.ts                               M  # 挂载 /snapshots
├── apps/server/scripts/smoke-snapshot.ts                  U  # 新增：快照链路 smoke
├── apps/extension/src/components/settings/api.ts          M  # 快照 API 客户端
├── apps/extension/src/components/settings/SnapshotCard.tsx U  # 新增：存档/列表/删除/恢复确认 UI
├── apps/extension/src/components/settings/SnapshotCard.test.tsx U  # 新增：组件用例
├── apps/extension/src/components/settings/cards.css       M  # 快照区样式
├── apps/extension/src/entrypoints/home/App.tsx            M  # 网络连接区挂载 SnapshotCard
├── apps/extension/src/db/restore.ts                       U  # 新增：当前账号库替换为快照
└── apps/extension/src/db/restore.test.ts                  U  # 新增：恢复成功/失败/保留用例
```
