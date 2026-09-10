# task-protocol-schema · 开发清单

> spec: docs/spec/settings/spec.md
> 创建: 2026-09-10

**状态**：`[ ] ⏳` 未开始 / `[ ] ▶️` 进行中 / `[x] 🟢` 验证通过 / `[!] 🔴` 验证失败

| #   | 任务                                                                                                                                                                                    | 场景回指                                        | 涉及文件                                                                                                                              | 风险                                                                   | 状态   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| T1  | 测试基建：shared 接入 vitest，root check 并入 test                                                                                                                                      | None                                            | packages/shared/package.json, packages/shared/src/taxonomy.test.ts                                                                    | None                                                                   | [x] 🟢 |
| T2  | Status 类型变更（TDD）：BookmarkStatusSchema 由固定枚举改为用户自定义非空字符串（≤30 字），DEFAULT_STATUS='inbox'；验证 createBookmark 默认 inbox、既有旧枚举值数据仍合法               | feat07 场景4                                    | packages/shared/src/taxonomy.ts, packages/shared/src/bookmark.ts, packages/shared/src/bookmark.test.ts, apps/server/src/db/mappers.ts | 高:已同步数据的契约变更，需既有 smoke 回归（task-server-settings T6）  | [x] 🟢 |
| T3  | Taxonomy schema 与默认集合（TDD）：TaxonomySchema（四维取值 + updatedAt；取值 1..30 字、维度内去重、status 必含 'inbox'）；DEFAULT_TAXONOMY_VALUES；epoch seed 的 createDefaultTaxonomy | feat05 场景1, feat06 场景3, 场景4, feat07 场景3 | packages/shared/src/taxonomy.ts, packages/shared/src/taxonomy.test.ts                                                                 | None                                                                   | [x] 🟢 |
| T4  | health 与 taxonomy 端点协议（TDD）：HealthResponseSchema；TaxonomyGetResponse / TaxonomyPutRequest / TaxonomyPutResponse（返回胜出版 + serverTime）                                     | feat01 场景1, feat08 场景2                      | packages/shared/src/health.ts, packages/shared/src/taxonomy.ts, packages/shared/src/health.test.ts                                    | None                                                                   | [x] 🟢 |
| T5  | sync 协议并入 taxonomy（TDD）：SyncPullResponse 加 taxonomy；SyncPushRequest 加可选 taxonomy；不带 taxonomy 的旧请求仍合法                                                              | feat08 场景1, 场景2, 场景3                      | packages/shared/src/sync.ts, packages/shared/src/sync.test.ts                                                                         | 高:同步协议向后兼容性，需 server smoke 验证（task-server-settings T6） | [x] 🟢 |
| T6  | 本地设置存储 schema（TDD）：SettingsSchema（activeServerUrl 可空 / 历史服务器列表 ≤20 含 lastLoginAt / session 可空 / lastSyncAt 可空）与 DEFAULT_SETTINGS                              | feat02 场景1, 场景5, feat03 场景4, feat04 场景1 | packages/shared/src/settings.ts, packages/shared/src/settings.test.ts, packages/shared/src/index.ts                                   | None                                                                   | [x] 🟢 |

## 影响文件树

```text
x-threadpick/
├── packages/shared/
│   ├── package.json          M  # scripts 加 test（vitest run）、devDeps 加 vitest
│   └── src/
│       ├── taxonomy.ts       M  # Status 枚举→自定义字符串；Taxonomy schema、默认集合、epoch seed、端点协议
│       ├── bookmark.ts       M  # 适配 Status 类型来源（如需）
│       ├── health.ts         U  # 新增：HealthResponseSchema
│       ├── settings.ts       U  # 新增：ServerRecord / Session / Settings schema 与 DEFAULT_SETTINGS
│       ├── sync.ts           M  # pull 加 taxonomy、push 加可选 taxonomy
│       ├── index.ts          M  # 导出新模块
│       └── *.test.ts         U  # 新增：TDD 测试（taxonomy / bookmark / health / settings / sync）
└── apps/server/src/db/mappers.ts  M  # BookmarkStatus 类型来源变化的适配
```
