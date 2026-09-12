# 站点图标收藏时下载入库，卡片按相对路径引用本地资源

> spec: docs/spec/homepage/spec.md
> feat: feat04, feat07
> 创建: 2026-09-12

## ① 需求

### 功能方向

收藏或导入一条书签时，插件不仅找到站点图标的地址，还会把图标**图片本体下载下来**，存进插件本地的统一资源库。同一网站的图标只存一份（按网站域名去重）。卡片展示时引用的是资源库里的**相对路径**（如 `icons/doubao.com`），不再是第三方网站的绝对地址；即使断网或原网站的图标地址失效，已下载的图标照常显示。

### 功能边界

- 做：图标在收藏/导入/主页回填时下载图片本体，存入本地资源库（按域名去重共享）；书签上的图标地址（iconUrl）照旧保留并同步，作为新设备重新下载的线索；卡片渲染优先用本地资源，本地没有时才回退远程地址，再失败回退小首字母色块；已有 iconUrl 但本地没资源的书签，回填时只补下载、不重新解析
- 不做：资源库同步到服务器（本地为主，各设备自行下载收敛，符合 v1 无 File Storage）；og:image 封面 / 截图等其他资源类型（资源库结构为其留位，不实现）；图标定期更新（取用时的版本）；popup 面板图标改造
- 边界约束：单个图标超过 256KB 或不是图片格式时不入库（防异常资源撑大本地库）

### 不能破坏的不变量

- 没有图标的书签卡片仍完整显示小首字母色块 + 域名 + 标题等全部既有信息
- 导入与收藏保存的行为不变：下载是后台异步，失败不影响收藏本身
- 同步协议不变：服务器只见到 iconUrl 文本，资源库不进同步
- 同一域名多条书签只存一份图标资源
- 上一任务（task-card-brand-icon）的品牌卡展示与测试继续成立

## ② 测试用例（先写，此刻失败）

### unit

- resource_path_relative：书签 URL 推出的资源键是相对路径（`icons/<域名>`，无协议无斜杠前缀） → 功能方向（相对路径引用）
- resource_roundtrip：putResource 存 data URL 后 getResource 原样取回；未存的路径返回 null → 功能方向（统一资源库）
- fetch_icon_data_ok：图标地址返回图片（≤256KB）→ 转为 data URL；content-type 非图片 / 超过 256KB / 请求失败 → null → 功能边界（格式与大小校验）
- ensure_icons_downloads：规则链解析出地址后下载本体入资源库，书签 iconUrl 照常写回 → 功能方向（收藏时下载）
- ensure_icons_dedupe：同域名两条书签只下载一次、资源库只有一份 → 不变量（按域名去重）
- ensure_icons_resource_only：书签已有 iconUrl 但本地无资源 → 只补下载不重新解析（解析器不被调用） → 功能边界（只补下载）
- ensure_icons_download_fail：下载失败时书签 iconUrl 仍写回（下轮可重试下载），资源库不落脏数据 → 边界（错误输入）
- card_prefers_local_resource：本地有资源时卡片 img 用 data URL（非远程地址）；无资源有 iconUrl 时用远程地址 → 功能方向（渲染优先级）

### smoke

- 导入一条真实网站书签 → 资源库出现 `icons/<域名>` 一条记录（图片本体）；断网重开主页 → 该卡片仍显示图标

### e2e

不需要，依据：资源存取与下载校验由 vitest（fake-indexeddb + mock fetch）覆盖；真实网站链路已实测（task-card-brand-icon ④）

## ③ 技术实现

### 实现步骤

1. `apps/extension/src/db/resources.ts`（新建）：统一资源库——`iconPathFor`（书签 URL → 相对键 `icons/<域名>`，同域名收敛）、`getResource`/`putResource`（data URL 存取，走当前库句柄）
2. `apps/extension/src/db/library.ts`：LibraryDB 加 v4 schema，新增 resources 表（主键 path）；旧库打开自动升级，存量数据不动
3. `apps/extension/src/lib/page-icon.ts`：新增 `fetchIconData`——下载图标本体，校验 content-type 为 image/\*、体积 ≤256KB，转 data URL；失败一律 null
4. `apps/extension/src/db/icons.ts`（重排）：ensureBookmarkIcons 新流程——缺 iconUrl 先规则链解析写回书签（照旧）；本地无资源则下载本体入库；路径级在途标记（pathInflight，检查+标记间无 await）保证同域名并发只下载一次；返回值改为变化次数（写书签 + 存资源各计一次）
5. `apps/extension/src/entrypoints/home/sections/RecentSection.tsx`：BrandMark 改为先查本地资源（data URL），没有再回退远程 iconUrl，onError 仍退小首字母色块
6. 测试修正记录：①icons「下载入库」用例初版断言 updated=1（沿用上任务语义），新语义为变化次数（写书签+存资源=2），改断言并注释；②typecheck 修 `split(';')[0]` 在 noUncheckedIndexedAccess 下的判空

### 涉及文件

- apps/extension/src/db/resources.ts: 新建，相对路径键 + 资源存取
- apps/extension/src/db/resources.test.ts: 新建，键推导/往返/覆盖 3 用例
- apps/extension/src/db/library.ts: Dexie v4 加 resources 表
- apps/extension/src/lib/page-icon.ts: 新增 fetchIconData（下载 + 校验 + data URL）
- apps/extension/src/lib/page-icon.test.ts: fetchIconData 4 用例（成功/非图片/超 256KB/失败）
- apps/extension/src/db/icons.ts: 重排为 解析→下载→入库→写回，同域名并发去重
- apps/extension/src/db/icons.test.ts: 重写为下载流程 7 用例（入库/去重/只补下载/完全不动作/下载失败/不重复抓/墓碑跳过）
- apps/extension/src/entrypoints/home/sections/RecentSection.tsx: BrandMark 本地资源优先
- apps/extension/src/entrypoints/home/sections/RecentSection.test.tsx: 新增「本地资源优先 data URL」用例

## ④ 验证结果

### 测试输出

apps/extension（vitest run，含 resources 3、fetchIconData 4、icons 下载流程 7、本地资源优先 1 新用例）：

```
 Test Files  26 passed (26)
      Tests  409 passed (409)
```

packages/shared（未改动，回归）：

```
      Tests  52 passed (52)
```

根 `pnpm check`（三包 typecheck + eslint --max-warnings 0 + prettier --check）：全绿（`All matched files use Prettier code style!`）。

双浏览器构建：`pnpm build:ext` → Chrome MV3 + Firefox MV2 均 `✔ Built extension`。

### 不变量回归

- task-card-brand-icon 全量用例保持绿（品牌卡渲染、onError 兜底、挂载回填、规则链 A1→A2 均在 409 内）
- 既有书签展示（标题/域名/时间/理由/标签/云朵）、点击打开原网址、筛选搜索行为：RecentSection.test.tsx 43 用例全绿
- 同步协议未动：本任务没有改 shared schema 与 server；iconUrl 文本同步沿用上一任务已验证的往返；resources 表只在本地 Dexie，不进任何同步载荷
- 导入/收藏保存链路不变量：导入与 Capture 的既有测试全绿，回填仍是 fire-and-forget

### 结论

- [x] 所有需求点被测试覆盖
- [x] 所有测试真实跑过且通过
- [x] 实现在边界内
- [x] 不变量未破坏
