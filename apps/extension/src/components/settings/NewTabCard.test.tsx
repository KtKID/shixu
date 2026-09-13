import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS, type Settings } from '@x-threadpick/shared';
import { loadSettings } from '../../db/settings';
import NewTabCard from './NewTabCard';

function checkbox(): HTMLInputElement {
  const box = screen.getByRole('checkbox');
  if (!(box instanceof HTMLInputElement)) throw new Error('找不到勾选框');
  return box;
}

function renderCard(settings: Settings = DEFAULT_SETTINGS): void {
  render(<NewTabCard settings={settings} onSettingsChange={() => undefined} />);
}

beforeEach(() => {
  fakeBrowser.reset();
  cleanup();
});

describe('NewTabCard（feat-newtab）', () => {
  it('默认未勾选：设置里 newtabEnabled=false，浏览器新标签页保持原样', () => {
    renderCard();
    expect(checkbox().checked).toBe(false);
  });

  it('勾选后写入设置 newtabEnabled=true（持久化到 browser.storage.local）', async () => {
    renderCard();
    fireEvent.click(checkbox());
    await waitFor(async () => expect((await loadSettings()).newtabEnabled).toBe(true));
  });

  it('取消勾选写回 false，立即恢复浏览器默认', async () => {
    renderCard({ ...DEFAULT_SETTINGS, newtabEnabled: true });
    expect(checkbox().checked).toBe(true);
    fireEvent.click(checkbox());
    await waitFor(async () => expect((await loadSettings()).newtabEnabled).toBe(false));
  });
});
