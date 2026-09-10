# task-classification-types · 开发清单

> spec: docs/spec/capture/spec.md
> 创建: 2026-09-10
> 备注: 本 task 由后端/协议负责人执行（契约先行）。形态（Type）多选的既有协议是单选（`classification.type: string | null`），与 spec feat04 及产品决策不符，本 task 修正为多选并同步后端存储；前端三个 task 依赖本 task 产物。

**状态**：`[ ] ⏳` 未开始 / `[ ] ▶️` 进行中 / `[x] 🟢` 验证通过 / `[!] 🔴` 验证失败

| #   | 任务                                                                                                                                                                                                  | 场景回指 | 涉及文件                                                              | 风险                                                                                               | 状态   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ |
| T1  | （TDD）先改协议测试再改 schema：`ClassificationSchema.type: string \| null` → `types: string[]`（每项非空、上限对齐 purposes 的 10），`createBookmark` 默认 `types: []`；packages/shared 全部测试通过 | None     | packages/shared/src/bookmark.ts, packages/shared/src/bookmark.test.ts | None                                                                                               | [x] 🟢 |
| T2  | 后端对齐：bookmarks 表 `type` 文本列 → `types` json 数组列（对齐 topics 写法），出入库映射同步改字段；drizzle-kit push 应用到 dev 库（60024 服务所用 data/threadpick.db）                             | None     | apps/server/src/db/schema.ts, apps/server/src/db/mappers.ts           | 高:列变更是持久化迁移，旧 type 单值不搬家直接丢弃；须真实 db:push 落库并跑冒烟链路，不允许只有单测 | [x] 🟢 |
| T3  | 回归验证：全仓 `pnpm check` 全绿；起 server 后 `pnpm smoke` 登录→推送（含多选形态的书签）→增量拉取通过                                                                                                | None     | 无新文件                                                              | None                                                                                               | [x] 🟢 |

## 影响文件树

```text
x-threadpick/
├── packages/shared/src/bookmark.ts        M  # ClassificationSchema type→types 数组、createBookmark 默认空数组
├── packages/shared/src/bookmark.test.ts   M  # 用例改为多选形态断言
├── apps/server/src/db/schema.ts           M  # bookmarks 表 type 列改 types json 数组
└── apps/server/src/db/mappers.ts          M  # 行↔协议映射的 types 字段
```
