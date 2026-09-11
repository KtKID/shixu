# 同步反馈补上传计数 + 账号卡片布局修正

> spec: docs/spec/settings/spec.md
> feat: feat10
> 创建: 2026-09-11

## ① 需求

### 功能方向

点「同步收藏」后，tips 除了显示本机被同步改动多少条，也显示这次上传了多少条本机变更到服务器——否则刚导入书签点同步显示「无变更」，看起来像没同步成功。同时修账号卡片布局：按钮在「同步收藏/同步中…」切换时宽度固定不跳动，登录状态条从一行左中右改为上下分区、间隔均匀的布局。

### 功能边界

- 做：tips 增加「上传 N」计数（本次推送到服务器的本机变更条数）；同步按钮固定宽度；账号卡片登录态布局重排（上：身份+退出；下：操作区：同步按钮+自动同步开关；再下：tips）
- 不做：同步进度条、逐条变更明细列表、历史同步记录

### 不能破坏的不变量

- feat10 场景1-5 的同步行为与计数语义不变（本机变更计数口径不变，上传计数为新增展示）
- feat11 自动同步开关行为与位置语义不变

## ② 测试用例（先写，此刻失败）

### unit

extension `apps/extension/src/db/sync.test.ts`：

- sync_pushed_count：本机 2 条变更 → 结果 `pushed: 2`（既有 sync_push_local_changes 用例补充断言）→ feat10 场景1（上传计数）
- 既有 sync_apply_add 等用例的结果对象补充 `pushed` 字段断言 → feat10 场景1

extension `apps/extension/src/components/settings/AccountCard.test.tsx`：

- sync_tips_with_push：mock 返回 pushed=3 → tips 显示「上传 3」（.cnt-push）→ feat10 场景1
- sync_zero_tips 修订：changes 全零且 pushed=0 → 「本次同步无变更」；pushed>0 时不显示「无变更」→ feat10 场景1
- sync_button_stable：同步按钮带固定宽度 class（btn-sync），同步中仅文案变化 → feat10 场景1（位置不跳变）
- session_layout：退出登录位于身份行（session-top），同步收藏位于操作行（session-ops）→ 布局修正

### smoke

不需要新增，依据：本任务只改扩展端展示与布局，不改协议；`pnpm smoke` 回归即可。

### e2e（按需）

不需要，依据：布局与文案为纯前端展示，jsdom 结构断言 + 人工构建后目测。

## ③ 技术实现

### 实现步骤

1. `apps/extension/src/db/sync.ts`：`SyncResult` ok 分支新增 `pushed`（本次推送的本机变更条数 = 过滤后 changed.length）
2. `apps/extension/src/components/settings/AccountCard.tsx`：登录卡片重排为 `session-top`（身份 + 退出登录）/ `session-ops`（同步按钮 + 自动同步 checkbox）两层；tips 只在计数非零时展示对应项，`pushed > 0` 时追加「上传 N」（.cnt-push）；双向皆零才显示「本次同步无变更」；同步按钮加固定宽度 class `btn-sync`
3. `apps/extension/src/components/settings/cards.css`：`.session` 改纵向 flex（gap 12）；新增 `.session-top` / `.session-ops`（虚线分隔）/ `.btn-sync`（min-width 96px）/ `.check-inline` / `.cnt-push`（蓝）；删除被取代的 `.check-row`

### 涉及文件

- apps/extension/src/db/sync.ts + sync.test.ts: pushed 计数
- apps/extension/src/components/settings/AccountCard.tsx + AccountCard.test.tsx: 布局重排 + tips 上传计数
- apps/extension/src/components/settings/cards.css: 布局与配色
- docs/spec/settings/spec.md: feat10 场景1 补充（上传计数、按钮不跳变）

## ④ 验证结果

### 测试输出

`pnpm exec vitest run`（apps/extension 全量）：

```
 Test Files  18 passed (18)
      Tests  280 passed (280)
```

`pnpm exec vitest run src/components/settings/`（改后复跑）：

```
 Test Files  4 passed (4)
      Tests  63 passed (63)
```

### 不变量回归

`pnpm check`：typecheck + eslint 全过；prettier 仅剩 `docs/spec/capture/tasks/task-popup-height-fit.md`（另一任务的未提交改动，非本任务边界）。`pnpm build:ext`（Chrome MV3）构建成功：Σ 494.52 kB。

### 结论

- [x] 所有需求点被测试覆盖
- [x] 所有测试真实跑过且通过
- [x] 实现在边界内
- [x] 不变量未破坏
