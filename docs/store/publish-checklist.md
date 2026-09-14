# 发布清单：无账号本地版 → Chrome Web Store / Firefox AMO

状态：**工程侧全部就绪**（2026-09-13）。下面是只剩人工的部分，按顺序走。

## 已完成（工程侧）

- ✅ `--mode store` 构建变体：无账号/无同步/无网络权限（`apps/extension/src/lib/variant.ts` + `wxt.config.ts` hook）
- ✅ 商店版 manifest：Chrome 无 host 权限；Firefox 无 host 权限 + 固定 gecko id `x-threadpick@ktkid.dev`
- ✅ 扩展图标 16/32/48/128（`apps/extension/public/icons/`，脚本 `pnpm --filter @x-threadpick/extension icons` 可再生成）
- ✅ 版本 0.1.0；打包脚本 `pnpm pack:ext:store:chrome` / `pnpm pack:ext:store:firefox`
- ✅ 产物（`apps/extension/dist/`）：
  - `x-threadpickextension-0.1.0-chrome-store.zip` → 上传 Chrome Web Store
  - `x-threadpickextension-0.1.0-firefox-store.zip` → 上传 AMO
  - `x-threadpickextension-0.1.0-sources-store.zip` → AMO 审核源码包
- ✅ 文案与表单答案：`docs/store/listing.md`；隐私政策草稿：`docs/store/privacy-policy.md`

## 你需要人工做的

### 0. 三个决定

1. **gecko id**：现在是 `x-threadpick@ktkid.dev`（`wxt.config.ts` 里）。AMO 首发后不可再改（改了等于新扩展、更新断档）。不想要这个域名就现在改。
2. **联系邮箱**：隐私政策与商店账号都要用。
3. **开源与否**：只影响 AMO 的 license 字段；Chrome 不要求源码，AMO 源码包仅供审核不公开。

### 1. 注册开发者账号

- Chrome Web Store：[注册](https://chrome.google.com/webstore/devconsole/register)，一次性 $5，需两步验证。
- Firefox AMO：[注册](https://addons.mozilla.org/developers/)，免费。

### 2. 托管隐私政策

`docs/store/privacy-policy.md` 补上联系邮箱后，放到公开 URL（GitHub Pages 最简单：推到任意公开仓库 → Settings → Pages 启用）。记下 URL，两家商店都要填。

### 3. 截图（两家同规格 1280×800）

```bash
pnpm build:ext:store          # 产物在 apps/extension/dist/chrome-mv3-store/
# Chrome → chrome://extensions → 开发者模式 → 加载已解压 → 选 dist/chrome-mv3-store
```

导入几十条真实书签后，用浏览器窗口截这三个页面（窗口宽高调到 1280×800 再截，或截后裁切）：

1. 主页「最近新增」——展示收藏卡 + 四维标签
2. 「导入已有书签」——展示搜索 + 勾选列表
3. 任一网页上唤起收藏面板（Cmd/Ctrl+Shift+S）——展示四维点选 + 理由输入

### 4. Chrome Web Store 提交

1. 开发者后台 → New item → 上传 `dist/x-threadpickextension-0.1.0-chrome-store.zip`。
2. Store listing：照抄 `docs/store/listing.md`（名称/描述/类别/截图/图标）。
3. Privacy tab：填隐私政策 URL；权限理由逐条粘贴 listing.md 的「权限理由」；数据披露选 **不收集任何用户数据**；Remote code 选 **No**。
4. Distribution：先选 **Unlisted**（隐藏发布，只有拿到链接能装）跑通审核；通过后再切 Public。
5. Submit for review。无 host 权限 + 无数据收集，一般几小时到 1-2 天。

### 5. Firefox AMO 提交

1. [提交新附加组件](https://addons.mozilla.org/developers/addon/submit/) → 上传 `dist/x-threadpickextension-0.1.0-firefox-store.zip`。
2. 选 **On this site / Listed** 视分发需求（建议直接 Listed 公开）。
3. 上传 sources zip 并粘贴 listing.md 里的构建说明。
4. 填名称/摘要/分类/license/隐私政策 URL；Data collection 选 **不收集**。
5. 提交后人工审核，通常 1-7 天。

### 6. 之后的更新流程

```bash
# 改代码 → bump apps/extension/package.json version →
pnpm check && pnpm build:ext:store
pnpm pack:ext:store:chrome    # → CWS 后台重新上传
pnpm pack:ext:store:firefox   # → AMO 重新上传（listed 更新会再审）
```

注意：`--mode store` 产物目录带 `-store` 后缀（`dist/chrome-mv3-store/`），与日常 `pnpm build:ext` 的产物并存互不覆盖；日常构建仍含完整账号/同步功能与 host 权限。

### 常见驳回点（自检）

- 描述里别出现「Chrome」「Google」等品牌词 ✓（文案已避开）
- 功能与权限描述不一致：确保商店里发布的 zip 是 `--mode store` 产物（zip 文件名带 `-store`），而不是日常构建——日常构建申请了全站 host 权限，会被重点审查
- 截图与实际 UI 一致：截自 store 版（无「网络连接」入口）
- Firefox MV2 的 `tabs`/`webNavigation` 说明已在 listing.md，AMO 审核员会核对
