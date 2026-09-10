import { beforeEach, describe, expect, it } from 'vitest';
import { createBookmark, DEFAULT_STATUS, type Classification } from '@x-threadpick/shared';
import { captureBookmark, db, getBookmarkByUrl } from './bookmarks';

/**
 * captureBookmark 是覆盖语义 upsert（高风险行 T1）：
 * 新建 / 命中更新 / 清空理由 / 软删除复活 / 判重规范化 / 默认值落库，逐分支钉住。
 */

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
  await db.bookmarks.clear();
});

describe('getBookmarkByUrl', () => {
  it('按规范化地址命中（忽略 utm 等追踪参数差异），未命中返回 null', async () => {
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
    expect(await db.bookmarks.count()).toBe(1);
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
    expect(await db.bookmarks.count()).toBe(1);
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

  it('曾被删除的页面再次收藏 → 同一条复活，保留最初创建时间（feat06 场景4）', async () => {
    const existing = await seedExisting();
    existing.deletedAt = '2026-09-01T00:00:00.000Z';
    await db.bookmarks.put(existing);

    const outcome = await captureBookmark(
      { url: 'https://example.com/a', title: '新标题', note: '复活', classification: FILLED },
      T2,
    );

    expect(outcome.status).toBe('updated');
    expect(outcome.bookmark.id).toBe(existing.id);
    expect(outcome.bookmark.deletedAt).toBeNull();
    expect(outcome.bookmark.createdAt).toBe(existing.createdAt);
    expect(outcome.bookmark.updatedAt).toBe(T2.toISOString());
    expect(await db.bookmarks.count()).toBe(1);
  });
});
