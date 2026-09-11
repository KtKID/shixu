# popup 取值删除按钮收进修改模式（顶栏「修改/完成」切换）

> spec: docs/spec/capture/spec.md
> feat: feat08（修订场景3/4/6，新增场景7）
> 创建: 2026-09-11

## ① 需求

### 功能方向

取值上的「×」删除按钮平时不显示。收藏面板右上方新增「修改」按钮：点击后按钮变为「完成」、进入修改模式，取值右侧才出现「×」删除按钮；再点「完成」退出、按钮变回「修改」、「×」隐藏。无论面板以何种状态被关闭，重新打开都回到默认非修改模式。

### 功能边界

- 做：顶栏右侧「修改/完成」切换按钮（进入修改模式时带激活态样式）；修改模式下每个取值右侧渲染「×」，非修改模式不渲染；关闭面板重开回到非修改模式（popup 每次打开即全新页面加载，模式不做任何持久化）
- 不做：不隐藏底部新增取值修改区（始终显示，feat08 场景1 不变）；不动增删校验与文案；不动设置页 DimensionsCard；不给「修改」按钮加不可收藏禁用——它是视图切换，切换出的「×」仍受 !capturable 禁用约束（场景6）

### 不能破坏的不变量

- 修改模式下删除行为与 feat08 场景3/4 完全一致：删选中值同步取消点选、状态被删回退 Inbox、Inbox 不可删、删除不动任何书签数据
- 不可收藏页面：新增/删除/点选入口仍全部不可用（场景6）
- 保存、重复收藏预填、横幅、关 Tab 链路不受影响
- 取值集合仍与设置页共享同一份本地 taxonomy

## ② 测试用例（先写，此刻失败）

### unit

- edit_hidden_by_default（场景7）：面板默认渲染——顶栏有「修改」按钮，全部取值（多选与 Inbox）无「删除取值 ×」按钮
- edit_toggle_on_off（场景7）：点「修改」→ 按钮变「完成」、「×」出现；点「完成」→ 按钮变回「修改」、「×」全部消失
- edit_mode_resets_on_reopen（场景7）：修改模式下卸载再全新挂载（模拟关闭面板后重开）→ 默认非修改模式（「修改」按钮、无「×」）
- remove_value / remove_selected_clears_selection / remove_selected_status_falls_back（场景3 修订）：先进修改模式再删，行为断言不变
- remove_inbox_rejected（场景4 修订）：修改模式下点 Inbox「×」→ 提示「默认状态不可删除」不变
- uncapturable_disables_edit_entries（场景6 修订）：不可收藏页面「修改」可切换，切换出的「×」与新增/点选一并禁用
- feat04 场景3 增补用例更新：默认无删除按钮，进入修改模式后「删除取值 RAG」出现

### smoke

- 既有 add_persists_shared_taxonomy 不变照跑：新增链路与共享 taxonomy 不受修改模式影响（新增取值不需要进修改模式）

### e2e

不需要，依据：纯前端组件状态切换 + 既有本地 Dexie 链路，无跨进程用户链路

## ③ 技术实现

### 实现步骤

1. `popup/App.tsx`：新增 `editing` state（`useState(false)`，纯组件内状态、不落任何存储——popup 每次打开即全新页面加载，重开自然复位）；顶栏 topbar-links 末尾（「设置」之后、快捷键提示之前）加「修改/完成」切换按钮：`aria-pressed={editing}`、激活时加 `on` class
2. `popup/App.tsx`：`.dims` 容器在修改模式下追加 `editing` class；chip 的「×」删除按钮改条件渲染 `{editing && ...}`（`disabled={!capturable}` 与删除逻辑不动）——非修改模式下 DOM 里不存在删除按钮，而非仅视觉隐藏
3. `popup/index.css`：`.chip-btn` 默认对称 padding（无「×」时右侧留白 `2px 10px`），`.dims.editing .chip-btn` 收窄右 padding 让「×」贴齐文字；新增 `.topbar-link.on` 激活态（accent-soft 底 + accent-ink 字）
4. `popup/App.test.tsx`：新增场景7 三个用例（默认无「×」/切换进出/卸载重挂复位）；场景3/4/6 既有用例先进修改模式再操作（`enterEditMode` 辅助）；feat04 场景3 增补用例断言更新为「默认无删除按钮 → 进修改模式后出现」

### 涉及文件

- apps/extension/src/entrypoints/popup/App.tsx: editing state、顶栏切换按钮、× 条件渲染
- apps/extension/src/entrypoints/popup/index.css: chip-btn padding 随模式收窄、topbar-link.on 激活态
- apps/extension/src/entrypoints/popup/App.test.tsx: 场景7 新增 + 场景3/4/6/feat04 场景3 用例修订
- docs/spec/capture/spec.md: feat08 修订（场景3/4/6 措辞 + 新增场景7，本 task 前置）

## ④ 验证结果

### 测试输出

TDD 红（实现前，9 失败均为「功能未实现」：找不到「修改」按钮 / 默认仍有删除按钮，非测试语法错）：

```
FAIL src/entrypoints/popup/App.test.tsx
Tests  9 failed | 45 passed (54)
```

测试修正记录（②阶段遗留的辅助函数问题，非方向调整）：

- `renderPanelWithDims` 原不返回 render 结果，场景7「重开复位」用例需要 `unmount` 模拟关闭面板后重开——改为返回 `render(<App />)` 的 RenderResult

实现后绿：

```
✓ src/entrypoints/popup/App.test.tsx (54 tests) 1904ms
Tests  54 passed (54)
```

### 不变量回归

```
apps/extension test:  Test Files  16 passed (16)
apps/extension test:        Tests  241 passed (241)
```

根 check 全绿：

```
pnpm typecheck     ✓（extension/server/shared 三包 tsc --noEmit）
pnpm lint          ✓（eslint . --max-warnings 0）
pnpm format:check  ✓（All matched files use Prettier code style!）
```

双浏览器构建通过：

```
✔ dist/chrome-mv3  （popup-CYckWOXS.css 7.01 kB）
✔ dist/firefox-mv2 （popup-CYckWOXS.css 7.01 kB）
```

### 结论

- [x] 所有需求点被测试覆盖（场景7 三态各有用例；场景3/4/6 修订后行为断言不变；不可收藏禁用态延伸到切换出的「×」）
- [x] 所有测试真实跑过且通过（红 9 → 绿 54/54，过程见上）
- [x] 实现在边界内（未隐藏底部新增区；未动 DimensionsCard/设置页；未动删除校验文案；「修改」按钮未加 capturable 禁用，属①声明的设计决策）
- [x] 不变量未破坏（241/241 全量回归 + check 全绿 + 双构建通过）
