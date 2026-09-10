/**
 * 原生书签树 → 展平列表。用户不需要知道存放路径：
 * bookmarks.getTree() 返回整棵树，这里递归展平并携带文件夹路径字符串（仅作参考展示）。
 */

export interface RawBookmarkNode {
  id: string;
  title: string;
  url?: string;
  children?: RawBookmarkNode[];
}

export interface FlatBookmark {
  id: string;
  title: string;
  url: string;
  folderPath: string;
}

export function flattenBookmarkTree(nodes: readonly RawBookmarkNode[]): FlatBookmark[] {
  const out: FlatBookmark[] = [];
  const walk = (list: readonly RawBookmarkNode[], path: readonly string[]): void => {
    for (const node of list) {
      if (node.url !== undefined && node.url !== '') {
        out.push({ id: node.id, title: node.title, url: node.url, folderPath: path.join(' / ') });
      }
      if (node.children !== undefined && node.children.length > 0) {
        walk(node.children, node.title === '' ? path : [...path, node.title]);
      }
    }
  };
  walk(nodes, []);
  return out;
}
