# popup 库计数移到顶栏「已收藏」左侧

> spec: docs/spec/capture/spec.md + docs/spec/homepage/spec.md
> feat: capture feat07（修订）+ homepage feat01 场景5（修订）
> 创建: 2026-09-11

## ① 需求

### 功能方向

收藏面板底部的「已入库 N 条」提示移到顶部：显示在顶栏「已收藏」入口的左边，文案改为「收藏N条」（N 为库中实际条数）。

### 功能边界

- 做：顶栏 topbar-links 首位渲染「收藏N条」（读取中显示「收藏…条」）；移除底部 library-bar 整条；底部区域随之收尾于保存按钮
- 不做：不动「已收藏/设置/修改」按钮与快捷键提示；计数不可点击；不动计数数据来源（getActiveBookmarks 活跃书签数）

### 不能破坏的不变量

- 计数仍为库中未删除收藏的实际条数（含导入）
- 「已收藏」仍新标签页打开主页「最近新增」；「打开导入器」按钮仍不存在
- 面板高度仍随内容自适应、默认态零滚动（移除底部条后余量更大）

## ② 测试用例（先写，此刻失败）

### unit

- count_in_topbar（场景1）：库有 2 条 → 顶栏显示「收藏2条」，位于 .topbar-links 首位（「已收藏」按钮左侧紧邻）；.library-bar 不再存在；无「打开导入器」按钮
- count_zero_when_empty（场景2）：空库 → 「收藏0条」

### smoke

- 既有计数链路不变：getActiveBookmarks → count（沿用既有用例的数据注入方式，读的是真实 Dexie）

### e2e

不需要，依据：纯展示位置与文案调整，无新链路；布局高度由 task-popup-height-fit 的实测流程兜底复验

## ③ 技术实现

### 实现步骤

1. `popup/App.tsx`：topbar-links 首位加 `<span class="library-count">`，文案 `收藏${count}条`（读取中「收藏…条」）；移除底部 `<div class="library-bar">` 整块
2. `popup/index.css`：删 `.library-bar` 规则；新增 `.topbar-links .library-count`（11px / ink-faint / 右缘 4px / 不换行）

### 涉及文件

- apps/extension/src/entrypoints/popup/App.tsx: 计数移位 + 底部条移除
- apps/extension/src/entrypoints/popup/index.css: library-count 顶栏样式，library-bar 删除
- apps/extension/src/entrypoints/popup/App.test.tsx: 库计数 describe 重写（位置/文案/底部条移除）
- docs/spec/capture/spec.md: feat07 重写为「顶栏库计数」
- docs/spec/homepage/spec.md: feat01 场景5 计数位置随改

## ④ 验证结果

### 测试输出

TDD 红（2 失败：新文案/位置未实现）：

```
Tests  2 failed | 53 passed (55)
```

实现后绿：

```
popup 套件（App + layout）: 59/59 通过
```

### 不变量回归

```
排除并行 WIP（feat09 两测试文件）: 238/238 通过
typecheck（排除并行 WIP 文件）: 0 错误
prettier 改动文件: 全过
双构建: chrome-mv3 ✓ / firefox-mv2 ✓
```

无头 Chrome 实测：顶栏渲染为「收藏0条 已收藏 设置 修改 ⌘⇧S」单行 40px、无横向溢出；.library-bar 不存在；默认态内容高 569px（<600 上限，零滚动，较改前再省 25px 余量）；修改模式 753px 仍按浏览器原生滚动兜底（不变量延续）。

### 结论

- [x] 所有需求点被测试覆盖（位置=「已收藏」左侧、文案「收藏N条」含空库 0、底部条移除、无导入器按钮）
- [x] 所有测试真实跑过且通过（红 2 → 绿 59/59）
- [x] 实现在边界内（未动按钮行为与计数来源；计数不可点击）
- [x] 不变量未破坏（238/238 回归 + 高度自适应/默认态零滚动实测延续）
