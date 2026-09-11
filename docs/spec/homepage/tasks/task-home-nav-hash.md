# 主页左侧导航切换同步地址 hash：刷新后停留在当前条目

> spec: docs/spec/homepage/spec.md
> feat: feat02
> 创建: 2026-09-11

## ① 需求

### 功能方向

主页左侧导航的切换就是「切换页面」：点哪个条目，地址栏就跟着变（`#网络连接` 等 hash）；刷新页面后停留在刷新前所在的条目，而不是回到「最近新增」。直接改地址里的 hash（含浏览器前进/后退）也能切换选中条目。

### 功能边界

- 做：点击导航条目 → 地址 hash 变为对应条目并产生浏览历史（前进/后退可切）；hash 变化（手动改地址、前进后退）→ 选中条目跟随；刷新后落在 hash 指定的条目
- 不做：不为筛选/搜索等页内状态做地址持久化；空 hash 时不强制补写 `#recent`；不改 popup「已收藏/设置」按钮的落点逻辑（feat01）

### 不能破坏的不变量

- 空 hash 或未知 hash 仍回退默认条目「最近新增」（feat02 既有回退规则）
- popup「已收藏」/「设置」按钮直达落点不变（feat01 场景1/2）
- 同一次打开内切换导航不丢未保存输入（feat02 场景2）
- 导航五项的结构、顺序与默认选中不变（feat02 场景1/3）

## ② 测试用例（先写，此刻失败）

### unit

- nav_click_updates_hash：点击「分类维度」→ `window.location.hash` 变为 `#dimensions` → 功能方向
- hashchange_switches_section：挂载后手动把 hash 改为 `#library` 并派发 hashchange → 选中条目切到「全部收藏」、内容区标题为「全部收藏」（前进/后退、手动改地址同机制）→ 功能方向
- refresh_keeps_section：点击「全部收藏」后模拟重开（以 `parseSectionHash(location.hash)` 为 initialSection 重新挂载）→ 仍选中「全部收藏」→ 功能方向
- 不变量回归：既有 `parseSectionHash` 回退、`initialSection` 落点、「切换不丢输入」用例原样通过 → 各不变量

### smoke

- 打开主页 → 点「网络连接」→ 地址变 `#network` → 重新挂载（模拟刷新）→ 仍在「网络连接」→ 手动改地址为 `#import` → 切到「导入已有书签」

### e2e（按需）

不需要，依据：纯前端单页 hash 同步，无跨进程用户链路。

## ③ 技术实现

### 实现步骤

1. `App.tsx`：新增 `navigate(key)`——`setSection` 之外回写 `window.location.hash`（产生浏览历史，前进/后退可切）；导航 onClick 与 `onNavigateImport` 统一改走 `navigate`
2. `App.tsx`：新增 `hashchange` 监听，hash 变化（手动改地址/前进后退）时 `setSection(parseSectionHash(...))` 反向同步选中条目
3. `App.test.tsx`：新增「导航切换同步地址 hash」三条用例（见②）
4. `spec.md`：feat02 增补场景5「切换条目时地址跟随」

### 涉及文件

- apps/extension/src/entrypoints/home/App.tsx: navigate 回写 hash + hashchange 监听
- apps/extension/src/entrypoints/home/App.test.tsx: 三条新用例
- docs/spec/homepage/spec.md: feat02 场景5

## ④ 验证结果

### 测试输出

红（实现前，失败均为功能未实现：点击不写 hash、无 hashchange 监听）：

```text
pnpm vitest run src/entrypoints/home/App.test.tsx
 Test Files  1 failed (1)
      Tests  3 failed | 11 passed (14)
```

绿（实现后）：

```text
pnpm vitest run src/entrypoints/home/App.test.tsx
 Test Files  1 passed (1)
      Tests  14 passed (14)
```

### 不变量回归

```text
pnpm vitest run   # apps/extension 全量（含 feat01 落点、feat02 不丢输入、feat04/05/06/07 既有用例）
 Test Files  19 passed (19)
      Tests  286 passed (286)

pnpm check   # typecheck + eslint --max-warnings 0 + prettier --check，全部通过
All matched files use Prettier code style!
```

### 结论

- [x] 所有需求点被测试覆盖
- [x] 所有测试真实跑过且通过
- [x] 实现在边界内
- [x] 不变量未破坏
