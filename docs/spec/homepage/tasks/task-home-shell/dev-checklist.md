# task-home-shell · 开发清单

> spec: docs/spec/homepage/spec.md
> 创建: 2026-09-11

**状态**：`[ ] ⏳` 未开始 / `[ ] ▶️` 进行中 / `[x] 🟢` 验证通过 / `[!] 🔴` 验证失败

| #   | 任务                                                                                                                                                                                                                                                                                                           | 场景回指                          | 涉及文件                                                                                                                                     | 风险 | 状态   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ |
| T1  | 主页 entrypoint 骨架：新建 home 整页（unlisted HTML），左侧导航固定在页面左缘、宽度不随窗口拉伸，条目依次为「最近新增 / 网络连接 / 分类维度 / 导入已有书签」（无预留项）；右侧内容区水平居中且有最大宽度（窗口很宽不摊满不贴左）；默认选中「最近新增」，地址支持指定初始条目（供「设置」按钮直达「网络连接」） | feat02 场景1, 场景3, 场景4        | apps/extension/src/entrypoints/home/index.html, main.tsx, App.tsx, App.test.tsx, index.css                                                   | None | [x] 🟢 |
| T2  | 设置卡片迁为公共组件：ServerCard / AccountCard / DimensionsCard / api / format（含各自测试与所需样式）从 settings entrypoint 迁到公共目录，主页「网络连接」「分类维度」分区接入，对外行为不变（沿用 settings spec）；删除原 settings 独立页                                                                    | feat02 场景1                      | apps/extension/src/components/settings/（U，迁移），apps/extension/src/entrypoints/settings/（D，整目录），home/App.test.tsx（分区内容断言） | None | [x] 🟢 |
| T3  | 「最近新增」视图：无筛选时默认展示最近 3 条并显示提示文案；每条卡片含首字母色块、标题、来源域名、相对时间（如「2 天前」）、收藏理由、分类标签（主题/形态取值与状态），理由为空不显示理由区域；空收藏库显示空状态并给出去「导入已有书签」的引导入口；点击卡片在新标签页打开原网址                               | feat04 场景1, 场景2, 场景3, 场景4 | apps/extension/src/entrypoints/home/sections/RecentSection.tsx                                                                               | None | [x] 🟢 |
| T4  | 排序与相对时间：按收藏时间从新到旧排列；「N 天前」覆盖今天/昨天等边界（直接复用或迁移 settings/format.ts 的日期工具，勿写第二份）                                                                                                                                                                              | feat04 场景1, 场景2               | apps/extension/src/components/settings/format.ts, apps/extension/src/entrypoints/home/sections/RecentSection.tsx                             | None | [x] 🟢 |
| T5  | popup 顶栏按钮：「已收藏」打开主页落在「最近新增」、「设置」打开主页落在「网络连接」；跳转后面板关闭，未保存的理由与点选不保留、不自动保存                                                                                                                                                                     | feat01 场景1, 场景2               | apps/extension/src/entrypoints/popup/App.tsx, index.css                                                                                      | None | [x] 🟢 |
| T6  | popup 底部库信息收敛：移除「打开导入器」按钮，保留「已入库 N 条」计数（连同删掉 openOptionsPage 调用）                                                                                                                                                                                                         | feat01 场景5                      | apps/extension/src/entrypoints/popup/App.tsx                                                                                                 | None | [x] 🟢 |
| T7  | options 入口改为主页跳转：扩展管理页「扩展选项」整页打开主页并落在「最近新增」；删除原独立导入器页与设置页（导入功能由 task-home-import 在主页重建，其间短暂无导入入口属预期中间态）                                                                                                                           | feat01 场景3                      | apps/extension/src/entrypoints/options/index.html, main.tsx（M，改跳转 stub）, App.tsx, index.css（D）                                       | None | [x] 🟢 |
| T8  | 导航切换保留输入：同一次打开内切到其他条目再切回，各分区已填内容不丢（如未测试的服务器地址）；跨次打开不要求保留                                                                                                                                                                                               | feat02 场景2                      | apps/extension/src/entrypoints/home/App.tsx, App.test.tsx                                                                                    | None | [x] 🟢 |
| T9  | unit：RecentSection 排序、相对时间边界、默认 3 条、空态、理由空不显示                                                                                                                                                                                                                                          | feat04 场景1, 场景2, 场景3        | apps/extension/src/entrypoints/home/sections/RecentSection.test.tsx                                                                          | None | [x] 🟢 |
| T10 | unit：popup 顶栏按钮落点与「打开导入器」移除                                                                                                                                                                                                                                                                   | feat01 场景1, 场景2, 场景5        | apps/extension/src/entrypoints/popup/App.test.tsx                                                                                            | None | [x] 🟢 |
| T11 | 手工 smoke（加载已解压扩展）：全新环境未连接未登录 → 经「已收藏」/「设置」/「扩展选项」三个入口打开主页，落点正确、本地库照常显示、内容居中                                                                                                                                                                    | feat01 场景1-4, feat02 场景4      | 无新增文件（步骤与结果记录在本 checklist）                                                                                                   | None | [x] 🟢 |

## 影响文件树

```text
x-threadpick/
├── apps/extension/src/entrypoints/home/                      U  # 新增主页 entrypoint（unlisted 整页）
│   ├── index.html / main.tsx / index.css                     U  # 页面外壳与全局样式（左导航固定、内容区居中）
│   ├── App.tsx / App.test.tsx                                U  # 四条目导航、分区切换、初始条目参数
│   └── sections/RecentSection.tsx / RecentSection.test.tsx   U  # 最近新增视图（卡片/空态/相对时间/点击开原页）
├── apps/extension/src/components/settings/                   U  # 自 settings entrypoint 迁移的公共卡片（含样式与测试）
│   ├── ServerCard.tsx / ServerCard.test.tsx                  U
│   ├── AccountCard.tsx / AccountCard.test.tsx                U
│   ├── DimensionsCard.tsx / DimensionsCard.test.tsx          U
│   ├── api.ts / api.test.ts / format.ts                      U  # format.ts 增 formatRelativeTime（T4）
│   └── cards.css                                             U  # 卡片所需样式（自原 settings/index.css 迁移）
├── apps/extension/src/entrypoints/settings/                  D  # 原独立设置页整目录删除（并入主页，行为不变）
├── apps/extension/src/entrypoints/options/                   M  # 「扩展选项」改为打开主页「最近新增」的跳转 stub
│   ├── index.html / main.tsx                                 M  # 跳转 stub（保留 options_ui 注册）
│   └── App.tsx / index.css                                   D  # 原导入器页删除（task-home-import 在主页重建）
└── apps/extension/src/entrypoints/popup/
    └── App.tsx / App.test.tsx / index.css                    M  # 顶栏「已收藏」「设置」两按钮、移除「打开导入器」
```

## T11 · smoke（真实浏览器执行记录 · 2026-09-11）

**执行方式**：CDP 驱动的真实浏览器链路（非 jsdom）。构建产物 `dist/chrome-mv3/` 经 `--load-extension` 加载到独立 user-data-dir 的全新环境（Chrome stable 152 已禁用该 flag，故用同内核的 Chrome for Testing 151.0.7922.34，Playwright 内置构建）；页面打开走扩展自身 service worker 的 `chrome.tabs.create`（真实扩展发起链路；CDP 直接导航 chrome-extension:// 被 Chrome 拦截）。与「纯手工」的差异仅在于：加载与点击由脚本驱动、popup 以扩展页面形式打开而非物理点击工具栏图标——popup 内按钮触发的是真实 React onClick → 真实 `browser.tabs.create` 与 `window.close()`。

**结果：12/12 通过**（执行日志要点）：

1. ✅ home.html#network → 落「网络连接」，分区含服务器地址/端口表单、历史服务器区（空态文案正确）；导航四条目按序「最近新增|网络连接|分类维度|导入已有书签」（feat02 场景1）。
2. ✅ 布局（1600px 视口，computed style 实测）：侧栏 `position: sticky`、宽度固定 200px 不随窗口拉伸；内容区 `max-width: 760px`、实际宽 760px、与主区中心偏移 0.0px（水平居中、不摊满不贴左）（feat02 场景4）。
3. ✅ home.html 无 hash → 默认落「最近新增」；全新环境（未连接未登录）空库照常显示：空状态文案 + 「最近添加」标题 + 去「导入已有书签」引导入口（feat01 场景4 / feat04 场景3）。
4. ✅ 向本地 IndexedDB 种入一条书签后重载：卡片照常渲染（标题/域名 example.com/相对时间「今天」/理由/标签 AI·博客文章·Inbox/`target="_blank"`/首字母色块 S）（feat04 场景2）。
5. ✅ popup（真实扩展页面上下文）：顶栏含「已收藏」「设置」、无「打开导入器」、显示「已入库 1 条」（feat01 场景5）。
6. ✅ 点「已收藏」→ 真实 `browser.tabs.create` 整页打开主页落「最近新增」，且 popup 随 `window.close()` 自毁（feat01 场景1）。
7. ✅ 点「设置」→ 主页落「网络连接」（feat01 场景2）。
8. ✅ options.html（「扩展选项」入口）→ `location.replace` 到 home.html#recent 且落「最近新增」（feat01 场景3）。

补充核验：manifest.json 含 `options_ui.open_in_tab`、home 为 unlisted 不入 manifest；`developerPrivate.getExtensionsInfo` 确认扩展在 Chrome stable 下 `--load-extension` 已失效（152），如需手工复验请在 chrome://extensions 开发者模式加载 `apps/extension/dist/chrome-mv3/`。
