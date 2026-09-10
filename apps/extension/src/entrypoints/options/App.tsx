import { useEffect, useMemo, useState } from 'react';
import type { Bookmark } from '@x-threadpick/shared';
import { getActiveBookmarks, importBookmarks, type ImportOutcome } from '../../db/bookmarks';
import {
  flattenBookmarkTree,
  type FlatBookmark,
  type RawBookmarkNode,
} from '../../lib/bookmark-tree';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function App() {
  const [sourceBookmarks, setSourceBookmarks] = useState<FlatBookmark[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [library, setLibrary] = useState<Bookmark[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      const tree: RawBookmarkNode[] = await browser.bookmarks.getTree();
      setSourceBookmarks(flattenBookmarkTree(tree));
      setLibrary(await getActiveBookmarks());
    };
    load()
      .then(() => setLoading(false))
      .catch((err: unknown) => {
        setMessage(`读取书签失败：${errorMessage(err)}`);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return sourceBookmarks;
    return sourceBookmarks.filter(
      (b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q),
    );
  }, [sourceBookmarks, query]);

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runImport = (): void => {
    const items = filtered.filter((b) => selected.has(b.id));
    if (items.length === 0) return;
    setMessage('导入中…');
    const finish = async (outcome: ImportOutcome): Promise<void> => {
      setLibrary(await getActiveBookmarks());
      setSelected(new Set());
      setMessage(
        `导入 ${outcome.imported} 条；已存在跳过 ${outcome.skipped} 条；无效 URL ${outcome.invalid} 条`,
      );
    };
    importBookmarks(items)
      .then(finish)
      .catch((err: unknown) => setMessage(`导入失败：${errorMessage(err)}`));
  };

  return (
    <div className="page">
      <header>
        <h1>x-threadpick</h1>
        <p className="sub">勾选导入浏览器书签 → 规范化去重 → 入库（默认 Inbox）</p>
      </header>

      <section className="card">
        <h2>从浏览器导入</h2>
        <div className="toolbar">
          <input
            type="search"
            placeholder="搜索标题 / URL，不需要知道书签放在哪个文件夹"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={runImport}
          >{`导入选中 ${selected.size} 条`}</button>
        </div>

        {loading ? (
          <p className="hint">正在读取浏览器书签…</p>
        ) : (
          <ul className="picker">
            {filtered.map((b) => (
              <li key={b.id} className="row">
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(b.id)}
                    onChange={() => toggle(b.id)}
                  />
                  <span className="title">{b.title === '' ? b.url : b.title}</span>
                  <span className="url">{b.url}</span>
                  <span className="path">{b.folderPath}</span>
                </label>
              </li>
            ))}
            {filtered.length === 0 && <li className="hint">没有匹配的书签</li>}
          </ul>
        )}
        {message !== null && <p className="message">{message}</p>}
      </section>

      <section className="card">
        <h2>已入库（{library.length}）</h2>
        <ul className="library">
          {library.map((b) => (
            <li key={b.id} className="row">
              <a href={b.url} target="_blank" rel="noreferrer" className="title">
                {b.title === '' ? b.url : b.title}
              </a>
              <span className={`status status-${b.classification.status}`}>
                {b.classification.status}
              </span>
              {b.note !== null && <span className="note">{b.note}</span>}
            </li>
          ))}
          {library.length === 0 && <li className="hint">还没有书签，从上方导入第一批</li>}
        </ul>
      </section>
    </div>
  );
}
