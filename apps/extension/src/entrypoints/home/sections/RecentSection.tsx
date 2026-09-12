import { useEffect, useMemo, useState } from 'react';
import { liveQuery } from 'dexie';
import { createDefaultTaxonomy, type Bookmark, type Taxonomy } from '@x-threadpick/shared';
import { getActiveBookmarks } from '../../../db/bookmarks';
import { currentLibrary, readLastSyncAt } from '../../../db/library';
import { getTaxonomy } from '../../../db/taxonomy';
import { formatRelativeTime } from '../../../components/settings/format';
import {
  applyFilter,
  emptyFilter,
  hasActiveFilter,
  hasDimensionFilter,
  sourceDomainOf,
  type FilterSelection,
  type SyncFilterContext,
} from '../../../lib/bookmark-filter';
import {
  readSyncContext,
  summarizeSync,
  syncStateOf,
  type SyncContext,
} from '../../../lib/sync-status';
import FiltersPanel from '../FiltersPanel';
import SearchBox from '../SearchBox';

/**
 * 收藏库视图（homepage feat04/feat05/feat06/feat07）：本地收藏库（未登录照常可用，feat01 场景4）。
 * recent 变体（「最近新增」）：无筛选且未搜索时按收藏时间（createdAt）从新到旧展示最近 3 条；
 * library 变体（「全部收藏」，feat07）：默认不截取地展示全部，标题「全部收藏」、无最近 3 条提示；
 * 两变体共享筛选/搜索行为：有筛选时标题切「筛选结果 · N 条命中」（feat05 场景1/6）、
 * 搜索关键词与四维筛选取「且」叠加，无匹配显示「没有找到相关收藏」（feat06）。
 */

const RECENT_LIMIT = 3;

/** 首字母色块的渐变组（视觉参考原型 g1-g6），按来源文字哈希稳定取色。 */
const THUMB_GRADS: readonly string[] = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'];

function displayTitle(bookmark: Bookmark): string {
  return bookmark.title.trim() === '' ? bookmark.url : bookmark.title.trim();
}

function thumbInitial(bookmark: Bookmark): string {
  const ch = displayTitle(bookmark).charAt(0);
  return ch === '' ? '✦' : ch.toUpperCase();
}

function thumbGrad(bookmark: Bookmark): string {
  let hash = 0;
  for (const ch of displayTitle(bookmark)) {
    hash = (hash + ch.charCodeAt(0)) % THUMB_GRADS.length;
  }
  return THUMB_GRADS[hash] ?? 'g1';
}

/** 状态取值存小写（DEFAULT_STATUS='inbox'），展示层首字母大写（与卡片/面板一致）。 */
function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function hasNote(bookmark: Bookmark): boolean {
  return bookmark.note !== null && bookmark.note.trim() !== '';
}

function BookmarkCard({ bookmark, sync }: { bookmark: Bookmark; sync: SyncContext }) {
  const syncState = sync.tracked ? syncStateOf(bookmark, sync.lastSyncAt) : null;
  return (
    <a className="bcard" href={bookmark.url} target="_blank" rel="noreferrer noopener">
      <div className={`thumb ${thumbGrad(bookmark)} serif`}>{thumbInitial(bookmark)}</div>
      <div className="bbody">
        <div className="btitle">{displayTitle(bookmark)}</div>
        <div className="bmeta">
          {sourceDomainOf(bookmark)} · {formatRelativeTime(bookmark.createdAt)}
          {syncState !== null && sync.tracked && (
            <span
              className={`sync-cloud ${syncState}`}
              title={syncState === 'synced' ? `已同步 · ${sync.email}` : '待同步'}
            >
              ☁
            </span>
          )}
        </div>
        {hasNote(bookmark) && <div className="bnote">{bookmark.note}</div>}
        <div className="btags">
          {bookmark.classification.topics.map((value) => (
            <span key={`topic-${value}`} className="btag">
              {value}
            </span>
          ))}
          {bookmark.classification.types.map((value) => (
            <span key={`type-${value}`} className="btag">
              {value}
            </span>
          ))}
          <span className="btag st">{statusLabel(bookmark.classification.status)}</span>
        </div>
      </div>
    </a>
  );
}

type LoadState = 'loading' | { bookmarks: Bookmark[]; taxonomy: Taxonomy; sync: SyncContext };

/** 视图变体：recent = 「最近新增」（默认截 3 条）；library = 「全部收藏」（feat07，默认全量）。 */
export type RecentSectionVariant = 'recent' | 'library';

/**
 * 页头汇总行文案（sync-archive feat04）：整库口径，不随筛选/搜索变化。
 * 未登录只显示条数（默认库无同步概念）；已登录追加「已全部同步 / M 条待同步」。
 */
export function summaryText(total: number, pending: number, tracked: boolean): string {
  if (!tracked) return `${total} 条收藏`;
  return pending === 0 ? `${total} 条收藏 · 已全部同步` : `${total} 条收藏 · ${pending} 条待同步`;
}

export default function RecentSection({
  onNavigateImport,
  variant = 'recent',
}: {
  onNavigateImport: () => void;
  variant?: RecentSectionVariant;
}) {
  const [state, setState] = useState<LoadState>('loading');
  const [filter, setFilter] = useState<FilterSelection>(emptyFilter);

  useEffect(() => {
    Promise.all([getActiveBookmarks(), getTaxonomy(), readSyncContext()])
      .then(([bookmarks, taxonomy, sync]) => setState({ bookmarks, taxonomy, sync }))
      .catch((err: unknown) => {
        console.error('[home] 读取收藏库失败', err);
        setState({ bookmarks: [], taxonomy: createDefaultTaxonomy(), sync: { tracked: false } });
      });
  }, []);

  /**
   * 免刷新翻转（sync-archive feat03 场景3/场景5）：登录态下订阅当前账号库的
   * lastSyncAt（Dexie liveQuery，跨上下文经 BroadcastChannel 感知 background
   * 自动同步完成后的写入）。同步失败不写 lastSyncAt → 无新值 → 保持待同步不误报。
   * 未登录（default 库）无同步概念，不订阅；登录/登出即换库，App 层按库键重建本组件。
   */
  const tracked = state !== 'loading' && state.sync.tracked;
  useEffect(() => {
    if (!tracked) return;
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    void currentLibrary()
      .then((lib) => {
        if (disposed) return;
        const subscription = liveQuery(() => readLastSyncAt(lib)).subscribe({
          next: (lastSyncAt) => {
            setState((prev) => {
              if (prev === 'loading' || !prev.sync.tracked) return prev;
              if (prev.sync.lastSyncAt === lastSyncAt) return prev;
              return {
                ...prev,
                sync: { tracked: true, email: prev.sync.email, lastSyncAt },
              };
            });
          },
          error: (err: unknown) => console.error('[home] 订阅同步进度失败', err),
        });
        unsubscribe = () => subscription.unsubscribe();
      })
      .catch((err: unknown) => console.error('[home] 建立同步进度订阅失败', err));
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [tracked]);

  /** 命中集合（applyFilter 已按收藏时间新到旧排列）；library 变体或筛选/搜索中 = 全量，recent 默认截取最近 3 条。 */
  const searching = filter.query.trim() !== '';
  const filtering = hasActiveFilter(filter);
  const expandAll = searching || filtering || variant === 'library';
  /** 「待同步」筛选的同步语境：登录态下取当前账号库 lastSyncAt（feat06）。 */
  const syncCtx: SyncFilterContext | undefined =
    state !== 'loading' && state.sync.tracked ? { lastSyncAt: state.sync.lastSyncAt } : undefined;
  const visible = useMemo(() => {
    if (state === 'loading') return [] as Bookmark[];
    const hits = applyFilter(state.bookmarks, filter, syncCtx);
    return expandAll ? hits : hits.slice(0, RECENT_LIMIT);
  }, [state, filter, expandAll, syncCtx]);

  /** 无筛选时的标题随变体：library「全部收藏」/ recent「最近添加」；筛选态统一「筛选结果 · N 条命中」。 */
  const defaultTitle = variant === 'library' ? '全部收藏' : '最近添加';
  /** 页头副标题（task-home-layout）：静态文案，不随筛选态变化。 */
  const tagline =
    variant === 'library' ? '把收藏变成可再次遇见的线索。' : '刚拾起的新线索，都先放在这里。';
  /** 页头汇总行（feat04）：整库口径、空库不出（场景4）；loading 期间不出。 */
  let summaryLine: string | null = null;
  if (state !== 'loading' && state.bookmarks.length > 0) {
    const lastSyncAt = state.sync.tracked ? state.sync.lastSyncAt : null;
    const { total, pending } = summarizeSync(state.bookmarks, lastSyncAt);
    summaryLine = summaryText(total, pending, state.sync.tracked);
  }

  return (
    <div className="recent">
      <header className="page-head">
        <div>
          <h2 className="page-title serif">
            {filtering ? `筛选结果 · ${visible.length} 条命中` : defaultTitle}
          </h2>
          <p className="page-tagline">{tagline}</p>
          {summaryLine !== null && <p className="page-summary">{summaryLine}</p>}
        </div>
        {filtering && (
          <button type="button" className="clear-filters" onClick={() => setFilter(emptyFilter())}>
            清除全部筛选
          </button>
        )}
      </header>
      {state === 'loading' ? (
        <p className="loading">正在读取收藏库…</p>
      ) : state.bookmarks.length === 0 ? (
        <div className="cards">
          <div className="empty">
            收藏库还是空的。
            <br />
            <button type="button" className="empty-action" onClick={onNavigateImport}>
              去「导入已有书签」→
            </button>
          </div>
        </div>
      ) : (
        <>
          <SearchBox
            query={filter.query}
            onQueryChange={(query) => setFilter({ ...filter, query })}
            hitCount={searching ? visible.length : null}
          />
          <FiltersPanel
            bookmarks={state.bookmarks}
            taxonomy={state.taxonomy}
            filter={filter}
            onChange={setFilter}
            syncTracked={state.sync.tracked}
          />
          {expandAll ? (
            <div className="cards">
              {visible.length === 0 ? (
                <div className="empty">
                  {searching
                    ? '没有找到相关收藏'
                    : filter.pendingOnly && !hasDimensionFilter(filter)
                      ? '没有待同步的收藏，一切都已在服务器上'
                      : '没有同时满足这些条件的收藏，试试减少一个维度。'}
                </div>
              ) : (
                visible.map((bookmark) => (
                  <BookmarkCard key={bookmark.id} bookmark={bookmark} sync={state.sync} />
                ))
              )}
            </div>
          ) : (
            <>
              <p className="result-hint">默认只显示最近添加的 3 条，选择上方标签开始按维度筛选。</p>
              <div className="cards">
                {visible.map((bookmark) => (
                  <BookmarkCard key={bookmark.id} bookmark={bookmark} sync={state.sync} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
