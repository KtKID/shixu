import { describe, expect, it } from 'vitest';
import { DEFAULT_STATUS } from './taxonomy';
import { BookmarkSchema, createBookmark } from './bookmark';

const base = {
  id: '0f0d3e2a-1b4f-4c8d-9a7e-2f3b4c5d6e7f',
  url: 'https://example.com/a',
  urlNormalized: 'https://example.com/a',
  title: '示例',
  summary: null,
  note: null,
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
  deletedAt: null,
};

const classification = (status: string) => ({
  topics: [],
  type: null,
  purposes: [],
  status,
});

describe('BookmarkSchema · Status 为用户自定义单选取值', () => {
  it('接受任意非空自定义取值（如中文）', () => {
    const r = BookmarkSchema.safeParse({ ...base, classification: classification('稍后再看') });
    expect(r.success).toBe(true);
  });

  it('拒绝空字符串与超长（>30 字）取值', () => {
    expect(BookmarkSchema.safeParse({ ...base, classification: classification('') }).success).toBe(
      false,
    );
    expect(
      BookmarkSchema.safeParse({ ...base, classification: classification('a'.repeat(31)) }).success,
    ).toBe(false);
  });

  it('旧枚举值（inbox/reading/done）数据仍然合法——已同步数据无需迁移', () => {
    for (const status of ['inbox', 'reading', 'done']) {
      expect(
        BookmarkSchema.safeParse({ ...base, classification: classification(status) }).success,
      ).toBe(true);
    }
  });

  it('createBookmark 新书签默认 status=inbox（系统默认值，feat07 场景4）', () => {
    const bookmark = createBookmark(crypto.randomUUID(), {
      url: 'https://example.com/new',
      title: 't',
    });
    expect(DEFAULT_STATUS).toBe('inbox');
    expect(bookmark.classification.status).toBe(DEFAULT_STATUS);
  });
});
