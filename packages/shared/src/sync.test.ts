import { describe, expect, it } from 'vitest';
import { createDefaultTaxonomy } from './taxonomy';
import { SyncPullResponseSchema, SyncPushRequestSchema } from './sync';

const serverTime = '2026-09-10T00:00:00.000Z';

describe('sync 协议并入 taxonomy（feat08）', () => {
  it('pull 响应必须含 taxonomy（场景1：另一设备取到相同取值集合）', () => {
    expect(
      SyncPullResponseSchema.safeParse({
        serverTime,
        bookmarks: [],
        views: [],
        taxonomy: createDefaultTaxonomy(),
        bookmarksTotal: 0,
      }).success,
    ).toBe(true);
    expect(
      SyncPullResponseSchema.safeParse({ serverTime, bookmarks: [], views: [], bookmarksTotal: 0 })
        .success,
    ).toBe(false);
  });

  it('push 请求 taxonomy 可选：不带 taxonomy 的旧式请求仍合法（向后兼容）', () => {
    expect(SyncPushRequestSchema.safeParse({ bookmarks: [], views: [] }).success).toBe(true);
    expect(
      SyncPushRequestSchema.safeParse({
        bookmarks: [],
        views: [],
        taxonomy: createDefaultTaxonomy(),
      }).success,
    ).toBe(true);
  });

  it('push 的 taxonomy 同样受 inbox 保护约束（feat07 场景3）', () => {
    const broken = { ...createDefaultTaxonomy(), status: ['reading'] };
    expect(
      SyncPushRequestSchema.safeParse({ bookmarks: [], views: [], taxonomy: broken }).success,
    ).toBe(false);
  });
});

describe('pull 响应带服务器收藏总数（sync-archive feat05 场景1）', () => {
  const base = { serverTime, bookmarks: [], views: [], taxonomy: createDefaultTaxonomy() };

  it('bookmarksTotal 为非负整数时通过', () => {
    expect(SyncPullResponseSchema.safeParse({ ...base, bookmarksTotal: 152 }).success).toBe(true);
    expect(SyncPullResponseSchema.safeParse({ ...base, bookmarksTotal: 0 }).success).toBe(true);
  });

  it('bookmarksTotal 必填：缺失即拒绝（服务器概览行依赖该字段）', () => {
    expect(SyncPullResponseSchema.safeParse(base).success).toBe(false);
  });

  it('bookmarksTotal 拒绝负数与小数（未删除收藏总数口径）', () => {
    expect(SyncPullResponseSchema.safeParse({ ...base, bookmarksTotal: -1 }).success).toBe(false);
    expect(SyncPullResponseSchema.safeParse({ ...base, bookmarksTotal: 1.5 }).success).toBe(false);
  });
});
