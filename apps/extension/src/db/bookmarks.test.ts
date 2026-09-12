import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  createBookmark,
  DEFAULT_STATUS,
  type Classification,
  type Session,
} from '@x-threadpick/shared';
import { captureBookmark, getActiveBookmarks, getBookmarkByUrl } from './bookmarks';
import { getTaxonomy } from './taxonomy';
import { clearSession, recordServerLogin } from './settings';
import { currentLibrary, resetLibraryRuntime } from './library';

/**
 * captureBookmark 是覆盖语义 upsert（高风险行 T1）：
 * 新建 / 命中更新 / 清空理由 / 软删除复活 / 判重规范化 / 默认值落库，逐分支钉住。
 * 多库架构（task-account-libraries T4）：读写一律经当前库句柄，登录即换库。
 */

const S1 = 'https://s1.example:8443';

function sessionOf(email: string): Session {
  return { email, serverUrl: S1, token: 'tok-1', expiresAt: '2030-01-01T00:00:00.000Z' };
}

const EMPTY_WITH_INBOX: Classification = {
  topics: [],
  types: [],
  purposes: [],
  status: DEFAULT_STATUS,
};

const FILLED: Classification = {
  topics: ['AI'],
  types: ['论文'],
  purposes: ['学习原理'],
  status: 'reading',
};

const T1 = new Date('2026-09-10T08:00:00.000Z');
const T2 = new Date('2026-09-10T09:00:00.000Z');

beforeEach(async () => {
  fakeBrowser.reset();
  await resetLibraryRuntime();
});

describe('按当前库读写（task-account-libraries T4 / feat01 场景1/场景9）', () => {
  it('未登录写 default 库；登录 A 后同一 API 读写 A 的库，互不可见；登出回 default', async () => {
    await captureBookmark(
      {
        url: 'https://example.com/d',
        title: '默认库一条',
        note: '',
        classification: EMPTY_WITH_INBOX,
      },
      T1,
    );
    expect((await getActiveBookmarks()).map((b) => b.title)).toEqual(['默认库一条']);

    await recordServerLogin(S1, sessionOf('a@x.com'));
    await captureBookmark(
      {
        url: 'https://example.com/a',
        title: 'A 库一条',
        note: '',
        classification: EMPTY_WITH_INBOX,
      },
      T1,
    );
    expect((await getActiveBookmarks()).map((b) => b.title)).toEqual(['A 库一条']); // 只见 A 库

    await clearSession();
    expect((await getActiveBookmarks()).map((b) => b.title)).toEqual(['默认库一条']); // 回 default，A 的不混入
  });

  it('分类取值随库：A 库的修改不进 default（feat01 场景3 取值清单随库）', async () => {
    await recordServerLogin(S1, sessionOf('a@x.com'));
    const libA = await currentLibrary();
    await libA.taxonomies.put({
      id: 'local',
      taxonomy: {
        ...(await getTaxonomy()),
        topic: ['A 专属主题'],
        updatedAt: '2026-09-10T00:00:00.000Z',
      },
    });
    expect((await getTaxonomy()).topic).toContain('A 专属主题');

    await clearSession();
    expect((await getTaxonomy()).topic).not.toContain('A 专属主题'); // default 库取值原样
  });
});

describe('feat02 数据层：已删除的收藏不再出现', () => {
  it('getActiveBookmarks 过滤墓碑：条数统计只算活跃条（feat02 场景1）', async () => {
    const db = await currentLibrary();
    await db.bookmarks.add(
      createBookmark(crypto.randomUUID(), { url: 'https://example.com/live', title: '活着' }),
    );
    const deleted = createBookmark(crypto.randomUUID(), {
      url: 'https://example.com/gone',
      title: '已删',
    });
    deleted.deletedAt = '2026-09-01T00:00:00.000Z';
    await db.bookmarks.add(deleted);

    const active = await getActiveBookmarks();
    expect(active).toHaveLength(1);
    expect(active[0]?.title).toBe('活着');
    expect(await db.bookmarks.count()).toBe(2); // 墓碑仍留库（同步用），只是不再出现
  });
});

describe('getBookmarkByUrl', () => {
  it('按规范化地址命中（忽略 utm 等追踪参数差异），未命中返回 null', async () => {
    const db = await currentLibrary();
    await db.bookmarks.add(
      createBookmark(crypto.randomUUID(), { url: 'https://example.com/a', title: 'A' }),
    );

    const hit = await getBookmarkByUrl('https://example.com/a?utm_source=x&utm_medium=social');
    expect(hit?.title).toBe('A');
    expect(await getBookmarkByUrl('https://example.com/other')).toBeNull();
  });
});

describe('captureBookmark · 新建（feat05 场景1 / feat04 场景4）', () => {
  it('库中无此页 → 新建一条，四维按面板内容落库', async () => {
    const outcome = await captureBookmark(
      {
        url: 'https://example.com/a?utm_medium=social',
        title: '页面 A',
        note: '以后写 benchmark 用',
        classification: FILLED,
      },
      T1,
    );

    expect(outcome.status).toBe('created');
    expect(outcome.bookmark.urlNormalized).toBe('https://example.com/a');
    expect(outcome.bookmark.note).toBe('以后写 benchmark 用');
    expect(outcome.bookmark.classification).toEqual(FILLED);
    expect(outcome.bookmark.deletedAt).toBeNull();
    expect(await (await currentLibrary()).bookmarks.count()).toBe(1);
  });

  it('零点选默认态落库：主题/形态/用途全空 + 状态 Inbox，理由留空为 null（feat04 场景4）', async () => {
    const outcome = await captureBookmark(
      { url: 'https://example.com/b', title: '页面 B', note: '', classification: EMPTY_WITH_INBOX },
      T1,
    );

    expect(outcome.bookmark.classification).toEqual(EMPTY_WITH_INBOX);
    expect(outcome.bookmark.note).toBeNull();
  });
});

describe('captureBookmark · 命中更新（feat06 场景2/3/4）', () => {
  async function seedExisting() {
    const db = await currentLibrary();
    const existing = createBookmark(
      crypto.randomUUID(),
      { url: 'https://example.com/a', title: '旧标题', note: '旧理由' },
      T1,
    );
    existing.classification = FILLED;
    await db.bookmarks.add(existing);
    return existing;
  }

  it('命中 = 同一条更新：不新增、标题刷新、修改时间前移、理由与四维按面板内容覆盖（feat06 场景2）', async () => {
    const existing = await seedExisting();

    const outcome = await captureBookmark(
      {
        url: 'https://example.com/a?utm_source=newsletter',
        title: '新标题',
        note: '新理由',
        classification: { topics: ['RAG'], types: [], purposes: [], status: 'done' },
      },
      T2,
    );

    expect(outcome.status).toBe('updated');
    expect(outcome.bookmark.id).toBe(existing.id);
    expect(outcome.bookmark.title).toBe('新标题');
    expect(outcome.bookmark.note).toBe('新理由');
    expect(outcome.bookmark.classification).toEqual({
      topics: ['RAG'],
      types: [],
      purposes: [],
      status: 'done',
    });
    expect(outcome.bookmark.updatedAt).toBe(T2.toISOString());
    expect(outcome.bookmark.createdAt).toBe(existing.createdAt);
    expect(await (await currentLibrary()).bookmarks.count()).toBe(1);
  });

  it('清空理由后保存 → 理由置空（覆盖语义，不保留旧值）（feat06 场景3）', async () => {
    const existing = await seedExisting();
    expect(existing.note).toBe('旧理由');

    const outcome = await captureBookmark(
      { url: 'https://example.com/a', title: '新标题', note: '', classification: FILLED },
      T2,
    );

    expect(outcome.bookmark.note).toBeNull();
  });

  it('曾被删除的页面再次收藏 → 同一条复活，收藏时间重置为本次（sync-archive feat02 场景2）', async () => {
    const existing = await seedExisting();
    existing.deletedAt = '2026-09-01T00:00:00.000Z';
    await (await currentLibrary()).bookmarks.put(existing);

    const outcome = await captureBookmark(
      { url: 'https://example.com/a', title: '新标题', note: '复活', classification: FILLED },
      T2,
    );

    expect(outcome.status).toBe('updated');
    expect(outcome.bookmark.id).toBe(existing.id);
    expect(outcome.bookmark.deletedAt).toBeNull();
    expect(outcome.bookmark.createdAt).toBe(T2.toISOString()); // 删除后不保留原收藏时间
    expect(outcome.bookmark.updatedAt).toBe(T2.toISOString());
    expect(await (await currentLibrary()).bookmarks.count()).toBe(1);
  });
});
