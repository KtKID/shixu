import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  createBookmark,
  ServerReachabilitySchema,
  type Session,
  type Settings,
} from '@x-threadpick/shared';
import type * as apiModule from '../../components/settings/api';
import type * as syncModule from '../../db/sync';
import { SERVER_REACHABILITY_KEY } from '../../lib/server-heartbeat';
import { openLibrary, resetLibraryRuntime, writeLastSyncAt } from '../../db/library';
import { loadSettings } from '../../db/settings';
import App, { parseSectionHash } from './App';

vi.mock('../../components/settings/api', async (importOriginal) => {
  const actual = await importOriginal<typeof apiModule>();
  return { ...actual, testConnection: vi.fn(), login: vi.fn(), register: vi.fn() };
});

vi.mock('../../db/sync', async (importOriginal) => {
  const actual = await importOriginal<typeof syncModule>();
  return { ...actual, syncNow: vi.fn(), syncSession: vi.fn() };
});

const { testConnection, login } = await import('../../components/settings/api');
const { syncSession } = await import('../../db/sync');
const testConnectionMock = vi.mocked(testConnection);
const loginMock = vi.mocked(login);
const syncSessionMock = vi.mocked(syncSession);

const EMAIL_A = 'a@x.com';
const PASSWORD = 'password1';

async function seedDefault(title: string): Promise<void> {
  const lib = await openLibrary('default');
  await lib.bookmarks.add(
    createBookmark(crypto.randomUUID(), { url: `https://example.com/${title}`, title }),
  );
}

/** mock 登录链路：连接与登录成功；首拉把 A 云端数据写进 A 的库。 */
function mockLoginPullsACloud(titles: string[]): void {
  testConnectionMock.mockResolvedValue({ latencyMs: 10, version: 'v0.1.0' });
  loginMock.mockResolvedValue({
    status: 'ok',
    token: 't-a',
    expiresAt: '2030-01-01T00:00:00.000Z',
  });
  syncSessionMock.mockImplementation(async (session: Session) => {
    const lib = await openLibrary(`${session.serverUrl}#${session.email}`);
    for (const title of titles) {
      await lib.bookmarks.add(
        createBookmark(crypto.randomUUID(), { url: `https://example.com/${title}`, title }),
      );
    }
    await writeLastSyncAt(lib, '2026-09-11T12:00:00.000Z');
    return {
      status: 'ok' as const,
      changes: { added: titles.length, updated: 0, deleted: 0 },
      pushed: 0,
      syncedAt: '2026-09-11T12:00:00.000Z',
    };
  });
}

async function loginThroughUi(): Promise<void> {
  // 真实路径：先填服务器地址（否则 currentBaseUrl=null 拦截登录），再填账号
  fireEvent.change(await screen.findByLabelText('服务器地址'), {
    target: { value: 's1.example' },
  });
  fireEvent.change(screen.getByLabelText('端口'), { target: { value: '8443' } });
  fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: EMAIL_A } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: PASSWORD } });
  fireEvent.click(screen.getByRole('button', { name: '登录' }));
  await screen.findByText('服务器已连接');
}

beforeEach(async () => {
  cleanup();
  fakeBrowser.reset();
  testConnectionMock.mockReset();
  // 默认服务器可达：填了地址会自动探测一次（feat12），需要确定性的 resolved 值
  testConnectionMock.mockResolvedValue({ latencyMs: 10, version: 'v0.1.0' });
  loginMock.mockReset();
  syncSessionMock.mockReset();
  syncSessionMock.mockResolvedValue({
    status: 'ok',
    changes: { added: 0, updated: 0, deleted: 0 },
    pushed: 0,
    syncedAt: '2026-09-11T12:00:00.000Z',
  });
  // 账号卡的服务器状态来自 background 心跳快照（feat12）；测试环境无 background，
  // 播种一条「登录目标服务器可达」记录，loginThroughUi 的「服务器已连接」才成立
  await browser.storage.session.set({
    [SERVER_REACHABILITY_KEY]: ServerReachabilitySchema.parse({
      baseUrl: 'https://s1.example:8443',
      reachable: true,
      checkedAt: new Date().toISOString(),
    }),
  });
  await resetLibraryRuntime();
});

describe('主页左侧导航（feat02 场景1 / 场景3）', () => {
  it('导航条目从上到下依次为五项，「全部收藏」排第一并默认选中（feat04 已废弃，无「最近新增」）', () => {
    render(<App />);

    const items = screen.getByRole('navigation', { name: '主导航' }).querySelectorAll('.nav-item');
    expect(items).toHaveLength(5);
    expect(items[0]?.textContent).toContain('全部收藏');
    expect(items[1]?.textContent).toContain('网络连接');
    expect(items[2]?.textContent).toContain('分类维度');
    expect(items[3]?.textContent).toContain('导入已有书签');
    expect(items[4]?.textContent).toContain('通用');
    expect(items[0]?.classList.contains('active')).toBe(true);
    expect(items[0]?.getAttribute('aria-current')).toBe('page');
    expect(items[1]?.getAttribute('aria-current')).toBeNull();
  });

  it('设计稿里的「视图」「回收站」等预留条目不出现（场景3）', () => {
    render(<App />);

    const nav = screen.getByRole('navigation', { name: '主导航' });
    expect(screen.queryByText('视图')).toBeNull();
    expect(screen.queryByText('回收站')).toBeNull();
    expect(nav.querySelectorAll('.nav-item')).toHaveLength(5);
  });

  it('点击条目切换选中分区', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '分类维度' }));
    const items = screen.getByRole('navigation', { name: '主导航' }).querySelectorAll('.nav-item');
    expect(items[2]?.classList.contains('active')).toBe(true);
    expect(items[0]?.classList.contains('active')).toBe(false);
  });
});

describe('「全部收藏」条目（feat07）', () => {
  it('默认即落在「全部收藏」，内容区标题为「全部收藏」', async () => {
    render(<App />);

    const items = screen.getByRole('navigation', { name: '主导航' }).querySelectorAll('.nav-item');
    expect(items[0]?.classList.contains('active')).toBe(true);
    expect(await screen.findByRole('heading', { name: '全部收藏' })).toBeTruthy();
  });

  it('空收藏库时同样可达，显示空态与去导入引导', async () => {
    render(<App initialSection="library" />);

    expect(await screen.findByText(/收藏库还是空的/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /去「导入已有书签」/ })).toBeTruthy();
  });
});

describe('地址指定初始条目（feat01 场景2 的落点承载）', () => {
  it('initialSection 指定「网络连接」时该项选中（供「设置」按钮直达）', () => {
    render(<App initialSection="network" />);

    const items = screen.getByRole('navigation', { name: '主导航' }).querySelectorAll('.nav-item');
    // 移除「最近新增」后导航五项，「网络连接」为第二项（index 1）
    expect(items[1]?.classList.contains('active')).toBe(true);
    expect(items[0]?.classList.contains('active')).toBe(false);
  });

  it('parseSectionHash：合法 hash 解析为对应条目，空/未知值与已移除的 #recent 都回退「全部收藏」', () => {
    expect(parseSectionHash('#library')).toBe('library');
    expect(parseSectionHash('#network')).toBe('network');
    expect(parseSectionHash('#dimensions')).toBe('dimensions');
    expect(parseSectionHash('#import')).toBe('import');
    expect(parseSectionHash('')).toBe('library');
    expect(parseSectionHash('#bogus')).toBe('library');
    expect(parseSectionHash('#recent')).toBe('library');
  });
});

describe('导航切换同步地址 hash（feat02 场景5）', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('点击条目后地址 hash 跟随（nav_click_updates_hash）', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '分类维度' }));
    expect(window.location.hash).toBe('#dimensions');
  });

  it('hash 变化（手动改地址/前进后退）时选中条目跟随（hashchange_switches_section）', async () => {
    render(<App />);

    window.location.hash = '#network';
    fireEvent(window, new HashChangeEvent('hashchange'));

    const items = screen.getByRole('navigation', { name: '主导航' }).querySelectorAll('.nav-item');
    expect(items[1]?.classList.contains('active')).toBe(true);
    expect(await screen.findByLabelText('服务器地址')).toBeTruthy();
  });

  it('切换条目后重开页面仍落在该条目（refresh_keeps_section）', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '分类维度' }));

    cleanup();
    render(<App initialSection={parseSectionHash(window.location.hash)} />);

    const items = screen.getByRole('navigation', { name: '主导航' }).querySelectorAll('.nav-item');
    expect(items[2]?.classList.contains('active')).toBe(true);
    expect(await screen.findByText('它讲什么？')).toBeTruthy();
  });
});

describe('导航分区内容沿用《设置页面》spec（feat02 场景1）', () => {
  it('「网络连接」内是服务器地址/端口、测试连接、历史服务器与账号登录', async () => {
    render(<App initialSection="network" />);

    expect(await screen.findByLabelText('服务器地址')).toBeTruthy();
    expect(screen.getByLabelText('端口')).toBeTruthy();
    expect(screen.getByRole('button', { name: '测试连接' })).toBeTruthy();
    expect(screen.getByText('历史服务器 · 登录成功后自动记录，点击即可切换')).toBeTruthy();
    expect(screen.getByText('暂无记录，登录成功后自动保存。')).toBeTruthy();
    expect(screen.getByLabelText('邮箱')).toBeTruthy();
    expect(screen.getByRole('button', { name: '登录' })).toBeTruthy();
  });

  it('「分类维度」内是四个维度的取值管理（默认取值集合）', async () => {
    render(<App initialSection="dimensions" />);

    expect(await screen.findByText('它讲什么？')).toBeTruthy();
    expect(screen.getByText('会议纪要')).toBeTruthy();
    expect(screen.getByRole('button', { name: '删除取值 inbox' })).toBeTruthy();
  });
});

describe('切换导航不丢输入（feat02 场景2）', () => {
  it('同一次打开内：填了未测试的服务器地址，切到「分类维度」再切回，地址仍在', async () => {
    render(<App initialSection="network" />);

    const host = await screen.findByLabelText('服务器地址');
    fireEvent.change(host, { target: { value: 'sync.example.com' } });
    fireEvent.change(screen.getByLabelText('端口'), { target: { value: '8443' } });

    fireEvent.click(screen.getByRole('button', { name: '分类维度' }));
    await screen.findByText('它讲什么？');
    expect(screen.queryByLabelText('服务器地址')).toBeNull(); // 已切走

    fireEvent.click(screen.getByRole('button', { name: '网络连接' }));
    expect(await screen.findByDisplayValue('sync.example.com')).toBeTruthy();
    expect(screen.getByDisplayValue('8443')).toBeTruthy();
  });

  it('「全部收藏」里的本地库内容与其他分区互不影响地并存', async () => {
    await (
      await openLibrary('default')
    ).bookmarks.add(
      createBookmark(crypto.randomUUID(), {
        url: 'https://local.example/page',
        title: '本地一条',
      }),
    );

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '网络连接' }));
    await screen.findByLabelText('服务器地址');

    fireEvent.click(screen.getByRole('button', { name: '全部收藏' }));
    expect(await screen.findByRole('heading', { name: '全部收藏' })).toBeTruthy();
    expect(screen.getByText('本地一条')).toBeTruthy();
  });
});

describe('多库切换刷新（sync-archive feat01 / task-account-libraries T8）', () => {
  it('场景2：登录 A 后「全部收藏」显示 A 的库（云端拉来），default 的收藏不出现', async () => {
    await seedDefault('默认库一条');
    mockLoginPullsACloud(['A 云端 1', 'A 云端 2']);
    render(<App initialSection="network" />);

    await loginThroughUi();
    fireEvent.click(screen.getByRole('button', { name: '全部收藏' }));

    expect(await screen.findByText('A 云端 1')).toBeTruthy();
    expect(screen.getByText('A 云端 2')).toBeTruthy();
    expect(screen.queryByText('默认库一条')).toBeNull(); // default 不并入 A
  });

  it('场景8/9：退出登录后界面回 default 库，登出期间的收藏可见；A 的内容不再出现', async () => {
    await seedDefault('登出期间一条');
    mockLoginPullsACloud(['A 云端 1']);
    render(<App initialSection="network" />);

    await loginThroughUi();
    fireEvent.click(screen.getByRole('button', { name: '全部收藏' }));
    await screen.findByText('A 云端 1');

    fireEvent.click(screen.getByRole('button', { name: '网络连接' }));
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
    await screen.findByText('未登录');

    fireEvent.click(screen.getByRole('button', { name: '全部收藏' }));
    expect(await screen.findByText('登出期间一条')).toBeTruthy();
    expect(screen.queryByText('A 云端 1')).toBeNull();
  });

  it('场景1：未登录时收藏/筛选照常可用，界面上不出现同步相关入口', async () => {
    await seedDefault('默认库一条');
    render(<App />);

    expect(await screen.findByText('默认库一条')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '同步收藏' })).toBeNull();
    expect(screen.queryByText('上次同步：')).toBeNull();
  });

  it('已登录状态下登录另一账号走确认框，确认后界面换新库（场景3 界面面）', async () => {
    mockLoginPullsACloud(['A 云端 1']);
    render(<App initialSection="network" />);
    await loginThroughUi();

    // 直接登录另一账号 B → 确认框
    loginMock.mockResolvedValue({
      status: 'ok',
      token: 't-b',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    syncSessionMock.mockImplementation(async (session: Session) => {
      const lib = await openLibrary(`${session.serverUrl}#${session.email}`);
      await lib.bookmarks.add(
        createBookmark(crypto.randomUUID(), { url: 'https://example.com/b1', title: 'B 云端 1' }),
      );
      return {
        status: 'ok' as const,
        changes: { added: 1, updated: 0, deleted: 0 },
        pushed: 0,
        syncedAt: '2026-09-11T12:00:00.000Z',
      };
    });
    fireEvent.click(await screen.findByRole('button', { name: '切换账号' }));
    fireEvent.change(await screen.findByLabelText('邮箱'), { target: { value: 'b@x.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    fireEvent.click(screen.getByRole('button', { name: '确认切换' }));
    await screen.findByText('b@x.com');

    fireEvent.click(screen.getByRole('button', { name: '全部收藏' }));
    expect(await screen.findByText('B 云端 1')).toBeTruthy();
    expect(screen.queryByText('A 云端 1')).toBeNull(); // A 的内容不进 B 的界面
    const settingsAfter: Settings = await loadSettings();
    expect(settingsAfter.session?.email).toBe('b@x.com');
  });
});

describe('「通用」分区（feat-newtab）', () => {
  it('点击「通用」显示新标签页卡：勾选框默认不勾选，勾选后写入设置', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '通用' }));
    expect(await screen.findByText('新建标签页时打开拾绪')).toBeTruthy();
    const box = screen.getByRole('checkbox');
    if (!(box instanceof HTMLInputElement)) throw new Error('找不到勾选框');
    expect(box.checked).toBe(false);

    fireEvent.click(box);
    await waitFor(async () => expect((await loadSettings()).newtabEnabled).toBe(true));
  });

  it('「通用」不受登录状态影响：未登录也能进入并看到新标签页卡', async () => {
    render(<App initialSection="general" />);

    expect(await screen.findByText('新建标签页时打开拾绪')).toBeTruthy();
    expect(screen.queryByText('正在载入…')).toBeNull();
  });
});
