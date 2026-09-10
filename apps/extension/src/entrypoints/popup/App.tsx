import { useEffect, useState } from 'react';
import { getActiveBookmarks } from '../../db/bookmarks';

export default function App() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    getActiveBookmarks()
      .then((bookmarks) => setCount(bookmarks.length))
      .catch(() => setCount(null));
  }, []);

  return (
    <div className="popup">
      <h1>x-threadpick</h1>
      <p>{count === null ? '…' : `已入库 ${count} 条书签`}</p>
      <button
        type="button"
        onClick={(): void => {
          browser.runtime
            .openOptionsPage()
            .then(() => window.close())
            .catch(() => window.close());
        }}
      >
        打开导入器
      </button>
    </div>
  );
}
