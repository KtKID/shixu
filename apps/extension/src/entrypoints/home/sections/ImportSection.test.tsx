import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Browser } from 'wxt/browser';
import { createBookmark } from '@x-threadpick/shared';
import { db } from '../../../db/bookmarks';
import { loadSettings } from '../../../db/settings';
import App from '../App';
import ImportSection from './ImportSection';

/**
 * 「导入已有书签」（homepage feat03）：读取浏览器书签树 → 搜索/勾选 → importBookmarks 去重入库。
 * browser.bookmarks.getTree 在 fakeBrowser 中未实现（notMocked），按 popup 测试同模式直接赋值 stub。
 */

type TreeNode = Browser.bookmarks.BookmarkTreeNode;

/** 构造一个带根节点的书签树（模拟 bookmarks.getTree 返回的真实形状；syncing 为类型必填）。 */
function treeOf(children: TreeNode[]): TreeNode[] {
  return [{ id: 'root', title: '', syncing: false, children }];
}

function folder(id: string, title: string, children: TreeNode[]): TreeNode {
  return { id, title, syncing: false, children };
}

function leaf(id: string, title: string, url: string): TreeNode {
  return { id, title, url, syncing: false };
}

function mockBookmarkTree(nodes: TreeNode[]): void {
  const getTree = vi.fn<() => Promise<TreeNode[]>>();
  getTree.mockResolvedValue(nodes);
  browser.bookmarks.getTree = getTree;
}

// 直接赋值的 mock 不会被 restoreAllMocks 还原，beforeEach 里显式还原
const realGetTree = browser.bookmarks.getTree;

beforeEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  fakeBrowser.reset();
  browser.bookmarks.getTree = realGetTree;
  await db.bookmarks.clear();
  await db.taxonomies.clear();
});

describe('搜索并导入（feat03 场景1）', () => {
  it('接入主页导航：点「导入已有书签」条目进入分区，读取书签树并展示（含文件夹路径）', async () => {
    mockBookmarkTree(
      treeOf([
        folder('f1', '研究', [leaf('b1', 'World Models 论文', 'https://arxiv.org/abs/2401.00001')]),
        folder('f2', '工具', [leaf('b2', 'Dexie', 'https://dexie.org/docs/')]),
      ]),
    );
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '导入已有书签' }));

    // 占位文案已被真实分区替换
    expect(screen.queryByText('导入已有书签（即将迁入）')).toBeNull();
    expect(await screen.findByText('World Models 论文')).toBeTruthy();
    expect(screen.getByText('https://arxiv.org/abs/2401.00001')).toBeTruthy();
    // 文件夹路径仅作参考展示（b1/b2 的来源文件夹，不含书签名本身）
    expect(screen.getByText('研究')).toBeTruthy();
    expect(screen.getByText('工具')).toBeTruthy();
  });

  it('关键词过滤标题或 URL，勾选若干条点导入 → 入库（默认 Inbox）、反馈计数、随后出现在「最近新增」', async () => {
    mockBookmarkTree(
      treeOf([
        folder('f1', '研究', [
          leaf('b1', 'World Models Survey', 'https://arxiv.org/abs/2401.00001'),
          leaf('b2', 'Dreamer 论文', 'https://arxiv.org/abs/2402.00002'),
        ]),
        folder('f2', '工具', [leaf('b3', 'Dexie 文档', 'https://dexie.org/docs/')]),
      ]),
    );
    render(<App initialSection="import" />);

    // 搜索「arxiv」：标题或 URL 命中 b1、b2，不命中 b3
    fireEvent.change(await screen.findByPlaceholderText(/搜索/), {
      target: { value: 'arxiv' },
    });
    await waitFor(() => {
      expect(screen.queryByText('Dexie 文档')).toBeNull();
    });
    expect(screen.getByText('World Models Survey')).toBeTruthy();
    expect(screen.getByText('Dreamer 论文')).toBeTruthy();

    // 勾选 2 条导入
    fireEvent.click(screen.getByLabelText(/World Models Survey/));
    fireEvent.click(screen.getByLabelText(/Dreamer 论文/));
    fireEvent.click(screen.getByRole('button', { name: /导入选中/ }));

    expect(await screen.findByText(/导入 2 条/)).toBeTruthy();
    expect(screen.getByText(/无效 URL 0 条/)).toBeTruthy();

    const rows = await db.bookmarks.toArray();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.classification.status === 'inbox')).toBe(true);

    // 导入的书签随后出现在「最近新增」（切回默认视图即可见）
    fireEvent.click(screen.getByRole('button', { name: '最近新增' }));
    expect(await screen.findByText('World Models Survey')).toBeTruthy();
    expect(screen.getByText('Dreamer 论文')).toBeTruthy();
  });

  it('标题不含关键词但 URL 命中时仍可搜到（过滤同时覆盖标题与 URL）', async () => {
    mockBookmarkTree(
      treeOf([folder('f1', '杂项', [leaf('b1', '无关键词标题', 'https://example.com/xyzzy')])]),
    );
    render(<ImportSection />);

    fireEvent.change(await screen.findByPlaceholderText(/搜索/), {
      target: { value: 'XYZZY' },
    });
    expect(await screen.findByText('无关键词标题')).toBeTruthy();
  });

  it('未勾选任何条目时导入按钮禁用', async () => {
    mockBookmarkTree(treeOf([folder('f1', '研究', [leaf('b1', '一条', 'https://a.example/1')])]));
    render(<ImportSection />);

    const button = await screen.findByRole('button', { name: /导入选中/ });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('搜索无匹配时提示，不显示任何书签行', async () => {
    mockBookmarkTree(treeOf([folder('f1', '研究', [leaf('b1', '一条', 'https://a.example/1')])]));
    render(<ImportSection />);

    fireEvent.change(await screen.findByPlaceholderText(/搜索/), {
      target: { value: '不存在的关键词' },
    });
    await waitFor(() => {
      expect(screen.queryByText('一条')).toBeNull();
    });
    expect(screen.getByText(/没有匹配的书签/)).toBeTruthy();
  });
});

describe('重复导入同一条（feat03 场景2）', () => {
  it('库里已有某网址 → 再勾选同一网址（标题、来源文件夹、追踪参数不同）导入：提示「已收藏过」，不产生第二条', async () => {
    // GIVEN 收藏库里已有该网址的书签
    await db.bookmarks.add(
      createBookmark(crypto.randomUUID(), {
        url: 'https://example.com/page',
        title: '当初收藏的标题',
      }),
    );
    // 浏览器树里同一网址：标题不同、文件夹不同、带 utm 追踪参数
    mockBookmarkTree(
      treeOf([
        folder('f9', '另一个文件夹', [
          leaf('b9', '这次显示的标题', 'https://example.com/page?utm_source=newsletter'),
        ]),
      ]),
    );
    render(<ImportSection />);

    fireEvent.click(await screen.findByLabelText(/这次显示的标题/));
    fireEvent.click(screen.getByRole('button', { name: /导入选中/ }));

    // THEN 提示「已收藏过」（网址先规范化再去重），不产生第二条记录
    expect(await screen.findByText(/已收藏过/)).toBeTruthy();
    expect(screen.getByText(/导入 0 条/)).toBeTruthy();

    const rows = await db.bookmarks.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.urlNormalized).toBe('https://example.com/page');
  });

  it('新旧混合导入：未收藏的入库、已收藏的跳过，计数分列', async () => {
    await db.bookmarks.add(
      createBookmark(crypto.randomUUID(), { url: 'https://old.example/have', title: '已有' }),
    );
    mockBookmarkTree(
      treeOf([
        folder('f1', '研究', [
          leaf('b1', '已有条目', 'https://old.example/have'),
          leaf('b2', '全新条目', 'https://new.example/fresh'),
        ]),
      ]),
    );
    render(<ImportSection />);

    fireEvent.click(await screen.findByLabelText(/已有条目/));
    fireEvent.click(screen.getByLabelText(/全新条目/));
    fireEvent.click(screen.getByRole('button', { name: /导入选中/ }));

    expect(await screen.findByText(/导入 1 条/)).toBeTruthy();
    expect(screen.getByText(/已收藏过 1 条/)).toBeTruthy();
    const rows = await db.bookmarks.toArray();
    expect(rows).toHaveLength(2);
  });
});

describe('浏览器没有任何书签（feat03 场景3）', () => {
  it('显示空状态文案，不显示搜索框与导入按钮', async () => {
    mockBookmarkTree(treeOf([]));
    render(<App initialSection="import" />);

    expect(await screen.findByText('浏览器中没有可导入的书签')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/搜索/)).toBeNull();
    expect(screen.queryByRole('button', { name: /导入选中/ })).toBeNull();
  });
});

describe('未登录时导入（feat03 场景4）', () => {
  it('不连接服务器直接落本地库，导入后「最近新增」立即可见（状态默认 Inbox）', async () => {
    // GIVEN 未登录任何服务器（fakeBrowser.reset() 后 storage 为空 → 默认设置 session=null）
    const settings = await loadSettings();
    expect(settings.session).toBeNull();
    expect(settings.activeServerUrl).toBeNull();

    mockBookmarkTree(
      treeOf([folder('f1', '研究', [leaf('b1', '离线收藏', 'https://offline.example/page')])]),
    );
    render(<App initialSection="import" />);

    fireEvent.click(await screen.findByLabelText(/离线收藏/));
    fireEvent.click(screen.getByRole('button', { name: /导入选中/ }));

    // THEN 反馈成功、记录落在本地库
    expect(await screen.findByText(/导入 1 条/)).toBeTruthy();
    const rows = await db.bookmarks.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.urlNormalized).toBe('https://offline.example/page');
    expect(rows[0]?.classification.status).toBe('inbox');

    // 「最近新增」立即可见，状态标签 Inbox
    fireEvent.click(screen.getByRole('button', { name: '最近新增' }));
    expect(await screen.findByText('离线收藏')).toBeTruthy();
    // 限定在收藏卡内断言（feat05 后筛选面板的状态候选 chips 也展示 Inbox，全页查询不再唯一）
    const card = screen.getByText('离线收藏').closest('.bcard');
    expect(card?.textContent).toContain('Inbox');
  });
});

describe('完整链路 smoke（T5：场景1 + 场景2）', () => {
  it('搜索 → 勾选 → 导入 → 最近新增出现新条目；同 URL 二次导入被跳过并提示', async () => {
    mockBookmarkTree(
      treeOf([
        folder('f1', '研究', [
          leaf('b1', 'World Models Survey', 'https://arxiv.org/abs/2401.00001'),
          leaf('b2', 'Dexie 文档', 'https://dexie.org/docs/'),
        ]),
      ]),
    );
    render(<App initialSection="import" />);

    // 搜索定位 → 勾选 → 导入
    fireEvent.change(await screen.findByPlaceholderText(/搜索/), { target: { value: 'world' } });
    fireEvent.click(await screen.findByLabelText(/World Models Survey/));
    fireEvent.click(screen.getByRole('button', { name: /导入选中/ }));
    expect(await screen.findByText(/导入 1 条/)).toBeTruthy();

    // 最近新增出现新条目
    fireEvent.click(screen.getByRole('button', { name: '最近新增' }));
    expect(await screen.findByText('World Models Survey')).toBeTruthy();

    // 回到导入：同一 URL（换标题换文件夹换参数）二次导入 → 被跳过并提示
    mockBookmarkTree(
      treeOf([
        folder('f2', '稍后再读', [
          leaf('c1', 'World Models（另一处收藏）', 'https://arxiv.org/abs/2401.00001?utm_source=x'),
        ]),
      ]),
    );
    fireEvent.click(screen.getByRole('button', { name: '导入已有书签' }));
    fireEvent.click(await screen.findByLabelText(/World Models（另一处收藏）/));
    fireEvent.click(screen.getByRole('button', { name: /导入选中/ }));

    expect(await screen.findByText(/已收藏过 1 条/)).toBeTruthy();
    expect(screen.getByText(/导入 0 条/)).toBeTruthy();
    expect((await db.bookmarks.toArray()).length).toBe(1);
  });
});
