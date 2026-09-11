# 设置页新增「创建账号」入口与注册弹窗

> spec: docs/spec/settings/spec.md
> feat: feat03, feat09
> 创建: 2026-09-11

## ① 需求

### 功能方向

在设置页网络/账号卡片的登录按钮旁新增「创建账号」入口，点击弹出创建表单（邮箱 + 设置密码），密码要求包含英文和数字且大于 5 位。创建成功后自动进入已登录状态，无需再手动登录一次。

### 功能边界

- 做：登录旁「创建账号」入口；弹出创建表单（邮箱 + 密码）；密码规则校验（英文+数字、长度 >5 位）；服务端注册接口；创建成功自动登录
- 不做：邮箱验证码/确认邮件、找回密码、再次输入密码确认、OAuth、注册频率限制

### 不能破坏的不变量

- 已有用户仍能正常登录（含 CLI 创建的账号），登录表单行为不变（feat03 场景1-4）
- 退出登录行为不变（feat04）
- 服务端 CLI 建号（create-user / set-password）继续可用
- 登录态持久化：重新打开设置页仍直接显示登录状态卡片

## ② 测试用例（先写，此刻失败）

### unit

shared `packages/shared/src/auth.test.ts`（新建）：

- register_accept：合规密码 `abc123` / `a1b2c3d4` 通过 RegisterRequestSchema → feat09 功能方向
- register_short：密码 5 位（`abc12`）与 4 位（`ab12`）被拒绝 → feat09 场景2（长度 >5 位）
- register_no_digit：纯英文密码 `abcdef` 被拒绝 → feat09 场景2
- register_no_letter：纯数字密码 `123456` 被拒绝 → feat09 场景2
- register_bad_email：非法邮箱被拒绝 → feat09 场景5
- login_min6：LoginRequestSchema 接受 6 位密码（注册规则对齐，否则 6-7 位密码注册后无法登录）→ 不变量「已有用户仍能正常登录」

extension `apps/extension/src/components/settings/api.test.ts`：

- register_ok：200 + 合法响应 → `{ status: 'ok', token, expiresAt }` → feat09 场景1
- register_taken：409 → `{ status: 'email_taken' }` → feat09 场景3
- register_unreachable：网络异常 → `{ status: 'unreachable' }` → feat09 场景4
- register_protocol：响应协议不符 → `{ status: 'server_error' }` → 边界

extension `apps/extension/src/components/settings/AccountCard.test.tsx`：

- entry_visible：未登录时登录按钮旁出现「创建账号」入口（改写原 feat03 场景5 测试）→ feat03 场景5
- register_autologin：mock 创建成功 → 弹窗关闭、显示已登录卡片、会话入库 → feat09 场景1
- register_bad_password：输入不含数字的密码 → 提示规则文案且 register 未被调用 → feat09 场景2
- register_taken：mock email_taken → 提示「该邮箱已注册」、停留弹窗 → feat09 场景3
- register_no_server：currentBaseUrl 为 null → 提示连接失败且 register 未被调用 → feat09 场景4

### smoke

server `apps/server/scripts/smoke-register.ts`（新建，`pnpm smoke:register`）：

- 随机邮箱注册 → 返回 token；用同邮箱密码登录成功；同邮箱重复注册 → 409；不合规密码注册 → 400 → feat09 场景1/2/3 最小真实调用链；登录成功同时回归不变量

### e2e（按需）

不需要，依据：注册链路由 smoke 脚本以真实 HTTP 覆盖，扩展 UI 由组件测试覆盖，无额外跨进程用户链路风险。

## ③ 技术实现

### 实现步骤

1. `packages/shared/src/auth.ts`：新增 `PasswordSchema`（英文+数字、6-128 位）与 `RegisterRequestSchema`；`LoginRequestSchema` 密码下限 8 → 6（与注册规则对齐，否则 6-7 位密码注册后无法登录）
2. `apps/server/src/routes/auth.ts`：新增 `POST /auth/register`——邮箱已存在返回 409 `EMAIL_TAKEN`；否则 argon2 哈希入库并签发 token，201 返回 `LoginResponseSchema`
3. `apps/extension/src/components/settings/api.ts`：新增 `register()` 客户端，409 → email_taken / 网络异常 → unreachable / 协议不符 → server_error
4. `apps/extension/src/components/settings/AccountCard.tsx`：登录按钮旁加「创建账号」link-btn；点击弹出 `role="dialog"` 弹窗（邮箱 + 设置密码）；提交前 schema 校验（邮箱非法与密码不合规分别提示）；成功后复用 `recordServerLogin` 自动登录并关闭弹窗
5. `apps/extension/src/components/settings/cards.css`：新增 `.modal-overlay` / `.modal` 样式
6. `apps/server/scripts/smoke-register.ts` + `package.json` 的 `smoke:register` 脚本：注册链路真实 HTTP 冒烟

### 涉及文件

- packages/shared/src/auth.ts: PasswordSchema / RegisterRequestSchema 新增，LoginRequestSchema 下限对齐 6 位
- packages/shared/src/auth.test.ts: 新增，schema 校验单测
- apps/server/src/routes/auth.ts: 新增 /auth/register 路由
- apps/server/scripts/smoke-register.ts: 新增注册链路冒烟脚本
- apps/server/package.json: 新增 smoke:register 脚本
- apps/extension/src/components/settings/api.ts: 新增 register() 与 RegisterOutcome
- apps/extension/src/components/settings/api.test.ts: register 协议面单测
- apps/extension/src/components/settings/AccountCard.tsx: 创建账号入口 + 注册弹窗
- apps/extension/src/components/settings/AccountCard.test.tsx: feat03 场景5 改写 + feat09 组件测试
- apps/extension/src/components/settings/cards.css: 弹窗样式
- docs/spec/settings/spec.md: feat03 场景5 改写、新增 feat09
- AGENTS.md: 认证决策描述更新（开放注册）

## ④ 验证结果

### 测试输出

`pnpm --filter @x-threadpick/shared test`：

```
 Test Files  7 passed (7)
      Tests  32 passed (32)
```

`pnpm exec vitest run src/components/settings/`（apps/extension）：

```
 ✓ src/components/settings/api.test.ts (19 tests) 8ms
 ✓ src/components/settings/AccountCard.test.tsx (11 tests) 165ms
 ✓ src/components/settings/ServerCard.test.tsx (11 tests) 266ms
 ✓ src/components/settings/DimensionsCard.test.tsx (10 tests) 406ms

 Test Files  4 passed (4)
      Tests  51 passed (51)
```

`pnpm smoke:register`（server 运行于 http://127.0.0.1:60024）：

```
SMOKE OK: 注册 → 登录 → 重复注册 409 → 弱密码 400
```

### 不变量回归

`pnpm smoke`（CLI 建号的既有账号登录 + 同步链路）：

```
SMOKE OK: 登录 → 推送 1 条 → 拉取验证通过
```

扩展全量测试 `pnpm exec vitest run`（含 feat03 场景1-4 登录、feat04 退出、登录态持久化）：

```
 Test Files  17 passed (17)
      Tests  255 passed (255)
```

`pnpm check`（typecheck + lint + format:check）全绿。

### 结论

- [x] 所有需求点被测试覆盖
- [x] 所有测试真实跑过且通过
- [x] 实现在边界内
- [x] 不变量未破坏
