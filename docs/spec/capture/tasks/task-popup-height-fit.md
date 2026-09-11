# popup 高度适配内容（600px 上限内一屏放下）

> spec: docs/spec/capture/spec.md
> feat: feat08（修订场景1/5/7，新增场景8）
> 创建: 2026-09-11
> 修订: 2026-09-11 用户反馈「不要有滚动，适配内容高度」——撤销固定 600px + 内部滚动区方案，改为高度完全随内容自适应（见文末修订记录）

## ① 需求

### 功能方向

面板高度拉到浏览器允许的最大值（Chrome popup 上限 600px）；日常点选状态（非修改模式）下全部内容一屏放下、无需滚动；内容放不下时（修改模式或取值很多）只有分类卡片区内部滚动，保存按钮永远可见可点。实测依据：无头 Chrome 加载真实扩展量得默认态内容总高 705px、修改模式 761px，均超 600px 上限，底部按钮被截断。

### 功能边界

- 做：面板高度固定 600px 并改纵向 flex 布局——顶栏/页面信息/理由输入/横幅/保存按钮/库信息钉住，四维卡片区（.dims）为唯一滚动区（细滚动条）
- 做：每维底部的新增取值修改区（输入框+加号）收进修改模式，与「×」删除按钮同一开关（修订上一 task「修改区始终显示」的边界——它是内容超出上限的主因，四条共占约 132px；收起后默认态约 577px 一屏放下）
- 做：退出修改模式时清除增删错误提示（「该取值已存在」等不残留到下次进入）
- 不做：不压缩既有间距与字号（历轮视觉反馈调过的基准不动）；不动新增/删除校验与文案；不隐藏页面信息、理由输入、底部按钮、库信息；不处理 Firefox 小窗兜底路径的 620px 窗口（面板按 600px 渲染，留 20px 空白可接受）

### 不能破坏的不变量

- 修改模式下新增/删除行为与 feat08 场景1-4 完全一致（校验、文案、selection 清理、Inbox 保护）
- 不可收藏页面禁用态延伸到修改区（进修改模式后输入框与「×」一并禁用）
- 保存、重复收藏预填、横幅、关 Tab 链路不受影响
- popup 关闭重开仍默认非修改模式（feat08 场景7 不变量延续）

## ② 测试用例（先写，此刻失败）

### unit

- chip_add_gated_by_edit_mode（场景1 修订）：默认无任何 .chip-add；进入修改模式后 4 个维度各有输入框与加号
- layout_two_segments_default（场景5 修订）：默认每 .dim 子元素顺序 [dim-head, chips]；修改模式下 [dim-head, chips, chip-add]（chip-add 仍为末段）
- exit_edit_clears_error（场景7 修订）：修改模式触发「该取值已存在」→ 退出再进入 → 提示不再显示
- 既有 feat08 场景1/2 新增用例：先 enterEditMode()（新增流程现在处于修改模式下）
- 既有场景6 用例：不可收藏页面先进修改模式，再断言输入框与「×」禁用
- feat04 场景3 增补用例：chip-add 断言移到 enterEditMode() 之后

### layout 契约（popup/layout.test.ts，仿主页 layout 契约模式）

- html_height_600：html 高度恰为 600px（浏览器 popup 上限，不多不少）
- panel_flex_column：.panel 为纵向 flex 容器
- dims_only_scroll_region：.dims 同时具备 flex:1、min-height:0、overflow-y:auto（唯一滚动区）
- pinned_sections_flex_none：.topbar/.page-info/.context/.footer/.library-bar 均为 flex:none（钉住不收缩不滚动）

### smoke

- 既有 add_persists_shared_taxonomy 不变照跑（先进修改模式）：共享 taxonomy 链路不受布局改造影响

### e2e

不需要，依据：纯前端布局/状态门控 + 既有本地 Dexie 链路；600px 一屏放下由无头 Chrome 实测复验（④记录），jsdom 无法断像素

## ③ 技术实现

### 实现步骤

1. `popup/App.tsx`：每维底部修改区（chip-add）与增删错误提示（dim-error）整体收进 `{editing && …}`——与「×」删除按钮同一开关；退出修改模式时清空 errors（`toggleEditing`，不用 setState updater 内嵌副作用）
2. `popup/index.css`：高度布局——`html { height: 600px }`（拉满浏览器 popup 上限）、`body { height: 100%; overflow: hidden }`（整页不滚动）、`#root { height: 100% }`（.panel 的 100% 高度链路要经过 React 挂载点，漏了它 flex 整体失效）、`.panel` 纵向 flex、`.dims` 唯一滚动区（flex:1 + min-height:0 + overflow-y:auto + 细滚动条 5px）、顶栏/页面信息/理由/横幅/底部按钮/库信息分组 `flex: none` 钉住
3. `popup/index.css`：五处 2-4px 级空白收紧（page-info/context 下边距 10→8、dims 下边距 4→2、footer 8/12→6/10、library-bar 底 12→8）——默认态内容从实测 608px 收进 600px 之内，视觉不可感知；间距字号基准不动
4. `popup/layout.test.ts`（新建，仿主页布局契约）：html 高度恰 600、body 不滚动、.panel 纵向 flex、.dims 唯一滚动区、钉住区块 flex:none（匹配分组选择器，先剥注释）
5. `popup/App.test.tsx`：feat08 场景1/2 新增用例与 smoke 先 `enterEditMode()`；场景5 改「默认两段/修改模式三段」；场景6 重构（先进修改模式再断言禁用）；场景7 增补修改区进出断言 + 新增「退出清错误」用例；feat04 场景3 增补用例断言更新

### 涉及文件

- apps/extension/src/entrypoints/popup/App.tsx: 修改区/错误提示门控 + toggleEditing 清错误
- apps/extension/src/entrypoints/popup/index.css: 600px 高度布局 + 滚动区 + 空白微收
- apps/extension/src/entrypoints/popup/App.test.tsx: 用例修订与新增（60 用例）
- apps/extension/src/entrypoints/popup/layout.test.ts: 新建布局契约（5 断言）
- docs/spec/capture/spec.md: feat08 修订（场景1/5/7）+ 场景8 新增（本 task 前置）

## ④ 验证结果

### 测试输出

TDD 红（实现前，15 失败：修改区默认缺失 + 布局契约 CSS 不存在，非测试语法错）：

```
Tests  15 failed | 49 passed (64)
```

测试修正记录（②阶段遗留，非方向调整）：

- 布局契约「钉住区块」断言原按单选择器正则匹配，分组选择器（.topbar,\n.page-info…）匹配不到，改为收集所有含 flex:none 的规则块选择器集合再断言；选择器捕获会带上前置 CSS 注释，先剥注释再匹配

实现后绿：

```
✓ src/entrypoints/popup/App.test.tsx + layout.test.ts
Tests  60 passed (60)
```

### 无变量回归

```
apps/extension test（排除并行 WIP 两文件）:  Tests  225 passed (225)
pnpm typecheck: 除并行 WIP（AccountCard.tsx 13 个未使用变量，feat09 创建账号任务红阶段）外 0 错误
pnpm lint:      同上，仅并行 WIP 文件报错
prettier --check（本 task 全部改动文件）: All matched files use Prettier code style!
双构建: chrome-mv3 ✓ / firefox-mv2 ✓（popup css 7.38 kB）
```

注：仓库另有并行任务（feat09 创建账号：AccountCard/api/auth/smoke-register）正在进行，其文件处于 TDD 红阶段；全量 `pnpm check` 此刻被其 WIP 阻断属预期，与本 task 无关（零文件重叠）。本 task 回归按「排除其两份测试文件 + 三项检查错误清单逐一核对不在本 task 文件」完成。

### 无头 Chrome 实测复验（Playwright 加载真实扩展，600px 契约）

| 状态               | html/body 高度 | 卡片区滚动                      | footer 底缘 | 库信息底缘 |
| ------------------ | -------------- | ------------------------------- | ----------- | ---------- |
| 默认（非修改模式） | 600 / 600      | 无（289=289）                   | 575px 钉住  | 600px      |
| 修改模式           | 600 / 600      | 内部滚动（内容 466 > 视口 289） | 575px 钉住  | 600px      |

修改模式滚动到底验证：scrollTop 177，最后一张卡的修改区完整露出（scrolledToEnd=true）。改动前基线：默认态内容 705px、修改模式 761px，均超 600 被截断——本 task 后默认态一屏放下零滚动。

### 结论

- [x] 所有需求点被测试覆盖（场景1/5/7 修订 + 场景8 高度契约：单测 + 布局契约 + 真实浏览器实测三层）
- [x] 所有测试真实跑过且通过（红 15 → 绿 60/60，排除并行 WIP 后 225/225）
- [x] 实现在边界内（未动间距字号基准，仅五处 2-4px 空白收紧；未动校验文案；未动保存链路）
- [x] 不变量未破坏（增删行为、禁用态、重开复位均照旧；并行 WIP 文件未触碰）

## 修订记录（2026-09-11：用户反馈「不要有滚动，适配内容高度」）

### 变更

撤销「固定 600px + .dims 内部滚动区 + 区块钉住」方案，改为**高度完全随内容自适应**：

- spec 场景8 重写：不设固定高度、不做内部滚动区；默认态一屏放下零滚动；超出浏览器 popup 上限（Chrome 600px，如修改模式）时按浏览器原生行为处理（面板停在上限、浏览器自身滚动），扩展不另做滚动机制
- `popup/index.css`：移除 html 600px / body height+overflow / #root / .panel flex / 钉住分组 / .dims 滚动与细滚动条全部机制；四处空白收紧保默认态在上限内（page-info/context 下边距 10→8、footer 底 12→10、library-bar 底 12→8）
- `popup/layout.test.ts`：契约重写为「自适应」——html/body/.dims/.panel 均不得声明 height/overflow/flex 伸缩、无 #root 规则、无 .dims 自定义滚动条（4 断言）

### 不变

- 修改区收进修改模式（App.tsx 门控、退出清错误）与全部行为用例不动
- 间距字号基准不动（四处 2-4px 空白收紧视觉不可感知）

### 复验（无头 Chrome 加载真实扩展）

| 状态               | 内容高度 | 上限 600px 内 | 滚动                                 |
| ------------------ | -------- | ------------- | ------------------------------------ |
| 默认（非修改模式） | 594px    | ✓             | 无任何滚动（高度=内容）              |
| 修改模式           | 778px    | ✗ 超上限      | 浏览器原生滚动兜底（无自定义滚动区） |

修改模式超出上限是浏览器硬限制（Chrome popup 最高 600px），代码无法消除；要修改模式也零滚动需换交互（如取值管理搬到独立页面），已向用户说明。

### 回归

```
popup 套件: 59/59 通过（layout 契约 5→4 断言后总数 59）
排除并行 WIP（feat09 两测试文件）: 224/224 通过
typecheck（排除并行 WIP 文件）: 0 错误；prettier 改动文件全过
双构建: chrome-mv3 ✓ / firefox-mv2 ✓
```

## 修订记录 2（2026-09-11：用户反馈「圆角/上下 padding 减半，整体压进 600px」）

### 变更（仅 popup/index.css，无行为改动）

- 圆角全部减半：--radius 12→6（页面信息/理由/维度卡），chip 16→8，favicon 8→4，brand-mark 7→4，提示条 10→5，btn 9→5，topbar-link/shortcut-hint 6/5→3
- 各区块上下 padding 与区块间距减半：topbar 10/8→5/4、page-info 10→5（下边距 10→5）、context 10/11→5/6（label 下边距 7→4）、dim 卡 padding-top 7→4 与卡间距 6→3、dim-head 下边距 6→3、chips 下 padding 8→4、chip-btn 上下 2→1、chip-add 输入 7→4、dim-error 5/7→2/4、footer 8/10→4/5、btn 上下 10→8、banner 9→5、各提示条下边距 10→5

### 实测（无头 Chrome，真实扩展）

| 状态                                       | 改前 | 改后 | 600px 上限                  |
| ------------------------------------------ | ---- | ---- | --------------------------- |
| 默认态 · 默认取值集                        | 569  | 458  | ✓ 余 142                    |
| 默认态 · 用户密度（8 主题/6 形态，多折行） | ~619 | 510  | ✓ 余 90                     |
| 修改模式 · 默认取值集                      | 753  | 614  | ✗ 超 14，浏览器原生滚动兜底 |
| 修改模式 · 用户密度                        | ~790 | 640  | ✗ 超 40，同上               |

用户截图场景（默认态 + 真实取值密度）现距上限还有 90px 余量，后续取值再增加约 3 行折行以内都不会触发滚动；修改模式为低频管理态，超出部分按 feat08 场景8 交浏览器原生滚动。截图经视觉检查：无裁切重叠、间距仍有呼吸感、按钮完整。

### 回归

```
popup 套件: 59/59 通过（纯 CSS 改动，行为用例不受影响）
排除并行 WIP（feat09 两测试文件）: 238/238 通过
typecheck（排除并行 WIP 文件）: 0 错误；prettier 全过
双构建: chrome-mv3 ✓ / firefox-mv2 ✓
```

## 修订记录 3（2026-09-11：用户反馈「顶栏左侧字与右侧按钮字没对称」）

### 变更（仅 popup/index.css 顶栏规则）

根因：右侧「收藏N条」为纯文本（约 17px 行盒）、按钮约 21px、快捷键提示约 20px，高度不一，各自垂直居中后基线互相错开，也与左侧 22px 品牌标记不齐。

修法：顶栏全部元素统一 22px 盒高（与 brand-mark 同高）、`display:inline-flex; align-items:center; line-height:1`、垂直 padding 改由盒高承担（.brand-name 加 line-height 22px）。改动规则：.brand-name / .shortcut-hint / .topbar-link / .topbar-links .library-count。

### 验证

无头 Chrome 数值实测：7 个顶栏元素（标记/拾绪/收藏N条/已收藏/设置/修改/⌘⇧S）全部 22px 高、中心线同为 16px——完全对称；截图视觉检查通过。popup 套件 59/59（纯 CSS，行为不受影响）、prettier 过、firefox 构建过；顶栏区高度不变（31px），不影响 600px 结论。
