# 同步收藏：手动同步按钮 + 结果计数 + 按账号自动同步

> spec: docs/spec/settings/spec.md
> feat: feat10, feat11
> 创建: 2026-09-11

## ① 需求

### 功能方向

扩展端补出同步客户端：已登录用户在账号卡片点「同步收藏」（在「退出登录」左边）即可把本机收藏与服务器对齐；按钮下方用彩色计数显示本次同步使本机发生的变更（新增绿、删除红、修改中性色）；另提供「自动同步」checkbox，勾选后本机一有收藏/分类变更就自动同步。开关按账号记忆，不同账号互不影响。

### 功能边界

- 做：同步客户端（推送本机变更 + 增量拉取 + LWW 合并）；手动同步按钮与同步中状态；同步结果计数 tips；按账号记忆的自动同步开关；勾选后写操作即时触发同步（短防抖）
- 不做：定时/周期同步、视图（View）的本机存储与应用（协议字段保留、本端忽略）、同步冲突 UI、同步历史记录

### 不能破坏的不变量

- 未登录时一切同步入口不出现、不发起任何网络请求；本机数据为唯一主库，同步失败不丢不改本机数据
- 登录/注册/退出/历史服务器行为不变（feat02/03/04/09）
- 服务端既有 /sync 协议不变（pnpm smoke 继续通过）
- 分类取值本地管理行为不变（feat06/07），删除取值不动书签

## ② 测试用例（先写，此刻失败）

### unit

extension `apps/extension/src/db/sync.test.ts`（新建，stub fetch 模拟服务器 + fake-indexeddb 本地库）：

- sync_not_logged_in：无会话 → `{ status: 'not_logged_in' }`，不发请求 → 不变量「未登录不同步」
- sync_apply_add：拉取到本机没有的远端书签 → 本机新增，计数 added+1 → feat10 场景1/5
- sync_apply_update：同 id 远端 updatedAt 更新 → 覆盖本机，计数 updated+1 → feat10 场景1（LWW）
- sync_keep_local_newer：同 id 本机 updatedAt 更新 → 本机保留，不计数 → feat10 场景5（LWW 反向）
- sync_apply_delete：拉取到墓碑（deletedAt≠null）且比本机新 → 本机软删除，计数 deleted+1 → feat10 场景1
- sync_push_local_changes：本机 lastSyncAt 之后的变更出现在 push 请求体（含 taxonomy），lastSyncAt 更新为 serverTime → feat10 场景5
- sync_taxonomy_lww：远端 taxonomy 更新 → 覆盖本机 taxonomy → feat10 场景5
- sync_unreachable：fetch 抛错 → `{ status: 'unreachable' }`，lastSyncAt 不变 → feat10 场景2 + 不变量「失败不动本机」
- sync_unauthorized：401 → `{ status: 'unauthorized' }` → feat10 场景3
- autosync_debounce：开启自动同步的账号触发 notifyLocalChange → 防抖后自动执行一次 syncNow（fake timers）→ feat11 场景1
- autosync_off：未开启账号触发 notifyLocalChange → 不执行 → feat11 场景2

extension `apps/extension/src/components/settings/api.test.ts`：

- sync_pull_ok / sync_push_ok：200 合法响应解析通过 → feat10 场景1（协议面）
- sync_401：401 → `{ status: 'unauthorized' }` → feat10 场景3
- sync_unreachable：网络异常 → `{ status: 'unreachable' }` → feat10 场景2

shared `packages/shared/src/settings.test.ts`：

- autosync_schema：autoSync 默认空表、记录随 Settings 持久化 → feat11 场景4

extension `apps/extension/src/db/settings.test.ts`：

- autosync_per_account：A 账号开启、B 账号读取互不影响；默认 false → feat11 场景3/4

extension `apps/extension/src/components/settings/AccountCard.test.tsx`：

- sync_button_position：已登录时「同步收藏」在「退出登录」左边；未登录时不出现 → feat10 场景4
- sync_success_tips：mock syncNow 成功 → tips 显示「新增 2 · 修改 1 · 删除 1」，新增绿色/删除红色 class，「上次同步」刷新 → feat10 场景1
- sync_zero_tips：无变更 → 显示「本次同步无变更」→ feat10 场景1
- sync_fail_message：unreachable → 提示失败文案 → feat10 场景2
- sync_expired：unauthorized → 提示登录过期并回到登录表单 → feat10 场景3
- autosync_checkbox：勾选/取消写入按账号设置并即时反映 → feat11 场景1/3

### smoke

复用 `pnpm smoke`（服务端 /sync 协议回归：登录 → 推送 → 拉取）。不新增脚本，依据：本任务不改服务端协议，扩展端同步逻辑由上方 fake-server 单测覆盖真实 HTTP 语义。

### e2e（按需）

不需要，依据：同步链路为「扩展 → 本地 HTTP 服务」单跳，fake-server 单测 + 服务端 smoke 已覆盖两端，无浏览器端跨进程自动化链路可增量覆盖。

## ③ 技术实现

### 实现步骤

1. `packages/shared/src/settings.ts`：`SettingsSchema` 新增 `autoSync: Record<账号key, boolean>`（`.default({})` 兼容旧本地记录，避免回退默认值把用户登出）
2. `apps/extension/src/db/settings.ts`：新增 `accountKey(session)`（`serverUrl#email`）与 `setAutoSync(key, enabled)`
3. `apps/extension/src/components/settings/api.ts`：新增 `syncPull` / `syncPush` 协议客户端（401 → unauthorized，网络异常 → unreachable，协议不符 → server_error）
4. `apps/extension/src/db/sync.ts`（新建）：`syncNow()`——推送 lastSyncAt 之后的本机书签变更（500 条一批，首批带 taxonomy 整包）→ `?since=` 增量拉取 → LWW 应用本机（远端新则覆盖；墓碑软删除；远端复活本机墓碑计为新增）→ taxonomy 整体 LWW → `lastSyncAt = serverTime`。计数只反映本机实际变化
5. `apps/extension/src/db/autosync.ts`（新建）：`notifyLocalChange()` 1.5s 防抖 → 当前账号开启自动同步才执行 syncNow；动态 `import('./sync')` 避免与 bookmarks/taxonomy 的静态循环依赖
6. 写操作接线：`importBookmarks`（有新增时）/ `captureBookmark`（建/改/复活）/ `addTaxonomyValue` / `removeTaxonomyValue` 成功后调用 `notifyLocalChange()`
7. `apps/extension/src/components/settings/AccountCard.tsx`：登录卡片加「同步收藏」（退出登录左边，同步中禁用）；结果 tips（新增绿 `.cnt-add` / 修改中性 `.cnt-upd` / 删除红 `.cnt-del`，零变更显示「本次同步无变更」）；unauthorized → 提示过期并清会话；「自动同步」checkbox 读写按账号设置
8. `apps/extension/src/components/settings/cards.css`：`.check-row` / `.sync-tips` / 计数配色

### 涉及文件

- packages/shared/src/settings.ts + settings.test.ts: autoSync 字段（默认 {}，按账号 key）
- apps/extension/src/db/settings.ts + settings.test.ts: accountKey / setAutoSync
- apps/extension/src/db/sync.ts + sync.test.ts: 同步客户端本体与计数
- apps/extension/src/db/autosync.ts: 自动同步防抖触发器
- apps/extension/src/db/bookmarks.ts / taxonomy.ts: 写操作接线 notifyLocalChange；taxonomy 新增 saveTaxonomy
- apps/extension/src/components/settings/api.ts + api.test.ts: syncPull / syncPush
- apps/extension/src/components/settings/AccountCard.tsx + AccountCard.test.tsx: 按钮 / tips / checkbox
- apps/extension/src/components/settings/cards.css: tips 与 checkbox 样式
- docs/spec/settings/spec.md: 新增 feat10 / feat11
- AGENTS.md: 仓库状态与待做清单更新

## ④ 验证结果

### 测试输出

`pnpm exec vitest run`（apps/extension，全量 18 个文件）：

```
 Test Files  18 passed (18)
      Tests  279 passed (279)
```

其中本任务新增：sync.test.ts 11 条、api.test.ts sync 4 条、settings.test.ts 自动同步 3 条、AccountCard.test.tsx feat10/feat11 共 7 条，shared settings.test.ts 2 条。

`pnpm --filter @x-threadpick/shared test`：

```
      Tests  34 passed (34)
```

### 不变量回归

服务端协议未改，`pnpm smoke` / `pnpm smoke:register`（server 运行于 http://127.0.0.1:60024）：

```
SMOKE OK: 登录 → 推送 1 条 → 拉取验证通过
SMOKE OK: 注册 → 登录 → 重复注册 409 → 弱密码 400
```

`pnpm check`：typecheck（三包）+ eslint 全过；prettier 仅剩 `docs/spec/capture/tasks/task-popup-height-fit.md` 一个警告——该文件是另一任务的未提交改动（本任务期间被外部修改），不属于本任务边界，未处理。

### 结论

- [x] 所有需求点被测试覆盖
- [x] 所有测试真实跑过且通过
- [x] 实现在边界内
- [x] 不变量未破坏
