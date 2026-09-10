import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createBookmark, type CaptureTarget } from '@x-threadpick/shared';
import type { Browser } from 'wxt/browser';
import { db } from '../../db/bookmarks';
import { CAPTURE_TARGET_KEY } from '../../lib/capture-invoke';
import App from './App';

const WEB_TARGET: CaptureTarget = {
  tabId: 1,
  url: 'https://arxiv.org/abs/2401.00001',
  title: 'World Models for Interactive Environments: A Survey',
  pinned: false,
};

async function stashTarget(target: CaptureTarget): Promise<void> {
  await browser.storage.session.set({ [CAPTURE_TARGET_KEY]: target });
}

function mockTabsQuery(tabs: Browser.tabs.Tab[]): void {
  const query = vi.fn<(queryInfo: Browser.tabs.QueryInfo) => Promise<Browser.tabs.Tab[]>>();
  query.mockResolvedValue(tabs);
  browser.tabs.query = query;
}

function mockNoActiveTab(): void {
  mockTabsQuery([]);
}

function mockActiveTab(tab: Partial<Browser.tabs.Tab>): void {
  mockTabsQuery([
    {
      id: 1,
      index: 0,
      pinned: false,
      highlighted: true,
      windowId: 1,
      active: true,
      frozen: false,
      incognito: false,
      selected: true,
      discarded: false,
      autoDiscardable: true,
      groupId: -1,
      lastAccessed: 0,
      ...tab,
    },
  ]);
}

beforeEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  fakeBrowser.reset();
  await db.bookmarks.clear();
});

describe('面板骨架（feat01 场景1 / feat02 场景1）', () => {
  it('打开面板：顶栏品牌与快捷键提示、页面信息、光标停在理由输入框', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    expect(await screen.findByText('拾绪')).toBeTruthy();
    expect(document.querySelector('.shortcut-hint')?.textContent).toMatch(/^(⌘⇧S|Ctrl\+Shift\+S)$/);
    const textarea = await screen.findByRole('textbox');
    expect(document.activeElement).toBe(textarea);
  });

  it('页面信息只读展示：标题、地址、首字母色块，不请求外部图标', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    const title = await screen.findByText(WEB_TARGET.title);
    expect(title.classList.contains('page-title')).toBe(true);
    const url = screen.getByText(WEB_TARGET.url);
    expect(url.classList.contains('page-url')).toBe(true);
    // 首字母色块：标题首字母，无 <img>（不向外部服务请求网站图标）
    const favicon = document.querySelector('.favicon');
    expect(favicon?.textContent).toBe('W');
    expect(document.querySelector('.page-info img')).toBeNull();
  });

  it('图标直接点击打开（无命令暂存）时自行解析当前活动标签', async () => {
    mockActiveTab({ url: WEB_TARGET.url, title: WEB_TARGET.title });

    render(<App />);

    expect(await screen.findByText(WEB_TARGET.title)).toBeTruthy();
    expect(screen.getByText(WEB_TARGET.url)).toBeTruthy();
  });

  it('四维分类区骨架：四个维度名称、问题与多选/单选标注齐备', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    expect(await screen.findByText('它讲什么？')).toBeTruthy();
    expect(screen.getByText('它是什么？')).toBeTruthy();
    expect(screen.getByText('我拿它干什么？')).toBeTruthy();
    expect(screen.getByText('我处理到哪了？')).toBeTruthy();
    expect(screen.getAllByText('可多选')).toHaveLength(3);
    expect(screen.getAllByText('单选')).toHaveLength(1);
    expect(screen.getByText('维度的取值在「设置」里统一管理，这里只做点选')).toBeTruthy();
  });

  it('底部动作区：两个保存按钮在可收藏页面可用', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    await screen.findByText(WEB_TARGET.title);
    const saveClose = screen.getByRole('button', { name: /保存并关闭 Tab/ });
    const saveOnly = screen.getByRole('button', { name: '仅保存' });
    expect(saveClose).toHaveProperty('disabled', false);
    expect(saveOnly).toHaveProperty('disabled', false);
  });
});

describe('不可收藏判定与禁用态（feat01 场景4 / feat02 场景2）', () => {
  it.each([
    ['浏览器内部页', 'chrome://newtab/'],
    ['about 页', 'about:blank'],
    ['本地文件页', 'file:///Users/x/notes.html'],
    ['扩展自身页', 'chrome-extension://abc/popup.html'],
  ])('%s 显示「此页面无法收藏」且全部操作不可用', async (_label, url) => {
    await stashTarget({ tabId: 1, url, title: '内部页面', pinned: false });
    mockNoActiveTab();

    render(<App />);

    expect(await screen.findByText('此页面无法收藏')).toBeTruthy();
    expect(screen.getByRole('button', { name: /保存并关闭 Tab/ })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: '仅保存' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('textbox')).toHaveProperty('disabled', true);
    expect(document.querySelector('.dims')?.getAttribute('aria-disabled')).toBe('true');
    // 禁用态下面板整体置灰
    expect(document.querySelector('.panel')?.classList.contains('panel-uncapturable')).toBe(true);
    // 页面信息仍然展示，供用户确认当前页
    expect(screen.getByText('内部页面')).toBeTruthy();
  });

  it('不可收藏页面不把光标放进理由输入框', async () => {
    await stashTarget({ tabId: 1, url: 'about:blank', title: '', pinned: false });
    mockNoActiveTab();

    render(<App />);

    const textarea = await screen.findByRole('textbox');
    expect(document.activeElement).not.toBe(textarea);
  });

  it('http(s) 页面不出现「此页面无法收藏」', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    await screen.findByText(WEB_TARGET.title);
    expect(screen.queryByText('此页面无法收藏')).toBeNull();
  });
});

describe('底部库入口（feat07）', () => {
  it('显示已入库条数，点击「打开导入器」进入导入页（场景1）', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();
    await db.bookmarks.add(
      createBookmark(crypto.randomUUID(), { url: 'https://a.com/1', title: 'A' }),
    );
    await db.bookmarks.add(
      createBookmark(crypto.randomUUID(), { url: 'https://b.com/2', title: 'B' }),
    );
    // openOptionsPage 保持 pending：真实实现随后会 window.close()，jsdom 下 close 会销毁 document
    const openOptionsPage = vi.fn<() => Promise<void>>().mockReturnValue(new Promise(() => {}));
    browser.runtime.openOptionsPage = openOptionsPage;

    render(<App />);

    expect(await screen.findByText('已入库 2 条')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '打开导入器' }));
    expect(openOptionsPage).toHaveBeenCalledOnce();
  });

  it('空库显示「已入库 0 条」，导入器链接可用（场景2）', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    expect(await screen.findByText('已入库 0 条')).toBeTruthy();
    expect(screen.getByRole('button', { name: '打开导入器' })).toBeTruthy();
  });
});
