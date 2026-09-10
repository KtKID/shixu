import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Browser } from 'wxt/browser';
import {
  CAPTURE_TARGET_KEY,
  getActiveTab,
  invokeCapture,
  isCapturableUrl,
  openCapturePanel,
  readCaptureTarget,
  resolveCaptureTarget,
  stashCaptureTarget,
} from './capture-invoke';

function makeTab(overrides: Partial<Browser.tabs.Tab>): Browser.tabs.Tab {
  return {
    id: 1,
    url: 'https://example.com/a',
    title: '示例页面',
    pinned: false,
    active: true,
    highlighted: true,
    index: 0,
    windowId: 1,
    incognito: false,
    autoDiscardable: false,
    discarded: false,
    frozen: false,
    groupId: -1,
    selected: false,
    lastAccessed: 0,
    ...overrides,
  };
}

/** tabs.query 直接替换为带类型的 mock；windows.create 用 spy 透传 fake-browser 真实实现（可断言入参）。 */
function mockActiveTabs(tabs: Browser.tabs.Tab[]) {
  const query = vi.fn<(queryInfo: Browser.tabs.QueryInfo) => Promise<Browser.tabs.Tab[]>>();
  query.mockResolvedValue(tabs);
  browser.tabs.query = query;
}

function spyWindowsCreate() {
  return vi.spyOn(browser.windows, 'create');
}

async function readRawStash(): Promise<unknown> {
  const raw = await browser.storage.session.get(CAPTURE_TARGET_KEY);
  return raw[CAPTURE_TARGET_KEY];
}

beforeEach(() => {
  vi.restoreAllMocks();
  fakeBrowser.reset();
  // fake-browser 的 action.openPopup 是「未实现即抛错」桩；默认视为不存在（模拟 Firefox MV2），
  // 需要 openPopup 路径的用例自行赋 mock。
  Object.defineProperty(browser.action, 'openPopup', {
    value: undefined,
    writable: true,
    configurable: true,
  });
});

describe('isCapturableUrl', () => {
  it('http/https 页面可收藏，其余不可（feat01 场景4）', () => {
    expect(isCapturableUrl('https://example.com/a')).toBe(true);
    expect(isCapturableUrl('http://example.com/a')).toBe(true);
    expect(isCapturableUrl('chrome://newtab/')).toBe(false);
    expect(isCapturableUrl('about:blank')).toBe(false);
    expect(isCapturableUrl('file:///Users/x/a.html')).toBe(false);
    expect(isCapturableUrl('moz-extension://abc/popup.html')).toBe(false);
    expect(isCapturableUrl('chrome-extension://abc/popup.html')).toBe(false);
    expect(isCapturableUrl('')).toBe(false);
  });
});

describe('invokeCapture（feat01 场景2）', () => {
  it('取当前活动标签并暂存目标信息（id/地址/标题/是否固定）', async () => {
    mockActiveTabs([
      makeTab({ id: 42, url: 'https://example.com/a?x=1', title: '示例页面', pinned: true }),
    ]);
    spyWindowsCreate();

    await invokeCapture();

    expect(await readRawStash()).toEqual({
      tabId: 42,
      url: 'https://example.com/a?x=1',
      title: '示例页面',
      pinned: true,
    });
  });

  it('非 http(s) 页面仍暂存并打开面板，由面板呈现禁用态（feat01 场景4）', async () => {
    mockActiveTabs([makeTab({ url: 'chrome://newtab/', title: '' })]);
    const create = spyWindowsCreate();

    await invokeCapture();

    expect(await readRawStash()).toMatchObject({ url: 'chrome://newtab/' });
    expect(create).toHaveBeenCalledOnce();
  });

  it('action.openPopup 可用时优先使用（Chrome 127+），不创建小窗', async () => {
    const openPopup = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    browser.action.openPopup = openPopup;
    mockActiveTabs([makeTab({})]);
    const create = spyWindowsCreate();

    const mode = await invokeCapture();

    expect(mode).toBe('popup');
    expect(openPopup).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });

  it('action.openPopup 不可用时 windows.create 小窗兜底，打开同一面板页（Firefox 路径）', async () => {
    mockActiveTabs([makeTab({})]);
    const create = spyWindowsCreate();

    const mode = await invokeCapture();

    expect(mode).toBe('window');
    expect(create).toHaveBeenCalledOnce();
    const arg = create.mock.calls[0]?.[0];
    expect(arg?.type).toBe('popup');
    expect(arg?.url).toBe(browser.runtime.getURL('/popup.html'));
  });

  it('openPopup 调用被拒时落到小窗兜底', async () => {
    browser.action.openPopup = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('denied'));
    mockActiveTabs([makeTab({})]);
    const create = spyWindowsCreate();

    expect(await invokeCapture()).toBe('window');
    expect(create).toHaveBeenCalledOnce();
  });

  it('没有活动标签时不写暂存，但仍打开面板', async () => {
    mockActiveTabs([]);
    const create = spyWindowsCreate();

    await invokeCapture();

    expect(await readRawStash()).toBeUndefined();
    expect(create).toHaveBeenCalledOnce();
  });
});

describe('stash / read 暂存', () => {
  it('写入后可读回（经 schema 校验）', async () => {
    await stashCaptureTarget({ tabId: 7, url: 'https://a.com', title: 'A', pinned: false });
    expect(await readCaptureTarget()).toEqual({
      tabId: 7,
      url: 'https://a.com',
      title: 'A',
      pinned: false,
    });
  });

  it('暂存内容损坏时返回 null 而不是抛错', async () => {
    await browser.storage.session.set({ [CAPTURE_TARGET_KEY]: { tabId: 'oops' } });
    expect(await readCaptureTarget()).toBeNull();
  });

  it('无暂存时返回 null', async () => {
    expect(await readCaptureTarget()).toBeNull();
  });
});

describe('resolveCaptureTarget（面板侧解析目标）', () => {
  it('当前窗口活动标签是普通网页时优先用它（图标直接点击路径），并刷新暂存', async () => {
    await stashCaptureTarget({ tabId: 9, url: 'https://stale.com', title: '旧', pinned: false });
    mockActiveTabs([makeTab({ id: 3, url: 'https://fresh.com/x', title: '新页面' })]);

    const target = await resolveCaptureTarget();

    expect(target).toEqual({
      tabId: 3,
      url: 'https://fresh.com/x',
      title: '新页面',
      pinned: false,
    });
    expect(await readRawStash()).toMatchObject({ url: 'https://fresh.com/x' });
  });

  it('活动标签是面板自身（小窗兜底路径）时回退到暂存目标', async () => {
    await stashCaptureTarget({
      tabId: 5,
      url: 'https://real.com',
      title: '真实页面',
      pinned: true,
    });
    mockActiveTabs([
      makeTab({ id: 99, url: browser.runtime.getURL('/popup.html'), title: '拾绪' }),
    ]);

    const target = await resolveCaptureTarget();

    expect(target).toEqual({ tabId: 5, url: 'https://real.com', title: '真实页面', pinned: true });
  });

  it('无活动标签但有暂存时返回暂存', async () => {
    await stashCaptureTarget({
      tabId: 8,
      url: 'https://only-stash.com',
      title: 'S',
      pinned: false,
    });
    mockActiveTabs([]);

    expect(await resolveCaptureTarget()).toMatchObject({ url: 'https://only-stash.com' });
  });

  it('既无可用活动标签也无暂存时返回 null', async () => {
    mockActiveTabs([]);

    expect(await resolveCaptureTarget()).toBeNull();
  });
});

describe('getActiveTab', () => {
  it('无活动标签时返回 null', async () => {
    mockActiveTabs([]);
    expect(await getActiveTab()).toBeNull();
  });
});

describe('openCapturePanel', () => {
  it('openPopup 缺失时走小窗兜底', async () => {
    const create = spyWindowsCreate();
    expect(await openCapturePanel()).toBe('window');
    expect(create).toHaveBeenCalledOnce();
  });
});
