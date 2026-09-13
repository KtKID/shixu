import { loadSettings } from '../db/settings';

/**
 * 新标签页接管（feat-newtab）：设置页勾选后，把「用户手动新建的空白新标签页」换成收藏主页。
 * 不用 chrome_url_overrides——manifest 覆盖装上即生效、无法跟设置开关联动；
 * 这里只监听标签页事件：未勾选时零干预，取消勾选立即恢复浏览器原生新标签页，卸载无残留。
 */

/** 各浏览器手动新建标签页的落地地址：Chrome 新标签页（含新版 new-tab-page 别名）与 Firefox about:newtab。 */
export const NEWTAB_URLS: readonly string[] = [
  'chrome://newtab/',
  'chrome://new-tab-page/',
  'about:newtab',
];

/** 判定所需的最小标签页字段（Tabs.Tab 子集，便于单测）。 */
export interface NewTabCandidate {
  id?: number | undefined;
  openerTabId?: number | undefined;
  pendingUrl?: string | undefined;
  url?: string | undefined;
}

/**
 * 纯判定：这个新建标签页是否应被接管。
 * 只接管「无 opener 且目标是默认新标签页」的标签——链接/脚本打开（中键、target=_blank）带 opener 不动，
 * 会话恢复与链接预载入的标签目标是真实地址也不命中；开关关闭时一律不动。
 */
export function shouldTakeOverNewTab(tab: NewTabCandidate, enabled: boolean): boolean {
  if (!enabled) return false;
  if (tab.openerTabId !== undefined) return false;
  const target = tab.pendingUrl ?? tab.url;
  return target !== undefined && NEWTAB_URLS.includes(target);
}

/**
 * 单个新建标签页的接管动作：开关开启且命中空白新标签页时，就地换成收藏主页。
 * 返回是否执行了接管，供监听层做去重。
 */
export async function takeOverNewTabIfEnabled(tab: NewTabCandidate): Promise<boolean> {
  const settings = await loadSettings();
  if (!shouldTakeOverNewTab(tab, settings.newtabEnabled)) return false;
  const tabId = tab.id;
  if (typeof tabId !== 'number' || tabId < 0) return false;
  await browser.tabs.update(tabId, { url: browser.runtime.getURL('/home.html') });
  console.log('[newtab] 已把新标签页换成收藏主页', tabId);
  return true;
}

/**
 * background 注册入口，三层检测互为兜底：
 * 1. onCreated——常规新建标签页（API 创建、无预渲染时手按 Cmd/Ctrl+T）；
 * 2. onUpdated——Chrome 预渲染新标签页被采纳时 onCreated 可能带无效 id（TAB_ID_NONE），
 *    标签落地后 url/pendingUrl 仍会暴露新标签页地址；
 * 3. webNavigation.onCommitted——预渲染采纳可能连 onUpdated 的 url 变化都不带，
 *    成熟重定向扩展对此的标准兜底：主框架提交导航到新标签页地址时接管。
 * 换成主页后 url 不再命中新标签页地址，各层都不会循环触发；takenOver 按标签去重。
 */
export function watchNewTabTakeover(): void {
  const takenOver = new Set<number>();
  const attempt = (tab: NewTabCandidate): void => {
    takeOverNewTabIfEnabled(tab)
      .then((tookOver) => {
        if (tookOver && typeof tab.id === 'number' && tab.id >= 0) takenOver.add(tab.id);
      })
      .catch((err: unknown) => console.error('[newtab] 接管新标签页失败', err));
  };
  browser.tabs.onCreated.addListener((tab) => attempt(tab));
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (takenOver.has(tabId)) return;
    attempt({
      id: tabId,
      openerTabId: tab.openerTabId,
      pendingUrl: tab.pendingUrl,
      url: changeInfo.url ?? tab.url,
    });
  });
  // 只看主框架（frameId 0）：iframe 提交不可能是「用户新建标签页」
  browser.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0 || takenOver.has(details.tabId)) return;
    attempt({ id: details.tabId, url: details.url });
  });
  browser.tabs.onRemoved.addListener((tabId) => takenOver.delete(tabId));
}
