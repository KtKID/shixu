# task-capture-form · 开发清单

> spec: docs/spec/capture/spec.md
> 创建: 2026-09-10
> 备注: 本 task 由前端负责人执行。覆盖 feat03（一句话理由）、feat04（四维点选）；在 task-capture-open 的面板骨架上开发，chips 交互可内联 App.tsx 也可拆 popup/ 下新组件，由实现者定。

**状态**：`[ ] ⏳` 未开始 / `[ ] ▶️` 进行中 / `[x] 🟢` 验证通过 / `[!] 🔴` 验证失败

| #   | 任务                                                                                                                                                                                                                            | 场景回指                          | 涉及文件                                                                                                                                        | 风险 | 状态   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ |
| T1  | （TDD）理由输入框：可输入任意文字、可留空，标签「为什么收藏？」+ 提示「可选，但这句话以后最管用」                                                                                                                               | feat03 场景1                      | apps/extension/src/entrypoints/popup/App.tsx, apps/extension/src/entrypoints/popup/App.test.tsx                                                 | None | [x] 🟢 |
| T2  | （TDD）键盘行为：理由框内 Enter 触发「保存并关闭 Tab」、输入法组字中的 Enter 只上屏不触发（isComposing 判定）、Shift+Enter 换行、Esc 关闭面板且不保存                                                                           | feat03 场景2, 场景3, 场景4, 场景5 | apps/extension/src/entrypoints/popup/App.tsx, apps/extension/src/entrypoints/popup/App.test.tsx                                                 | None | [x] 🟢 |
| T3  | （TDD）四维点选：主题/形态/用途多选 toggle，状态单选且默认选中「Inbox」；取值来自本地分类取值集合（db/taxonomy 的 getTaxonomy，复用现有函数）；面板下方提示「维度的取值在『设置』里统一管理，这里只做点选」，面板内不提供增删改 | feat04 场景1, 场景2, 场景3        | apps/extension/src/entrypoints/popup/App.tsx, apps/extension/src/entrypoints/popup/index.css, apps/extension/src/entrypoints/popup/App.test.tsx | None | [x] 🟢 |
| T4  | （TDD）零点选默认态：不动任何分类时，状态保持「Inbox」选中、其余三维全空（落库终验在 task-capture-save 集成行完成）                                                                                                             | feat04 场景4                      | apps/extension/src/entrypoints/popup/App.tsx, apps/extension/src/entrypoints/popup/App.test.tsx                                                 | None | [x] 🟢 |

## 影响文件树

```text
x-threadpick/
├── apps/extension/src/entrypoints/popup/App.tsx      M  # 理由输入框键盘行为与四维 chips 交互
├── apps/extension/src/entrypoints/popup/index.css    M  # chips 选中态样式
└── apps/extension/src/entrypoints/popup/App.test.tsx M  # 键盘行为与 chips 交互用例
```
