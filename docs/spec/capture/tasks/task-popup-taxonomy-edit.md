# popup 四维卡片就地增删取值（三段布局）

> spec: docs/spec/capture/spec.md
> feat: feat08（并修订 feat04 场景3：面板不再「只点选、不管理」）
> 创建: 2026-09-11

## ① 需求

### 功能方向

用户在收藏面板里想到一个更贴切的分类词时，不必跳去设置页：每个维度卡片内直接新增取值（输入框 + 加号，回车同样提交）并立刻点选；已有取值右侧带「×」可就地删除。增删与设置页操作的是同一套取值。

### 功能边界

- 做：四个维度均可就地新增/删除取值；新增校验（空白静默、重复「该取值已存在」、超 30 字「取值过长」）；Inbox 不可删（「默认状态不可删除」）；删除取值时若其处于选中态则同步取消（状态回退 Inbox）；错误提示随再次输入消失；添加成功后输入框清空、焦点保留
- 做（布局）：维度卡片三段结构——顶部标题、中部取值区（flex-wrap 随内容自动伸缩高度）、底部修改区（输入框与加号贴齐卡片左右边缘）；popup 整体左右宽度不变（body 360px、.dims 14px 外边距）
- 不做：取值改名、拖拽排序、在面板里管理维度本身（维度固定四个）；不动 popup 与主页的入口跳转；不新增同步行为（本地 taxonomy 单行 LWW 既有机制不变）
- 不做：不修改设置页 DimensionsCard 及其样式

### 不能破坏的不变量

- 取值集合与设置页共享同一份（面板新增的取值出现在设置页「分类维度」，反之亦然）——底层沿用 db/taxonomy 的 addTaxonomyValue / removeTaxonomyValue，不另起存储
- 删除取值不影响任何已保存书签（设置 spec feat07 同语义，db 层已保证）
- 不可收藏页面：理由输入与四维点选不可用的既有禁用态延伸到增删入口
- 既有收藏链路不受影响：点选、预填、保存、横幅、关 Tab 行为不变
- Inbox 永远存在于状态取值中且为默认选中

## ② 测试用例（先写，此刻失败）

### unit

- add_via_plus（场景1）：输入「Agent」点加号 → chip 出现、输入框清空且仍聚焦 → 边界见 add_rejects
- add_via_enter（场景1）：输入框内按 Enter 等同点加号
- add_rejects_blank（场景2）：纯空格提交 → 不添加、无提示、取值数不变
- add_rejects_duplicate（场景2）：重复添加「世界模型」→ 提示「该取值已存在」；再次输入时提示消失
- add_rejects_too_long（场景2）：31 字提交 → 提示「取值过长」
- remove_value（场景3）：点「世界模型」的 × → chip 消失、db.taxonomies 同步更新
- remove_selected_clears_selection（场景3）：先选中「世界模型」再删 → 该选中取消（.on 仅剩 inbox）
- remove_selected_status_falls_back（场景3）：seed status=[inbox, reading]，选中 reading 后删 → 状态回退选中 inbox
- remove_inbox_rejected（场景4）：点 Inbox 的 × → 提示「默认状态不可删除」，取值保留
- layout_three_segments（场景5）：每个 .dim 内子元素顺序 dim-head → chips → chip-add，chip-add 为末段且贴卡片左右边缘（class 结构断言；视觉留实现 review）
- hint_removed：不再出现「维度的取值在『设置』里统一管理」提示

### smoke

- add_persists_shared_taxonomy（不变量）：面板添加取值后读 db.taxonomies 'local' 行含该值——与设置页共享同一份；用 RTL + 真实 Dexie（fake-indexeddb），链路 组件 → addTaxonomyValue → IndexedDB

### e2e

不需要，依据：纯前端组件交互 + 本地 Dexie，无跨进程用户链路；设置页共享由 smoke 直验 DB 行保证

## ③ 技术实现

### 实现步骤

1. `popup/App.tsx`：chip 结构改造——外层改 `<span class="chip">`（保留 on/status-chip/flow class 同步），内部两个按钮：点选按钮（accessible name = 取值文本，aria-pressed）+ 「×」删除按钮（aria-label=`删除取值 <值>`），避免 button 嵌套
2. `popup/App.tsx`：每维底部加修改区 `<div class="chip-add">`：input（placeholder「新主题…」等）+ 加号按钮；Enter/点击加号调 addTaxonomyValue，成功后 setTaxonomy(await getTaxonomy())、清空输入、ref 聚焦；按 result.reason 显示错误（复用 DimensionsCard 的分支文案），onChange 清错误
3. `popup/App.tsx`：remove 调 removeTaxonomyValue，成功后刷新 taxonomy 并同步清理 selection——多选维度 filter 掉该值；status 被删时回退 DEFAULT_STATUS
4. `popup/App.tsx`：移除 `.dims-hint` 提示行；增删控件 disabled={!capturable}
5. `popup/index.css`：.dim 去左右 padding 改三段（dim-head/chips 各自 padding 0 12px；chip-add 满宽贴边、上分隔线、input flex:1、加号方圆按钮）；新增 chip 内 .x 与点选按钮、.dim-error 样式（视觉参照 settings/cards.css 等比缩小）；body 宽度与 .dims 外边距不动
6. 既有断言更新：App.test.tsx 骨架用例中的 dims-hint 断言删除；feat04 场景3 用例改为「与设置共享 + 面板内有增删入口」

### 涉及文件

- apps/extension/src/entrypoints/popup/App.tsx: chip 结构改造、增删逻辑、selection 清理、移除提示行
- apps/extension/src/entrypoints/popup/App.test.tsx: 新增 feat08 describe + 既有两处断言随 spec 修订更新
- apps/extension/src/entrypoints/popup/index.css: 维度卡片三段布局 + chip-add/x/error 样式
- docs/spec/capture/spec.md: feat04 场景3 修订 + feat08 增补（本 task 前置）

## ④ 验证结果

### 测试输出

TDD 红（实现前，14 失败均为「功能未实现」：找不到 chip-add 输入框 / chip-btn / 删除按钮，非测试语法错）：

```
FAIL src/entrypoints/popup/App.test.tsx
Tests  14 failed | 37 passed (51)
```

实现后绿（含 prettier 格式化后复跑）：

```
✓ src/entrypoints/popup/App.test.tsx (51 tests) 2.41s
Tests  51 passed (51)
```

测试修正记录（②阶段遗留的断言问题，非方向调整）：

- 「Inbox 不可删除」用例原断言 `row?.taxonomy.status).toContain(DEFAULT_STATUS)`——受保护拒绝不落库、首次使用时 'local' 行本就不存在，改为断言 `db.taxonomies.get('local')` 为 undefined（拒绝时不落库）
- 既有断言随结构升级的三处合法迁移（feat04 场景3「无增删入口」反转、`.dims .chip.on` 落到 `.chip-btn`、`getByRole('textbox')` 带 name 消除多匹配）已在 ③ 实现步骤第 6 条记录

### 不变量回归

```
apps/extension test:  Test Files  16 passed (16)
apps/extension test:        Tests  236 passed (236)
```

（含设置页 DimensionsCard 10 例——共享 taxonomy 不变量；db/taxonomy、db/bookmarks、保存链路等全部既有套件）

根 check 全绿：

```
pnpm typecheck  ✓（extension/server/shared 三包 tsc --noEmit）
pnpm lint       ✓（eslint . --max-warnings 0）
pnpm format:check ✓（All matched files use Prettier code style!）
```

### 结论

- [x] 所有需求点被测试覆盖（feat08 场景1-6 各有用例；共享 taxonomy smoke；三段布局结构断言）
- [x] 所有测试真实跑过且通过（红 → 绿过程见上）
- [x] 实现在边界内（未动 DimensionsCard/home 页；未改 popup 宽度与 .dims 外边距；未新增存储或同步行为）
- [x] 不变量未破坏（236/236 全量回归 + check 全绿）
