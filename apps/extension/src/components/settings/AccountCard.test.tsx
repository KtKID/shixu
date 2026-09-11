import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS, type Settings } from '@x-threadpick/shared';
import { loadSettings, recordServerLogin, saveSettings, setAutoSync } from '../../db/settings';
import type * as apiModule from './api';
import type * as syncModule from '../../db/sync';
import AccountCard from './AccountCard';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof apiModule>();
  return { ...actual, testConnection: vi.fn(), login: vi.fn(), register: vi.fn() };
});

vi.mock('../../db/sync', async (importOriginal) => {
  const actual = await importOriginal<typeof syncModule>();
  return { ...actual, syncNow: vi.fn() };
});

const { testConnection, login, register } = await import('./api');
const { syncNow } = await import('../../db/sync');
const testConnectionMock = vi.mocked(testConnection);
const loginMock = vi.mocked(login);
const registerMock = vi.mocked(register);
const syncNowMock = vi.mocked(syncNow);

const S1 = 'https://s1.example:8443';
const EMAIL = 'a@x.com';
const PASSWORD = 'password1';

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

beforeEach(() => {
  cleanup();
  fakeBrowser.reset();
  testConnectionMock.mockReset();
  registerMock.mockReset();
  syncNowMock.mockReset();
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
      const s = await loadSettings();
      await saveSettings({ ...s, lastSyncAt: '2026-09-11T12:00:00.000Z' });
      return {
        status: 'ok' as const,
        changes: { added: 2, updated: 1, deleted: 1 },
        pushed: 3,
        syncedAt: '2026-09-11T12:00:00.000Z',
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
