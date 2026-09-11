# task-home-import · 开发清单

> spec: docs/spec/homepage/spec.md
> 创建: 2026-09-11

**状态**：`[ ] ⏳` 未开始 / `[ ] ▶️` 进行中 / `[x] 🟢` 验证通过 / `[!] 🔴` 验证失败

| #   | 任务                                                                                                                                                                                          | 场景回指            | 涉及文件                                                                                                                                                   | 风险 | 状态   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ |
| T1  | 「导入已有书签」分区：读取浏览器书签树（复用 lib/bookmark-tree 展平+文件夹路径），搜索过滤标题/URL、勾选、导入并展示结果反馈（导入 N / 已存在跳过 / 无效 URL 计数）；接入主页导航替换占位分区 | feat03 场景1        | apps/extension/src/entrypoints/home/sections/ImportSection.tsx, apps/extension/src/entrypoints/home/App.tsx, apps/extension/src/entrypoints/home/index.css | None | [x] 🟢 |
| T2  | 判重语义：复用 db/bookmarks.ts 的 importBookmarks（URL 规范化 → urlNormalized 判重，标题或来源文件夹不同仍识别为同一条），对跳过条目给出「已收藏过」的可感知提示，不产生第二条                | feat03 场景2        | apps/extension/src/entrypoints/home/sections/ImportSection.tsx                                                                                             | None | [x] 🟢 |
| T3  | 浏览器无书签空状态：显示「浏览器中没有可导入的书签」，不显示搜索框与导入按钮                                                                                                                  | feat03 场景3        | apps/extension/src/entrypoints/home/sections/ImportSection.tsx                                                                                             | None | [x] 🟢 |
| T4  | 未登录导入链路：不连接服务器直接落本地库，导入成功后「最近新增」立即可见（导入后状态默认 Inbox）                                                                                              | feat03 场景4        | apps/extension/src/entrypoints/home/sections/ImportSection.tsx                                                                                             | None | [x] 🟢 |
| T5  | unit/smoke：搜索 → 勾选 → 导入 → 最近新增出现新条目；同 URL 二次导入被跳过并提示                                                                                                              | feat03 场景1, 场景2 | apps/extension/src/entrypoints/home/sections/ImportSection.test.tsx                                                                                        | None | [x] 🟢 |

## 影响文件树

```text
x-threadpick/
└── apps/extension/src/entrypoints/home/
    ├── App.tsx                                      M  # 「导入已有书签」条目接入真实分区（替换占位）
    ├── index.css                                    M  # 导入分区样式（沿用主页设计）
    └── sections/ImportSection.tsx / .test.tsx       U  # 搜索/勾选/导入/判重提示/空态（复用 bookmark-tree 与 importBookmarks，不改数据层）
```
