import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS } from '@x-threadpick/shared';
import { saveSettings } from '../db/settings';
import { shouldTakeOverNewTab, takeOverNewTabIfEnabled } from './newtab';

describe('shouldTakeOverNewTab（feat-newtab：纯判定）', () => {
  it('开关关闭时一律不接管（默认状态：用户的新标签页零接触）', () => {
    expect(shouldTakeOverNewTab({ id: 1, pendingUrl: 'chrome://newtab/' }, false)).toBe(false);
    expect(shouldTakeOverNewTab({ id: 1, url: 'about:newtab' }, false)).toBe(false);
  });

  it('Chrome 手动新建标签页（pendingUrl 为新标签页地址）被接管', () => {
    expect(shouldTakeOverNewTab({ id: 1, pendingUrl: 'chrome://newtab/' }, true)).toBe(true);
    expect(shouldTakeOverNewTab({ id: 1, pendingUrl: 'chrome://new-tab-page/' }, true)).toBe(true);
  });

  it('Firefox 手动新建标签页（url=about:newtab，无 pendingUrl）被接管', () => {
    expect(shouldTakeOverNewTab({ id: 2, url: 'about:newtab' }, true)).toBe(true);
  });

  it('带 opener 的标签不接管（中键 / target=_blank 打开的链接）', () => {
    expect(
      shouldTakeOverNewTab({ id: 3, pendingUrl: 'chrome://newtab/', openerTabId: 9 }, true),
    ).toBe(false);
  });

  it('目标是真实地址的标签不接管（会话恢复 / 链接预载入）', () => {
    expect(shouldTakeOverNewTab({ id: 4, pendingUrl: 'https://example.com/a' }, true)).toBe(false);
  });

  it('无地址信息的不接管', () => {
    expect(shouldTakeOverNewTab({ id: 5 }, true)).toBe(false);
  });

  it('pendingUrl 优先于 url', () => {
    expect(
      shouldTakeOverNewTab(
        { id: 6, pendingUrl: 'chrome://newtab/', url: 'https://example.com' },
        true,
      ),
    ).toBe(true);
  });
});

describe('takeOverNewTabIfEnabled（feat-newtab：接管动作）', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  /** mock 掉 tabs.update：fakeBrowser 里没有这些 id 指向的真实标签页。 */
  function spyOnUpdate() {
    return vi.spyOn(browser.tabs, 'update').mockResolvedValue(undefined);
  }

  it('开关开启：空白新标签页被就地换成收藏主页 home.html', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, newtabEnabled: true });
    const update = spyOnUpdate();
    await expect(takeOverNewTabIfEnabled({ id: 11, pendingUrl: 'chrome://newtab/' })).resolves.toBe(
      true,
    );
    expect(update).toHaveBeenCalledWith(11, { url: browser.runtime.getURL('/home.html') });
  });

  it('开关关闭：不调用 tabs.update，浏览器新标签页原样', async () => {
    await saveSettings(DEFAULT_SETTINGS);
    const update = spyOnUpdate();
    await expect(takeOverNewTabIfEnabled({ id: 12, pendingUrl: 'chrome://newtab/' })).resolves.toBe(
      false,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('链接打开的标签即使开关开启也不动', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, newtabEnabled: true });
    const update = spyOnUpdate();
    await expect(
      takeOverNewTabIfEnabled({ id: 13, pendingUrl: 'chrome://newtab/', openerTabId: 2 }),
    ).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('无效 id（Chrome 预渲染采纳的标签可能带 TAB_ID_NONE）不跳转，留给 onUpdated 兜底', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, newtabEnabled: true });
    const update = spyOnUpdate();
    await expect(takeOverNewTabIfEnabled({ id: -1, pendingUrl: 'chrome://newtab/' })).resolves.toBe(
      false,
    );
    expect(update).not.toHaveBeenCalled();
  });
});
