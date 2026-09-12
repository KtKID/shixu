import type { Bookmark } from '@x-threadpick/shared';
import { getCurrentLibraryLastSyncAt } from '../db/library';
import { loadSettings } from '../db/settings';

/**
 * 同步状态推导（sync-archive feat03/feat04）：纯比较逻辑 + 当前库语境读取。
 * 单条状态 = 该书签 updatedAt 与当前库 lastSyncAt 比较（ISO 8601 UTC 串字典序，
 * 与 db/sync.ts 推送过滤 `updatedAt > since` 同一口径）；整库汇总 = 总数 + 待同步数；
 * 未登录（default 库）无同步概念（feat01），界面据此不渲染任何同步元素。
 */

export type SyncState = 'synced' | 'pending';

/**
 * 当前库的同步语境：
 * - 未登录（default 库）：tracked=false，无同步概念；
 * - 已登录（账号库）：tracked=true，带账号邮箱（悬停文案用）与库内 lastSyncAt
 *   （null = 登录后从未同步过，此时全部条目视为待同步——服务器上还没有）。
 */
export type SyncContext =
  { tracked: false } | { tracked: true; email: string; lastSyncAt: string | null };

/** 单条同步状态：updatedAt > lastSyncAt 即待同步（feat03 场景1/场景2）。 */
export function syncStateOf(bookmark: Bookmark, lastSyncAt: string | null): SyncState {
  if (lastSyncAt === null || bookmark.updatedAt > lastSyncAt) return 'pending';
  return 'synced';
}

/** 整库同步汇总：收藏总数与待同步条数（feat04 场景1/场景2）。 */
export interface SyncSummary {
  total: number;
  pending: number;
}

export function summarizeSync(
  bookmarks: readonly Bookmark[],
  lastSyncAt: string | null,
): SyncSummary {
  return {
    total: bookmarks.length,
    pending: bookmarks.filter((bookmark) => syncStateOf(bookmark, lastSyncAt) === 'pending').length,
  };
}

/** 读当前库的同步语境：登录态决定有无同步概念，lastSyncAt 取自当前账号库 meta。 */
export async function readSyncContext(): Promise<SyncContext> {
  const settings = await loadSettings();
  const session = settings.session;
  if (session === null) return { tracked: false };
  return { tracked: true, email: session.email, lastSyncAt: await getCurrentLibraryLastSyncAt() };
}
