# task-capture-open · dev-report

> task: docs/spec/capture/tasks/task-capture-open/dev-checklist.md
> 创建: 2026-09-10

## 结果

- task 测试：T1–T4 🟢 全绿（本 task 新增 29 条用例：capture-invoke 16 条 + popup 面板 13 条）；T5 保持 ▶️（见未决）
- 既有回归：通过（apps/extension 全量 101/101；根目录 `pnpm check` 三包 typecheck + lint + format 全绿）
- 高风险行：0 行（本 task 全部风险列为 None）；T5 的自动可验证部分（Chrome/Firefox 双构建成功、产物 manifest 含 `commands.capture-current-tab` 声明与 popup.html、权限含 activeTab）已验证通过

## 未决

- T5 · 真机加载链路无法自动验证 · 已自动完成：双构建 + manifest/popup 产物断言；待人工真机验证：点图标打开、快捷键唤起、快捷键被占用时在浏览器快捷键管理页手动指定后可用、内部页/本地文件页禁用态、空库「已入库 0 条」
- 越界说明 1 · `packages/shared/src/capture-target.ts`（+ index.ts 导出）不在 checklist 涉及文件内 · 原因：background → popup 经 `browser.storage.session` 传递 CaptureTarget，属跨上下文存储边界，按「zod 唯一真源 + 边界运行时校验」规范 schema 只能放 shared
- 越界说明 2 · `wxt.config.ts` 追加 `activeTab` 权限（T1 原文「不新增 permission」仅覆盖 commands API 本身）· 原因：快捷键/图标唤起路径下读取活动标签 url/title 需要 activeTab（无安装警告），未加 tabs 权限
- 测试修正 1 · T3「保存按钮可用」用例初版在 loading 态即断言（按钮初始 disabled），改为等页面标题渲染后再断言 · 属测试时序问题，实现未变
- 测试修正 2 · feat07 场景1 用例中 `openOptionsPage` mock 改为 pending promise · 原因：实现随后调用 `window.close()`，jsdom 下会销毁 document 导致后续用例 cleanup 报错
- 实现取舍 · React `autoFocus` 对异步挂载的 textarea 不触发聚焦，光标落输入框改用 ref + effect 显式 focus（feat01 场景1 有组件测试覆盖）
