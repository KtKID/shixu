import { BookmarkSchema } from '@x-threadpick/shared';
import { fetchIconData, resolvePageIcon } from '../lib/page-icon';
import { getActiveBookmarks } from './bookmarks';
import { currentLibrary } from './library';
import { notifyLocalChange } from './autosync';
import { iconPathFor, putResource } from './resources';

/**
 * 图标异步回填（task-card-brand-icon）+ 本体下载入统一资源库（task-card-icon-resource）：
 * - 缺 iconUrl：规则链解析地址 → 写回书签（updatedAt 前移，走既有自动同步）；
 * - 本地无资源：下载图片本体存 resources 表（相对键 icons/<域名>，同域名去重共享）；
 * - 下载失败 iconUrl 照存（下轮会话补下载）；解析失败留 null，本次运行内不重复抓；
 * - 调用方 fire-and-forget（导入完成 / Capture 保存 / 主页挂载），不阻塞主流程。
 */

const attempted = new Set<string>();
/** 同域名并发去重：路径级在途标记（检查+标记之间无 await，单线程内原子）。 */
const pathInflight = new Set<string>();
const CONCURRENCY = 3;

/** 测试隔离：清空本次运行的已尝试集合与在途标记。 */
export function resetIconAttempts(): void {
  attempted.clear();
  pathInflight.clear();
}

/** 回填一轮；返回本轮发生变化（写书签或存资源）的次数。 */
export async function ensureBookmarkIcons(
  resolve: (pageUrl: string) => Promise<string | null> = resolvePageIcon,
  fetchIcon: (iconUrl: string) => Promise<string | null> = fetchIconData,
): Promise<number> {
  const db = await currentLibrary();
  const pending = (await getActiveBookmarks(db)).filter((b) => !attempted.has(b.id));
  let updated = 0;
  const queue = [...pending];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const bookmark = queue.shift();
        if (bookmark === undefined) return;
        attempted.add(bookmark.id);
        const path = iconPathFor(bookmark.url);

        let iconUrl = bookmark.iconUrl;
        if (iconUrl === null) {
          iconUrl = await resolve(bookmark.url);
          if (iconUrl === null) continue;
          await db.bookmarks.put(
            BookmarkSchema.parse({ ...bookmark, iconUrl, updatedAt: new Date().toISOString() }),
          );
          updated++;
        }

        if (pathInflight.has(path)) continue;
        pathInflight.add(path);
        try {
          if ((await db.resources.get(path)) !== undefined) continue;
          const dataUrl = await fetchIcon(iconUrl);
          if (dataUrl !== null) {
            await putResource(path, dataUrl);
            updated++;
          }
        } finally {
          pathInflight.delete(path);
        }
      }
    }),
  );
  if (updated > 0) notifyLocalChange();
  return updated;
}
