import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  DEFAULT_STATUS,
  TAXONOMY_EPOCH,
  TAXONOMY_VALUE_MAX,
  createBookmark,
} from '@x-threadpick/shared';
import { addTaxonomyValue, getTaxonomy, removeTaxonomyValue } from './taxonomy';
import { currentLibrary, resetLibraryRuntime } from './library';

beforeEach(async () => {
  fakeBrowser.reset();
  await resetLibraryRuntime();
  const db = await currentLibrary();
  await db.taxonomies.clear();
  await db.bookmarks.clear();
});

describe('getTaxonomy', () => {
  it('首次读取返回默认集合，updatedAt 为 epoch（feat05 场景1）', async () => {
    const taxonomy = await getTaxonomy();
    expect(taxonomy.topic).toEqual(['项目管理', '会议纪要', '行业报告', '办公技巧']);
    expect(taxonomy.type).toEqual(['网页文章', '在线文档', '数据表格', '演示文稿']);
    expect(taxonomy.purpose).toEqual(['工作参考', '汇报材料', '模板备用']);
    expect(taxonomy.status).toEqual(['inbox', '进行中', '已完成']);
    expect(taxonomy.updatedAt).toBe(TAXONOMY_EPOCH);
  });
});

describe('addTaxonomyValue', () => {
  it('添加成功：追加到维度末尾并推进 updatedAt（feat06 场景1）', async () => {
    const result = await addTaxonomyValue('topic', 'RAG');
    expect(result).toEqual({ status: 'added' });
    const taxonomy = await getTaxonomy();
    expect(taxonomy.topic.at(-1)).toBe('RAG');
    expect(taxonomy.updatedAt > TAXONOMY_EPOCH).toBe(true);
  });

  it('未登录时本地添加同样生效，无服务器参与（feat06 场景5）', async () => {
    const result = await addTaxonomyValue('purpose', '随手收集');
    expect(result).toEqual({ status: 'added' });
    expect((await getTaxonomy()).purpose).toContain('随手收集');
  });

  it('空白输入不添加（feat06 场景2）', async () => {
    const result = await addTaxonomyValue('topic', '   ');
    expect(result).toEqual({ status: 'rejected', reason: 'empty' });
    expect((await getTaxonomy()).topic).toHaveLength(4);
  });

  it('维度内重复取值拒绝，不产生重复标签（feat06 场景3）', async () => {
    const result = await addTaxonomyValue('topic', '项目管理');
    expect(result).toEqual({ status: 'rejected', reason: 'duplicate' });
    expect((await getTaxonomy()).topic.filter((v) => v === '项目管理')).toHaveLength(1);
  });

  it('首尾空格自动去除后保存（feat06 场景4）', async () => {
    const result = await addTaxonomyValue('purpose', '  新用途  ');
    expect(result).toEqual({ status: 'added' });
    expect((await getTaxonomy()).purpose).toContain('新用途');
  });

  it('超过 30 字拒绝，恰好 30 字允许（feat06 场景4）', async () => {
    const long = '长'.repeat(TAXONOMY_VALUE_MAX + 1);
    const exact = '长'.repeat(TAXONOMY_VALUE_MAX);
    expect(await addTaxonomyValue('topic', long)).toEqual({
      status: 'rejected',
      reason: 'too_long',
    });
    expect((await getTaxonomy()).topic).not.toContain(long);
    expect(await addTaxonomyValue('topic', exact)).toEqual({ status: 'added' });
  });
});

describe('removeTaxonomyValue', () => {
  it('删除普通取值成功（feat07 场景1）', async () => {
    const result = await removeTaxonomyValue('topic', '会议纪要');
    expect(result).toEqual({ status: 'removed' });
    expect((await getTaxonomy()).topic).not.toContain('会议纪要');
  });

  it('删除取值不改动任何书签数据（feat07 场景2）', async () => {
    const id = crypto.randomUUID();
    const bookmark = createBookmark(id, { url: 'https://example.com/a', title: 'A' });
    await (await currentLibrary()).bookmarks.add(bookmark);
    const result = await removeTaxonomyValue('topic', '会议纪要');
    expect(result).toEqual({ status: 'removed' });
    expect(await (await currentLibrary()).bookmarks.get(id)).toEqual(bookmark);
  });

  it('默认状态 inbox 不可删除（feat07 场景3）', async () => {
    const result = await removeTaxonomyValue('status', DEFAULT_STATUS);
    expect(result).toEqual({ status: 'rejected', reason: 'protected' });
    expect((await getTaxonomy()).status).toContain(DEFAULT_STATUS);
  });

  it('其余状态取值可自由删除（feat07 场景4）', async () => {
    const result = await removeTaxonomyValue('status', '进行中');
    expect(result).toEqual({ status: 'removed' });
    expect((await getTaxonomy()).status).toEqual([DEFAULT_STATUS, '已完成']);
  });

  it('删除不存在的取值返回 not_found', async () => {
    expect(await removeTaxonomyValue('topic', '不存在')).toEqual({
      status: 'rejected',
      reason: 'not_found',
    });
  });
});
