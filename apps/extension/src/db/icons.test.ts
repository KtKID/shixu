import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createBookmark, type Bookmark } from '@x-threadpick/shared';
import { ensureBookmarkIcons, resetIconAttempts } from './icons';
import { getActiveBookmarks } from './bookmarks';
import { currentLibrary, resetLibraryRuntime } from './library';
import { getResource, iconPathFor, putResource } from './resources';

/**
 * 图标回填（task-card-brand-icon）+ 本体下载入统一资源库（task-card-icon-resource）：
 * 规则链解析地址 → 下载图片本体存 resources（相对路径键 icons/<域名>，按域名去重）→
 * 书签 iconUrl 照常写回（同步线索）。下载失败 iconUrl 照存，下轮会话补下载。
 */

const DATA_URL = 'data:image/png;base64,AAA';

async function seed(url: string, iconUrl?: string): Promise<Bookmark> {
  // 固定过去时间入库：回填写回的 updatedAt 必然晚于它（断言不依赖真实时钟分辨率）
  const bookmark = createBookmark(
    crypto.randomUUID(),
    { url, title: url },
    new Date('2026-09-01T00:00:00.000Z'),
  );
  const stored = iconUrl === undefined ? bookmark : { ...bookmark, iconUrl };
  const db = await currentLibrary();
  await db.bookmarks.add(stored);
  return stored;
}

const resolvesTo = (url: string | null) => vi.fn(() => Promise.resolve(url));
const fetchesTo = (data: string | null) => vi.fn(() => Promise.resolve(data));

beforeEach(async () => {
  fakeBrowser.reset();
  await resetLibraryRuntime();
  resetIconAttempts();
});

describe('ensureBookmarkIcons · 下载入资源库', () => {
  it('解析出地址后下载本体入库，书签 iconUrl 写回且 updatedAt 前移', async () => {
    const original = await seed('https://a.example/x');

    const updated = await ensureBookmarkIcons(
      resolvesTo('https://a.example/icon.png'),
      fetchesTo(DATA_URL),
    );

    // updated 计变化次数：写书签 iconUrl + 存图标本体各一次
    expect(updated).toBe(2);
    const [stored] = await getActiveBookmarks();
    if (stored === undefined) throw new Error('播种的书签未入库');
    expect(stored.iconUrl).toBe('https://a.example/icon.png');
    expect(stored.updatedAt > original.updatedAt).toBe(true);
    expect(await getResource(iconPathFor(stored.url))).toBe(DATA_URL);
  });

  it('同域名多条书签只下载一次、资源库只存一份', async () => {
    await seed('https://a.example/x');
    await seed('https://a.example/y');
    const fetchIcon = fetchesTo(DATA_URL);

    await ensureBookmarkIcons(resolvesTo('https://a.example/icon.png'), fetchIcon);

    expect(fetchIcon).toHaveBeenCalledTimes(1);
    const db = await currentLibrary();
    expect(await db.resources.count()).toBe(1);
  });

  it('已有 iconUrl 但本地无资源：只补下载，不重新解析', async () => {
    await seed('https://has.example/', 'https://has.example/icon.png');
    const resolve = resolvesTo('https://should-not-be-called.example/x.png');
    const fetchIcon = fetchesTo(DATA_URL);

    await ensureBookmarkIcons(resolve, fetchIcon);

    expect(resolve).not.toHaveBeenCalled();
    expect(fetchIcon).toHaveBeenCalledTimes(1);
    expect(await getResource('icons/has.example')).toBe(DATA_URL);
  });

  it('已有 iconUrl 且资源已存在：完全不动作', async () => {
    const bookmark = await seed('https://done.example/', 'https://done.example/icon.png');
    await putResource(iconPathFor(bookmark.url), DATA_URL);
    const resolve = resolvesTo(null);
    const fetchIcon = fetchesTo(DATA_URL);

    expect(await ensureBookmarkIcons(resolve, fetchIcon)).toBe(0);
    expect(resolve).not.toHaveBeenCalled();
    expect(fetchIcon).not.toHaveBeenCalled();
  });

  it('下载失败：iconUrl 仍写回（下轮可补下载），资源库不落脏数据', async () => {
    await seed('https://flaky.example/');

    const updated = await ensureBookmarkIcons(
      resolvesTo('https://flaky.example/icon.png'),
      fetchesTo(null),
    );

    expect(updated).toBe(1);
    const [stored] = await getActiveBookmarks();
    expect(stored?.iconUrl).toBe('https://flaky.example/icon.png');
    expect(await getResource('icons/flaky.example')).toBeNull();
  });

  it('取不到图标的收藏本次运行内不重复抓取', async () => {
    await seed('https://dead.example/');
    const resolve = resolvesTo(null);

    expect(await ensureBookmarkIcons(resolve, fetchesTo(DATA_URL))).toBe(0);
    expect(await ensureBookmarkIcons(resolve, fetchesTo(DATA_URL))).toBe(0);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('软删除墓碑不参与回填', async () => {
    const tombstone = await seed('https://gone.example/');
    const db = await currentLibrary();
    await db.bookmarks.put({ ...tombstone, deletedAt: new Date().toISOString() });
    const resolve = resolvesTo('https://x.example/i.png');

    expect(await ensureBookmarkIcons(resolve, fetchesTo(DATA_URL))).toBe(0);
    expect(resolve).not.toHaveBeenCalled();
  });
});
