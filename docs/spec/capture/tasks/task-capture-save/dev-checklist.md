# task-capture-save · 开发清单

> spec: docs/spec/capture/spec.md
> 创建: 2026-09-10
> 备注: 本 task 由前端负责人执行。覆盖 feat05（保存两式）、feat06（重复收藏）；在 task-capture-open（骨架/目标信息）与 task-capture-form（表单状态）之上开发，含本地库 upsert 数据层。

**状态**：`[ ] ⏳` 未开始 / `[ ] ▶️` 进行中 / `[x] 🟢` 验证通过 / `[!] 🔴` 验证失败

| #   | 任务                                                                                                                                                                                                                                                      | 场景回指                                 | 涉及文件                                                                                        | 风险                                                                                                           | 状态   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| T1  | （TDD）本地库 upsert：新增 `getBookmarkByUrl`（规范化地址判重预读）与 `captureBookmark`（新建=默认分类落库；命中=同一条更新：标题刷新、修改时间前移、理由与四维按面板内容覆盖、清空理由置空、曾软删除的复活并保留创建时间）；出入库经 BookmarkSchema 校验 | feat05 场景1, feat06 场景2, 场景3, 场景4 | apps/extension/src/db/bookmarks.ts, apps/extension/src/db/bookmarks.test.ts                     | 高:更新为覆盖语义，直接决定既有理由/分类是否被丢；须数据层测试覆盖各分支并配合 T5 真实链路验证，不允许只有单测 | [x] 🟢 |
| T2  | （TDD）面板预填：命中已有记录显示「已收藏过 · 保存将更新」，理由与四维按库中内容预填（状态选中其当前状态）                                                                                                                                                | feat06 场景1                             | apps/extension/src/entrypoints/popup/App.tsx, apps/extension/src/entrypoints/popup/App.test.tsx | None                                                                                                           | [x] 🟢 |
| T3  | （TDD）保存动作与横幅：「保存并关闭 Tab」（含理由框 Enter）与「仅保存」→ captureBookmark → 横幅「✓ 已存入 <状态名>（，Tab 即将关闭）」→ 关闭目标标签页与面板；保存进行中忽略重复点击；零点选默认态经保存链路正确落库（空主题/形态/用途 + Inbox）          | feat05 场景1, 场景2, 场景6, feat04 场景4 | apps/extension/src/entrypoints/popup/App.tsx, apps/extension/src/entrypoints/popup/App.test.tsx | None                                                                                                           | [x] 🟢 |
| T4  | （TDD）关 Tab 边界：固定标签页保存但不关（横幅「✓ 已保存；固定标签页未关闭」）、窗口最后一个标签页随窗口关闭、面板期间目标已被关则照常保存跳过关页                                                                                                        | feat05 场景3, 场景4, 场景5               | apps/extension/src/entrypoints/popup/App.tsx, apps/extension/src/entrypoints/popup/App.test.tsx | None                                                                                                           | [x] 🟢 |
| T5  | 手动链路验证：真实页面新收藏（两种保存）、同一页重复收藏预填与更新、清空理由保存后确认为空、固定页/最后标签页/输入法组字回车、popup 与小窗兜底两种面板载体各过一遍                                                                                        | feat05 场景1-6, feat06 场景1-4           | 无新文件                                                                                        | None                                                                                                           | [x] 🟢 |

## 影响文件树

```text
x-threadpick/
├── apps/extension/src/db/bookmarks.ts                M  # 新增 getBookmarkByUrl 与 captureBookmark（判重预读 + 更新/复活 upsert）
├── apps/extension/src/db/bookmarks.test.ts           U  # 新增：新建/更新/清空理由/复活/默认值落库
├── apps/extension/src/entrypoints/popup/App.tsx      M  # 预填提示、保存动作、横幅、关 Tab 边界与防重复
└── apps/extension/src/entrypoints/popup/App.test.tsx M  # 保存链路与边界用例
```
