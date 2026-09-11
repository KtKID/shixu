# task-home-filter · 开发清单

> spec: docs/spec/homepage/spec.md
> 创建: 2026-09-11

**状态**：`[ ] ⏳` 未开始 / `[ ] ▶️` 进行中 / `[x] 🟢` 验证通过 / `[!] 🔴` 验证失败

| #   | 任务                                                                                                                                                                                                                                      | 场景回指                          | 涉及文件                                                                                                                                                                                                                                                                                            | 风险 | 状态   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ |
| T1  | 筛选引擎（纯函数）：同一维度内多选取「或」（任一命中）、跨维度取「且」、状态维度单值匹配、主题维度支持「满足任一 / 全部满足」两种模式（默认任一，仅作用于主题）                                                                           | feat05 场景1, 场景2, 场景3, 场景4 | apps/extension/src/lib/bookmark-filter.ts                                                                                                                                                                                                                                                           | None | [x] 🟢 |
| T2  | 候选动态计数（纯函数）：每个候选取值的计数按**其他维度**的已选条件计算、不含本维度已选项的影响；已选候选与计数为 0 的候选始终保留在结果里                                                                                                 | feat05 场景5                      | apps/extension/src/lib/bookmark-filter.ts                                                                                                                                                                                                                                                           | None | [x] 🟢 |
| T3  | 筛选面板 UI：四个维度的候选 chips 取自本地 taxonomy 取值；状态点选即替换（再点取消）、多选维度再点取消单个条件；存在任一筛选时显示「清除全部筛选」，点击回到默认「最近添加」视图；标题切换为「筛选结果 · N 条命中」，结果按收藏时间新到旧 | feat05 场景1, 场景3, 场景4, 场景6 | apps/extension/src/entrypoints/home/FiltersPanel.tsx, apps/extension/src/entrypoints/home/FiltersPanel.test.tsx, apps/extension/src/entrypoints/home/sections/RecentSection.tsx, apps/extension/src/entrypoints/home/sections/RecentSection.test.tsx, apps/extension/src/entrypoints/home/index.css | None | [x] 🟢 |
| T4  | 无命中空态：显示「没有同时满足这些条件的收藏，试试减少一个维度。」，用户已选条件保持可见、可撤销，不自动清除                                                                                                                              | feat05 场景7                      | apps/extension/src/entrypoints/home/sections/RecentSection.tsx, apps/extension/src/entrypoints/home/sections/RecentSection.test.tsx                                                                                                                                                                 | None | [x] 🟢 |
| T5  | unit：把场景 1–7 的 THEN 逐条转为 bookmark-filter 断言（含计数、全部满足切换、状态替换）                                                                                                                                                  | feat05 场景1-7                    | apps/extension/src/lib/bookmark-filter.test.ts                                                                                                                                                                                                                                                      | None | [x] 🟢 |

## 影响文件树

```text
x-threadpick/
└── apps/extension/src/
    ├── lib/bookmark-filter.ts / bookmark-filter.test.ts           U  # 筛选引擎：匹配 + 候选计数（纯函数，单测主战场）
    └── entrypoints/home/
        ├── FiltersPanel.tsx / FiltersPanel.test.tsx               U  # 四维候选面板（状态单选、主题模式切换、计数徽标）
        ├── sections/RecentSection.tsx / RecentSection.test.tsx    M  # 接筛选状态：命中列表、命中数标题、清除全部、无命中空态
        └── index.css                                              M  # 候选 chips 与模式切换样式（沿用主页设计）
```
