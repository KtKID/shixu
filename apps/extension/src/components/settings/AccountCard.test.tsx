import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  DEFAULT_SETTINGS,
  createBookmark,
  type Session,
  type Settings,
} from '@x-threadpick/shared';
import { loadSettings, recordServerLogin, setAutoSync } from '../../db/settings';
import {
  currentLibrary,
  libraryDbName,
  openLibrary,
  rememberSession,
  resetLibraryRuntime,
  writeLastSyncAt,
} from '../../db/library';
import type * as apiModule from './api';
import type * as syncModule from '../../db/sync';
import { SERVER_BOOKMARKS_TOTAL_META_KEY } from '../../db/sync';
import { formatDateTime } from './format';
import AccountCard from './AccountCard';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof apiModule>();
  return { ...actual, testConnection: vi.fn(), login: vi.fn(), register: vi.fn() };
});

vi.mock('../../db/sync', async (importOriginal) => {
  const actual = await importOriginal<typeof syncModule>();
  return { ...actual, syncNow: vi.fn(), syncSession: vi.fn() };
});

const { testConnection, login, register } = await import('./api');
const { syncNow, syncSession } = await import('../../db/sync');
const testConnectionMock = vi.mocked(testConnection);
const loginMock = vi.mocked(login);
const registerMock = vi.mocked(register);
const syncNowMock = vi.mocked(syncNow);
const syncSessionMock = vi.mocked(syncSession);

const S1 = 'https://s1.example:8443';
const EMAIL = 'a@x.com';
const EMAIL_B = 'b@x.com';
const PASSWORD = 'password1';
const SYNCED_AT = '2026-09-11T12:00:00.000Z';

const OK_SYNC = {
  status: 'ok' as const,
  changes: { added: 0, updated: 0, deleted: 0 },
  pushed: 0,
  syncedAt: SYNCED_AT,
};

function sessionOf(email: string, token = 't1'): Session {
  return { email, serverUrl: S1, token, expiresAt: '2030-01-01T00:00:00.000Z' };
}

function Harness({
  initial,
  currentBaseUrl,
}: {
  initial: Settings;
  currentBaseUrl: string | null;
}) {
  const [settings, setSettings] = useState(initial);
  return (
    <AccountCard
      settings={settings}
      currentBaseUrl={currentBaseUrl}
      onSettingsChange={setSettings}
    />
  );
}

function fillLogin(email: string, password: string): void {
  fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: password } });
}

beforeEach(async () => {
  cleanup();
  fakeBrowser.reset();
  testConnectionMock.mockReset();
  registerMock.mockReset();
  syncNowMock.mockReset();
  loginMock.mockReset();
  syncSessionMock.mockReset();
  syncSessionMock.mockResolvedValue(OK_SYNC);
  await resetLibraryRuntime();
});

describe('登录账号（feat03）', () => {
  it('场景1：登录成功显示登录状态卡片，会话与历史服务器入库', async () => {
    testConnectionMock.mockResolvedValue({ latencyMs: 10, version: 'v0.1.0' });
    loginMock.mockResolvedValue({
      status: 'ok',
      token: 't1',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    render(<Harness initial={DEFAULT_SETTINGS} currentBaseUrl={S1} />);
    fillLogin(EMAIL, PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByText('已登录 · 同步开启')).toBeTruthy();
    expect(screen.getByText(EMAIL)).toBeTruthy();
    expect(screen.getByText('上次同步：尚未同步')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy(); // 头像字母
    expect(screen.queryByLabelText('密码')).toBeNull(); // 登录表单隐藏
    const stored = await loadSettings();
    expect(stored.session).toMatchObject({ email: EMAIL, serverUrl: S1, token: 't1' });
    expect(stored.activeServerUrl).toBe(S1); // feat02 场景1：登录成功记录历史
    expect(stored.history.map((s) => s.baseUrl)).toEqual([S1]);
  });

  it('场景2：邮箱或密码错误，提示且停留表单、邮箱保留', async () => {
    testConnectionMock.mockResolvedValue({ latencyMs: 10, version: 'v0.1.0' });
    loginMock.mockResolvedValue({ status: 'invalid_credentials' });
    render(<Harness initial={DEFAULT_SETTINGS} currentBaseUrl={S1} />);
    fillLogin(EMAIL, 'wrong-password');
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByText('邮箱或密码不正确')).toBeTruthy();
    expect(screen.getByDisplayValue(EMAIL)).toBeTruthy();
    expect(screen.getByLabelText('密码')).toBeTruthy();
  });

  it('场景3：服务器地址未填，提示连接失败且不进入登录中状态', () => {
    render(<Harness initial={DEFAULT_SETTINGS} currentBaseUrl={null} />);
    fillLogin(EMAIL, PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(screen.getByText('连接失败，请先检查服务器地址')).toBeTruthy();
    expect(testConnectionMock).not.toHaveBeenCalled();
    expect(loginMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '登录' }).hasAttribute('disabled')).toBe(false);
  });

  it('场景3：服务器不可达，同样提示且不进入登录中状态', async () => {
    testConnectionMock.mockRejectedValue(new TypeError('fetch failed'));
    render(<Harness initial={DEFAULT_SETTINGS} currentBaseUrl={S1} />);
    fillLogin(EMAIL, PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByText('连接失败，请先检查服务器地址')).toBeTruthy();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('场景4：重新打开设置页直接显示登录状态卡片', async () => {
    const settings = await recordServerLogin(S1, {
      email: EMAIL,
      serverUrl: S1,
      token: 't1',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    render(<Harness initial={settings} currentBaseUrl={S1} />);
    expect(screen.getByText('已登录 · 同步开启')).toBeTruthy();
    expect(screen.queryByLabelText('邮箱')).toBeNull(); // 不要求重新输入密码
    expect(screen.getByText('上次同步：尚未同步')).toBeTruthy();
  });

  it('场景5：登录按钮旁出现「创建账号」入口', () => {
    render(<Harness initial={DEFAULT_SETTINGS} currentBaseUrl={S1} />);
    expect(screen.getByRole('button', { name: '创建账号' })).toBeTruthy();
  });
});

describe('退出登录（feat04）', () => {
  it('场景1：退出回到登录表单，本机历史与书签设置不受影响', async () => {
    const settings = await recordServerLogin(S1, {
      email: EMAIL,
      serverUrl: S1,
      token: 't1',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    render(<Harness initial={settings} currentBaseUrl={S1} />);
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
    expect(await screen.findByText('未登录')).toBeTruthy();
    expect(screen.getByLabelText('邮箱')).toBeTruthy(); // 回到登录表单
    const stored = await loadSettings();
    expect(stored.session).toBeNull();
    expect(stored.activeServerUrl).toBe(S1);
    expect(stored.history.map((s) => s.baseUrl)).toEqual([S1]); // 书签与取值另存，不受影响
  });
});

describe('创建账号（feat09）', () => {
  function openRegisterDialog(): HTMLElement {
    fireEvent.click(screen.getByRole('button', { name: '创建账号' }));
    return screen.getByRole('dialog');
  }

  function fillRegister(dialog: HTMLElement, email: string, password: string): void {
    fireEvent.change(within(dialog).getByLabelText('邮箱'), { target: { value: email } });
    fireEvent.change(within(dialog).getByLabelText('设置密码'), { target: { value: password } });
  }

  it('场景1：创建成功自动登录，弹窗关闭且会话入库', async () => {
    testConnectionMock.mockResolvedValue({ latencyMs: 10, version: 'v0.1.0' });
    registerMock.mockResolvedValue({
      status: 'ok',
      token: 't1',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    render(<Harness initial={DEFAULT_SETTINGS} currentBaseUrl={S1} />);
    const dialog = openRegisterDialog();
    fillRegister(dialog, EMAIL, 'abc123');
    fireEvent.click(within(dialog).getByRole('button', { name: '创建' }));
    expect(await screen.findByText('已登录 · 同步开启')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull(); // 弹窗关闭
    expect(screen.getByText(EMAIL)).toBeTruthy();
    const stored = await loadSettings();
    expect(stored.session).toMatchObject({ email: EMAIL, serverUrl: S1, token: 't1' });
    expect(stored.history.map((s) => s.baseUrl)).toEqual([S1]); // feat02 场景1 同样适用
  });

  it('场景2：密码不含数字，提示规则且不发送请求', () => {
    render(<Harness initial={DEFAULT_SETTINGS} currentBaseUrl={S1} />);
    const dialog = openRegisterDialog();
    fillRegister(dialog, EMAIL, 'abcdef');
    fireEvent.click(within(dialog).getByRole('button', { name: '创建' }));
    expect(screen.getByText('密码需包含英文和数字，且大于 5 位')).toBeTruthy();
    expect(registerMock).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy(); // 停留弹窗
  });

  it('场景3：邮箱已注册，提示且停留弹窗、邮箱保留', async () => {
    testConnectionMock.mockResolvedValue({ latencyMs: 10, version: 'v0.1.0' });
    registerMock.mockResolvedValue({ status: 'email_taken' });
    render(<Harness initial={DEFAULT_SETTINGS} currentBaseUrl={S1} />);
    const dialog = openRegisterDialog();
    fillRegister(dialog, EMAIL, 'abc123');
    fireEvent.click(within(dialog).getByRole('button', { name: '创建' }));
    expect(await screen.findByText('该邮箱已注册')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByDisplayValue(EMAIL)).toBeTruthy();
  });

  it('场景4：服务器地址未填，提示连接失败且不发送请求', () => {
    render(<Harness initial={DEFAULT_SETTINGS} currentBaseUrl={null} />);
    const dialog = openRegisterDialog();
    fillRegister(dialog, EMAIL, 'abc123');
    fireEvent.click(within(dialog).getByRole('button', { name: '创建' }));
    expect(screen.getByText('连接失败，请先检查服务器地址')).toBeTruthy();
    expect(registerMock).not.toHaveBeenCalled();
  });
});

describe('手动同步收藏（feat10）', () => {
  async function renderLoggedIn(): Promise<void> {
    const settings = await recordServerLogin(S1, {
      email: EMAIL,
      serverUrl: S1,
      token: 't1',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    render(<Harness initial={settings} currentBaseUrl={S1} />);
  }

  it('场景1/4：已登录时出现「同步收藏」，未登录时不出现；布局上下分区', async () => {
    await renderLoggedIn();
    const syncBtn = screen.getByRole('button', { name: '同步收藏' });
    const logoutBtn = screen.getByRole('button', { name: '退出登录' });
    // 布局：退出登录在身份行（session-top），同步收藏在操作行（session-ops）
    expect(logoutBtn.closest('.session-top')).not.toBeNull();
    expect(syncBtn.closest('.session-ops')).not.toBeNull();
    // 同步按钮固定宽度 class：同步收藏/同步中… 切换不跳位
    expect(syncBtn.classList.contains('btn-sync')).toBe(true);
    cleanup();
    render(<Harness initial={DEFAULT_SETTINGS} currentBaseUrl={S1} />);
    expect(screen.queryByRole('button', { name: '同步收藏' })).toBeNull();
  });

  it('场景1：同步成功显示彩色计数 tips（含上传数），「上次同步」刷新', async () => {
    syncNowMock.mockImplementation(async () => {
      await writeLastSyncAt(await currentLibrary(), SYNCED_AT);
      return {
        status: 'ok' as const,
        changes: { added: 2, updated: 1, deleted: 1 },
        pushed: 3,
        syncedAt: SYNCED_AT,
      };
    });
    await renderLoggedIn();
    fireEvent.click(screen.getByRole('button', { name: '同步收藏' }));
    expect(await screen.findByText('本次同步：')).toBeTruthy();
    expect(document.querySelector('.cnt-add')?.textContent).toBe('新增 2');
    expect(document.querySelector('.cnt-upd')?.textContent).toBe('修改 1');
    expect(document.querySelector('.cnt-del')?.textContent).toBe('删除 1');
    expect(document.querySelector('.cnt-push')?.textContent).toBe('上传 3');
    expect(screen.queryByText(/尚未同步/)).toBeNull();
  });

  it('场景1：双向都无变化时显示「本次同步无变更」', async () => {
    syncNowMock.mockResolvedValue({
      status: 'ok',
      changes: { added: 0, updated: 0, deleted: 0 },
      pushed: 0,
      syncedAt: '2026-09-11T12:00:00.000Z',
    });
    await renderLoggedIn();
    fireEvent.click(screen.getByRole('button', { name: '同步收藏' }));
    expect(await screen.findByText('本次同步无变更')).toBeTruthy();
  });

  it('场景1：本机有变更只上传时显示上传数而非「无变更」', async () => {
    syncNowMock.mockResolvedValue({
      status: 'ok',
      changes: { added: 0, updated: 0, deleted: 0 },
      pushed: 2,
      syncedAt: '2026-09-11T12:00:00.000Z',
    });
    await renderLoggedIn();
    fireEvent.click(screen.getByRole('button', { name: '同步收藏' }));
    expect(await screen.findByText('本次同步：')).toBeTruthy();
    expect(document.querySelector('.cnt-push')?.textContent).toBe('上传 2');
    expect(screen.queryByText('本次同步无变更')).toBeNull();
  });

  it('场景2：服务器不可达提示失败，「上次同步」不变', async () => {
    syncNowMock.mockResolvedValue({ status: 'unreachable' });
    await renderLoggedIn();
    fireEvent.click(screen.getByRole('button', { name: '同步收藏' }));
    expect(await screen.findByText('同步失败，请检查服务器地址或稍后重试')).toBeTruthy();
    expect(screen.getByText(/尚未同步/)).toBeTruthy();
  });

  it('场景3：登录已过期 → 提示并回到登录表单', async () => {
    syncNowMock.mockResolvedValue({ status: 'unauthorized' });
    await renderLoggedIn();
    fireEvent.click(screen.getByRole('button', { name: '同步收藏' }));
    expect(await screen.findByText('登录已过期，请重新登录')).toBeTruthy();
    expect(await screen.findByText('未登录')).toBeTruthy();
    expect((await loadSettings()).session).toBeNull();
  });
});

describe('自动同步开关（feat11）', () => {
  async function renderLoggedIn(): Promise<void> {
    const settings = await recordServerLogin(S1, {
      email: EMAIL,
      serverUrl: S1,
      token: 't1',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    render(<Harness initial={settings} currentBaseUrl={S1} />);
  }

  it('场景4/1：默认未勾选；勾选后按账号写入设置', async () => {
    await renderLoggedIn();
    const el = screen.getByRole('checkbox', { name: '自动同步' });
    if (!(el instanceof HTMLInputElement)) throw new Error('自动同步应为 checkbox input');
    expect(el.checked).toBe(false);
    fireEvent.click(el);
    await vi.waitFor(async () => {
      expect((await loadSettings()).autoSync[`${S1}#${EMAIL}`]).toBe(true);
    });
  });

  it('场景3：已开启的账号重新登录后开关保持勾选', async () => {
    const session = {
      email: EMAIL,
      serverUrl: S1,
      token: 't1',
      expiresAt: '2030-01-01T00:00:00.000Z',
    };
    await recordServerLogin(S1, session);
    await setAutoSync(`${S1}#${EMAIL}`, true);
    const settings = await loadSettings();
    render(<Harness initial={settings} currentBaseUrl={S1} />);
    const el = screen.getByRole('checkbox', { name: '自动同步' });
    if (!(el instanceof HTMLInputElement)) throw new Error('自动同步应为 checkbox input');
    expect(el.checked).toBe(true);
  });
});

describe('账号卡服务器概览（sync-archive feat05）', () => {
  /** 已登录 + 指定库内 meta；synced=false 模拟从未同步（lastSyncAt 与 total 均无）。 */
  async function renderWithTotal(total: number | null, synced = true): Promise<void> {
    await recordServerLogin(S1, {
      email: EMAIL,
      serverUrl: S1,
      token: 't1',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    if (synced) {
      const lib = await currentLibrary();
      await writeLastSyncAt(lib, SYNCED_AT);
      if (total !== null) {
        await lib.meta.put({ key: SERVER_BOOKMARKS_TOTAL_META_KEY, value: String(total) });
      }
    }
    render(<Harness initial={await loadSettings()} currentBaseUrl={S1} />);
    await screen.findByText('已登录 · 同步开启');
    // 等随库读取 effect 完成后再返回，后续断言无竞态
    await vi.waitFor(() => {
      const el = screen.getByText(/上次同步：/);
      expect(el.textContent).toBe(
        synced
          ? `上次同步：${formatDateTime(SYNCED_AT)}${
              total !== null ? ` · 服务器上共 ${total} 条收藏` : ''
            }`
          : '上次同步：尚未同步',
      );
    });
  }

  it('场景1：同步过 → 「服务器上共 N 条收藏」与「上次同步」并排同行显示', async () => {
    await renderWithTotal(152);
    const line = screen.getByText(/上次同步：/);
    expect(line.textContent).toBe(`上次同步：${formatDateTime(SYNCED_AT)} · 服务器上共 152 条收藏`);
  });

  it('场景2：从未同步 → 不显示服务器条数一行，只有「上次同步：尚未同步」', async () => {
    await renderWithTotal(null, false);
    expect(screen.getByText('上次同步：尚未同步').textContent).not.toContain('服务器上共');
  });

  it('场景3：同步失败（unreachable）→ 保留最近一次成功值，不清空不报错', async () => {
    await renderWithTotal(152);
    syncNowMock.mockResolvedValue({ status: 'unreachable' });
    fireEvent.click(screen.getByRole('button', { name: '同步收藏' }));
    expect(await screen.findByText('同步失败，请检查服务器地址或稍后重试')).toBeTruthy();
    expect(screen.getByText(/服务器上共 152 条收藏/)).toBeTruthy();
  });

  it('场景1：手动同步成功后，服务器条数随最新 pull 刷新', async () => {
    await renderWithTotal(1);
    syncNowMock.mockImplementation(async () => {
      const lib = await currentLibrary();
      await writeLastSyncAt(lib, SYNCED_AT);
      await lib.meta.put({ key: SERVER_BOOKMARKS_TOTAL_META_KEY, value: '153' });
      return { ...OK_SYNC };
    });
    fireEvent.click(screen.getByRole('button', { name: '同步收藏' }));
    await vi.waitFor(() => {
      expect(screen.getByText(/上次同步：/).textContent).toBe(
        `上次同步：${formatDateTime(SYNCED_AT)} · 服务器上共 153 条收藏`,
      );
    });
  });
});

describe('多库账号流（sync-archive feat01）', () => {
  async function renderLoggedIn(session: Session): Promise<void> {
    await recordServerLogin(session.serverUrl, session);
    const settings = await loadSettings();
    render(<Harness initial={settings} currentBaseUrl={S1} />);
    await screen.findByText('已登录 · 同步开启');
  }

  function mockLoginOk(token: string): void {
    testConnectionMock.mockResolvedValue({ latencyMs: 10, version: 'v0.1.0' });
    loginMock.mockResolvedValue({
      status: 'ok',
      token,
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
  }

  /** 走完已登录状态下「切换账号」入口：打开登录表单并提交目标账号凭据。 */
  function submitSwitchTo(email: string, password = PASSWORD): void {
    fireEvent.click(screen.getByRole('button', { name: '切换账号' }));
    fillLogin(email, password);
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
  }

  it('场景2：登录 A 后库切到 A（云端拉来的数据入 A 库），default 库原样不动', async () => {
    await (
      await currentLibrary()
    ).bookmarks.add(
      createBookmark(crypto.randomUUID(), { url: 'https://example.com/d', title: '默认库一条' }),
    );
    mockLoginOk('t-a');
    syncSessionMock.mockImplementation(async (session: Session) => {
      const lib = await openLibrary(`${session.serverUrl}#${session.email}`);
      await lib.bookmarks.bulkAdd([
        createBookmark(crypto.randomUUID(), { url: 'https://example.com/a1', title: 'A 云端 1' }),
        createBookmark(crypto.randomUUID(), { url: 'https://example.com/a2', title: 'A 云端 2' }),
      ]);
      return { ...OK_SYNC, changes: { added: 2, updated: 0, deleted: 0 } };
    });

    render(<Harness initial={DEFAULT_SETTINGS} currentBaseUrl={S1} />);
    fillLogin(EMAIL, PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await screen.findByText('已登录 · 同步开启');
    expect((await currentLibrary()).name).toBe(libraryDbName(`${S1}#${EMAIL}`));
    expect(await (await openLibrary(`${S1}#${EMAIL}`)).bookmarks.count()).toBe(2);
    expect(
      await (await openLibrary('default')).bookmarks.count(), // default 的 1 条不被并入
    ).toBe(1);
  });

  it('场景3：已登录 A 直接登录 B → 确认框；确认后 A 自动退出、当前库换 B、A 的库保留', async () => {
    await renderLoggedIn(sessionOf(EMAIL, 't-a'));
    const libA = await openLibrary(`${S1}#${EMAIL}`);
    await libA.bookmarks.add(
      createBookmark(crypto.randomUUID(), { url: 'https://example.com/a', title: 'A 本机一条' }),
    );

    mockLoginOk('t-b');
    syncSessionMock.mockImplementation(async (session: Session) => {
      const lib = await openLibrary(`${session.serverUrl}#${session.email}`);
      await lib.bookmarks.add(
        createBookmark(crypto.randomUUID(), { url: 'https://example.com/b1', title: 'B 云端一条' }),
      );
      return { ...OK_SYNC, changes: { added: 1, updated: 0, deleted: 0 } };
    });
    submitSwitchTo(EMAIL_B);

    // 未确认前不发起任何请求
    const dialog = await screen.findByRole('dialog', { name: '切换账号' });
    expect(dialog.textContent).toContain(EMAIL);
    expect(dialog.textContent).toContain(EMAIL_B);
    expect(dialog.textContent).toContain('自动退出');
    expect(testConnectionMock).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: '确认切换' }));

    await screen.findByText(EMAIL_B); // 界面换 B
    expect((await loadSettings()).session?.email).toBe(EMAIL_B); // A 自动退出
    expect((await currentLibrary()).name).toBe(libraryDbName(`${S1}#${EMAIL_B}`));
    expect(await libA.bookmarks.count()).toBe(1); // A 的库原样保留（场景4：未同步改动不丢）
    expect(await (await openLibrary(`${S1}#${EMAIL_B}`)).bookmarks.count()).toBe(1);
  });

  it('场景3：取消确认 → 不切换，仍登录 A', async () => {
    await renderLoggedIn(sessionOf(EMAIL, 't-a'));
    mockLoginOk('t-b');
    submitSwitchTo(EMAIL_B);

    const dialog = await screen.findByRole('dialog', { name: '切换账号' });
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));

    expect((await loadSettings()).session?.email).toBe(EMAIL);
    expect(testConnectionMock).not.toHaveBeenCalled();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('场景7：本机无 B 库且服务器不可达 → 提示「需要联网获取账号 B 的收藏」，切换暂停（仍登录 A）', async () => {
    await renderLoggedIn(sessionOf(EMAIL, 't-a'));
    testConnectionMock.mockRejectedValue(new TypeError('fetch failed'));
    loginMock.mockResolvedValue({
      status: 'ok',
      token: 't-b',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });

    submitSwitchTo(EMAIL_B);
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: '切换账号' })).getByRole('button', {
        name: '确认切换',
      }),
    );

    expect(await screen.findByText('需要联网获取账号 b@x.com 的收藏')).toBeTruthy();
    expect((await loadSettings()).session?.email).toBe(EMAIL); // 切换暂停
    expect(loginMock).not.toHaveBeenCalled(); // 服务器不可达，未走到登录
  });

  it('场景7：登录成功但首拉失败 → 同样提示且切换暂停', async () => {
    await renderLoggedIn(sessionOf(EMAIL, 't-a'));
    mockLoginOk('t-b');
    syncSessionMock.mockResolvedValue({ status: 'unreachable' });

    submitSwitchTo(EMAIL_B);
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: '切换账号' })).getByRole('button', {
        name: '确认切换',
      }),
    );

    expect(await screen.findByText('需要联网获取账号 b@x.com 的收藏')).toBeTruthy();
    expect((await loadSettings()).session?.email).toBe(EMAIL); // 未记录 B 的登录
  });

  it('场景6：本机留有 B 的库与最近会话，服务器不可达也能离线切回', async () => {
    await renderLoggedIn(sessionOf(EMAIL, 't-a'));
    const sessionB = sessionOf(EMAIL_B, 't-b');
    const libB = await openLibrary(`${S1}#${EMAIL_B}`);
    await libB.bookmarks.add(
      createBookmark(crypto.randomUUID(), { url: 'https://example.com/b', title: 'B 本机一条' }),
    );
    await writeLastSyncAt(libB, '2026-09-10T00:00:00.000Z');
    await rememberSession(`${S1}#${EMAIL_B}`, sessionB);

    testConnectionMock.mockRejectedValue(new TypeError('fetch failed'));
    submitSwitchTo(EMAIL_B, 'any-password-1'); // 离线：密码无从校验，凭本机会话切回
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: '切换账号' })).getByRole('button', {
        name: '确认切换',
      }),
    );

    await screen.findByText(EMAIL_B);
    expect(loginMock).not.toHaveBeenCalled(); // 没走服务器登录
    expect((await loadSettings()).session?.email).toBe(EMAIL_B);
    expect((await currentLibrary()).name).toBe(libraryDbName(`${S1}#${EMAIL_B}`));
    expect(await (await currentLibrary()).bookmarks.count()).toBe(1); // B 的库照常可用
  });

  it('场景8/9：退出登录回到 default 库；期间收藏只进 default，再登录 B 不带出', async () => {
    await renderLoggedIn(sessionOf(EMAIL, 't-a'));
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }));

    await screen.findByText('未登录');
    expect((await currentLibrary()).name).toBe(libraryDbName('default'));
    await (
      await currentLibrary()
    ).bookmarks.add(
      createBookmark(crypto.randomUUID(), {
        url: 'https://example.com/off',
        title: '登出期间一条',
      }),
    );

    mockLoginOk('t-b');
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    fillLogin(EMAIL_B, PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    await screen.findByText('已登录 · 同步开启');

    expect((await currentLibrary()).name).toBe(libraryDbName(`${S1}#${EMAIL_B}`));
    expect(await (await currentLibrary()).bookmarks.count()).toBe(0); // B 的库是空的
    expect(
      await (await openLibrary('default')).bookmarks.count(), // 登出期间的收藏留在 default
    ).toBe(1);
  });
});
