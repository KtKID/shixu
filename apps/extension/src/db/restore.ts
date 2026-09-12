import type { SnapshotMeta } from '@x-threadpick/shared';
import { getSnapshot } from '../components/settings/api';
import { openLibrary } from './library';
import { accountKey, loadSettings } from './settings';
import { syncNow } from './sync';
import { saveTaxonomy } from './taxonomy';

/**
 * 从快照恢复当前账号库（sync-archive feat09；task-snapshot-archive T5）：
 * 1. 读取快照全量载荷——失败即失败，本机未动（feat09 场景3）；
 * 2. 单个 Dexie 事务内整库替换（任一步失败全部回滚，停在恢复前状态）：
 *    - 快照没有的本机记录打墓碑（快照时间之后新增的收藏被移除，删除照常同步）；
 *    - 快照项覆盖写入、取值清单整体替换，updatedAt 统一前移到恢复时刻——
 *      保证 last-write-wins 比较必胜（覆盖服务器上较新的版本与本机未推送改动）；
 * 3. 触发同步把墓碑与恢复项推到服务器；同步失败不回滚恢复（离线优先，联网后补推）。
 * 快照本身保留，可再次恢复（feat09 场景2）。
 */

export type RestoreResult =
  | { status: 'ok'; restoredAt: string; synced: boolean }
  | { status: 'not_logged_in' }
  | { status: 'unauthorized' }
  | { status: 'unreachable' }
  | { status: 'server_error' };

export async function restoreFromSnapshot(meta: SnapshotMeta): Promise<RestoreResult> {
  const session = (await loadSettings()).session;
  if (session === null) return { status: 'not_logged_in' };
  if (session.expiresAt <= new Date().toISOString()) return { status: 'unauthorized' };

  // 1. 读快照：网络失败/协议不符在这里返回，本机库保持原样
  const detail = await getSnapshot(session.serverUrl, session.token, meta.id);
  if (detail.status !== 'ok') return { status: detail.status };

  // 2. 整库替换（原子事务）
  const restoredAt = new Date().toISOString();
  const db = await openLibrary(accountKey(session));
  const snapshotIds = new Set(detail.data.bookmarks.map((b) => b.id));
  const localRows = await db.bookmarks.toArray();
  await db.transaction('rw', db.bookmarks, db.taxonomies, async () => {
    for (const row of localRows) {
      if (!snapshotIds.has(row.id)) {
        // 差集墓碑：快照后新增/本机多出的记录被移除（墓碑化而非物理删除，删除可同步）
        await db.bookmarks.put({ ...row, updatedAt: restoredAt, deletedAt: restoredAt });
      }
    }
    for (const bookmark of detail.data.bookmarks) {
      // 快照项覆盖写入：updatedAt 前移，LWW 必胜
      await db.bookmarks.put({ ...bookmark, updatedAt: restoredAt });
    }
    await saveTaxonomy({ ...detail.data.taxonomy, updatedAt: restoredAt }, db);
  });

  // 3. 触发同步（恢复的变化照常上服务器）；同步失败不影响已完成的恢复
  const sync = await syncNow();
  return { status: 'ok', restoredAt, synced: sync.status === 'ok' };
}
