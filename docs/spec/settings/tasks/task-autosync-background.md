# 自动同步移到后台进程执行

> spec: docs/spec/settings/spec.md
> feat: feat11
> 创建: 2026-09-11

## ① 需求

### 功能方向

修复「勾了自动同步但实际没同步」：目前自动同步的等待计时跑在收藏面板里，面板一关计时就被销毁，同步永远不会发生。改为收藏操作只负责通知后台，由后台进程等待并执行同步——面板关闭不影响。

### 功能边界

- 做：写操作改为向后台发「本地有变更」通知；后台进程统一防抖并执行自动同步；防抖语义不变（连续变更合并为一次）
- 不做：变更队列持久化（浏览器完全关闭期间的变更靠下次打开后的手动/自动同步覆盖）、同步失败重试策略

### 不能破坏的不变量

- feat11 场景1-4 不变：只有勾选自动同步的账号才会自动同步；防抖仍存在；手动同步行为不变
- 未登录、同步失败时不影响任何本地写操作本身（通知失败静默忽略）
- feat10 手动同步与计数 tips 不变

## ② 测试用例（先写，此刻失败）

### unit

extension `apps/extension/src/db/sync.test.ts`（改写原 autosync 两条用例）：

- autosync_bg_debounce：开启的账号，后台收到两次 `local-change` 通知 → 防抖后只执行一次同步（fake timers + fetch 断言）→ feat11 场景1/5
- autosync_bg_off：未开启账号收到通知 → 不执行 → feat11 场景2
- autosync_bg_bad_message：非协议消息被忽略不抛错 → 边界

extension `apps/extension/src/db/autosync.test.ts`（新建）：

- notify_sends_message：notifyLocalChange 向后台发送 local-change 消息（spy runtime.sendMessage）→ feat11 场景5
- notify_silent_when_no_receiver：无接收方时通知静默失败不抛错 → 不变量「不影响写操作」

### smoke

不需要新增，依据：不改同步协议与服务端；`pnpm smoke` 回归即可。

### e2e（按需）

不需要，依据：消息通道为扩展内部通信，fakeBrowser 单测覆盖；真实面板关闭场景属浏览器生命周期，构建后人工验证一次。

## ③ 技术实现

### 实现步骤

1. `packages/shared/src/messages.ts`（新建，index.ts 导出）：`AutoSyncMessageSchema = { type: 'local-change' }`——最初放在扩展 `src/lib/messages.ts`，但扩展包未直接依赖 zod（dev-ts 要求 schema 唯一真源在 shared），改放 shared
2. `apps/extension/src/db/autosync.ts`（改写）：`notifyLocalChange()` 不再本地计时，改为 `runtime.sendMessage` 通知后台（无接收方时 catch 静默）；新增 `handleAutoSyncTrigger(raw)`——schema 校验 → 1.5s 防抖 → 当前账号开启自动同步才 `syncNow()`（动态 import 避免循环依赖）
3. `apps/extension/src/entrypoints/background.ts`：`onMessage` 监听接入 `handleAutoSyncTrigger`，防抖计时随 background 存活
4. `apps/extension/src/db/sync.ts`：移除对 autosync 的转发导出（调用方直连 autosync）

### 涉及文件

- packages/shared/src/messages.ts / index.ts: AutoSyncMessageSchema
- apps/extension/src/db/autosync.ts + autosync.test.ts: 消息化触发器
- apps/extension/src/db/sync.test.ts: autosync 用例改写为后台触发语义
- apps/extension/src/entrypoints/background.ts: onMessage 接线
- apps/extension/src/db/sync.ts: 移除转发导出
- docs/spec/settings/spec.md: feat11 新增场景5

## ④ 验证结果

### 测试输出

`pnpm exec vitest run`（apps/extension 全量 19 个文件）：

```
 Test Files  19 passed (19)
      Tests  283 passed (283)
```

### 不变量回归

`pnpm check`：typecheck + eslint 全过；prettier 仅剩 `docs/spec/capture/tasks/task-popup-height-fit.md`（另一任务的未提交改动，非本任务边界）。`pnpm build:ext`（Chrome MV3）构建成功：Σ 595.31 kB。

手动验证步骤（构建后）：加载 dist/chrome-mv3 → 勾选自动同步 → 收藏一条新页面并立即关闭面板 → 稍后点「同步收藏」应显示「本次同步无变更」（自动同步已在后台完成，lastSyncAt 已前移）。

### 结论

- [x] 所有需求点被测试覆盖
- [x] 所有测试真实跑过且通过
- [x] 实现在边界内
- [x] 不变量未破坏
