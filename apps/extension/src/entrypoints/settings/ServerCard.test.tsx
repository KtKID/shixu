import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS, type Session, type Settings } from '@x-threadpick/shared';
import { loadSettings, recordServerLogin } from '../../db/settings';
import type * as apiModule from './api';
import ServerCard from './ServerCard';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof apiModule>();
  return { ...actual, testConnection: vi.fn() };
});

const { testConnection } = await import('./api');
const testConnectionMock = vi.mocked(testConnection);

const S1 = 'https://s1.example:8443';
const S2 = 'http://192.168.1.8:9000';

function makeSession(serverUrl: string): Session {
  return {
    email: 'a@x.com',
    serverUrl,
    token: 'tok-1',
    expiresAt: '2030-01-01T00:00:00.000Z',
  };
}

/** 有状态 Harness：受控的 host/port 与 settings，模拟 App 的接线。 */
function Harness({
  initial,
  initialHost = '',
  initialPort = '',
}: {
  initial: Settings;
  initialHost?: string;
  initialPort?: string;
}) {
  const [settings, setSettings] = useState(initial);
  const [host, setHost] = useState(initialHost);
  const [port, setPort] = useState(initialPort);
  return (
    <ServerCard
      settings={settings}
      host={host}
      port={port}
      onHostChange={setHost}
      onPortChange={setPort}
      onSettingsChange={setSettings}
    />
  );
}

beforeEach(() => {
  cleanup();
  fakeBrowser.reset();
  testConnectionMock.mockReset();
});

describe('测试连接（feat01）', () => {
  it('场景1：连接成功，展示往返延迟与服务版本', async () => {
    testConnectionMock.mockResolvedValue({ latencyMs: 42, version: 'v0.1.0' });
    render(<Harness initial={DEFAULT_SETTINGS} />);
    fireEvent.change(screen.getByLabelText('服务器地址'), {
      target: { value: 'sync.example.com' },
    });
    fireEvent.change(screen.getByLabelText('端口'), { target: { value: '8443' } });
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
    expect(await screen.findByText('连接成功')).toBeTruthy();
    expect(screen.getByText(/延迟 42ms · 服务版本 v0\.1\.0/)).toBeTruthy();
    expect(testConnectionMock).toHaveBeenCalledWith('https://sync.example.com:8443');
  });

  it('场景1：请求期间显示连接中状态', async () => {
    let release: (value: { latencyMs: number; version: string }) => void = () => {};
    testConnectionMock.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    render(<Harness initial={DEFAULT_SETTINGS} />);
    fireEvent.change(screen.getByLabelText('服务器地址'), {
      target: { value: 'sync.example.com' },
    });
    fireEvent.change(screen.getByLabelText('端口'), { target: { value: '8443' } });
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
    expect(screen.getByText(/正在连接 sync\.example\.com:8443/)).toBeTruthy();
    release({ latencyMs: 5, version: 'v0.1.0' });
    expect(await screen.findByText('连接成功')).toBeTruthy();
  });

  it('场景2：地址或端口未填，提示先填写且不发请求', () => {
    render(<Harness initial={DEFAULT_SETTINGS} />);
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
    expect(screen.getByText('连接失败')).toBeTruthy();
    expect(screen.getByText('请先填写服务器地址与端口')).toBeTruthy();
    expect(testConnectionMock).not.toHaveBeenCalled();
  });

  it('场景3：服务器不可达，提示无法访问且不改变登录状态', async () => {
    testConnectionMock.mockRejectedValue(new TypeError('fetch failed'));
    render(<Harness initial={DEFAULT_SETTINGS} />);
    fireEvent.change(screen.getByLabelText('服务器地址'), { target: { value: 'ghost.example' } });
    fireEvent.change(screen.getByLabelText('端口'), { target: { value: '8443' } });
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
    expect(await screen.findByText('连接失败')).toBeTruthy();
    expect(screen.getByText('无法访问服务器或连接超时')).toBeTruthy();
  });
});

describe('历史服务器（feat02）', () => {
  it('场景5：无记录时显示空态文案', () => {
    render(<Harness initial={DEFAULT_SETTINGS} />);
    expect(screen.getByText('暂无记录，登录成功后自动保存。')).toBeTruthy();
  });

  it('场景1：登录成功记录的服务器出现在列表并标记当前', async () => {
    const settings = await recordServerLogin(S1, makeSession(S1));
    render(<Harness initial={settings} />);
    expect(screen.getByText(/s1\.example/)).toBeTruthy();
    expect(screen.getByText('当前')).toBeTruthy();
    expect(screen.getByText(/上次登录成功 ·/)).toBeTruthy();
  });

  it('场景2：点击历史条目切换当前服务器，地址栏同步并自动测试连接', async () => {
    let settings = await recordServerLogin(S1, makeSession(S1));
    settings = await recordServerLogin(S2, makeSession(S2));
    testConnectionMock.mockResolvedValue({ latencyMs: 12, version: 'v0.1.0' });
    render(<Harness initial={settings} />);
    fireEvent.click(screen.getByRole('button', { name: `切换到 ${S1}` }));
    expect(await screen.findByDisplayValue('s1.example')).toBeTruthy();
    expect(screen.getByDisplayValue('8443')).toBeTruthy();
    expect(await loadSettings()).toMatchObject({ activeServerUrl: S1 });
    await vi.waitFor(() => {
      expect(testConnectionMock).toHaveBeenCalledWith(S1);
    });
  });

  it('场景3：修改当前服务器记录后地址栏一并更新', async () => {
    const settings = await recordServerLogin(S1, makeSession(S1));
    render(<Harness initial={settings} initialHost="s1.example" initialPort="8443" />);
    fireEvent.click(screen.getByRole('button', { name: '修改' }));
    fireEvent.change(screen.getByLabelText('历史服务器地址'), { target: { value: 'new.example' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByDisplayValue('new.example')).toBeTruthy();
    expect(await loadSettings()).toMatchObject({
      activeServerUrl: 'https://new.example:8443',
      history: [expect.objectContaining({ baseUrl: 'https://new.example:8443' })],
    });
  });

  it('场景3：修改非当前服务器不影响当前指针', async () => {
    let settings = await recordServerLogin(S1, makeSession(S1));
    settings = await recordServerLogin(S2, makeSession(S2));
    render(<Harness initial={settings} initialHost="192.168.1.8" initialPort="9000" />);
    const s1Row = screen.getByRole('button', { name: `切换到 ${S1}` }).closest('.srv-item');
    const s1Edit = screen
      .getAllByRole('button', { name: '修改' })
      .find((b) => s1Row?.contains(b) ?? false);
    if (s1Edit === undefined) throw new Error('未找到 S1 行的修改按钮');
    fireEvent.click(s1Edit);
    fireEvent.change(screen.getByLabelText('历史服务器地址'), { target: { value: 'new.example' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await vi.waitFor(async () => {
      expect(await loadSettings()).toMatchObject({ activeServerUrl: S2 });
    });
  });

  it('场景4：删除当前服务器后地址栏内容保留', async () => {
    const settings = await recordServerLogin(S1, makeSession(S1));
    render(<Harness initial={settings} initialHost="s1.example" initialPort="8443" />);
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    await vi.waitFor(async () => {
      const stored = await loadSettings();
      expect(stored.history).toHaveLength(0);
      expect(stored.activeServerUrl).toBe(S1);
    });
    expect(screen.getByDisplayValue('s1.example')).toBeTruthy();
    expect(screen.getByDisplayValue('8443')).toBeTruthy();
  });

  it('场景4：删除非当前服务器只移除该条', async () => {
    let settings = await recordServerLogin(S1, makeSession(S1));
    settings = await recordServerLogin(S2, makeSession(S2));
    render(<Harness initial={settings} initialHost="192.168.1.8" initialPort="9000" />);
    const s1Row = screen.getByRole('button', { name: `切换到 ${S1}` }).closest('.srv-item');
    const s1Delete = screen
      .getAllByRole('button', { name: '删除' })
      .find((b) => s1Row?.contains(b) ?? false);
    if (s1Delete === undefined) throw new Error('未找到 S1 行的删除按钮');
    fireEvent.click(s1Delete);
    await vi.waitFor(async () => {
      const stored = await loadSettings();
      expect(stored.history.map((s) => s.baseUrl)).toEqual([S2]);
      expect(stored.activeServerUrl).toBe(S2);
    });
  });
});
