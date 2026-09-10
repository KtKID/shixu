# task-capture-save · dev-report

> task: docs/spec/capture/tasks/task-capture-save/dev-checklist.md
> 创建: 2026-09-10

## 结果

- task 测试：T1–T4 🟢（新增 18 条用例：db/bookmarks.test.ts 6 条数据层分支 + App.test.tsx 12 条保存链路/预填/边界）；T5 保持 ▶️（见未决）
- 既有回归：通过（apps/extension 全量 131/131；根目录 `pnpm check` 三包 typecheck + lint + format 全绿；Chrome/Firefox 双构建成功，manifest 断言通过）
- 高风险行：T1（覆盖语义 upsert）——数据层测试覆盖全部分支（新建/默认落库/命中更新/清空理由置空/软删除复活保留 createdAt/规范化判重），出入库经 BookmarkSchema 校验；真实链路部分随 T5 待人工真机验证

## 未决

- T5 · 真机链路无法自动验证 · 已自动完成：Chrome/Firefox 双构建 + manifest/popup 产物断言；待人工真机验证清单：真实页面新收藏（保存并关闭 Tab / 仅保存两式）、同一页重复收藏的预填与更新、清空理由保存后确认为空、固定标签页不关、窗口最后一个标签页连带关窗、输入法组字回车只上屏、popup 与小窗兜底（Firefox）两种面板载体各过一遍
- 测试修正 1 · T1「规范化判重」用例初版用 `?utm_source=x&b=1` 做查询地址，`b` 不是追踪参数、规范化后保留 → 与库中记录本就不是同一页 · 属测试用例写错，改为纯追踪参数查询；实现未变
- 测试修正 2 · capture-form 遗留的 5 条键盘行为用例原断言注入式占位 props（onSaveAndClose/onSaveOnly）· 本 task 将占位替换为真实保存实现（props 改为 `bannerDelayMs` 注入横幅停留时长），相关用例改写为对真实效果的断言（落库行数/横幅文案/tabs.remove/window.close）；feat03 场景2-5 的行为契约保持不变且全部有覆盖
- 实现说明 · T4 三个关 Tab 边界（pinned 不关、tabs.remove 抛错跳过、最后标签页无特判）随 T3 的 save() 一并落地，T4 以测试钉住行为意图（含「不调 windows.remove」的反向断言）
- 越界说明 · `popup/index.css` 不在本 task 涉及文件内，追加了两节样式：`.saved-banner`（feat05 横幅，设计稿 popup.html 原有样式的迁移补漏）与 `.update-hint`（feat06 场景1「已收藏过 · 保存将更新」提示条）；无行为逻辑变化
