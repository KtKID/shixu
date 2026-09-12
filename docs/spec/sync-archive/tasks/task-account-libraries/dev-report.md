# task-account-libraries · dev-report

> task: docs/spec/sync-archive/tasks/task-account-libraries/dev-checklist.md
> 创建: 2026-09-11

## 结果

- task 测试：extension 317/317 🟢、shared 36/36 🟢 全绿（library 新测 11 条 + bookmarks / sync / settings / taxonomy / AccountCard / DimensionsCard / home App / ImportSection / RecentSection / popup App 既有测试全部适配多库后通过）
- 既有回归：通过（全仓 `pnpm test`，server 包无 test script 不在列；`pnpm check` typecheck×3 + eslint 0 警告 + prettier 全过；chrome/firefox 双构建通过）
- 高风险行：2 行均含真实链路验证
  - T3（存量迁移）：手动升级路径两种均已验证——旧数据 + 已登录（书签/取值/全局 lastSyncAt 迁入账号库、default 清空）、旧数据 + 未登录（原地保留、此后登录不再迁移），另含幂等与进程重启（marker 持久）用例，走真 Dexie + 真 browser.storage 语义（`library.test.ts`）。验证形态为组件级测试环境（fake-indexeddb + wxt fakeBrowser），非真浏览器手测。
  - T7（账号流）：真实链路 smoke 通过——临时隔离 server 实例（独立端口 62555 + 独立 SQLite，跑完已删）+ 真实 HTTP 零 mock，AccountCard 真实交互走完 登录 A（healthz/login/首拉）→ A 库收藏并点「同步收藏」真推送 → 用会话 token 直接 GET /sync 证实 server 侧 A/B 账号隔离 → 已登录切 B 走确认框、A 自动退出、B 库为空且 A 库原样 → 登出回 default（2 条不动）→ 重登 A 库完整恢复；仓库自带 `smoke-register` 同实例通过。真浏览器手动验证不可行：Chrome 153 stable 已禁 `--load-extension`（Chromium 137 起移除），故以真协议 smoke 替代，临时验证文件未留仓库。

## 备注

- 本 task 由中断续做：接手时 T1/T2/T4/T5/T6/T8 已 🟢、T3/T7/T9 为半成品。经 diff 与测试核对，T3（`migrateLegacyData` + 迁移测试）、T7（`AccountCard` 账号流 + 7 条多库用例）、T9（测试适配）实现与测试均已成形且全绿，本次为收尾验证与状态回写，无重做。
- 对账修复（x-verify 退回）：taxonomy.test / ImportSection.test / RecentSection.test / popup App.test / DimensionsCard.test 五个测试文件均 import 本 task 新建的 `db/library`（播种/断言经库句柄），此前漏列 T9 涉及文件列与影响文件树，已补齐；代码无改动。
- 工作区同时存在的 home-nav-hash 改动（`App.tsx`/`App.test.tsx`）属另一任务，未回退，本 task 改动叠加其上。
