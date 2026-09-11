# 主页布局改版：宽屏舒展布局

> spec: docs/spec/homepage/spec.md
> feat: feat02, feat04, feat07
> 创建: 2026-09-11

## ① 需求

### 功能方向

主页内容区现在太窄、太紧凑，宽屏下两侧大片留白、卡片只排两列。参照设计图把收藏视图的布局放宽：内容区显著加宽、页头是大标题加一句副标题、搜索框是居中的大圆角胶囊、四维筛选分区更舒展、收藏卡片在宽屏下一排能放更多张。

### 功能边界

- 做：内容区最大宽度放宽（仍居中）；收藏视图页头改为大标题 + 副标题；搜索框改为居中胶囊并带 ⌘K 快捷键提示徽标；筛选面板行间加分隔、维度名带图标、间距加大；卡片网格改为按宽度自动排列（宽屏一排更多列）；首字母色块加高
- 不做：不加设计图里的视图页签、排序下拉、网格/列表切换（属「视图」功能，spec 未覆盖）；不把卡片封面换成真实图片（无封面数据）；不改左侧导航条目与结构；不改筛选、搜索、导入的任何行为逻辑；不改 spec.md

### 不能破坏的不变量

- 内容区仍水平居中且有最大宽度，左侧导航固定在页面左缘、宽度不随窗口拉伸（feat02 场景4）
- 无筛选时标题仍是「最近添加」/「全部收藏」，筛选时标题仍是「筛选结果 · N 条命中」；「清除全部筛选」出现时机不变（feat04/feat05/feat07）
- 筛选规则（维度内或、跨维度且、状态单选、主题全部满足、候选计数）、搜索行为（三域匹配、⌘K 聚焦、与筛选叠加）全部不变（feat05/feat06）
- 空收藏库、无命中、导入引导等空态文案与行为不变

## ② 测试用例（先写，此刻失败）

### unit

- layout_content_width：index.css 的 `--content-width` ≥ 1100px → 功能方向「内容区加宽、宽屏不浪费空间」
- layout_cards_autofill：index.css 的 `.cards` 网格用 `repeat(auto-fill, minmax(≥230px, 1fr))` → 功能方向「宽屏一排更多卡片」
- layout_search_pill：index.css 的 `.searchbox` 为胶囊形（border-radius: 999px）→ 功能方向「搜索框大圆角胶囊」
- layout_thumb_height：index.css 的 `.thumb` 高度 ≥ 96px → 功能方向「首字母色块加高」
- page_head_library：「全部收藏」渲染页头大标题与副标题「把收藏变成可再次遇见的线索。」→ 功能方向「页头大标题 + 副标题」
- page_head_recent：「最近新增」渲染页头大标题与副标题 → 功能方向
- searchbox_kbd：搜索框渲染 ⌘K 快捷键提示徽标（.searchbox-kbd）→ 功能方向
- filter_dim_icon：四个维度的名称旁各渲染一个图标（.fdim-ic）→ 功能方向「维度名带图标」

### smoke

- 打开主页 → 默认「最近新增」：页头、胶囊搜索框、筛选面板、卡片网格按新布局渲染；切到「全部收藏」同样渲染（jsdom 结构级 smoke，复用 App/RecentSection 渲染链路）
- 视觉验收（人工）：`pnpm build:ext` 后加载扩展打开主页，宽屏（≥1600px）下内容居中、卡片一排 4 列、整体观感对齐设计图——jsdom 无法验证像素级布局，此项人工确认

### e2e

不需要，依据：纯前端视图层布局变更，无跨进程用户链路；行为回归由既有组件/集成测试覆盖。

## ③ 技术实现

### 实现步骤

1. `index.css`：`--content-width` 760px → 1240px；`.main` padding 加大为 `40px 48px 72px`；内容仍 `margin: 0 auto` 居中（feat02 场景4 不变量）
2. `RecentSection.tsx`：标题行 `.result-head` 改为页头 `.page-head`（大标题 `.page-title` + 副标题 `.page-tagline`，「清除全部筛选」留在右上）；标题文案规则不变（筛选态仍「筛选结果 · N 条命中」）；副标题按变体取静态文案
3. `index.css`：新增 `.page-head` / `.page-title`（30px 衬线）/ `.page-tagline` 样式，窄屏（≤720px）标题缩到 24px
4. `SearchBox.tsx` + `index.css`：搜索框改居中胶囊（`max-width: 620px`、`border-radius: 999px`、输入行高加大），单个圆角矩形无内嵌盒子；⌘K 快捷键提示为搜索框末尾的纯文本（`.searchbox-kbd`，无边框无背景）
5. `FiltersPanel.tsx` + `index.css`：`DIMENSION_META` 增加图标（❖/◉/◎/▸，取自参考原型），维度名加宽至 64px 并带 `.fdim-ic` 图标；面板改半透明底、行间虚线分隔、chips 间距与字号加大
6. `index.css`：`.cards` 网格 `repeat(2, 1fr)` → `repeat(auto-fill, minmax(250px, 1fr))`（宽屏自动多列，原 900px 媒体查询随之删除）；`.thumb` 色块 84px → 96px
7. 测试：`layout.test.ts` 新增（CSS 布局契约：内容宽度 ≥1100px、卡片 auto-fill minmax ≥230px、搜索框 999px 胶囊、色块高度 ≥96px、cards.css 无裸 input/label 选择器）；`RecentSection.test.tsx` 新增页头 2 例；`SearchBox.test.tsx` 新增单圆角矩形（无内嵌徽标）1 例；`FiltersPanel.test.tsx` 新增维度图标 1 例

测试修正记录（x-qdev 第 3 步）：

- 用户视觉反馈（交付后，第 3 次）：⌘K 不要放在 placeholder 文案里，移到搜索框最右端，但保持纯文本（不要带回边框底色的盒子）。实现：placeholder 恢复为「搜索标题、来源域名或收藏理由…」，搜索框末尾加 `.searchbox-kbd` 纯文本元素（CSS 只设字号/颜色/字距，契约测试断言该规则不含 border 与 background 声明）
- 用户视觉反馈（交付后，第 2 次）：搜索框里仍有一个带边框圆角底色的内嵌盒子，与胶囊外框两端重叠成「框中框」。Playwright 实测 computed 样式定位根因：`components/settings/cards.css` 被主页全局引入，其中裸元素选择器 `input[type='text']`（特异性 0-1-1）压过 `.searchbox-input`（0-1-0），把设置卡片表单的边框/9px 圆角/#fbf8f1 底色漏到搜索输入框上。修复：cards.css 的 `label` / `input[...]` / `input::placeholder` / `input:focus` 全部限定到 `.card` 内；layout.test.ts 新增「样式不外泄」契约（裸 input/label 选择器必须为 []）。修复后实测：搜索框输入框 computed 无边框透明底，「网络连接」卡片内输入框样式不受影响（截图人工复核通过）
- 用户视觉反馈（交付后，第 1 次）：搜索框内嵌的 ⌘K 徽标是带边框底色的独立盒子，套在胶囊里呈「框中框」。去掉 `.searchbox-kbd` 元素与其样式，⌘K 提示放回 placeholder；搜索框保持单个圆角矩形。对应测试由「渲染徽标」改为「无内嵌徽标盒子 + placeholder 含 ⌘K」（先红后绿）
- `layout.test.ts` 初版用 `import css from './index.css?raw'` 读样式：vitest 环境把 CSS import 置空（?raw 返回空串），改为 `readFileSync(join(process.cwd(), ...))` 从文件系统读取（测试基建差异，非实现问题；测试命令固定从包根运行，cwd 即包根）
- `RecentSection.test.tsx` 新增用例触发 prettier 格式告警，`prettier --write` 修复（格式问题，非实现问题）
- `popup/App.test.tsx`「光标停在理由输入框」用例在本 task 全量回归中间歇失败（约 1/3 概率）：焦点在 `capturable` 翻真后的 `useEffect` 里落地（popup/App.tsx `whyRef.focus()`），`findByRole` 只保证输入框挂载、不保证焦点 effect 已执行，新增测试加重了并行调度压力使该时序窗口暴露。干净工作区连跑 5 次全绿确认是既有测试的脆弱时序假设，改为 `waitFor` 等待焦点落定（测试写法修正，非实现问题；改动文件已补入下方「涉及文件」）。修正后全量连跑 6 次全绿

### 涉及文件

- apps/extension/src/entrypoints/home/index.css: 内容区加宽、页头样式、搜索框胶囊、筛选面板放宽、卡片网格 auto-fill、色块加高
- apps/extension/src/entrypoints/home/sections/RecentSection.tsx: 标题行改页头（大标题 + 副标题）
- apps/extension/src/entrypoints/home/SearchBox.tsx: 搜索框单圆角矩形，placeholder 含 ⌘K 提示
- apps/extension/src/entrypoints/home/FiltersPanel.tsx: 维度名带图标
- apps/extension/src/entrypoints/home/layout.test.ts: 新增 CSS 布局契约测试
- apps/extension/src/entrypoints/home/sections/RecentSection.test.tsx: 新增页头用例
- apps/extension/src/entrypoints/home/SearchBox.test.tsx: 新增单圆角矩形（无内嵌徽标）用例
- apps/extension/src/entrypoints/home/FiltersPanel.test.tsx: 新增维度图标用例
- apps/extension/src/components/settings/cards.css: input/label 元素选择器限定到 .card 内（修复样式泄漏）
- apps/extension/src/entrypoints/popup/App.test.tsx: 焦点断言改 `waitFor`（既有脆弱时序假设的测试修正，见上方修正记录；实现代码未动）

## ④ 验证结果

### 测试输出

`npx vitest run src/entrypoints/home`（真实输出）：

```
 ✓ src/entrypoints/home/layout.test.ts (6 tests) 3ms
 ✓ src/entrypoints/home/SearchBox.test.tsx (5 tests) 88ms
 ✓ src/entrypoints/home/FiltersPanel.test.tsx (11 tests) 219ms
 ✓ src/entrypoints/home/App.test.tsx (11 tests) 246ms
 ✓ src/entrypoints/home/sections/ImportSection.test.tsx (10 tests) 255ms
 ✓ src/entrypoints/home/sections/RecentSection.test.tsx (26 tests) 650ms
 Test Files  6 passed (6)
      Tests  69 passed (69)
```

包级门禁 `pnpm --filter @x-threadpick/extension check`（typecheck + vitest）与全仓 `pnpm check`（typecheck + lint + format:check）、`pnpm build:ext`（Chrome 构建）均通过。

smoke 说明：结构级 smoke（主页打开 → 页头/搜索框/筛选面板/卡片网格渲染、导航切换）由 App.test.tsx 与 RecentSection.test.tsx 的 jsdom 渲染链路覆盖；像素级视觉验收（宽屏一排 4 列、整体观感对齐设计图）jsdom 无法验证，构建产物已生成在 `apps/extension/dist/chrome-mv3`，**待人工在浏览器加载确认**。

### 不变量回归

既有测试全量回归 `npx vitest run`（真实输出）：

```
 Test Files  16 passed (16)
      Tests  238 passed (238)
```

feat02 场景4（内容居中 + 侧栏固定）、feat04/feat07（标题与默认展示）、feat05（筛选规则、候选计数、清除全部）、feat06（搜索、⌘K 聚焦）相关用例全部保持绿色，文案与行为未变。

### 结论

- [x] 所有需求点被测试覆盖
- [x] 所有测试真实跑过且通过
- [x] 实现在边界内
- [x] 不变量未破坏
