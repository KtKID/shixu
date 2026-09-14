# 全部收藏页新增收藏时间下拉筛选

> spec: docs/spec/homepage/spec.md
> feat: feat08
> 创建: 2026-09-14

## ① 需求

### 功能方向

「全部收藏」页在标签筛选与书签列表之间新增一个「收藏时间」下拉筛选，选项为：今天、最近 7 天、最近一个月、最近半年、全部（默认）。选择后只显示对应时间范围内收藏的条目，与标签筛选、搜索叠加生效。

### 功能边界

- 做：收藏时间下拉（5 个固定选项，默认「全部」）；选中后与四维筛选、搜索取「且」叠加；时间条件激活时标题切「筛选结果 · N 条命中」、出现「清除全部筛选」且清除后回到「全部」；标签候选计数以当前时间范围为前提；下拉为自定义样式组件，与页面视觉一致，不用浏览器原生下拉
- 不做：「最近新增」页不提供此筛选；自定义起止日期；按更新时间/访问时间筛选；时间范围的计数徽标

### 不能破坏的不变量

- 「全部收藏」默认（时间=全部、无其他筛选）展示与之前完全一致：全部收藏、按收藏时间新到旧、标题「全部收藏」（feat07 场景1）
- 四维筛选、搜索、待同步、「清除全部筛选」、空态文案等既有行为不变（feat05/feat06/sync-archive feat06 既有测试全绿）
- 「最近新增」页不出现时间下拉，其余行为不变（feat04）

## ② 测试用例（先写，此刻失败）

### unit

filter 引擎（lib/bookmark-filter.test.ts，fake Date 锚定现在）：

- time_today：当天 00:30 收藏命中「今天」，昨天 23:30 收藏不命中 → feat08 场景2
- time_7d：6 天前命中、8 天前不命中「最近 7 天」 → feat08 场景2
- time_month：29 天前命中、31 天前不命中「最近一个月（30 天）」 → feat08 场景2 + 边界
- time_halfyear：179 天前命中、181 天前不命中「最近半年（180 天）」 → feat08 场景2 + 边界
- time_all_default：emptyFilter 的时间条件为「全部」，任意久远收藏恒命中 → feat08 场景1 + 不变量
- time_and_dimension：时间范围与形态条件取「且」（满足形态但超期不命中） → feat08 场景3
- time_active_filter：时间条件非「全部」时 hasActiveFilter 为真（驱动标题与「清除全部筛选」） → feat08 场景2
- time_facet_count：时间范围作为前提参与候选动态计数（超期条目不计入候选计数） → feat08 场景3

下拉组件（TimeRangeDropdown.test.tsx）：

- dropdown_default_label：初始显示「全部」 → feat08 场景1
- dropdown_options：点击触发钮展开，出现 5 个选项（今天/最近 7 天/最近一个月/最近半年/全部） → 功能方向
- dropdown_select：点「最近 7 天」后 onChange 收到对应值、面板收起、触发钮文案变「最近 7 天」 → feat08 场景2
- dropdown_close_outside：展开后点面板外区域收起，不改动当前值 → 边界
- dropdown_close_escape：展开后按 Escape 收起 → 边界

视图集成（RecentSection.test.tsx，library 变体，播种 今天/5 天前/20 天前/100 天前 四条）：

- library_time_dropdown_shown：library 变体出现「收藏时间」下拉且默认「全部」；recent 变体不出现 → 功能边界 + 不变量
- library_time_filter：切「最近 7 天」后只显示今天与 5 天前两卡，标题「筛选结果 · 2 条命中」、出现「清除全部筛选」 → feat08 场景2
- library_time_stacks：先选形态再切「最近一个月」，只显示两者皆满足的卡片 → feat08 场景3
- library_time_clear：「清除全部筛选」后下拉回到「全部」、列表恢复全部、标题回「全部收藏」 → feat08 场景4
- library_time_empty：范围内无收藏时显示「没有同时满足这些条件的收藏，试试减少一个维度。」，下拉保持已选值 → feat08 场景5

### smoke

构建 chrome-mv3 → 加载扩展开主页 → 进「全部收藏」→ 点「收藏时间」下拉切「最近 7 天」→ 列表只余近 7 天卡片、标题变「筛选结果 · N 条命中」→ 点「清除全部筛选」恢复全部。

### e2e（按需）

不需要，依据：纯前端过滤 + 展示层组件，无跨进程用户链路风险；数据读写复用已测链路。

## ③ 技术实现

### 实现步骤

1. `src/lib/bookmark-filter.ts`：新增 `TimeRange` 类型（`'all' | 'today' | 'd7' | 'd30' | 'd180'`）；`FilterSelection` 加 `timeRange` 字段、`emptyFilter()` 默认 `'all'`；新增 `matchesTimeRange()`（'today' 按本地自然日比较，其余按 `now − N 天` 窗口，createdAt 解析失败不命中）；`matchesFilter` 将时间条件与既有条件「且」叠加；`hasActiveFilter` 计入 `timeRange !== 'all'`（驱动标题切换与「清除全部筛选」）；候选动态计数 `countFacetValues` 因 `withoutDimension` 只剔除本维度，时间范围自然作为前提参与计数
2. `src/entrypoints/home/TimeRangeDropdown.tsx`（新建）：自定义下拉（button + role=listbox/option，非原生 select），固定 5 选项（今天/最近 7 天/最近一个月/最近半年/全部），受控 value + onChange；点选项收起，点面板外（mousedown）/ Escape 收起；触发钮带 `aria-label="收藏时间：<当前值>"`
3. `src/entrypoints/home/index.css`：`.timerange / .tr-*` 样式——触发钮沿用 fchip 药丸风格（--line 描边、#faf6ec 底、999px 圆角），面板用卡片同材质（--card 底、--line 描边、--radius、--shadow），选中项 accent-soft/accent-ink
4. `src/entrypoints/home/sections/RecentSection.tsx`：library 变体在 FiltersPanel 与卡片列表之间渲染 `TimeRangeDropdown`；「待同步」专属空态的判定追加 `timeRange === 'all'`（时间条件激活时让位给通用空态文案）
5. 测试：`bookmark-filter.test.ts` 加 feat08 describe（fake Date 锚定）；`TimeRangeDropdown.test.tsx` 新建；`RecentSection.test.tsx` 加 library 时间筛选集成 describe

测试修正记录（x-qdev 第 3 步）：

- 触发钮可访问名最初不含「收藏时间」（label 是按钮外的兄弟 span）→ 实现侧加 `aria-label`（无障碍语义修正，非测试让步）
- 既有 feat07 场景1 用例 `findByText('全部收藏')` 在 loading 期间即命中页头标题、随后同步查询卡片拿到空数组（间歇性失败，本次改动暴露的既有竞态）→ 改为先等首卡出现再断言；新增用例的 `pickTimeRange` 同步改用 `findByRole` 等待下拉出现
- 点面板外收起的 `event.target as Node` 断言触发 `no-unsafe-type-assertion` → 改为 `instanceof Node` 收窄

### 涉及文件

- apps/extension/src/lib/bookmark-filter.ts: TimeRange 类型 + timeRange 条件（命中/hasActiveFilter/计数前提）
- apps/extension/src/lib/bookmark-filter.test.ts: feat08 引擎层用例 ×8
- apps/extension/src/entrypoints/home/TimeRangeDropdown.tsx: 新建自定义下拉组件
- apps/extension/src/entrypoints/home/TimeRangeDropdown.test.tsx: 新建组件用例 ×5
- apps/extension/src/entrypoints/home/sections/RecentSection.tsx: library 变体接入下拉 + 待同步空态判定收紧
- apps/extension/src/entrypoints/home/sections/RecentSection.test.tsx: feat08 集成用例 ×5 + feat07 场景1 竞态修复
- apps/extension/src/entrypoints/home/index.css: .timerange / .tr-* 样式
- docs/spec/homepage/spec.md: 新增 feat08

## ④ 验证结果

### 测试输出

红（实现前，失败均为功能未实现：`emptyFilter()` 无 timeRange、matchesFilter 不感知时间条件、TimeRangeDropdown 模块不存在、视图无下拉）：

```text
pnpm exec vitest run src/lib/bookmark-filter.test.ts src/entrypoints/home/TimeRangeDropdown.test.tsx src/entrypoints/home/sections/RecentSection.test.tsx
 Test Files  3 failed (3)
      Tests  13 failed | 79 passed (92)
```

绿（实现后，目标三文件，连跑 4 次结果一致）：

```text
 Test Files  3 passed (3)
      Tests  98 passed (98)
```

### 不变量回归

apps/extension 全量（含 feat04/05/06/07、sync-archive、popup、capture 等全部既有用例）：

```text
 Test Files  29 passed (29)
      Tests  457 passed (457)
```

packages/shared 全量：

```text
 Test Files  8 passed (8)
      Tests  53 passed (53)
```

静态检查与构建：

```text
pnpm check        # typecheck（三包 tsc --noEmit）+ eslint --max-warnings 0 + prettier --check 全部通过
pnpm build:ext    # chrome-mv3 + firefox-mv2 均 Built extension ✔，home.html 正常产出
```

smoke 链路（打开主页 →「全部收藏」→ 点「收藏时间」下拉切「最近 7 天」→ 只余近 7 天卡片、标题「筛选结果 · N 条命中」→ 清除全部恢复）由 feat08 集成用例（library_time_filter / library_time_clear）在真实 Dexie 库 + 组件渲染链路上覆盖；双浏览器构建产物已验证。

### 结论

- [x] 所有需求点被测试覆盖
- [x] 所有测试真实跑过且通过
- [x] 实现在边界内
- [x] 不变量未破坏
