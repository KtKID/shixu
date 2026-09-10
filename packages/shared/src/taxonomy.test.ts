import { describe, expect, it } from 'vitest';
import {
  createDefaultTaxonomy,
  DEFAULT_STATUS,
  DEFAULT_TAXONOMY_VALUES,
  TAXONOMY_EPOCH,
  TaxonomyGetResponseSchema,
  TaxonomyPutRequestSchema,
  TaxonomyPutResponseSchema,
  TaxonomySchema,
} from './taxonomy';

const valid = {
  topic: ['AI', 'Harness'],
  type: ['博客文章'],
  purpose: ['学习原理'],
  status: ['inbox', 'reading'],
  updatedAt: '2026-09-10T00:00:00.000Z',
};

describe('TaxonomySchema', () => {
  it('合法对象通过', () => {
    expect(TaxonomySchema.safeParse(valid).success).toBe(true);
  });

  it('同一维度内取值重复被拒（feat06 场景3）', () => {
    expect(TaxonomySchema.safeParse({ ...valid, topic: ['AI', 'AI'] }).success).toBe(false);
  });

  it('取值超 30 字或空串被拒（feat06 场景4）', () => {
    expect(TaxonomySchema.safeParse({ ...valid, topic: ['a'.repeat(31)] }).success).toBe(false);
    expect(TaxonomySchema.safeParse({ ...valid, topic: [''] }).success).toBe(false);
  });

  it('status 缺少系统默认值 inbox 被拒（feat07 场景3：默认状态不可删除）', () => {
    expect(TaxonomySchema.safeParse({ ...valid, status: ['reading', 'done'] }).success).toBe(false);
  });

  it('createDefaultTaxonomy：seed 合法、status 含 inbox、updatedAt=epoch（feat05 场景1 / feat08 场景2）', () => {
    const taxonomy = createDefaultTaxonomy();
    expect(taxonomy.topic).toEqual([...DEFAULT_TAXONOMY_VALUES.topic]);
    expect(taxonomy.type).toEqual([...DEFAULT_TAXONOMY_VALUES.type]);
    expect(taxonomy.purpose).toEqual([...DEFAULT_TAXONOMY_VALUES.purpose]);
    expect(taxonomy.status).toEqual([...DEFAULT_TAXONOMY_VALUES.status]);
    expect(taxonomy.status).toContain(DEFAULT_STATUS);
    expect(taxonomy.updatedAt).toBe(TAXONOMY_EPOCH);
  });
});

describe('taxonomy 端点协议', () => {
  it('GET / PUT 响应结构解析', () => {
    expect(TaxonomyGetResponseSchema.safeParse({ taxonomy: valid }).success).toBe(true);
    expect(
      TaxonomyPutResponseSchema.safeParse({
        taxonomy: valid,
        serverTime: '2026-09-10T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('PUT 请求体即 Taxonomy：同样受 inbox 保护约束', () => {
    expect(TaxonomyPutRequestSchema.safeParse({ ...valid, status: [] }).success).toBe(false);
  });
});
