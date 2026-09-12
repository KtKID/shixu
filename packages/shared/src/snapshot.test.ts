import { describe, expect, it } from 'vitest';
import { createBookmark } from './bookmark';
import { TAXONOMY_EPOCH, createDefaultTaxonomy } from './taxonomy';
import {
  SnapshotArchiveSchema,
  SnapshotCreateResponseSchema,
  SnapshotDeleteResponseSchema,
  SnapshotDetailResponseSchema,
  SnapshotListResponseSchema,
  SnapshotMetaSchema,
} from './snapshot';

const NOW = '2026-09-12T08:00:00.000Z';

const META = { id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301', savedAt: NOW, itemCount: 2 };

const ARCHIVE = {
  savedAt: NOW,
  bookmarks: [
    createBookmark('3f2504e0-4f89-11d3-9a0c-0305e82c3302', {
      url: 'https://example.com/a',
      title: 'A',
    }),
    {
      ...createBookmark('3f2504e0-4f89-11d3-9a0c-0305e82c3303', {
        url: 'https://example.com/gone',
        title: '已删',
      }),
      deletedAt: NOW,
    },
  ],
  taxonomy: { ...createDefaultTaxonomy(), updatedAt: NOW },
};

describe('SnapshotMetaSchema（feat08 场景1：列表项含存档时间与条数）', () => {
  it('id + savedAt + itemCount 解析通过', () => {
    expect(SnapshotMetaSchema.safeParse(META).success).toBe(true);
  });

  it('id 非 uuid、savedAt 非时间戳、itemCount 非负整数被拒', () => {
    expect(SnapshotMetaSchema.safeParse({ ...META, id: 'not-a-uuid' }).success).toBe(false);
    expect(SnapshotMetaSchema.safeParse({ ...META, savedAt: 'yesterday' }).success).toBe(false);
    expect(SnapshotMetaSchema.safeParse({ ...META, itemCount: -1 }).success).toBe(false);
    expect(SnapshotMetaSchema.safeParse({ ...META, itemCount: 1.5 }).success).toBe(false);
  });
});

describe('SnapshotArchiveSchema（feat07 场景1：整库存档载荷）', () => {
  it('书签全量（含墓碑）+ taxonomy + savedAt 解析通过，itemCount 口径由调用方决定', () => {
    const parsed = SnapshotArchiveSchema.parse(ARCHIVE);
    expect(parsed.bookmarks).toHaveLength(2);
    expect(parsed.bookmarks[1]?.deletedAt).toBe(NOW);
    expect(parsed.taxonomy.status).toContain('inbox');
  });

  it('taxonomy 缺系统默认 inbox 被拒（恢复后仍满足系统约束）', () => {
    const bad = {
      ...ARCHIVE,
      taxonomy: { ...ARCHIVE.taxonomy, status: ['reading'] },
    };
    expect(SnapshotArchiveSchema.safeParse(bad).success).toBe(false);
  });

  it('bookmarks 元素字段损坏被拒', () => {
    const bad = {
      ...ARCHIVE,
      bookmarks: [{ ...ARCHIVE.bookmarks[0], updatedAt: '昨天' }],
    };
    expect(SnapshotArchiveSchema.safeParse(bad).success).toBe(false);
  });
});

describe('创建/列表/详情/删除响应（feat07 场景1、feat08 场景1/场景3）', () => {
  it('SnapshotCreateResponseSchema：snapshot meta 解析通过，未知键剥离', () => {
    expect(SnapshotCreateResponseSchema.safeParse({ snapshot: META }).success).toBe(true);
    const stripped = SnapshotCreateResponseSchema.parse({ snapshot: { ...META, extra: 1 } });
    expect(stripped.snapshot).toEqual(META);
  });

  it('SnapshotListResponseSchema：空列表与新到旧列表都合法', () => {
    expect(SnapshotListResponseSchema.safeParse({ snapshots: [] }).success).toBe(true);
    expect(SnapshotListResponseSchema.safeParse({ snapshots: [META] }).success).toBe(true);
    expect(
      SnapshotListResponseSchema.safeParse({ snapshots: [{ ...META, id: 'x' }] }).success,
    ).toBe(false);
  });

  it('SnapshotDetailResponseSchema：meta + 全量载荷', () => {
    const parsed = SnapshotDetailResponseSchema.safeParse({ ...META, ...ARCHIVE });
    expect(parsed.success).toBe(true);
    const detail = SnapshotDetailResponseSchema.parse({ ...META, ...ARCHIVE });
    expect(detail.id).toBe(META.id);
    expect(detail.itemCount).toBe(2);
    expect(detail.bookmarks).toHaveLength(2);
    expect(detail.taxonomy.updatedAt).toBe(NOW);
    expect(
      SnapshotDetailResponseSchema.safeParse({ ...META, ...ARCHIVE, itemCount: -3 }).success,
    ).toBe(false);
  });

  it('SnapshotDeleteResponseSchema：仅 { ok: true } 通过', () => {
    expect(SnapshotDeleteResponseSchema.safeParse({ ok: true }).success).toBe(true);
    expect(SnapshotDeleteResponseSchema.safeParse({ ok: false }).success).toBe(false);
  });

  it('TAXONOMY_EPOCH 仍可用（epoch seed 与快照 updatedAt 语义一致）', () => {
    expect(TAXONOMY_EPOCH).toBe('1970-01-01T00:00:00.000Z');
  });
});
