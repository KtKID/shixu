import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  createBookmark,
  DEFAULT_SETTINGS,
  type Session,
  type Settings,
  type SnapshotMeta,
} from '@x-threadpick/shared';
import { recordServerLogin } from '../../db/settings';
import { currentLibrary, resetLibraryRuntime } from '../../db/library';
import { getTaxonomy } from '../../db/taxonomy';
import type * as apiModule from './api';
import type * as restoreModule from '../../db/restore';
import SnapshotCard from './SnapshotCard';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof apiModule>();
  return {
    ...actual,
    createSnapshot: vi.fn(),
    listSnapshots: vi.fn(),
    getSnapshot: vi.fn(),
    deleteSnapshot: vi.fn(),
  };
});

vi.mock('../../db/restore', async (importOriginal) => {
  const actual = await importOriginal<typeof restoreModule>();
  return { ...actual, restoreFromSnapshot: vi.fn() };
});

const { createSnapshot, listSnapshots, deleteSnapshot } = await import('./api');
const { restoreFromSnapshot } = await import('../../db/restore');
const createSnapshotMock = vi.mocked(createSnapshot);
const listSnapshotsMock = vi.mocked(listSnapshots);
const deleteSnapshotMock = vi.mocked(deleteSnapshot);
const restoreFromSnapshotMock = vi.mocked(restoreFromSnapshot);

/** 定位含指定条数文本的快照行。 */
async function rowOf(countText: string): Promise<HTMLElement> {
  const text = await screen.findByText(countText);
  const row = text.closest('.snap-item');
  if (!(row instanceof HTMLElement)) throw new Error(`找不到「${countText}」的快照行`);
  return row;
}

const S1 = 'https://s1.example:8443';
const EMAIL = 'a@x.com';

const SNAP_A: SnapshotMeta = {
  id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  savedAt: '2026-09-11T10:00:00.000Z',
  itemCount: 152,
};
const SNAP_B: SnapshotMeta = {
  id: '3f2504e0-4f89-11d3-9a0c-0305e82c3302',
  savedAt: '2026-09-10T09:00:00.000Z',
  itemCount: 150,
};

function sessionOf(email: string, token = 't1'): Session {
  return { email, serverUrl: S1, token, expiresAt: '2030-01-01T00:00:00.000Z' };
}

async function loggedInSettings(): Promise<Settings> {
  return recordServerLogin(S1, sessionOf(EMAIL));
}

async function seedBookmarks(count: number, deleted = 0): Promise<void> {
  const lib = await currentLibrary();
  for (let i = 0; i < count; i++) {
    await lib.bookmarks.add(
      createBookmark(crypto.randomUUID(), {
        url: `https://example.com/b${i}`,
        title: `书签 ${i}`,
      }),
    );
  }
  for (let i = 0; i < deleted; i++) {
    await lib.bookmarks.add({
      ...createBookmark(crypto.randomUUID(), {
        url: `https://example.com/deleted${i}`,
        title: `墓碑 ${i}`,
      }),
      deletedAt: '2026-09-01T00:00:00.000Z',
    });
  }
}

beforeEach(async () => {
  cleanup();
  fakeBrowser.reset();
  createSnapshotMock.mockReset();
  listSnapshotsMock.mockReset();
  deleteSnapshotMock.mockReset();
  restoreFromSnapshotMock.mockReset();
  listSnapshotsMock.mockResolvedValue({ status: 'ok', data: { snapshots: [] } });
  deleteSnapshotMock.mockResolvedValue({ status: 'ok', data: { ok: true } });
  await resetLibraryRuntime();
});

describe('快照存档按钮（feat07）', () => {
  it('场景2：未登录时「立即存档」不可用并提示「登录后才能存档」，不显示快照列表区', () => {
    render(<SnapshotCard settings={DEFAULT_SETTINGS} />);

    const btn = screen.getByRole('button', { name: '立即存档' });
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('登录后才能存档')).toBeTruthy();
    // feat08 场景5：未登录不显示快照区
    expect(screen.queryByText('还没有快照。')).toBeNull();
    expect(screen.queryByRole('button', { name: '恢复' })).toBeNull();
  });

  it('场景1：已登录点「立即存档」→「存档中…」禁用 → 成功提示「已存档 N 条收藏」且列表新增记录', async () => {
    const settings = await loggedInSettings();
    await seedBookmarks(2); // 登录后播种：进账号库（组件存档读当前账号库）
    createSnapshotMock.mockImplementation((_baseUrl, _token, body) =>
      Promise.resolve({
        status: 'ok' as const,
        data: {
          snapshot: {
            id: SNAP_A.id,
            savedAt: body.savedAt,
            itemCount: body.bookmarks.filter((b) => b.deletedAt === null).length,
          },
        },
      }),
    );
    render(<SnapshotCard settings={settings} />);

    fireEvent.click(screen.getByRole('button', { name: '立即存档' }));
    const archiving = screen.getByRole('button', { name: '存档中…' });
    expect(archiving.hasAttribute('disabled')).toBe(true);

    expect(await screen.findByText('已存档 2 条收藏')).toBeTruthy();
    expect(screen.getByRole('button', { name: '立即存档' })).toBeTruthy();
    // 快照列表出现新记录（条数 + 恢复/删除操作）
    const row = await rowOf('2 条');
    expect(within(row).getByRole('button', { name: '恢复' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: '删除' })).toBeTruthy();
    expect(createSnapshotMock).toHaveBeenCalledTimes(1);
  });

  it('场景1：存档载荷 = 当前库全部收藏（含墓碑）+ 取值清单 + 当前时间', async () => {
    const settings = await loggedInSettings();
    await seedBookmarks(2, 1);
    createSnapshotMock.mockResolvedValue({
      status: 'ok',
      data: { snapshot: { id: SNAP_A.id, savedAt: '2026-09-12T08:00:00.000Z', itemCount: 2 } },
    });
    render(<SnapshotCard settings={settings} />);

    fireEvent.click(await screen.findByRole('button', { name: '立即存档' }));
    await screen.findByText('已存档 2 条收藏');

    const body = createSnapshotMock.mock.calls[0]?.[2];
    expect(body).toBeTruthy();
    expect(body?.bookmarks).toHaveLength(3); // 含墓碑：恢复后已删条目不复活
    expect(body?.bookmarks.filter((b) => b.deletedAt !== null)).toHaveLength(1);
    expect(body?.taxonomy).toEqual(await getTaxonomy(await currentLibrary()));
    expect(Number.isNaN(Date.parse(body?.savedAt ?? 'x'))).toBe(false);
    expect(createSnapshotMock.mock.calls[0]?.[0]).toBe(S1);
    expect(createSnapshotMock.mock.calls[0]?.[1]).toBe(sessionOf(EMAIL).token);
  });

  it('场景3：存档失败提示「存档失败，请稍后再试」，快照列表不新增记录', async () => {
    const settings = await loggedInSettings();
    await seedBookmarks(1);
    createSnapshotMock.mockResolvedValue({ status: 'unreachable' });
    render(<SnapshotCard settings={settings} />);

    fireEvent.click(await screen.findByRole('button', { name: '立即存档' }));
    expect(await screen.findByText('存档失败，请稍后再试')).toBeTruthy();
    expect(screen.queryByText(/^已存档/)).toBeNull();
    expect(screen.getByText('还没有快照。')).toBeTruthy(); // 列表不新增
  });

  it('场景4：空库也允许存档，记录显示「0 条」', async () => {
    createSnapshotMock.mockResolvedValue({
      status: 'ok',
      data: { snapshot: { id: SNAP_A.id, savedAt: '2026-09-12T08:00:00.000Z', itemCount: 0 } },
    });
    const settings = await loggedInSettings();
    render(<SnapshotCard settings={settings} />);

    fireEvent.click(await screen.findByRole('button', { name: '立即存档' }));
    expect(await screen.findByText('已存档 0 条收藏')).toBeTruthy();
    expect(screen.getByText('0 条')).toBeTruthy();
  });

  it('场景5：存档中按钮保持禁用，重复点击不触发第二次请求', async () => {
    const settings = await loggedInSettings();
    await seedBookmarks(1);
    let resolveArchive: (value: { status: 'ok'; data: { snapshot: SnapshotMeta } }) => void = () =>
      undefined;
    createSnapshotMock.mockReturnValue(
      new Promise((resolve) => {
        resolveArchive = resolve;
      }),
    );
    render(<SnapshotCard settings={settings} />);

    const btn = await screen.findByRole('button', { name: '立即存档' });
    fireEvent.click(btn);
    const archiving = screen.getByRole('button', { name: '存档中…' });
    fireEvent.click(archiving); // 存档中再点：无效
    resolveArchive({
      status: 'ok',
      data: { snapshot: { id: SNAP_A.id, savedAt: '2026-09-12T08:00:00.000Z', itemCount: 1 } },
    });
    await screen.findByText('已存档 1 条收藏');
    expect(createSnapshotMock).toHaveBeenCalledTimes(1); // 最终只产生一份新快照
  });
});

describe('快照列表与管理（feat08）', () => {
  it('场景1：列表按存档时间从新到旧，每份含时间、条数与「恢复」「删除」', async () => {
    listSnapshotsMock.mockResolvedValue({ status: 'ok', data: { snapshots: [SNAP_A, SNAP_B] } });
    const settings = await loggedInSettings();
    render(<SnapshotCard settings={settings} />);

    const rowA = await rowOf('152 条');
    const rowB = await rowOf('150 条');
    expect(rowA.textContent).toContain('9月11日');
    expect(rowB.textContent).toContain('9月10日');
    // 从新到旧：152 条（9月11日）在 150 条（9月10日）之前
    expect(rowA.compareDocumentPosition(rowB) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const row of [rowA, rowB]) {
      expect(within(row).getByRole('button', { name: '恢复' })).toBeTruthy();
      expect(within(row).getByRole('button', { name: '删除' })).toBeTruthy();
    }
  });

  it('场景3：删除需确认，确认后从列表消失且不影响收藏库', async () => {
    const settings = await loggedInSettings();
    await seedBookmarks(1);
    listSnapshotsMock.mockResolvedValue({ status: 'ok', data: { snapshots: [SNAP_A, SNAP_B] } });
    render(<SnapshotCard settings={settings} />);

    fireEvent.click(within(await rowOf('152 条')).getByRole('button', { name: '删除' }));

    // 确认框出现，明确是删除快照
    const dialog = screen.getByRole('dialog', { name: '删除快照' });
    expect(dialog.textContent).toContain('收藏库本身不受影响');
    fireEvent.click(within(dialog).getByRole('button', { name: '确认删除' }));

    expect(await screen.findByText('150 条')).toBeTruthy();
    expect(screen.queryByText('152 条')).toBeNull(); // 该份从列表消失
    expect(deleteSnapshotMock).toHaveBeenCalledWith(S1, 't1', SNAP_A.id);
    expect(await (await currentLibrary()).bookmarks.count()).toBe(1); // 收藏库不受任何影响
  });

  it('场景3：取消删除则不动', async () => {
    listSnapshotsMock.mockResolvedValue({ status: 'ok', data: { snapshots: [SNAP_A] } });
    const settings = await loggedInSettings();
    render(<SnapshotCard settings={settings} />);

    fireEvent.click(within(await rowOf('152 条')).getByRole('button', { name: '删除' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '删除快照' })).getByRole('button', {
        name: '取消',
      }),
    );

    await screen.findByText('152 条');
    expect(deleteSnapshotMock).not.toHaveBeenCalled();
  });

  it('场景2：快照数据带账号 token 拉取（列表请求按当前会话发起）', async () => {
    const settings = await loggedInSettings();
    render(<SnapshotCard settings={settings} />);
    await vi.waitFor(() => {
      expect(listSnapshotsMock).toHaveBeenCalledWith(S1, 't1');
    });
  });
});

describe('从快照恢复（feat09）', () => {
  it('场景1：点「恢复」弹确认框（替换语义），确认后提示「已恢复至 <时间> 的存档」', async () => {
    listSnapshotsMock.mockResolvedValue({ status: 'ok', data: { snapshots: [SNAP_A] } });
    restoreFromSnapshotMock.mockResolvedValue({
      status: 'ok',
      restoredAt: '2026-09-12T08:30:00.000Z',
      synced: true,
    });
    const settings = await loggedInSettings();
    render(<SnapshotCard settings={settings} />);

    fireEvent.click(within(await rowOf('152 条')).getByRole('button', { name: '恢复' }));

    // 确认框明确替换语义（本机库将被替换、快照后新增被移除、变化照常同步）
    const dialog = screen.getByRole('dialog', { name: '恢复快照' });
    expect(dialog.textContent).toContain('将被替换为该快照');
    expect(dialog.textContent).toContain('新增的收藏会被移除');
    expect(dialog.textContent).toContain('照常同步到服务器');

    fireEvent.click(within(dialog).getByRole('button', { name: '确认恢复' }));

    expect(await screen.findByText(/已恢复至 .+ 的存档/)).toBeTruthy();
    expect(restoreFromSnapshotMock).toHaveBeenCalledWith(SNAP_A);
  });

  it('场景2：恢复成功后快照仍在列表，可再次恢复', async () => {
    listSnapshotsMock.mockResolvedValue({ status: 'ok', data: { snapshots: [SNAP_A] } });
    restoreFromSnapshotMock.mockResolvedValue({
      status: 'ok',
      restoredAt: '2026-09-12T08:30:00.000Z',
      synced: true,
    });
    const settings = await loggedInSettings();
    render(<SnapshotCard settings={settings} />);

    fireEvent.click(within(await rowOf('152 条')).getByRole('button', { name: '恢复' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '恢复快照' })).getByRole('button', {
        name: '确认恢复',
      }),
    );
    await screen.findByText(/已恢复至 .+ 的存档/);

    // S 仍在列表中，恢复按钮仍可用
    expect(screen.getByText('152 条')).toBeTruthy();
    expect(within(await rowOf('152 条')).getByRole('button', { name: '恢复' })).toBeTruthy();
    expect(restoreFromSnapshotMock).toHaveBeenCalledTimes(1);
  });

  it('场景3：恢复失败提示「恢复失败，收藏库保持恢复前的样子」，列表不动', async () => {
    listSnapshotsMock.mockResolvedValue({ status: 'ok', data: { snapshots: [SNAP_A] } });
    restoreFromSnapshotMock.mockResolvedValue({ status: 'unreachable' });
    const settings = await loggedInSettings();
    render(<SnapshotCard settings={settings} />);

    fireEvent.click(within(await rowOf('152 条')).getByRole('button', { name: '恢复' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '恢复快照' })).getByRole('button', {
        name: '确认恢复',
      }),
    );

    expect(await screen.findByText('恢复失败，收藏库保持恢复前的样子')).toBeTruthy();
    expect(screen.getByText('152 条')).toBeTruthy(); // 快照列表不受影响
  });

  it('取消恢复则不执行', async () => {
    listSnapshotsMock.mockResolvedValue({ status: 'ok', data: { snapshots: [SNAP_A] } });
    const settings = await loggedInSettings();
    render(<SnapshotCard settings={settings} />);

    fireEvent.click(within(await rowOf('152 条')).getByRole('button', { name: '恢复' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '恢复快照' })).getByRole('button', {
        name: '取消',
      }),
    );

    expect(screen.queryByRole('dialog', { name: '恢复快照' })).toBeNull();
    expect(restoreFromSnapshotMock).not.toHaveBeenCalled();
  });
});
