# task-home-search · 开发清单

> spec: docs/spec/homepage/spec.md
> 创建: 2026-09-11

**状态**：`[ ] ⏳` 未开始 / `[ ] ▶️` 进行中 / `[x] 🟢` 验证通过 / `[!] 🔴` 验证失败

| #   | 任务                                                                                                                                                   | 场景回指            | 涉及文件                                                                                                                                                                                                                              | 风险 | 状态   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ |
| T1  | 关键词匹配（纯函数，扩展 bookmark-filter）：标题、来源域名、收藏理由（note）包含关键词即命中；与已选筛选条件取「且」叠加；清空关键词后回到仅按筛选显示 | feat06 场景1, 场景3 | apps/extension/src/lib/bookmark-filter.ts                                                                                                                                                                                             | None | [x] 🟢 |
| T2  | 搜索框 UI：位于「最近新增」视图筛选区上方；展示命中条数；无匹配显示「没有找到相关收藏」空状态、不显示列表                                              | feat06 场景1, 场景2 | apps/extension/src/entrypoints/home/SearchBox.tsx, apps/extension/src/entrypoints/home/sections/RecentSection.tsx, apps/extension/src/entrypoints/home/sections/RecentSection.test.tsx, apps/extension/src/entrypoints/home/index.css | None | [x] 🟢 |
| T3  | 快捷键聚焦：⌘K（Windows/Linux 为 Ctrl+K）在主页任意位置聚焦搜索框                                                                                      | feat06 场景4        | apps/extension/src/entrypoints/home/SearchBox.tsx, apps/extension/src/entrypoints/home/SearchBox.test.tsx                                                                                                                             | None | [x] 🟢 |
| T4  | unit：匹配域覆盖标题/域名/理由、与筛选叠加、清空恢复、空态                                                                                             | feat06 场景1-3      | apps/extension/src/lib/bookmark-filter.test.ts                                                                                                                                                                                        | None | [x] 🟢 |

## 影响文件树

```text
x-threadpick/
└── apps/extension/src/
    ├── lib/bookmark-filter.ts / bookmark-filter.test.ts      M  # 增加关键词匹配与「且」叠加语义
    └── entrypoints/home/
        ├── SearchBox.tsx / SearchBox.test.tsx                U  # 搜索框、命中条数、⌘K/Ctrl+K 聚焦
        ├── sections/RecentSection.tsx / RecentSection.test.tsx  M  # 接搜索词：叠加过滤、无匹配空态
        └── index.css                                        M  # 搜索框样式（沿用主页设计）
```
