# task-home-shell · dev-report

> task: docs/spec/homepage/tasks/task-home-shell/dev-checklist.md
> 创建: 2026-09-11

## 对账修订（2026-09-11 · x-verify 退回项）

- 问题：影响文件树含 `home/App.test.tsx`，但表格「涉及文件」列无任何行覆盖该文件（树上表外文件）。
- 修订：将该测试文件补进其验收用例所在的 T1（导航骨架/初始条目）、T2（「网络连接」「分类维度」分区内容断言）、T8（切换保留输入）三行的「涉及文件」列；任务描述、场景回指、行状态均未改动。
- 修订后机械核对：树上 `home/App.test.tsx`（checklist 影响文件树）↔ 表格 T1/T2/T8；`popup/App.test.tsx` ↔ T10；其余树文件均有目录级或文件级覆盖（components/settings/ 目录归 T2、format.ts 另由 T4 显式列出）。

## 结果

- task 测试：11/11 行 🟢（T11 smoke 已在真实浏览器执行，见下）
- 既有回归：通过（`pnpm test` 全仓：packages/shared 26/26、apps/extension 147/147——含 db / capture-invoke / 迁移后的 settings 卡片全部用例）
- 静态检查：`pnpm lint`（eslint . --max-warnings 0）通过、`pnpm typecheck` 通过、`pnpm format:check` 全仓通过（上轮遗留的 4 个既有不合格式文件——其他 task 的 checklist ×3 与 .zcode 运行脚本 ×1——已按本轮授权统一 prettier --write 修复）
- 构建产物：`pnpm build:ext` 通过——dist/chrome-mv3/ 下 home.html（unlisted，manifest 无对应条目）、options.html（保留 options_ui + open_in_tab）、popup.html 齐备
- 高风险行：0 行（清单风险列全部为 None）
- 本 task 新增/迁移测试：home/App.test.tsx（9，feat02 场景1/2/3 + 初始条目 + 分区内容）、home/sections/RecentSection.test.tsx（9，feat04 场景1-4，T9 行）、popup/App.test.tsx（39，含新增顶栏主页入口 2 + 库信息收敛改写 2，T10 行）、components/settings/ 下迁移的 ServerCard(11)/AccountCard(7)/DimensionsCard(10)/api(15) 用例全部随迁通过

## T11 smoke（真实浏览器链路，12/12 通过）

CDP 驱动的真实浏览器执行：Chrome for Testing 151.0.7922.34（Playwright 内置构建；Chrome stable 152 已禁用 `--load-extension`，经 `developerPrivate.getExtensionsInfo` 实证）+ 独立 user-data-dir 全新环境（未连接未登录）+ `--load-extension` 加载 dist/chrome-mv3/；页面经扩展自身 service worker 的 `chrome.tabs.create` 打开（CDP 直接导航 chrome-extension:// 被浏览器拦截，此为合规的扩展发起链路）。核验点：三入口落点（已收藏→最近新增 / 设置→网络连接 / 扩展选项→replace 到 home#recent）、popup 自毁（window.close 生效）、无「打开导入器」+「已入库 1 条」、空库空态与导入引导、种入书签后卡片渲染（域名/「今天」/理由/四维标签/target=_blank）、布局 computed style 实测（侧栏 sticky 宽 200px；内容区 max-width 760px、中心偏移 0.0px）。完整记录见 checklist 的「T11 · smoke」节。

## 行级备注

- T2：迁移为纯搬迁（ServerCard/AccountCard/DimensionsCard/api/format 及各自测试移至 components/settings/，import 深度相同零改动；卡片样式提取为 cards.css 由主页引入；settings entrypoint 整目录删除，其 App.test.tsx 测的是已删除的「设置页骨架」故随页废弃）。对外行为沿用《设置页面》spec，由迁移后的卡片用例全绿背书。
- T4：未写第二份日期工具——直接在迁移后的 components/settings/format.ts 内新增 formatRelativeTime（自然日差，覆盖今天/昨天/N 天前/跨月边界）。
- T7：options 跳转 stub 无 unit（jsdom 下 location.replace 不可靠断言），除 typecheck + 构建产物检查外，浏览器内终验由 T11 smoke 第 8 项覆盖（options.html → home.html#recent 实测通过）。
- T8：测试先写后跑，直接绿——host/port 状态在 T2 接线时即提升于 home/App.tsx 顶层（沿用原 settings/App.tsx 结构），分区切换只切换视图不丢表单值，属实现方式天然满足场景，非跳过验证。
- T11：原计划「手工」smoke 由 CDP 自动化真实浏览器等价执行（加载与点击脚本驱动、popup 以扩展页面形式打开）；差异与证据链已如实记录于 checklist。
