import { useEffect, useRef } from 'react';

/**
 * 收藏搜索框（homepage feat06）：受控输入，关键词在标题 / 来源域名 / 收藏理由三域匹配
 * （引擎见 lib/bookmark-filter 的 matchesQuery），与四维筛选取「且」叠加。
 * 命中条数由父层（RecentSection）按当前关键词 + 筛选条件计算后传入；未搜索时不展示。
 */

interface SearchBoxProps {
  query: string;
  onQueryChange: (next: string) => void;
  /** 当前命中条数；null = 未在搜索（不展示计数）。 */
  hitCount: number | null;
}

export default function SearchBox({ query, onQueryChange, hitCount }: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // feat06 场景4：⌘K（Windows/Linux 为 Ctrl+K）在主页任意位置聚焦搜索框。
  // 监听挂在 window 上，与光标位置无关；preventDefault 阻止浏览器默认（如地址栏搜索）。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="searchbox">
      <span className="searchbox-icon" aria-hidden="true">
        ⌕
      </span>
      <input
        ref={inputRef}
        type="text"
        className="searchbox-input"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="搜索标题、来源域名或收藏理由…"
        aria-label="搜索收藏"
      />
      {hitCount !== null && <span className="searchbox-count">{hitCount} 条结果</span>}
      <span className="searchbox-kbd" aria-hidden="true">
        ⌘K
      </span>
    </div>
  );
}
