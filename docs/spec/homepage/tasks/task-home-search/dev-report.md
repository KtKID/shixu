# task-home-search · dev-report

> task: docs/spec/homepage/tasks/task-home-search/dev-checklist.md
> 创建: 2026-09-11

## 结果

- task 测试：4/4 🟢 全绿（引擎层 bookmark-filter.test.ts 28 用例 + 组件层 SearchBox.test.tsx 4 用例 + 集成层 RecentSection.test.tsx 21 用例，其中本轮新增 17 个）
- 既有回归：通过（本轮实跑 `pnpm test` 全仓：shared 26/26 + extension 211/211；server 无 test script 由 `--if-present` 跳过。`pnpm check` 全绿：typecheck + lint + format:check）
- 高风险行：0 行（清单风险列全 None，无 smoke 强制项；浏览器扩展无法在工作流内加载真实浏览器，无手工 smoke 行需要执行，如实记录）

## 场景覆盖（feat06 · 4/4）

- 场景1 搜到结果（8 用例）：理由/标题/来源域名三域命中、大小写不敏感、URL 路径不参与、null 理由不误命中、空关键词恒命中、结果按收藏时间新到旧、搜索框位于筛选区上方（DOM 顺序断言）、命中条数展示（「N 条结果」）。
- 场景2 没有匹配（2 用例）：引擎层 applyFilter 返回空；UI 层显示「没有找到相关收藏」空状态、不渲染任何 `.bcard`、不显示默认 hint。
- 场景3 与筛选叠加（4 用例）：关键词与四维筛选取「且」（引擎 + UI）；清空关键词回到仅按筛选显示（引擎 + UI）；「清除全部筛选」把搜索词一并清空回到默认「最近添加」视图（emptyFilter() 天然含 query=''，feat05 场景6「回到默认视图」语义的自然延伸，实现未为此加专门逻辑）。
- 场景4 快捷键聚焦（3 用例）：⌘K（meta+K）与 Ctrl+K（ctrl+K）在光标不在搜索框时聚焦；无修饰的 K 与 ⌘J 不抢焦点。

## 实现摘要

- `lib/bookmark-filter.ts`：`FilterSelection` 增加 `query` 字段（emptyFilter 默认 ''）；新增导出 `matchesQuery`（三域不区分大小写包含，trim 后空串恒命中）与 `sourceDomainOf`（hostname 提取，解析失败回退原始 url）；`matchesFilter` 接入关键词「且」叠加。既有 `toggleFilterValue` / FiltersPanel 的 spread 展开天然保留 query，无第二份状态。`hasActiveFilter` 保持只看四维（标题切换语义不变）；候选计数基准集在搜索时随 matchesFilter 自然包含关键词条件（feat05 场景5 未定义搜索下的计数口径，无搜索词时行为不变）。
- `SearchBox.tsx`（新建）：受控输入 + 命中条数（null = 未搜索不展示）；⌘K/Ctrl+K 监听挂 window（与光标位置无关），preventDefault 阻止浏览器默认。
- `RecentSection.tsx`：SearchBox 渲染在 FiltersPanel 上方；`searching || filtering` 时展示全部命中（不再截取 3 条），空态文案按 searching 优先取「没有找到相关收藏」；本地 `sourceDomain` 删除、改用引擎导出的 `sourceDomainOf`（消除重复实现）。
- `index.css`：`.searchbox*` 样式（沿用主页卡片视觉：--card 底、--line 边框、focus-within 高亮）。

## 对账修订

影响文件树含 `sections/RecentSection.test.tsx`（标 M）但 T2「涉及文件」列原无该文件——已补进 T2 行（承载 feat06 场景1/2 的 UI 验收与场景3 的 UI 叠加集成；与 task-home-shell、task-home-filter 经 x-verify 退回后的同类修订口径一致）。任务描述、场景回指、行状态均未改动。修订后机械核对（grep）：树内 7 个文件 ↔ T1（bookmark-filter.ts）、T2（SearchBox.tsx / RecentSection.tsx / RecentSection.test.tsx / index.css）、T3（SearchBox.tsx / SearchBox.test.tsx）、T4（bookmark-filter.test.ts）全部有行级覆盖。

## 过程记录（TDD 测试侧修正，实现未因断言放松而改动）

- T2 场景3 UI 用例初次断言写错：清空搜索框后误期望「世界模型视频」出现——该条不满足已选形态「论文」筛选，本就不该显示；改为断言被搜索挡掉的「别的论文」恢复显示、「世界模型视频」仍不显示。测试修正，实现未动。
- T3 期间发现 ⌘K 实现曾随 T2 的 SearchBox 初稿提前写入，按行序 TDD 纪律先行移除、在 T3 以失败测试确认后重新加入。
- 一处 `as HTMLInputElement` 断言被 eslint（no-unnecessary-type-assertion）与 tsc（HTMLElement 无 value）交叉拒绝，改为 `instanceof HTMLInputElement` 类型守卫；另 2 个文件按 Prettier --write 格式化。均为工程修正，语义不变。
