# 移除主页「最近新增」导航条目，「全部收藏」成为默认视图

> spec: docs/spec/homepage/spec.md
> feat: feat01, feat02, feat04, feat07, feat08
> 创建: 2026-09-14

## ① 需求

### 功能方向

主页左侧导航不再有「最近新增」条目。打开主页（无论从导航、收藏面板「已收藏」按钮、浏览器扩展管理页入口，还是被接管的新标签页）都直接落在「全部收藏」，浏览全部收藏。

### 功能边界

- 做：导航删去「最近新增」，「全部收藏」排第一并作为默认条目；空地址或未知地址都落到「全部收藏」；收藏面板「已收藏」按钮、扩展管理页「扩展选项」入口改落「全部收藏」；原「最近新增」的视图能力（只显示 3 条、提示文案、标题「最近添加」）整体移除；收藏时间下拉随视图合并变为常驻（feat08 不再有「只在全部收藏」的限制）
- 不做：「全部收藏」及四维筛选/搜索/时间筛选/同步标记的既有行为不变；其他导航条目（网络连接/分类维度/导入已有书签/通用）不变；浏览器书签导入逻辑不变

### 不能破坏的不变量

- 「全部收藏」视图行为不变：默认全量、按收藏时间新到旧、标题「全部收藏」、筛选/搜索/清除/空态文案（feat05/06/07/08 既有规则）
- 收藏面板「设置」按钮仍落「网络连接」（feat01 场景2）；切换条目地址跟随、刷新仍落当前条目（feat02 场景5）
- 四维筛选、搜索、收藏时间筛选、待同步筛选、云朵标记、页头汇总行既有行为不变
- 导入的书签仍立即出现在收藏列表（feat03）

## ② 测试用例（先写，此刻失败）

纯删功能，**不新增测试用例**：删除随功能失效的用例，受影响的既有断言就地改到新行为。

### unit / 集成（既有用例的删与改）

删除（随功能失效）：

- feat04 场景1「最近 3 条截断 + 提示文案 + 标题『最近添加』」用例
- 「最近新增」页头标题用例
- feat08 用例中「recent 变体不出现时间下拉」的分支（recent 变体已不存在）

就地更新（断言指向新行为，不新增）：

- 导航条目六项 → 五项（全部收藏/网络连接/分类维度/导入已有书签/通用），默认选中第一项 → 功能方向
- `parseSectionHash`：空/未知/旧 `#recent` 回退 library（原回退 recent） → 功能边界
- popup「已收藏」打开地址 `#recent` → `#library`；options stub 跳 `#library` → 功能方向
- 视图内「最近添加」标题断言 → 「全部收藏」；「清除全部筛选」回归默认视图断言 → 「全部收藏」；最近 3 条截断断言 → 全量 → 功能方向
- ImportSection 链路里点「最近新增」验证导入可见 → 点「全部收藏」 → 不变量（feat03）
- 其余既有用例（feat05/06/07/08、同步标记、汇总行、云朵翻转）不动，统一视图下应全绿 → 不变量

### smoke

构建 chrome-mv3 → 加载扩展：主页打开即「全部收藏」且全部条目可见；popup 点「已收藏」落「全部收藏」；地址改为 `#bogus` 刷新仍落「全部收藏」。

### e2e（按需）

不需要，依据：纯前端视图/导航层变更，无跨进程用户链路风险。

## ③ 技术实现

### 实现步骤

1. `home/App.tsx`：`SectionKey` 删 `'recent'`；`SECTIONS` 删「最近新增」条目；`parseSectionHash` 回退 `'library'`；`initialSection` 默认 `'library'`；删除 recent 分区渲染分支
2. `sections/RecentSection.tsx` → `sections/LibrarySection.tsx`（改名）：删 `RecentSectionVariant` 类型与 `variant` prop、`RECENT_LIMIT` 截断、`result-hint` 提示段、recent 标题/副标题分支；时间下拉去掉 `variant === 'library'` 门控改为常驻；外壳 className `recent` → `library`（无 CSS 规则依赖）
3. `popup/App.tsx`：`openHome('recent')` → `'library'`（类型同步改）
4. `options/main.tsx`：跳转 `#recent` → `#library`
5. `components/settings/NewTabCard.tsx`：文案「最近新增」→「全部收藏」
6. `home/index.css`：删除无人引用的 `.result-hint` 规则，注释更新
7. 测试按 ② 删改；`spec.md`：feat01 场景1/3、feat02 场景1/5、feat03 场景1/4 落点改「全部收藏」，feat04 标记废弃留档，feat07 改为默认视图描述，feat08 删去「只在全部收藏」限制

### 涉及文件

- apps/extension/src/entrypoints/home/App.tsx: 导航五项 + 默认/回退 library
- apps/extension/src/entrypoints/home/App.test.tsx: 导航/hash 断言更新
- apps/extension/src/entrypoints/home/sections/LibrarySection.tsx: 自 RecentSection 改名 + 删 variant/截断/提示
- apps/extension/src/entrypoints/home/sections/LibrarySection.test.tsx: 自 RecentSection.test 改名 + 删改断言
- apps/extension/src/entrypoints/home/sections/ImportSection.test.tsx: 链路断言改点「全部收藏」
- apps/extension/src/entrypoints/home/SearchBox.tsx / TimeRangeDropdown.test.tsx: 注释里的组件名同步
- apps/extension/src/entrypoints/popup/App.tsx / App.test.tsx: 「已收藏」落 #library
- apps/extension/src/entrypoints/options/main.tsx: 跳转 #library
- apps/extension/src/components/settings/NewTabCard.tsx: 文案
- apps/extension/src/entrypoints/home/index.css: 删 .result-hint
- docs/spec/homepage/spec.md: feat01/02/03/04/07/08 措辞

## ④ 验证结果

### 测试输出

红（实现前，失败均为功能未删：导航仍六项、hash 回退 recent、popup 仍 #recent、LibrarySection 模块不存在）：

```text
pnpm exec vitest run src/entrypoints/home
 Test Files  2 failed | 5 passed (7)
      Tests  8 failed | 57 passed (65)
```

绿（实现后，home + popup 全部 entrypoint 测试）：

```text
pnpm exec vitest run src/entrypoints
 Test Files  9 passed (9)
      Tests  172 passed (172)
```

### 不变量回归

apps/extension 全量（feat05/06/07/08、sync-archive、capture、newtab 等全部既有用例）：

```text
 Test Files  29 passed (29)
      Tests  455 passed (455)
```

packages/shared 全量：

```text
 Test Files  8 passed (8)
      Tests  53 passed (53)
```

静态检查与构建：

```text
pnpm check        # typecheck（三包 tsc --noEmit）+ eslint --max-warnings 0 + prettier --check 全部通过
pnpm build:ext    # chrome-mv3 + firefox-mv2 均 Built extension ✔
```

smoke 链路（主页打开即「全部收藏」全量可见；popup「已收藏」落全部收藏；`#bogus` 刷新回退全部收藏）由 App.test 的默认条目/hash 回退用例与 popup 的 `#library` 断言覆盖；双浏览器构建产物已验证。

### 结论

- [x] 所有需求点被测试覆盖
- [x] 所有测试真实跑过且通过
- [x] 实现在边界内
- [x] 不变量未破坏
