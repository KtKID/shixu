import {
  DEFAULT_STATUS,
  TAXONOMY_VALUE_MAX,
  TaxonomySchema,
  createDefaultTaxonomy,
  type Dimension,
  type Taxonomy,
} from '@x-threadpick/shared';
import { TAXONOMY_ROW_ID, currentLibrary, type LibraryDB, type TaxonomyRow } from './library';
import { notifyLocalChange } from './autosync';

/**
 * 本地分类取值管理：Dexie 单行（id='local'），随当前库存储（task-account-libraries T4）。
 * 首次读取返回 epoch seed（不落库），首次修改时落库且 updatedAt 前进——
 * 保证未登录期间的本地修改在 last-write-wins 比较中必然胜过初始 seed（spec feat08 场景2 前提）。
 * 删除取值不改动任何书签数据（spec feat07 场景2）。
 */

export type { TaxonomyRow };

export async function getTaxonomy(db?: LibraryDB): Promise<Taxonomy> {
  const handle = db ?? (await currentLibrary());
  const row = await handle.taxonomies.get(TAXONOMY_ROW_ID);
  if (row === undefined) return createDefaultTaxonomy();
  const result = TaxonomySchema.safeParse(row.taxonomy);
  if (!result.success) {
    console.warn('[x-threadpick] 本地 taxonomy 校验失败，已回退默认集合', result.error.issues);
    return createDefaultTaxonomy();
  }
  return result.data;
}

async function putTaxonomy(taxonomy: Taxonomy, db: LibraryDB): Promise<void> {
  await db.taxonomies.put({ id: TAXONOMY_ROW_ID, taxonomy: TaxonomySchema.parse(taxonomy) });
}

/** 同步应用远端 taxonomy（feat10 场景5）：整包替换本机（调用方已做 LWW 比较）。 */
export async function saveTaxonomy(taxonomy: Taxonomy, db?: LibraryDB): Promise<void> {
  await putTaxonomy(taxonomy, db ?? (await currentLibrary()));
}

export type AddTaxonomyValueResult =
  { status: 'added' } | { status: 'rejected'; reason: 'empty' | 'duplicate' | 'too_long' };

export async function addTaxonomyValue(
  dimension: Dimension,
  rawValue: string,
): Promise<AddTaxonomyValueResult> {
  const db = await currentLibrary();
  const value = rawValue.trim();
  if (value === '') return { status: 'rejected', reason: 'empty' };
  if (value.length > TAXONOMY_VALUE_MAX) return { status: 'rejected', reason: 'too_long' };
  const taxonomy = await getTaxonomy(db);
  if (taxonomy[dimension].includes(value)) return { status: 'rejected', reason: 'duplicate' };
  taxonomy[dimension] = [...taxonomy[dimension], value];
  taxonomy.updatedAt = new Date().toISOString();
  await putTaxonomy(taxonomy, db);
  notifyLocalChange();
  return { status: 'added' };
}

export type RemoveTaxonomyValueResult =
  { status: 'removed' } | { status: 'rejected'; reason: 'protected' | 'not_found' };

export async function removeTaxonomyValue(
  dimension: Dimension,
  value: string,
): Promise<RemoveTaxonomyValueResult> {
  const db = await currentLibrary();
  if (dimension === 'status' && value === DEFAULT_STATUS) {
    return { status: 'rejected', reason: 'protected' };
  }
  const taxonomy = await getTaxonomy(db);
  if (!taxonomy[dimension].includes(value)) return { status: 'rejected', reason: 'not_found' };
  taxonomy[dimension] = taxonomy[dimension].filter((v) => v !== value);
  taxonomy.updatedAt = new Date().toISOString();
  await putTaxonomy(taxonomy, db);
  notifyLocalChange();
  return { status: 'removed' };
}
