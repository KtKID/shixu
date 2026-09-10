import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS, type Settings } from '@x-threadpick/shared';
import { loadSettings, recordServerLogin } from '../../db/settings';
import type * as apiModule from './api';
import AccountCard from './AccountCard';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof apiModule>();
  return { ...actual, testConnection: vi.fn(), login: vi.fn() };
});

const { testConnection, login } = await import('./api');
const testConnectionMock = vi.mocked(testConnection);
const loginMock = vi.mocked(login);

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
  loginMock.mockReset();
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

  it('场景5：登录表单不出现注册入口', () => {
    render(<Harness initial={DEFAULT_SETTINGS} currentBaseUrl={S1} />);
    expect(screen.queryByText('注册')).toBeNull();
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
