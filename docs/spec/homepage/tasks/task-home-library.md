# 主页新增「全部收藏」导航条目：不截取地浏览全部收藏

> spec: docs/spec/homepage/spec.md
> feat: feat02, feat07
> 创建: 2026-09-11

## ① 需求

### 功能方向

主页左侧导航在「最近新增」之后新增「全部收藏」条目。用户打开它能看到收藏库的**全部**收藏（按收藏时间从新到旧），不受「最近新增」默认只展示 3 条的限制；筛选与搜索的用法和「最近新增」完全一样。

### 功能边界

- 做：导航新增「全部收藏」条目（第二位，地址 hash `#library` 可直达）；该视图默认展示全部收藏、标题「全部收藏」、无「只显示最近 3 条」提示；筛选/搜索/清除全部筛选/无命中空态沿用现有行为；空收藏库沿用现有空态与去导入引导
- 不做：分页或分组、列表内编辑/删除收藏、popup「已收藏」按钮落点调整（仍按 feat01 落「最近新增」）、动态视图保存（远期）
- 不做（数据层）：不改 bookmark-filter 引擎与 db 层，视图差异只在展示层

### 不能破坏的不变量

- 「最近新增」默认仍只展示最近 3 条 + 提示文案、标题「最近添加」（feat04 场景1）
- 筛选/搜索在「最近新增」的行为不变（feat05/feat06 既有测试全绿）
- 导航其余条目（网络连接/分类维度/导入已有书签）行为与顺序不变；「视图」「回收站」等预留条目仍不出现（feat02 场景3）
- 导航切换保留输入（feat02 场景2）与空 hash 回退「最近新增」不变

## ② 测试用例（先写，此刻失败）

### unit

- nav_library_item：导航 5 项、顺序为 最近新增/全部收藏/网络连接/分类维度/导入已有书签，默认选中「最近新增」 → 功能方向 + feat02 场景1（改写既有四项断言，spec 已增补为五项）
- nav_switch_to_library：点击「全部收藏」切换选中且内容区标题为「全部收藏」 → 功能方向
- parse_hash_library：`#library` 解析为 library 条目，未知/空 hash 仍回退 recent → 功能方向 + 不变量
- library_shows_all：5 条收藏默认全部展示（不截 3 条）、标题「全部收藏」、无「最近 3 条」提示 → feat07 场景1
- library_filter_search：选中主题后标题变「筛选结果 · N 条命中」；输入关键词显示「N 条结果」 → feat07 场景2
- library_empty：空库显示空态提示与去「导入已有书签」引导 → feat07 场景3
- recent_unchanged（不变量）：「最近新增」默认仍 3 条 + 提示（既有测试覆盖，回归确认）

### smoke

- 打开主页 → 点「全部收藏」→ 全部收藏按新到旧展示 → 选主题「AI」→ 标题切「筛选结果 · N 条命中」→ 清除全部筛选回到「全部收藏」默认视图

### e2e（按需）

不需要，依据：纯前端视图层变更，无跨进程用户链路；数据读写复用已测链路。

## ③ 技术实现

### 实现步骤

1. `App.tsx`：`SectionKey` 增加 `'library'`；`SECTIONS` 在「最近新增」后插入 `{ key: 'library', label: '全部收藏', icon: '▤' }`；内容区渲染 `<RecentSection variant="library" …/>`
2. `RecentSection.tsx`：新增 `variant?: 'recent' | 'library'` prop（默认 recent）；`expandAll` 追加 `variant === 'library'`；无筛选标题按 variant 取「全部收藏」/「最近添加」（筛选/搜索态标题不变）；空态与筛选逻辑共用
3. 测试改写：`App.test.tsx` 导航四项断言 → 五项（spec feat02 增补）；`RecentSection.test.tsx` 新增 library 变体用例

测试修正记录（x-qdev 第 3 步）：

- 新用例「点击全部收藏」首次绿跑时 `findByText('全部收藏')` 同时命中导航按钮与分区标题、「空收藏库」用例的 `导入已有书签` 同时命中导航项与空态按钮 → 改为 heading role 与「去「导入已有书签」」精确查询（测试选择器歧义，非实现问题）
- 既有用例「initialSection 指定网络连接」的索引断言 items[1] → items[2]：feat07 增补后导航五项，「网络连接」为第三项（spec 增补导致的合法更新）

### 涉及文件

- apps/extension/src/entrypoints/home/App.tsx: 导航条目 + 分区渲染
- apps/extension/src/entrypoints/home/App.test.tsx: 导航顺序断言改五项 + 新增切换/hash 用例
- apps/extension/src/entrypoints/home/sections/RecentSection.tsx: variant 展示差异
- apps/extension/src/entrypoints/home/sections/RecentSection.test.tsx: library 变体用例
- docs/spec/homepage/spec.md: feat02 场景1 导航列表 + 新增 feat07

## ④ 验证结果

### 测试输出

红（实现前，失败均为功能未实现：导航仍四项、RecentSection 无 library 变体、`#library` 回退 recent）：

```text
pnpm vitest run src/entrypoints/home
 Test Files  2 failed | 3 passed (5)
      Tests  8 failed | 51 passed (59)
```

绿（实现后，apps/extension 全量）：

```text
pnpm vitest run
 Test Files  15 passed (15)
      Tests  216 passed (216)
```

### 不变量回归

```text
pnpm check   # typecheck（wxt prepare + tsc --noEmit）+ eslint --max-warnings 0 + prettier --check
Checking formatting...
All matched files use Prettier code style!   # 全部通过（含既有 feat04/05/06 用例：最近 3 条截断、筛选、搜索、popup 均未破坏）
```

### 结论

- [x] 所有需求点被测试覆盖
- [x] 所有测试真实跑过且通过
- [x] 实现在边界内
- [x] 不变量未破坏
