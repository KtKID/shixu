import { useEffect, useMemo, useState } from 'react';
import { importBookmarks, type ImportOutcome } from '../../../db/bookmarks';
import {
  flattenBookmarkTree,
  type FlatBookmark,
  type RawBookmarkNode,
} from '../../../lib/bookmark-tree';

/**
 * 「导入已有书签」（homepage feat03）：原独立导入器能力搬进主页导航条目，用户可感知行为不变。
 * 链路：bookmarks.getTree → lib/bookmark-tree 展平（携带文件夹路径）→ 搜索标题/URL → 勾选
 * → db/bookmarks.importBookmarks（URL 规范化判重、默认 Inbox）→ 结果反馈计数。
 * 多库架构（task-account-libraries T8）：importBookmarks 经当前库句柄写入——
 * 未登录进 default 库、登录进当前账号库；App 层以 libraryKey remount 本组件保证切换后状态归零。
 */

type LoadState = { status: 'loading' } | { status: 'ready'; bookmarks: FlatBookmark[] };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function ImportSection() {
  const [source, setSource] = useState<LoadState>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportOutcome | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    browser.bookmarks
      .getTree()
      .then((tree: RawBookmarkNode[]) =>
        setSource({ status: 'ready', bookmarks: flattenBookmarkTree(tree) }),
      )
      .catch((err: unknown) => setMessage(`读取书签失败：${errorMessage(err)}`));
  }, []);

  // 搜索过滤：标题或 URL 包含关键词（大小写不敏感），不需要知道书签放在哪个文件夹
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (source.status !== 'ready') return [];
    if (q === '') return source.bookmarks;
    return source.bookmarks.filter(
      (b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q),
    );
  }, [source, query]);

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runImport = (): void => {
    const items = filtered
      .filter((b) => selected.has(b.id))
      .map((b) => ({ url: b.url, title: b.title }));
    if (items.length === 0) return;
    setImporting(true);
    setMessage(null);
    importBookmarks(items)
      .then((outcome: ImportOutcome) => {
        setResult(outcome);
        setSelected(new Set());
        // 跳过 = 已收藏过（URL 规范化后判重命中，feat03 场景2 的可感知提示）
        setMessage(
          `导入 ${outcome.imported} 条；已收藏过 ${outcome.skipped} 条；无效 URL ${outcome.invalid} 条`,
        );
      })
      .catch((err: unknown) => setMessage(`导入失败：${errorMessage(err)}`))
      .finally(() => setImporting(false));
  };

  if (source.status === 'loading') {
    return (
      <div className="import">
        <div className="result-head">
          <h2 className="result-title serif">导入已有书签</h2>
        </div>
        <p className="loading">正在读取浏览器书签…</p>
      </div>
    );
  }

  // 浏览器书签为空：只显示空状态，不显示搜索框与导入按钮（feat03 场景3）
  if (source.bookmarks.length === 0) {
    return (
      <div className="import">
        <div className="result-head">
          <h2 className="result-title serif">导入已有书签</h2>
        </div>
        <p className="imp-none">浏览器中没有可导入的书签</p>
        {message !== null && <p className="imp-message">{message}</p>}
      </div>
    );
  }

  return (
    <div className="import">
      <div className="result-head">
        <h2 className="result-title serif">导入已有书签</h2>
        <span className="result-count">{`共 ${source.bookmarks.length} 条`}</span>
      </div>

      <div className="imp-toolbar">
        <input
          type="search"
          className="imp-search"
          placeholder="搜索标题 / URL，不需要知道书签放在哪个文件夹"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="imp-run"
          disabled={selected.size === 0 || importing}
          onClick={runImport}
        >{`导入选中 ${selected.size} 条`}</button>
      </div>

      <ul className="imp-list">
        {filtered.map((b) => {
          const label = b.title === '' ? b.url : b.title;
          return (
            <li key={b.id} className="imp-row">
              <label>
                <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} />
                <span className="imp-title">{label}</span>
                <span className="imp-url">{b.url}</span>
                <span className="imp-path">{b.folderPath}</span>
              </label>
            </li>
          );
        })}
        {filtered.length === 0 && <li className="imp-empty">没有匹配的书签</li>}
      </ul>

      {message !== null && (
        <p className={`imp-message${result !== null ? ' ok' : ''}`}>{message}</p>
      )}
    </div>
  );
}
