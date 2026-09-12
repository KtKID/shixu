# task-server-overview · dev-report

<!--
只记结论，不粘贴测试输出；全绿时"未决"节整节删除。
-->

> task: docs/spec/sync-archive/tasks/task-server-overview/dev-checklist.md
> 创建: 2026-09-12

## 结果

- task 测试：4/4 🟢 全绿（T1–T4 逐行先红后绿）
- 既有回归：通过（全仓 `pnpm test`：shared 49/49 + extension 382/382；`pnpm check` typecheck/lint/format 全绿）
- 高风险行：0 行（checklist 无 风险:高 行）；T2/T4 的 server 行为经真实 HTTP 链路 smoke 双路验证

## 逐行结论

- **T1 🟢** shared：`SyncPullResponseSchema` 增必填 `bookmarksTotal`（非负整数，feat05 场景1）。红：缺失/负数/小数 3 用例先失败；绿：`packages/shared` 49/49。schema 必填化的连带适配（仅补 fixture，不改断言语义）：`packages/shared/src/sync.test.ts` 既有 taxonomy 用例补 `bookmarksTotal: 0`、`apps/extension/src/db/sync.test.ts` 假服务器按真实口径计算该字段、`apps/extension/src/components/settings/api.test.ts` pull fixture 补字段。
- **T2 🟢** server：pull 路由 `count()` 统计 `userId` 命中且 `deletedAt IS NULL` 的行填充 `bookmarksTotal`（`apps/server/src/routes/sync.ts:57-65`）。沿用既有 user_id 前缀索引，未新建索引。server 包无单测框架（check=typecheck），行为验证随 T4 真实链路。
- **T3 🟢** 扩展端：pull 成功后把总数写入当前库 meta（`SERVER_BOOKMARKS_TOTAL_META_KEY`，仅在 pull ok 时覆写 → 场景3 连不上保留最近值）；`AccountCard` 随库读取，在「上次同步」同一行并排显示「 · 服务器上共 N 条收藏」，从未同步（meta 无值）不出现该行（`apps/extension/src/db/sync.ts:49-64`、`AccountCard.tsx` session-meta 行）。红：db 落库 3 用例 + 显示 4 用例先失败；绿：两文件 50/50。
- **T4 🟢** smoke 改为真实链路（`apps/server/scripts/smoke.ts`）：`/auth/register` 现场建号 → 推送 3 条书签 → 全量 pull 断言 `bookmarksTotal` 与推送数一致（3）且书签齐全 → 追加推送 1 条墓碑再 pull 断言总数不变（未删除口径，feat02）。AccountCard 显示用例在 `AccountCard.test.tsx`（同步过显示并排、从未同步不显示、unreachable 保留、同步成功刷新）。

## 门禁失败根因与修复（2026-09-12 复验）

- 根因：本机 60024 端口有本仓库 apps/server 的常驻进程（`tsx --env-file=.env src/index.ts`，无 watch，启动于 T2 改动之前），pull 响应缺 `bookmarksTotal`；仓库默认 `pnpm smoke`（SMOKE_BASE_URL 默认即 60024）解析响应时 ZodError → 门禁失败。
- 修复：以原命令、原 cwd、同一 `.env` 重启该常驻 server 加载新代码（SQLite 文件库，数据不受影响）；重启后探针确认 pull 响应含 `bookmarksTotal`。
- 复验：`pnpm smoke`（默认 60024）通过；另按任务约定以独立端口 62562 + 独立数据文件（`/tmp/xtp-smoke-server-overview.*/`）再跑一遍同样通过，独立实例已停止、临时目录已删除。

## 收尾自验（真实运行）

- 第一轮交付后的自验有瑕疵：prettier --write 与 pnpm check 在 shell cwd 残留于 apps/server 时执行，prettier 相对路径落空（静默）、check 仅覆盖 server 包 typecheck，导致 smoke.ts 格式问题漏检（第二次门禁失败项）。
- 修正后在仓库根完整重跑：`pnpm check` exit 0（三包 typecheck + `eslint . --max-warnings 0` + `prettier . --check` 全部真实执行，All matched files use Prettier code style!）；`pnpm test` exit 0（shared 8 文件 49/49、extension 23 文件 382/382；server 无 vitest，真实链路由 smoke 覆盖）；格式化后的 `pnpm smoke`（默认 60024，已加载新代码的常驻实例）再次通过。
