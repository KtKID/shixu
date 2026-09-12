import { useEffect, useState } from 'react';
import {
  SnapshotCreateRequestSchema,
  type Bookmark,
  type Settings,
  type SnapshotMeta,
} from '@x-threadpick/shared';
import { parseStoredBookmark } from '../../db/bookmarks';
import { currentLibrary } from '../../db/library';
import { restoreFromSnapshot } from '../../db/restore';
import { getTaxonomy } from '../../db/taxonomy';
import { createSnapshot, deleteSnapshot, listSnapshots } from './api';
import { formatDateTime } from './format';

/**
 * 快照存档卡（sync-archive feat07/feat08）：挂在「网络连接」页账号卡下方。
 * - 存档：当前库全部收藏（含墓碑，恢复后已删条目不复活）+ 取值清单打包上传，归当前账号名下；
 * - 列表：仅当前账号的快照（严格按账号隔离，登录态切换即换列表），新到旧；
 * - 未登录：「立即存档」不可用 +「登录后才能存档」，不显示快照区（feat08 场景5）。
 */

interface Props {
  settings: Settings;
}

export default function SnapshotCard({ settings }: Props) {
  const session = settings.session;
  const sessionExpired = session !== null && session.expiresAt <= new Date().toISOString();
  const loggedIn = session !== null && !sessionExpired;

  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [archiving, setArchiving] = useState(false);
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SnapshotMeta | null>(null);
  // 恢复流程（feat09）：确认框 → restoreFromSnapshot → 成功/失败提示（失败时本机已被 restore 保证原样）
  const [pendingRestore, setPendingRestore] = useState<SnapshotMeta | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  // 当前账号的快照列表：登录态变化（登录/登出/换账号）即重拉；失败静默保持空列表（低干扰）
  useEffect(() => {
    if (session === null) {
      setSnapshots([]);
      return;
    }
    let active = true;
    listSnapshots(session.serverUrl, session.token)
      .then((outcome) => {
        if (active && outcome.status === 'ok') setSnapshots(outcome.data.snapshots);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [session]);

  const runArchive = (): void => {
    if (archiving || session === null) return;
    const currentSession = session;
    setArchiving(true);
    setArchiveMessage(null);
    (async () => {
      const db = await currentLibrary();
      const rows = await db.bookmarks.toArray();
      const bookmarks = rows.map(parseStoredBookmark).filter((b): b is Bookmark => b !== null);
      const body = SnapshotCreateRequestSchema.parse({
        savedAt: new Date().toISOString(),
        bookmarks,
        taxonomy: await getTaxonomy(db),
      });
      const outcome = await createSnapshot(currentSession.serverUrl, currentSession.token, body);
      if (outcome.status !== 'ok') {
        setArchiveMessage('存档失败，请稍后再试');
        return;
      }
      const created = outcome.data.snapshot;
      setArchiveMessage(`已存档 ${created.itemCount} 条收藏`);
      setSnapshots((prev) => [created, ...prev]);
    })()
      .catch((err: unknown) => {
        console.error('[settings] 存档失败', err);
        setArchiveMessage('存档失败，请稍后再试');
      })
      .finally(() => {
        setArchiving(false);
      });
  };

  const confirmDelete = (): void => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (target === null || session === null) return;
    deleteSnapshot(session.serverUrl, session.token, target.id)
      .then((outcome) => {
        // 删除成功才从列表移除；失败保留（收藏库本身不受任何影响）
        if (outcome.status === 'ok') {
          setSnapshots((prev) => prev.filter((s) => s.id !== target.id));
        }
      })
      .catch((err: unknown) => console.error('[settings] 删除快照失败', err));
  };

  const confirmRestore = (): void => {
    const target = pendingRestore;
    setPendingRestore(null);
    if (target === null || restoring || session === null) return;
    setRestoring(true);
    setRestoreMessage(null);
    restoreFromSnapshot(target)
      .then((result) => {
        setRestoring(false);
        // 快照保留在列表中（feat09 场景2），成功与失败都只更新提示
        setRestoreMessage(
          result.status === 'ok'
            ? `已恢复至 ${formatDateTime(target.savedAt)} 的存档`
            : '恢复失败，收藏库保持恢复前的样子',
        );
      })
      .catch((err: unknown) => {
        setRestoring(false);
        console.error('[settings] 恢复失败', err);
        setRestoreMessage('恢复失败，收藏库保持恢复前的样子');
      });
  };

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title serif">
          快照存档<span className="en">Snapshots</span>
        </div>
        {loggedIn && <div className="status">{`${snapshots.length} 份存档`}</div>}
      </div>
      <p className="card-desc">
        把整库收藏与分类取值存成带时间的快照，归到当前账号名下；需要时可整库恢复。
      </p>
      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!loggedIn || archiving}
          onClick={runArchive}
        >
          {archiving ? '存档中…' : '立即存档'}
        </button>
        {!loggedIn && <span className="status">登录后才能存档</span>}
        {archiveMessage !== null && <span className="status">{archiveMessage}</span>}
        {restoreMessage !== null && <span className="status">{restoreMessage}</span>}
      </div>

      {loggedIn && (
        <div className="snap-list">
          {snapshots.length === 0 ? (
            <p className="card-desc">还没有快照。</p>
          ) : (
            snapshots.map((snap) => (
              <div className="snap-item" key={snap.id}>
                <span className="snap-time">{formatDateTime(snap.savedAt)}</span>
                <span className="snap-count">{`${snap.itemCount} 条`}</span>
                <div className="snap-actions">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setPendingRestore(snap)}
                  >
                    恢复
                  </button>
                  <button type="button" className="link-btn" onClick={() => setPendingDelete(snap)}>
                    删除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {pendingRestore !== null && (
        <div className="modal-overlay">
          <div className="card modal" role="dialog" aria-label="恢复快照">
            <div className="card-head">
              <div className="card-title serif">
                恢复快照<span className="en">Restore</span>
              </div>
            </div>
            <p className="card-desc">
              本机收藏库将被替换为该快照（{formatDateTime(pendingRestore.savedAt)}，共{' '}
              {pendingRestore.itemCount}{' '}
              条）的内容，快照时间之后新增的收藏会被移除，且这个变化会照常同步到服务器。
            </p>
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={restoring}
                onClick={confirmRestore}
              >
                {restoring ? '恢复中…' : '确认恢复'}
              </button>
              <button type="button" className="link-btn" onClick={() => setPendingRestore(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingDelete !== null && (
        <div className="modal-overlay">
          <div className="card modal" role="dialog" aria-label="删除快照">
            <div className="card-head">
              <div className="card-title serif">
                删除快照<span className="en">Delete</span>
              </div>
            </div>
            <p className="card-desc">
              删除 {formatDateTime(pendingDelete.savedAt)} 的存档（{pendingDelete.itemCount}{' '}
              条）？收藏库本身不受影响，删除后不可找回。
            </p>
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={confirmDelete}>
                确认删除
              </button>
              <button type="button" className="link-btn" onClick={() => setPendingDelete(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
