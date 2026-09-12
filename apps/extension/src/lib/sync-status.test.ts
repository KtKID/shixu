import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createBookmark, type Bookmark, type Session } from '@x-threadpick/shared';
import { currentLibrary, resetLibraryRuntime, writeLastSyncAt } from '../db/library';
import { recordServerLogin } from '../db/settings';
import { readSyncContext, syncStateOf, summarizeSync } from './sync-status';

/**
 * 同步状态推导（sync-archive feat03 场景1/场景2、feat04 场景1/场景2）：
 * 单条 = 该书签 updatedAt 与当前库 lastSyncAt 比较；整库 = 总数 + 待同步数；
 * 未登录（default 库）返回「无同步概念」，界面据此不渲染任何同步元素。
 */

const S1 = 'https://s1.example:8443';

function sessionOf(email: string): Session {
  return { email, serverUrl: S1, token: 'tok-1', expiresAt: '2030-01-01T00:00:00.000Z' };
}

function makeBookmark(url: string, updatedAt: string): Bookmark {
  const bookmark = createBookmark(crypto.randomUUID(), { url, title: url });
  bookmark.updatedAt = updatedAt;
  return bookmark;
}

beforeEach(async () => {
  fakeBrowser.reset();
  await resetLibraryRuntime();
});

describe('单条同步状态（feat03 场景1/场景2）', () => {
  it('updatedAt ≤ lastSyncAt → 已同步（feat03 场景1）', () => {
    const bookmark = makeBookmark('https://a.example/1', '2026-09-10T08:00:00.000Z');
    expect(syncStateOf(bookmark, '2026-09-11T12:00:00.000Z')).toBe('synced');
  });

  it('updatedAt 恰好等于 lastSyncAt 也算已同步（同步完成时点之后无改动）', () => {
    const bookmark = makeBookmark('https://a.example/1', '2026-09-11T12:00:00.000Z');
    expect(syncStateOf(bookmark, '2026-09-11T12:00:00.000Z')).toBe('synced');
  });

  it('updatedAt > lastSyncAt → 待同步（feat03 场景2：刚收藏或刚修改还没推上去）', () => {
    const bookmark = makeBookmark('https://a.example/1', '2026-09-11T13:00:00.000Z');
    expect(syncStateOf(bookmark, '2026-09-11T12:00:00.000Z')).toBe('pending');
  });

  it('从未同步过（lastSyncAt = null）→ 全部待同步（服务器上还没有）', () => {
    const bookmark = makeBookmark('https://a.example/1', '2026-09-10T08:00:00.000Z');
    expect(syncStateOf(bookmark, null)).toBe('pending');
  });
});

describe('整库汇总（feat04 场景1/场景2）', () => {
  it('全部已同步：total=N、pending=0（feat04 场景1：152 条都已同步）', () => {
    const bookmarks = [
      makeBookmark('https://a.example/1', '2026-09-10T08:00:00.000Z'),
      makeBookmark('https://b.example/2', '2026-09-11T08:00:00.000Z'),
    ];
    expect(summarizeSync(bookmarks, '2026-09-11T12:00:00.000Z')).toEqual({
      total: 2,
      pending: 0,
    });
  });

  it('部分待同步：汇总给出待同步条数（feat04 场景2：152 条中 3 条待同步）', () => {
    const bookmarks = [
      makeBookmark('https://a.example/1', '2026-09-13T08:00:00.000Z'),
      makeBookmark('https://b.example/2', '2026-09-13T09:00:00.000Z'),
      makeBookmark('https://c.example/3', '2026-09-13T10:00:00.000Z'),
      makeBookmark('https://d.example/4', '2026-09-10T08:00:00.000Z'),
    ];
    expect(summarizeSync(bookmarks, '2026-09-11T12:00:00.000Z')).toEqual({
      total: 4,
      pending: 3,
    });
  });

  it('lastSyncAt = null（登录但从未同步）→ 全部计入待同步', () => {
    const bookmarks = [makeBookmark('https://a.example/1', '2026-09-10T08:00:00.000Z')];
    expect(summarizeSync(bookmarks, null)).toEqual({ total: 1, pending: 1 });
  });

  it('空库：total=0、pending=0（feat04 场景4 不显示汇总行的数据前提）', () => {
    expect(summarizeSync([], '2026-09-11T12:00:00.000Z')).toEqual({ total: 0, pending: 0 });
  });
});

describe('当前库同步语境（未登录 default 库无同步概念）', () => {
  it('未登录（default 库）→ tracked: false，界面据此不出现任何同步元素（feat03 场景4）', async () => {
    await expect(readSyncContext()).resolves.toEqual({ tracked: false });
  });

  it('已登录 → tracked: true，带账号邮箱与当前账号库的 lastSyncAt', async () => {
    await recordServerLogin(S1, sessionOf('a@x.com'));
    const db = await currentLibrary(); // 登录后当前库已是账号库
    await writeLastSyncAt(db, '2026-09-11T12:00:00.000Z');

    await expect(readSyncContext()).resolves.toEqual({
      tracked: true,
      email: 'a@x.com',
      lastSyncAt: '2026-09-11T12:00:00.000Z',
    });
  });

  it('已登录但从未同步 → lastSyncAt 为 null（全部待同步）', async () => {
    await recordServerLogin(S1, sessionOf('a@x.com'));
    await expect(readSyncContext()).resolves.toEqual({
      tracked: true,
      email: 'a@x.com',
      lastSyncAt: null,
    });
  });
});
