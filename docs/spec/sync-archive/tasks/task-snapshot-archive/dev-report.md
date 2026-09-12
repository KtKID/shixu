# task-snapshot-archive · dev-report

> task: docs/spec/sync-archive/tasks/task-snapshot-archive/dev-checklist.md
> 创建: 2026-09-12

## 结果

- task 测试：extension 新增两文件 20/20 🟢（SnapshotCard.test.tsx 14 + restore.test.ts 6，红→绿各一轮）+ shared snapshot.test.ts 10/10 🟢；连同受改动影响的既有文件（api / AccountCard / home App）合计 87/87 🟢
- 既有回归：通过——指定测试文件回归 `pnpm --filter @x-threadpick/extension exec vitest run <5 个文件>` 87/87；`pnpm check` 全绿与 chrome/firefox 双构建**未在本阶段执行**（并行任务约束，禁止全仓命令），全量回归由编排层统一执行。文件级静态自查已过：改动文件 `eslint --max-warnings 0` 0 错误、`prettier --check` 全过（6 个文件曾不合格，已 `--write` 修正后复跑测试仍绿）
- 高风险行：1 行（T5 恢复流程），真实链路验证齐备：
  - 模拟失败（断网）：restore.test.ts 用 fetch stub reject（标准断网模拟）断言 unreachable / server_error / 协议不符三种失败下本机书签与取值清单逐条不变（feat09 场景3）
  - 真实链路（smoke 级，live 用例随测试文件留存）：独立 server 实例（空闲端口 + `apps/server/data/restore-live-*.db`，`db:push` 建表，跑完进程与数据文件均已清理、已核无残留）+ 真实 HTTP 零 mock：注册 → **真 api.createSnapshot** 存档 → 本机继续改（A 改标题 + D/E 新增）→ restoreFromSnapshot（真 getSnapshot + 真 Dexie 事务替换 + 真 syncNow）→ 本机回到快照内容（3 活跃 + 2 墓碑、taxonomy 快照版、updatedAt 前移）→ 服务器拉取侧可见恢复项与墓碑传播（「变化照常同步」）→ **真 listSnapshots / deleteSnapshot** → 杀掉 server 进程后再恢复：unreachable 且本机不动。真浏览器手测不可行（Chrome 153 stable 已禁 `--load-extension`，沿用 task-account-libraries 的结论），以真协议 live 用例替代
- T2（server 路由）由 `apps/server/scripts/smoke-snapshot.ts` 真实验证：独立实例上走完 healthz → 注册双账号 → 0 条空档（itemCount=0）→ 2 条存档（墓碑不计 itemCount=1）→ 列表新到旧且仅 meta（响应原文无载荷字段）→ 详情全量载荷一致 → 删除后 404 → 11 份上限淘汰保持 10 份且最旧被淘汰 → A/B 账号快照互相隔离，全绿（exit 0），临时实例与数据文件已清理

## 备注

- 自验命令约束的一点偏差，如实说明：ask 给的自验命令 `pnpm --filter @x-threadpick/extension exec vitest run <文件>` 对 packages/shared 的测试文件返回 `No test files found`（其 vitest include 限定 `apps/extension/src/**`，已实测），而 T1 交付物含 shared 的 zod 测试。为不跳过 T1 的红→绿，对 shared 包用了同形态的单文件命令 `pnpm --filter @x-threadpick/shared exec vitest run src/snapshot.test.ts`（仅跑本 task 新增的一个文件，非全量 vitest，不触碰其他并行任务文件），其余验证一律使用 ask 指定的命令。
- checklist T6 行的「`pnpm check` 全绿 + 双构建」按并行约束未执行，已在行内注明由编排层统一执行；如编排层 check 报出问题，预期只可能出在格式/类型细节，上述文件级 prettier+eslint 自查已把该风险压到最低。
- 工作区已有的 home-nav-hash 未提交改动（`App.tsx`/`App.test.tsx`）属另一任务：本次对 `App.tsx` 仅做叠加（import SnapshotCard + network 分区挂载一行），未回退；`App.test.tsx` 未改动，作为挂载兼容回归跑过（18/18）。
- 实现口径：快照载荷含全部记录（含墓碑），itemCount 为活跃收藏数——恢复后已删条目不复活且删除可传播；恢复把快照项与取值清单的 updatedAt 统一前移到恢复时刻，保证 LWW 必胜；恢复后的同步失败不回滚恢复本体（离线优先，联网补推），synced 布尔仅在返回值中反映。
