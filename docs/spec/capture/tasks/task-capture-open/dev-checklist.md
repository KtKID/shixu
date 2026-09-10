# task-capture-open · 开发清单

> spec: docs/spec/capture/spec.md
> 创建: 2026-09-10
> 备注: 本 task 由前端负责人执行。覆盖 feat01（打开收藏面板）、feat02（页面信息展示）、feat07（底部库入口）；依赖 task-classification-types 完成后的协议（形态多选）。样式以 docs/assets/popup.html 为基准。

**状态**：`[ ] ⏳` 未开始 / `[ ] ▶️` 进行中 / `[x] 🟢` 验证通过 / `[!] 🔴` 验证失败

| #   | 任务                                                                                                                                                                                                                                                                                              | 场景回指                                        | 涉及文件                                                                                                                                        | 风险 | 状态   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ |
| T1  | 声明快捷命令：manifest `commands` 注册 `capture-current-tab`，建议键 `{ default: Ctrl+Shift+S, mac: Command+Shift+S }`；不新增 permission（commands API 免权限）                                                                                                                                  | feat01 场景2, 场景3                             | apps/extension/wxt.config.ts                                                                                                                    | None | [x] 🟢 |
| T2  | （TDD）命令处理 `capture-invoke`：取当前活动标签 → 仅 http(s) 页面放行 → 暂存目标信息（标签 id、地址、标题、是否固定）供面板读取 → 打开面板：`action.openPopup()` 可用则用（Chrome 127+），否则 `windows.create` 弹小窗打开同一面板页兜底（Firefox MV2 走此路径）；background 注册 onCommand 监听 | feat01 场景2, 场景4                             | apps/extension/src/lib/capture-invoke.ts, apps/extension/src/lib/capture-invoke.test.ts, apps/extension/src/entrypoints/background.ts           | None | [x] 🟢 |
| T3  | （TDD）面板骨架重构：popup 改为收藏面板——顶栏（拾绪 + 当前平台快捷键提示）、只读页面信息（标题最多两行截断、地址截断、首字母色块，不请求外部图标）、底部「已入库 N 条」与「打开导入器」链接；打开时光标停在理由输入框                                                                             | feat01 场景1, feat02 场景1, feat07 场景1, 场景2 | apps/extension/src/entrypoints/popup/App.tsx, apps/extension/src/entrypoints/popup/index.css, apps/extension/src/entrypoints/popup/App.test.tsx | None | [x] 🟢 |
| T4  | （TDD）不可收藏判定与禁用态：非 http(s) 页面（浏览器内部页、本地文件页、扩展自身页）显示「此页面无法收藏」，两个保存按钮、理由输入、分类点选全部不可用                                                                                                                                            | feat01 场景4, feat02 场景2                      | apps/extension/src/entrypoints/popup/App.tsx, apps/extension/src/entrypoints/popup/App.test.tsx                                                 | None | [x] 🟢 |
| T5  | 手动链路验证：Chrome 与 Firefox 双构建加载——点图标打开、快捷键打开、快捷键被占用时在浏览器快捷键管理页手动指定后可用、内部页/本地文件页禁用态、空库显示「已入库 0 条」                                                                                                                            | feat01 场景1-4, feat02 场景1-2, feat07 场景1-2  | 无新文件                                                                                                                                        | None | [ ] ▶️ |

## 影响文件树

```text
x-threadpick/
├── apps/extension/wxt.config.ts                      M  # manifest.commands 声明 capture-current-tab 与建议快捷键
├── apps/extension/src/entrypoints/background.ts      M  # 注册快捷命令监听
├── apps/extension/src/lib/capture-invoke.ts          U  # 新增：取活动标签/校验/暂存目标/开面板（openPopup 优先、小窗兜底）
├── apps/extension/src/lib/capture-invoke.test.ts     U  # 新增：命令处理单元测试
├── apps/extension/src/entrypoints/popup/App.tsx      M  # 重构为收藏面板骨架：顶栏/页面信息/底部库入口/不可收藏禁用态
├── apps/extension/src/entrypoints/popup/index.css    M  # 设计稿 popup.html 样式迁移
└── apps/extension/src/entrypoints/popup/App.test.tsx U  # 新增：面板骨架与禁用态组件测试
```
