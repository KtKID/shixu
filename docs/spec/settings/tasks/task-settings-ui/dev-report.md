# task-settings-ui · dev-report

> task: docs/spec/settings/tasks/task-settings-ui/dev-checklist.md
> 创建: 2026-09-10

## 结果

- task 测试：5/5 行 🟢；扩展包 vitest 72/72 全绿（db 门面 25 · api 协议 12 · 组件场景 35）
- 既有回归：通过（shared vitest 全绿；server 冒烟 `smoke`（登录→推送→拉取）与 `smoke-settings`（healthz→taxonomy seed/LWW→sync 兼容）双通过；全仓 `pnpm check` 三项全绿；chrome-mv3 / firefox-mv2 构建通过且 settings 页与 host 权限正确入 manifest）
- 高风险行：本 task 无 `高:` 行。数据层高危行为（LWW 冲突取舍）属 task-extension-settings-store T4，尚未实现，不在本 task 范围
- TDD 说明：数据层门面与 T1 骨架严格执行红→绿；T2–T5 的交互实现随骨架批次落地，场景测试随后补齐锁定（非先红后绿）

## 范围说明（超出 checklist 涉及文件的改动，均有依据）

1. **前置依赖补齐**：checklist 备注指向 task-extension-settings-store 的门面模块，但该 task 尚未执行（其 checklist 全部 ⏳）。本 task 按其 T1–T3 的文件布局与规则补齐了 `src/db/settings.ts`、`src/db/taxonomy.ts`（含单测），即 store task T1–T3 的实现面。store task 剩余工作收敛为：核对/接管这两个文件、完成 T4 taxonomy 登录同步（`src/sync/taxonomy.ts`）。
2. `apps/extension/src/db/bookmarks.ts`：Dexie `version(2)` 增加 `taxonomies` 表（store task T3 计划内改动）。
3. `apps/extension/wxt.config.ts`：manifest 增加 `host_permissions: ['http://*/*', 'https://*/*']`——设置页需在扩展上下文内 fetch 用户自建服务器，无此权限会被 CORS 拦截；Firefox MV2 由 WXT 自动并入 permissions（已核对构建产物）。
4. `apps/extension/package.json` + `vitest.config.ts` + `vitest.setup.ts`：测试基建（vitest + jsdom + @testing-library/react + fake-indexeddb + WxtVitest 插件），store task T1 计划内改动。
5. **设计稿偏差（按 spec 修订执行）**：`docs/assets/settings.html` 中状态维度标注「单选 · 流转」且支持拖拽排序；spec feat05 场景2（2026-09 修订）明确状态取值间**无流转语义**，实现为「单选」徽标、无箭头无拖拽。登录表单按 feat03 场景5 不渲染设计稿中的「注册」链接。
6. **协议面**：`packages/shared` 现有导出已覆盖设置页全部需要（Settings/ServerRecord/Session/Health/Login/Taxonomy/DEFAULT_TAXONOMY_VALUES 等），未新增导出——schema 唯一真源不动，前端出入边界一律 `safeParse/parse`。

## 验证证据

```verify
id: A1
scenario: feat01 场景1, feat01 场景2, feat01 场景3
cmd: pnpm --filter @x-threadpick/extension exec vitest run src/entrypoints/settings/api.test.ts src/entrypoints/settings/ServerCard.test.tsx
expect_contains: passed
mode: auto
```

```verify
id: A2
scenario: feat02 场景1, feat02 场景2, feat02 场景3, feat02 场景4, feat02 场景5
cmd: pnpm --filter @x-threadpick/extension exec vitest run src/db/settings.test.ts src/entrypoints/settings/ServerCard.test.tsx
expect_contains: passed
mode: auto
```

```verify
id: A3
scenario: feat03 场景1, feat03 场景2, feat03 场景3, feat03 场景4, feat03 场景5, feat04 场景1
cmd: pnpm --filter @x-threadpick/extension exec vitest run src/entrypoints/settings/AccountCard.test.tsx
expect_contains: passed
mode: auto
```

```verify
id: A4
scenario: feat05 场景1, feat05 场景2, feat06 场景1, feat06 场景2, feat06 场景3, feat06 场景4, feat06 场景5, feat07 场景1, feat07 场景2, feat07 场景3, feat07 场景4
cmd: pnpm --filter @x-threadpick/extension exec vitest run src/db/taxonomy.test.ts src/entrypoints/settings/App.test.tsx src/entrypoints/settings/DimensionsCard.test.tsx
expect_contains: passed
mode: auto
```

```verify
id: A5
scenario: feat01 场景1, feat02 场景1, feat03 场景1, feat05 场景2
cmd: pnpm check
expect_contains: All matched files use Prettier code style!
mode: auto
timeout: 300000
```

```verify
id: A6
scenario: feat05 场景2
cmd: pnpm build:ext && pnpm build:ext:firefox
expect_contains: Finished
mode: auto
timeout: 300000
```

```verify
id: M1
scenario: feat01 场景1, feat03 场景1, feat03 场景2
mode: manual
steps: 起本地服务（apps/server 下 `PORT=8791 JWT_SECRET=<≥16字符> pnpm start`，CLI 预建账号）；Chrome 加载 .output/chrome-mv3 或 `pnpm dev:ext`，打开扩展 settings 页；服务器卡填 127.0.0.1:8791 点「测试连接」应显示连接成功+延迟+版本；账号卡用错误密码登录应提示「邮箱或密码不正确」，正确密码登录后出现登录态卡片且历史服务器记录该地址。
```

```verify
id: M2
scenario: feat01 场景3, feat02 场景2, feat03 场景4, feat06 场景4
mode: manual
steps: 同 M1 环境。填不存在的地址测连接应显示「无法访问服务器或连接超时」且登录态不变；登录成功后关闭再打开设置页应直接显示登录态卡片；历史列表点击其它条目应切换并自动测试；维度输入 31 字应提示「取值过长」；视觉对照 docs/assets/settings.html（状态维度为「单选」、无流转箭头与拖拽，注册链接不出现）。
```

## 自检结论

本人（x-dev）已在本机运行全部 auto verify 命令，并确认结果与本报告一致（A1–A6 全部通过；M1/M2 的服务端部分已在冒烟中覆盖，浏览器端步骤待人工/verify 阶段执行）。
本报告由 x-dev 于 2026-09-10 生成。
