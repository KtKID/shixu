import type { Bookmark, Classification, Dimension } from '@x-threadpick/shared';
import { syncStateOf } from './sync-status';

/**
 * 四维筛选引擎（homepage feat05）：纯函数，不触库、不感知 UI。
 * 规则：同维度内多选取「或」，跨维度取「且」；状态维度单值；
 * 主题维度可切换「满足任一 / 全部满足」（仅作用于主题，其余多选维度恒为「或」）。
 * sync-archive feat06：「待同步」作为第五个正交条件（pendingOnly），命中判定依赖
 * 调用方传入的同步语境（当前库 lastSyncAt），引擎本身仍不触库。
 */

export type TopicMatchMode = 'any' | 'all';

/** 收藏时间范围（homepage feat08）：全部 / 今天（自然日）/ 最近 7 天 / 30 天（一个月）/ 180 天（半年）。 */
export type TimeRange = 'all' | 'today' | 'd7' | 'd30' | 'd180';

/** 同步语境（feat06）：待同步 = updatedAt > 当前库 lastSyncAt（口径同 lib/sync-status）。 */
export interface SyncFilterContext {
  lastSyncAt: string | null;
}

/**
 * 筛选条件：主题/形态/用途多选、状态单值（null = 未选）；topicMatch 仅作用于主题维度；
 * query 为收藏搜索关键词（feat06，空串 = 未搜索，与四维筛选取「且」叠加）；
 * pendingOnly = 只看待同步（sync-archive feat06，未登录界面保证不置真）；
 * timeRange 为收藏时间范围（feat08，'all' = 不过滤）。
 */
export interface FilterSelection {
  topics: string[];
  types: string[];
  purposes: string[];
  status: string | null;
  topicMatch: TopicMatchMode;
  query: string;
  pendingOnly: boolean;
  timeRange: TimeRange;
}

/** 默认空筛选：满足任一、无任何已选条件、无搜索词、不按待同步过滤、收藏时间全部（feat05 场景4 默认）。 */
export function emptyFilter(): FilterSelection {
  return {
    topics: [],
    types: [],
    purposes: [],
    status: null,
    topicMatch: 'any',
    query: '',
    pendingOnly: false,
    timeRange: 'all',
  };
}

/** 是否存在四维筛选条件（不含 pendingOnly 与搜索词；供「待同步」专属空态判定）。 */
export function hasDimensionFilter(filter: FilterSelection): boolean {
  return (
    filter.topics.length > 0 ||
    filter.types.length > 0 ||
    filter.purposes.length > 0 ||
    filter.status !== null
  );
}

/** 是否存在任一筛选条件（feat05 场景6：「清除全部筛选」的显示前提；pendingOnly 与收藏时间计入）。 */
export function hasActiveFilter(filter: FilterSelection): boolean {
  return hasDimensionFilter(filter) || filter.pendingOnly || filter.timeRange !== 'all';
}

function toggleInList(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * 点选一个候选值：
 * - 多选维度（主题/形态/用途）再点取消单个条件（feat05 场景6）；
 * - 状态维度点选即替换，再点同一值则取消（feat05 场景3）。
 */
export function toggleFilterValue(
  filter: FilterSelection,
  dimension: Dimension,
  value: string,
): FilterSelection {
  switch (dimension) {
    case 'topic':
      return { ...filter, topics: toggleInList(filter.topics, value) };
    case 'type':
      return { ...filter, types: toggleInList(filter.types, value) };
    case 'purpose':
      return { ...filter, purposes: toggleInList(filter.purposes, value) };
    case 'status':
      return { ...filter, status: filter.status === value ? null : value };
  }
}

/** 来源域名（hostname）：URL 解析失败回退原始字符串（与收藏卡片展示一致）。 */
export function sourceDomainOf(bookmark: Bookmark): string {
  try {
    return new URL(bookmark.url).hostname;
  } catch {
    return bookmark.url;
  }
}

/**
 * 关键词命中（feat06 场景1）：标题、来源域名、收藏理由（note）包含关键词即命中，
 * 不区分大小写；URL 路径不参与。空/全空白关键词视为未搜索、恒命中。
 */
export function matchesQuery(bookmark: Bookmark, keyword: string): boolean {
  const needle = keyword.trim().toLowerCase();
  if (needle === '') return true;
  const note = bookmark.note === null ? '' : bookmark.note;
  return (
    bookmark.title.toLowerCase().includes(needle) ||
    sourceDomainOf(bookmark).toLowerCase().includes(needle) ||
    note.toLowerCase().includes(needle)
  );
}

const DAY_MS = 86400000;

/** 各时间范围的天数窗口（feat08）；'today' 与 'all' 不走天数比较。 */
const TIME_RANGE_DAYS: Partial<Record<TimeRange, number>> = { d7: 7, d30: 30, d180: 180 };

/**
 * 收藏时间命中（feat08，与四维/搜索/待同步取「且」叠加）：
 * 'all' 恒命中；'today' 按本地自然日（与「现在」同年同月同日）；
 * 其余按天数窗口（createdAt ≥ now − N 天）。createdAt 解析失败视为不命中。
 */
export function matchesTimeRange(bookmark: Bookmark, range: TimeRange, now = new Date()): boolean {
  if (range === 'all') return true;
  const created = Date.parse(bookmark.createdAt);
  if (Number.isNaN(created)) return false;
  if (range === 'today') {
    const day = new Date(created);
    return (
      day.getFullYear() === now.getFullYear() &&
      day.getMonth() === now.getMonth() &&
      day.getDate() === now.getDate()
    );
  }
  const days = TIME_RANGE_DAYS[range];
  return days !== undefined && created >= now.getTime() - days * DAY_MS;
}

/** 判断单条书签是否命中筛选条件（维度间「且」、维度内「或」、状态单值、主题可全满足、关键词/「待同步」/收藏时间均「且」叠加）。 */
export function matchesFilter(
  bookmark: Bookmark,
  filter: FilterSelection,
  sync?: SyncFilterContext,
): boolean {
  const { topics, types, purposes, status, topicMatch } = filter;
  if (!matchesQuery(bookmark, filter.query)) {
    return false;
  }
  if (!matchesTimeRange(bookmark, filter.timeRange)) {
    return false;
  }
  if (
    filter.pendingOnly &&
    (sync === undefined || syncStateOf(bookmark, sync.lastSyncAt) !== 'pending')
  ) {
    return false;
  }
  if (topics.length > 0) {
    const hit =
      topicMatch === 'all'
        ? topics.every((value) => bookmark.classification.topics.includes(value))
        : topics.some((value) => bookmark.classification.topics.includes(value));
    if (!hit) return false;
  }
  if (types.length > 0 && !types.some((value) => bookmark.classification.types.includes(value))) {
    return false;
  }
  if (
    purposes.length > 0 &&
    !purposes.some((value) => bookmark.classification.purposes.includes(value))
  ) {
    return false;
  }
  if (status !== null && bookmark.classification.status !== status) {
    return false;
  }
  return true;
}

/** 应用筛选并按收藏时间（createdAt）从新到旧排列（feat05 场景1；pendingOnly 需传 sync 语境）。 */
export function applyFilter(
  bookmarks: readonly Bookmark[],
  filter: FilterSelection,
  sync?: SyncFilterContext,
): Bookmark[] {
  return bookmarks
    .filter((bookmark) => matchesFilter(bookmark, filter, sync))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// ---- 候选动态计数（feat05 场景5） ----

/** 一个候选取值的动态计数（count = 其他维度条件下的命中条数）。 */
export interface FacetCount {
  value: string;
  count: number;
  selected: boolean;
}

/** 维度 → 书签分类里承载该维度取值的字段（status 为单值，包一层数组统一处理）。 */
const DIMENSION_VALUES: Record<Dimension, (classification: Classification) => readonly string[]> = {
  topic: (c) => c.topics,
  type: (c) => c.types,
  purpose: (c) => c.purposes,
  status: (c) => [c.status],
};

/** 剔除单一维度的已选条件（主题的模式随之失效），其余维度条件保持。 */
function withoutDimension(filter: FilterSelection, dimension: Dimension): FilterSelection {
  switch (dimension) {
    case 'topic':
      return { ...filter, topics: [] };
    case 'type':
      return { ...filter, types: [] };
    case 'purpose':
      return { ...filter, purposes: [] };
    case 'status':
      return { ...filter, status: null };
  }
}

/**
 * 候选动态计数：每个候选取值的 count 按**其他维度**的已选条件计算
 * （基准集剔除本维度已选项的影响），不含本维度条件；已选候选与计数为 0 的
 * 候选始终保留在结果里（candidates 逐项返回，不裁剪）；pendingOnly 保持为前提。
 */
export function countFacetValues(
  bookmarks: readonly Bookmark[],
  filter: FilterSelection,
  dimension: Dimension,
  candidates: readonly string[],
  sync?: SyncFilterContext,
): FacetCount[] {
  const scoped = bookmarks.filter((bookmark) =>
    matchesFilter(bookmark, withoutDimension(filter, dimension), sync),
  );
  const valuesOf = DIMENSION_VALUES[dimension];
  return candidates.map((value) => ({
    value,
    count: scoped.filter((bookmark) => valuesOf(bookmark.classification).includes(value)).length,
    selected: selectedValues(filter, dimension).includes(value),
  }));
}

/** 当前维度已选值列表（status 单值同样以列表返回，供统一 includes 判断）。 */
function selectedValues(filter: FilterSelection, dimension: Dimension): readonly string[] {
  switch (dimension) {
    case 'topic':
      return filter.topics;
    case 'type':
      return filter.types;
    case 'purpose':
      return filter.purposes;
    case 'status':
      return filter.status === null ? [] : [filter.status];
  }
}
