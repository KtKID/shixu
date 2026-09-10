# task-server-settings · 开发清单

> spec: docs/spec/settings/spec.md
> 创建: 2026-09-10

**状态**：`[ ] ⏳` 未开始 / `[ ] ▶️` 进行中 / `[x] 🟢` 验证通过 / `[!] 🔴` 验证失败

| #   | 任务                                                                                                                                                   | 场景回指                                 | 涉及文件                                                           | 风险                                            | 状态   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------- | ------ |
| T1  | healthz 升级：返回 { ok, version, serverTime }，SERVER_VERSION 与 package.json 同步维护                                                                | feat01 场景1                             | apps/server/src/index.ts, apps/server/src/version.ts               | None                                            | [x] 🟢 |
| T2  | taxonomy 表：drizzle 建表（每用户一行，四维取值列 + updatedAt）并 db:push                                                                              | None                                     | apps/server/src/db/schema.ts                                       | 高:持久化结构落库，T6 smoke 验证                | [x] 🟢 |
| T3  | 抽共享鉴权中间件（sync 与 taxonomy 复用，行为不变）                                                                                                    | None                                     | apps/server/src/middleware/auth.ts, apps/server/src/routes/sync.ts | None                                            | [x] 🟢 |
| T4  | GET /taxonomy：无记录返回 epoch seed（不落库），有记录返回库内版本                                                                                     | feat05 场景1, feat08 场景2               | apps/server/src/routes/taxonomy.ts, apps/server/src/db/mappers.ts  | None                                            | [x] 🟢 |
| T5  | PUT /taxonomy：整体覆盖 + LWW（仅当提交方 updatedAt 更新才落库），返回胜出版本                                                                         | feat08 场景1, 场景3                      | apps/server/src/routes/taxonomy.ts                                 | 高:LWW 直接决定冲突取舍，必须真实链路验证（T6） | [x] 🟢 |
| T6  | sync 并入：pull 返回 taxonomy（无记录回 epoch seed）；push 接受可选 taxonomy 同 LWW 规则入事务                                                         | feat08 场景1, 场景2, 场景3               | apps/server/src/routes/sync.ts, apps/server/src/db/mappers.ts      | 高:同步协议变更，既有书签链路需回归             | [x] 🟢 |
| T7  | smoke：healthz 版本 → GET taxonomy(seed) → PUT 新版 → PUT 旧版被拒 → sync pull/push 含 taxonomy → 不带 taxonomy 的旧式 push 兼容；并回归既有书签 smoke | feat01 场景1, feat08 场景1, 场景2, 场景3 | apps/server/scripts/smoke-settings.ts                              | None                                            | [x] 🟢 |

## 影响文件树

```text
x-threadpick/
└── apps/server/
    ├── src/
    │   ├── index.ts            M  # healthz 返回版本与时间
    │   ├── version.ts          U  # 新增：SERVER_VERSION 常量（与 package.json 同步）
    │   ├── middleware/auth.ts  U  # 新增：共享 Bearer 鉴权中间件
    │   ├── db/schema.ts        M  # 新增 taxonomies 表
    │   ├── db/mappers.ts       M  # 新增 taxonomy 行↔对象映射
    │   └── routes/
    │       ├── taxonomy.ts     U  # 新增：GET/PUT /taxonomy（LWW）
    │       └── sync.ts         M  # 复用鉴权中间件；pull/push 并入 taxonomy
    ├── package.json            M  # scripts 加 smoke-settings
    └── scripts/smoke-settings.ts  U  # 新增：设置链路 smoke + 既有书签回归
```
