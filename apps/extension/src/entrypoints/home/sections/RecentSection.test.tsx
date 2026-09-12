import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createBookmark, type Bookmark, type Session } from '@x-threadpick/shared';
import {
  currentLibrary,
  resetLibraryRuntime,
  writeLastSyncAt,
  type LibraryDB,
} from '../../../db/library';
import { recordServerLogin } from '../../../db/settings';
import { ensureBookmarkIcons } from '../../../db/icons';
import { iconPathFor, putResource } from '../../../db/resources';
import RecentSection from './RecentSection';

/** 挂载时的图标回填不打真实网络（task-card-brand-icon）；回填行为本身在 db/icons.test.ts 覆盖。 */
vi.mock('../../../db/icons', () => ({
  ensureBookmarkIcons: vi.fn(() => Promise.resolve(0)),
  resetIconAttempts: vi.fn(),
}));

let db: LibraryDB;

/** 相对时间与「今天」判定锚点；只 fake Date，保留真实计时器供 testing-library 使用。 */
const NOW = new Date('2026-09-11T12:00:00');
const DAY_MS = 86400000;
const S1 = 'https://s1.example:8443';

function sessionOf(email: string): Session {
  return { email, serverUrl: S1, token: 'tok-1', expiresAt: '2030-01-01T00:00:00.000Z' };
}

interface SeedInput {
  url: string;
  title: string;
  note?: string | null;
  daysAgo: number;
  topics?: string[];
  types?: string[];
  status?: string;
  iconUrl?: string;
}

/** 按给定天数偏移 createdAt/UpdatedAt 播种一条书签（收藏时间 = createdAt）。 */
async function seed(input: SeedInput): Promise<void> {
  const created = new Date(NOW.getTime() - input.daysAgo * DAY_MS);
  const bookmark: Bookmark = createBookmark(
    crypto.randomUUID(),
    { url: input.url, title: input.title, note: input.note ?? null },
    created,
  );
  bookmark.classification = {
    topics: input.topics ?? [],
    types: input.types ?? [],
    purposes: [],
    status: input.status ?? 'inbox',
  };
  if (input.iconUrl !== undefined) bookmark.iconUrl = input.iconUrl;
  await db.bookmarks.add(bookmark);
}

/** 登录账号并把当前账号库推到「上次同步于 syncAgo 天前」，模拟已同步过的库。 */
async function login(options: { email?: string; syncAgo?: number | null } = {}): Promise<void> {
  await recordServerLogin(S1, sessionOf(options.email ?? 'a@x.com'));
  db = await currentLibrary();
  if (options.syncAgo !== null) {
    await writeLastSyncAt(
      db,
      new Date(NOW.getTime() - (options.syncAgo ?? 1) * DAY_MS).toISOString(),
    );
  }
}

beforeEach(async () => {
  cleanup();
  fakeBrowser.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await resetLibraryRuntime();
  db = await currentLibrary();
  await db.bookmarks.clear();
  await db.taxonomies.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('「最近新增」默认展示（feat04 场景1）', () => {
  it('标题为「最近添加」，按收藏时间从新到旧展示最近 3 条，下方提示筛选文案', async () => {
    for (const item of [
      { url: 'https://a.example/1', title: '第一条', daysAgo: 0 },
      { url: 'https://b.example/2', title: '第二条', daysAgo: 1 },
      { url: 'https://c.example/3', title: '第三条', daysAgo: 2 },
      { url: 'https://d.example/4', title: '第四条', daysAgo: 3 },
      { url: 'https://e.example/5', title: '第五条', daysAgo: 4 },
    ]) {
      await seed(item);
    }
    const onNavigateImport = vi.fn();
    render(<RecentSection onNavigateImport={onNavigateImport} />);

    expect(await screen.findByText('第一条')).toBeTruthy();
    expect(screen.getByText('最近添加')).toBeTruthy();
    expect(screen.getByText(/选择上方标签开始按维度筛选/)).toBeTruthy();
    // 未选择任何筛选时不展开全部列表：只显示最近 3 张卡，且最新的三条
    const titles = Array.from(document.querySelectorAll('.bcard .btitle')).map(
      (el) => el.textContent ?? '',
    );
    expect(titles).toEqual(['第一条', '第二条', '第三条']);
  });

  it('卡片顺序从新到旧（乱序入库后仍按收藏时间排列）', async () => {
    await seed({ url: 'https://old.example', title: '旧的', daysAgo: 9 });
    await seed({ url: 'https://new.example', title: '新的', daysAgo: 0 });
    await seed({ url: 'https://mid.example', title: '中间的', daysAgo: 5 });

    render(<RecentSection onNavigateImport={vi.fn()} />);

    const titles = (await screen.findAllByText(/的$/)).map((el) => el.textContent ?? '');
    expect(titles).toEqual(['新的', '中间的', '旧的']);
  });
});

describe('相对时间边界（feat04 场景2 / T4）', () => {
  it('今天 / 昨天 / N 天前', async () => {
    await seed({ url: 'https://a.example/t', title: '今天条', daysAgo: 0 });
    await seed({ url: 'https://b.example/y', title: '昨天条', daysAgo: 1 });
    await seed({ url: 'https://c.example/n', title: 'N天条', daysAgo: 2 });

    render(<RecentSection onNavigateImport={vi.fn()} />);

    // 品牌卡（task-card-brand-icon）：域名在品牌行、时间在 meta 行，同卡各自存在
    await screen.findByText('今天条');
    const cards = Array.from(document.querySelectorAll('.bcard'));
    const byDomain = (d: string) =>
      cards.find((c) => c.querySelector('.bdomain')?.textContent === d);
    expect(byDomain('a.example')?.querySelector('.bmeta')?.textContent).toContain('今天');
    expect(byDomain('b.example')?.querySelector('.bmeta')?.textContent).toContain('昨天');
    expect(byDomain('c.example')?.querySelector('.bmeta')?.textContent).toContain('2 天前');
  });

  it('跨月的日期按自然日差计算（8月31日收藏 → 2 天前）', async () => {
    await seed({ url: 'https://m.example/x', title: '跨月条', daysAgo: 2 });

    render(<RecentSection onNavigateImport={vi.fn()} />);

    const card = await screen.findByRole('link');
    expect(card.querySelector('.bdomain')?.textContent).toBe('m.example');
    expect(card.querySelector('.bmeta')?.textContent).toContain('2 天前');
  });
});

describe('每条收藏的展示内容（feat04 场景2）', () => {
  it('品牌卡：小图标（无图标时小首字母色块）+ 域名行、标题、时间、理由与分类标签', async () => {
    await seed({
      url: 'https://github.com/x/worlddreamer',
      title: 'WorldDreamer: Interactive World Models',
      note: '重点看 action → next state 的设计',
      daysAgo: 2,
      topics: ['世界模型', 'AI'],
      types: ['GitHub 仓库'],
      status: 'reading',
    });

    render(<RecentSection onNavigateImport={vi.fn()} />);

    const card = await screen.findByRole('link');
    expect(card.textContent).toContain('WorldDreamer: Interactive World Models');
    expect(card.textContent).toContain('github.com');
    expect(card.textContent).toContain('2 天前');
    expect(card.textContent).toContain('重点看 action → next state 的设计');
    // 分类标签：主题 + 形态取值，与状态取值
    expect(card.textContent).toContain('世界模型');
    expect(card.textContent).toContain('AI');
    expect(card.textContent).toContain('GitHub 仓库');
    expect(card.textContent).toContain('Reading'); // 状态存小写，展示首字母大写
    // 品牌卡（task-card-brand-icon）：无图标时小首字母色块 + 域名行，无大色块 .thumb
    expect(card.querySelector('.thumb')).toBeNull();
    const tile = card.querySelector('.brandtile');
    expect(tile?.textContent).toBe('W');
    expect(tile?.className).toMatch(/g[1-6]/);
    expect(card.querySelector('.bdomain')?.textContent).toBe('github.com');
  });

  it('有 iconUrl 的收藏卡片渲染站点图标 img，不出首字母色块', async () => {
    await seed({
      url: 'https://kimi.com/en',
      title: 'Kimi',
      daysAgo: 0,
      iconUrl: 'https://kimi.com/icon.png',
    });

    render(<RecentSection onNavigateImport={vi.fn()} />);

    const card = await screen.findByRole('link');
    const icon = card.querySelector<HTMLImageElement>('img.brandicon');
    expect(icon?.getAttribute('src')).toBe('https://kimi.com/icon.png');
    expect(card.querySelector('.brandtile')).toBeNull();
    expect(card.querySelector('.bdomain')?.textContent).toBe('kimi.com');
  });

  it('本地资源库有图标本体时优先用 data URL，不用远程地址（task-card-icon-resource）', async () => {
    await seed({
      url: 'https://kimi.com/en',
      title: 'Kimi',
      daysAgo: 0,
      iconUrl: 'https://kimi.com/icon.png',
    });
    await putResource(iconPathFor('https://kimi.com/en'), 'data:image/png;base64,AAA');

    render(<RecentSection onNavigateImport={vi.fn()} />);

    const card = await screen.findByRole('link');
    await waitFor(() => {
      expect(card.querySelector('img.brandicon')?.getAttribute('src')).toBe(
        'data:image/png;base64,AAA',
      );
    });
  });

  it('图标加载失败时退回小首字母色块（onError 兜底）', async () => {
    await seed({
      url: 'https://kimi.com/en',
      title: 'Kimi',
      daysAgo: 0,
      iconUrl: 'https://kimi.com/broken.png',
    });

    render(<RecentSection onNavigateImport={vi.fn()} />);

    const card = await screen.findByRole('link');
    const icon = card.querySelector<HTMLImageElement>('img.brandicon');
    if (icon === null) throw new Error('品牌图标未渲染');
    fireEvent.error(icon);
    expect(card.querySelector('img.brandicon')).toBeNull();
    expect(card.querySelector('.brandtile')?.textContent).toBe('K');
  });

  it('打开视图时触发一轮图标回填（已有收藏自动补取）', async () => {
    await seed({ url: 'https://a.example/t', title: '一条', daysAgo: 0 });

    render(<RecentSection onNavigateImport={vi.fn()} />);

    await screen.findByText('一条');
    expect(ensureBookmarkIcons).toHaveBeenCalled();
  });

  it('标题为空时回退展示网址，小色块取网址首字母', async () => {
    await seed({ url: 'https://bare.example/only-url', title: '', daysAgo: 0 });

    render(<RecentSection onNavigateImport={vi.fn()} />);

    const card = await screen.findByRole('link');
    expect(card.textContent).toContain('https://bare.example/only-url');
    expect(card.querySelector('.brandtile')?.textContent).toBe('H');
  });

  it('理由为空的收藏不显示理由区域', async () => {
    await seed({ url: 'https://a.example/no-note', title: '无理由', daysAgo: 0, note: null });
    await seed({
      url: 'https://b.example/with-note',
      title: '有理由',
      daysAgo: 1,
      note: '理由内容',
    });

    render(<RecentSection onNavigateImport={vi.fn()} />);

    await screen.findByText('有理由');
    const cards = document.querySelectorAll('.bcard');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.querySelector('.bnote')).toBeNull(); // 无理由 → 不渲染理由区域
    expect(cards[1]?.querySelector('.bnote')?.textContent).toContain('理由内容');
  });
});

describe('空收藏库（feat04 场景3）', () => {
  it('显示空状态提示，并提供去「导入已有书签」的引导入口', async () => {
    const onNavigateImport = vi.fn();
    render(<RecentSection onNavigateImport={onNavigateImport} />);

    expect(await screen.findByText(/收藏库还是空的/)).toBeTruthy();
    const guide = screen.getByRole('button', { name: /导入已有书签/ });
    fireEvent.click(guide);
    expect(onNavigateImport).toHaveBeenCalledOnce();
    // 空库不渲染任何收藏卡
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});

describe('打开原网页（feat04 场景4）', () => {
  it('点击卡片在新标签页打开该收藏的原网址', async () => {
    await seed({ url: 'https://open.example/target', title: '目标页', daysAgo: 0 });

    render(<RecentSection onNavigateImport={vi.fn()} />);

    const link = await screen.findByRole('link');
    expect(link.getAttribute('href')).toBe('https://open.example/target');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});

describe('四维筛选集成（feat05 场景1）', () => {
  it('选中主题「AI」后标题变「筛选结果 · N 条命中」，结果按收藏时间新到旧', async () => {
    await seed({ url: 'https://a.example/1', title: '甲条', daysAgo: 0, topics: ['AI'] });
    await seed({ url: 'https://b.example/2', title: '乙条', daysAgo: 1, topics: ['世界模型'] });
    await seed({
      url: 'https://c.example/3',
      title: '丙条',
      daysAgo: 2,
      topics: ['AI', '世界模型'],
    });
    await seed({ url: 'https://d.example/4', title: '丁条', daysAgo: 3 }); // 无主题

    render(<RecentSection onNavigateImport={vi.fn()} />);
    await screen.findByText('甲条');

    // 主题「AI」与「世界模型」都在默认 taxonomy 候选里；选「AI」→ 甲、丙命中
    fireEvent.click(screen.getByRole('button', { name: /^AI/ }));
    expect(await screen.findByText('筛选结果 · 2 条命中')).toBeTruthy();
    expect(screen.queryByText('最近添加')).toBeNull();
    expect(screen.queryByText(/选择上方标签开始按维度筛选/)).toBeNull(); // 筛选态不再显示默认 hint
    const titles = Array.from(document.querySelectorAll('.bcard .btitle')).map(
      (el) => el.textContent ?? '',
    );
    expect(titles).toEqual(['甲条', '丙条']); // 收藏时间新到旧（0 天前 → 2 天前）
  });

  it('无筛选时不显示「清除全部筛选」，有筛选时出现', async () => {
    await seed({ url: 'https://a.example/1', title: '甲条', daysAgo: 0, topics: ['AI'] });

    render(<RecentSection onNavigateImport={vi.fn()} />);
    await screen.findByText('甲条');
    expect(screen.queryByRole('button', { name: '清除全部筛选' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^AI/ }));
    expect(await screen.findByRole('button', { name: '清除全部筛选' })).toBeTruthy();
  });
});

describe('状态筛选集成（feat05 场景3）', () => {
  it('点状态「Reading」命中 reading 条；再点「Done」仅替换为 Done', async () => {
    await seed({ url: 'https://r.example/1', title: '在读条', daysAgo: 0, status: 'reading' });
    await seed({ url: 'https://i.example/2', title: '新条', daysAgo: 1, status: 'inbox' });
    await seed({ url: 'https://d.example/3', title: '完成条', daysAgo: 2, status: 'done' });

    render(<RecentSection onNavigateImport={vi.fn()} />);
    await screen.findByText('在读条');

    fireEvent.click(screen.getByRole('button', { name: /^Reading/ }));
    expect(await screen.findByText('筛选结果 · 1 条命中')).toBeTruthy();
    expect(screen.getByText('在读条')).toBeTruthy();
    expect(screen.queryByText('新条')).toBeNull();

    // 点选即替换：Reading → Done，不能同时选中两个状态
    fireEvent.click(screen.getByRole('button', { name: /^Done/ }));
    expect(await screen.findByText('完成条')).toBeTruthy();
    expect(screen.queryByText('在读条')).toBeNull();

    // 再点一次 Done 取消该条件，回到默认视图
    fireEvent.click(screen.getByRole('button', { name: /^Done/ }));
    expect(await screen.findByText('最近添加')).toBeTruthy();
  });
});

describe('主题「全部满足」切换集成（feat05 场景4）', () => {
  it('默认满足任一：单主题条也命中；切「全部满足」后只剩同时标两主题的条', async () => {
    await seed({ url: 'https://only.example/1', title: '单主题条', daysAgo: 1, topics: ['AI'] });
    await seed({
      url: 'https://both.example/2',
      title: '双主题条',
      daysAgo: 0,
      topics: ['AI', '世界模型'],
    });

    render(<RecentSection onNavigateImport={vi.fn()} />);
    await screen.findByText('双主题条');

    fireEvent.click(screen.getByRole('button', { name: /^AI/ }));
    fireEvent.click(screen.getByRole('button', { name: /^世界模型/ }));
    expect(await screen.findByText('筛选结果 · 2 条命中')).toBeTruthy(); // 任一命中

    fireEvent.click(screen.getByRole('button', { name: '全部满足' }));
    expect(await screen.findByText('筛选结果 · 1 条命中')).toBeTruthy();
    const titles = Array.from(document.querySelectorAll('.bcard .btitle')).map(
      (el) => el.textContent ?? '',
    );
    expect(titles).toEqual(['双主题条']);

    fireEvent.click(screen.getByRole('button', { name: '满足任一' }));
    expect(await screen.findByText('筛选结果 · 2 条命中')).toBeTruthy();
  });
});

describe('取消单个条件与清除全部（feat05 场景6）', () => {
  it('再点一次「AI」仅取消该条件，形态「论文」保持；清除全部后回到默认视图', async () => {
    await seed({
      url: 'https://a.example/1',
      title: '甲条',
      daysAgo: 0,
      topics: ['AI'],
      types: ['论文'],
    });
    await seed({
      url: 'https://c.example/2',
      title: '丙条',
      daysAgo: 2,
      topics: ['AI'],
      types: ['GitHub 仓库'],
    });
    await seed({
      url: 'https://e.example/3',
      title: '戊条',
      daysAgo: 4,
      topics: ['世界模型'],
      types: ['论文'],
    });

    render(<RecentSection onNavigateImport={vi.fn()} />);
    await screen.findByText('甲条');

    fireEvent.click(screen.getByRole('button', { name: /^AI/ }));
    fireEvent.click(screen.getByRole('button', { name: /^论文/ }));
    expect(await screen.findByText('筛选结果 · 1 条命中')).toBeTruthy(); // 仅甲（AI 且 论文）

    // 再点「AI」：仅取消该条件，论文保持 → 甲、戊命中
    fireEvent.click(screen.getByRole('button', { name: /^AI/ }));
    expect(await screen.findByText('筛选结果 · 2 条命中')).toBeTruthy();
    let titles = Array.from(document.querySelectorAll('.bcard .btitle')).map(
      (el) => el.textContent ?? '',
    );
    expect(titles).toEqual(['甲条', '戊条']);

    // 清除全部筛选 → 回到默认「最近添加」视图（最近 3 条 + hint）
    fireEvent.click(screen.getByRole('button', { name: '清除全部筛选' }));
    expect(await screen.findByText('最近添加')).toBeTruthy();
    expect(screen.getByText(/选择上方标签开始按维度筛选/)).toBeTruthy();
    titles = Array.from(document.querySelectorAll('.bcard .btitle')).map(
      (el) => el.textContent ?? '',
    );
    expect(titles).toEqual(['甲条', '丙条', '戊条']);
  });

  it('候选计数按其他维度条件动态显示（场景5 联动）', async () => {
    await seed({
      url: 'https://a.example/1',
      title: '甲条',
      daysAgo: 0,
      topics: ['AI'],
      types: ['论文'],
    });
    await seed({
      url: 'https://c.example/2',
      title: '丙条',
      daysAgo: 2,
      topics: ['AI', '世界模型'],
      types: ['GitHub 仓库'],
    });

    render(<RecentSection onNavigateImport={vi.fn()} />);
    await screen.findByText('甲条');

    fireEvent.click(screen.getByRole('button', { name: /^论文/ }));
    await screen.findByText('筛选结果 · 1 条命中');
    // 形态=论文前提下：AI=1（甲）、世界模型=0（丙是 GitHub 仓库，计 0 仍显示）
    expect(
      screen.getByRole('button', { name: /^AI/ }).querySelector('.fchip-count')?.textContent,
    ).toBe('1');
    const worldChip = screen.getByRole('button', { name: /^世界模型/ });
    expect(worldChip.querySelector('.fchip-count')?.textContent).toBe('0'); // 计 0 仍显示且不消失
  });
});

describe('无命中空态（feat05 场景7）', () => {
  it('组合无命中时显示提示文案；已选条件保持可见、可撤销，不自动清除', async () => {
    await seed({
      url: 'https://a.example/1',
      title: '甲条',
      daysAgo: 0,
      topics: ['AI'],
      types: ['论文'],
    });

    render(<RecentSection onNavigateImport={vi.fn()} />);
    await screen.findByText('甲条');

    // 主题「AI」+ 形态「GitHub 仓库」：甲不满足 GitHub 仓库 → 0 命中
    fireEvent.click(screen.getByRole('button', { name: /^AI/ }));
    fireEvent.click(screen.getByRole('button', { name: /^GitHub 仓库/ }));

    expect(await screen.findByText('没有同时满足这些条件的收藏，试试减少一个维度。')).toBeTruthy();
    expect(screen.getByText('筛选结果 · 0 条命中')).toBeTruthy();
    expect(screen.queryByText('甲条')).toBeNull(); // 不显示列表
    // 已选条件保持可见（chips 仍按下）且未被自动清除
    expect(screen.getByRole('button', { name: /^AI/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^GitHub 仓库/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    // 可撤销：点掉「GitHub 仓库」后恢复命中
    fireEvent.click(screen.getByRole('button', { name: /^GitHub 仓库/ }));
    expect(await screen.findByText('甲条')).toBeTruthy();
    expect(screen.getByText('筛选结果 · 1 条命中')).toBeTruthy();
  });
});

describe('搜索收藏：搜到结果（feat06 场景1）', () => {
  it('搜索框位于筛选区上方；输入「action」命中理由含关键词的收藏并显示命中条数', async () => {
    await seed({
      url: 'https://a.example/1',
      title: '甲条',
      note: '重点看 action → next state 的设计',
      daysAgo: 1,
    });
    await seed({ url: 'https://b.example/2', title: '乙条', daysAgo: 0 });

    render(<RecentSection onNavigateImport={vi.fn()} />);
    await screen.findByText('甲条');

    // 搜索框位于「最近新增」视图筛选区上方
    const searchbox = document.querySelector('.searchbox');
    const filters = document.querySelector('.filters');
    expect(searchbox).toBeTruthy();
    expect(
      searchbox !== null && filters !== null
        ? (searchbox.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        : false,
    ).toBe(true);

    fireEvent.change(screen.getByRole('textbox', { name: '搜索收藏' }), {
      target: { value: 'action' },
    });
    expect(await screen.findByText('1 条结果')).toBeTruthy();
    expect(screen.getByText('甲条')).toBeTruthy();
    expect(screen.queryByText('乙条')).toBeNull(); // 未命中不显示
  });

  it('域名包含关键词同样命中；多条命中按收藏时间从新到旧排列', async () => {
    await seed({ url: 'https://github.com/x/old', title: '旧仓库条', daysAgo: 5 });
    await seed({ url: 'https://github.com/x/new', title: '新仓库条', daysAgo: 0 });
    await seed({ url: 'https://gitlab.example/x', title: '无关条', daysAgo: 2 });

    render(<RecentSection onNavigateImport={vi.fn()} />);
    await screen.findByText('新仓库条');

    fireEvent.change(screen.getByRole('textbox', { name: '搜索收藏' }), {
      target: { value: 'github' },
    });
    expect(await screen.findByText('2 条结果')).toBeTruthy();
    const titles = Array.from(document.querySelectorAll('.bcard .btitle')).map(
      (el) => el.textContent ?? '',
    );
    expect(titles).toEqual(['新仓库条', '旧仓库条']); // 收藏时间新到旧
    expect(screen.queryByText('无关条')).toBeNull();
  });
});

describe('搜索没有匹配（feat06 场景2）', () => {
  it('搜索「量子」显示「没有找到相关收藏」空状态，不显示列表', async () => {
    await seed({ url: 'https://a.example/1', title: '甲条', daysAgo: 0 });

    render(<RecentSection onNavigateImport={vi.fn()} />);
    await screen.findByText('甲条');

    fireEvent.change(screen.getByRole('textbox', { name: '搜索收藏' }), {
      target: { value: '量子' },
    });
    expect(await screen.findByText('没有找到相关收藏')).toBeTruthy();
    expect(document.querySelectorAll('.bcard')).toHaveLength(0); // 不显示列表
    expect(screen.queryByText('甲条')).toBeNull();
    expect(screen.queryByText(/选择上方标签开始按维度筛选/)).toBeNull(); // 搜索态不显示默认 hint
  });
});

describe('搜索与筛选叠加（feat06 场景3 UI 集成）', () => {
  it('选中形态「论文」再搜「世界模型」只显示交集；清空搜索框回到仅按筛选显示', async () => {
    await seed({
      url: 'https://a.example/1',
      title: '世界模型论文',
      daysAgo: 2,
      types: ['论文'],
    });
    await seed({
      url: 'https://b.example/2',
      title: '世界模型视频',
      daysAgo: 1,
      types: ['视频'],
    });
    await seed({
      url: 'https://c.example/3',
      title: '别的论文',
      daysAgo: 0,
      types: ['论文'],
    });

    render(<RecentSection onNavigateImport={vi.fn()} />);
    await screen.findByText('世界模型论文');

    fireEvent.click(screen.getByRole('button', { name: /^论文/ }));
    expect(await screen.findByText('筛选结果 · 2 条命中')).toBeTruthy(); // 论文：世界模型论文 + 别的论文

    fireEvent.change(screen.getByRole('textbox', { name: '搜索收藏' }), {
      target: { value: '世界模型' },
    });
    expect(await screen.findByText('1 条结果')).toBeTruthy(); // 交集：仅「世界模型论文」
    expect(screen.getByText('世界模型论文')).toBeTruthy();
    expect(screen.queryByText('世界模型视频')).toBeNull();
    expect(screen.queryByText('别的论文')).toBeNull();

    // 清空搜索框 → 回到仅按筛选显示（论文 2 条：被搜索挡掉的「别的论文」回来；
    // 「世界模型视频」不满足论文筛选，仍不显示）
    fireEvent.change(screen.getByRole('textbox', { name: '搜索收藏' }), {
      target: { value: '' },
    });
    expect(await screen.findByText('别的论文')).toBeTruthy();
    expect(screen.getByText('世界模型论文')).toBeTruthy();
    expect(screen.queryByText('世界模型视频')).toBeNull();
    expect(screen.getByText('筛选结果 · 2 条命中')).toBeTruthy();
  });

  it('「清除全部筛选」把搜索词一并清空，回到默认「最近添加」视图', async () => {
    await seed({ url: 'https://a.example/1', title: '甲条', daysAgo: 0, topics: ['AI'] });
    await seed({ url: 'https://b.example/2', title: '乙条', daysAgo: 1 });

    render(<RecentSection onNavigateImport={vi.fn()} />);
    await screen.findByText('甲条');

    fireEvent.click(screen.getByRole('button', { name: /^AI/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '搜索收藏' }), {
      target: { value: '甲' },
    });
    expect(await screen.findByText('1 条结果')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '清除全部筛选' }));
    expect(await screen.findByText('最近添加')).toBeTruthy();
    expect(screen.getByText(/选择上方标签开始按维度筛选/)).toBeTruthy();
    const searchInput = screen.getByRole('textbox', { name: '搜索收藏' });
    if (!(searchInput instanceof HTMLInputElement)) throw new Error('搜索框应为 input 元素');
    expect(searchInput.value).toBe('');
  });
});

describe('「全部收藏」视图（feat07）', () => {
  it('默认展示全部收藏（不截 3 条），标题「全部收藏」，无「最近 3 条」提示（场景1）', async () => {
    for (const item of [
      { url: 'https://a.example/1', title: '第一条', daysAgo: 0 },
      { url: 'https://b.example/2', title: '第二条', daysAgo: 1 },
      { url: 'https://c.example/3', title: '第三条', daysAgo: 2 },
      { url: 'https://d.example/4', title: '第四条', daysAgo: 3 },
      { url: 'https://e.example/5', title: '第五条', daysAgo: 4 },
    ]) {
      await seed(item);
    }
    render(<RecentSection variant="library" onNavigateImport={vi.fn()} />);

    expect(await screen.findByText('全部收藏')).toBeTruthy();
    expect(screen.queryByText('最近添加')).toBeNull();
    expect(screen.queryByText(/选择上方标签开始按维度筛选/)).toBeNull();
    const titles = Array.from(document.querySelectorAll('.bcard .btitle')).map(
      (el) => el.textContent ?? '',
    );
    expect(titles).toEqual(['第一条', '第二条', '第三条', '第四条', '第五条']); // 全部 5 条，新到旧
  });

  it('筛选与搜索行为与「最近新增」一致（场景2）', async () => {
    await seed({ url: 'https://a.example/1', title: '甲条', daysAgo: 0, topics: ['AI'] });
    await seed({ url: 'https://b.example/2', title: '乙条', daysAgo: 1, topics: ['世界模型'] });
    await seed({ url: 'https://c.example/3', title: '丙条', daysAgo: 2, topics: ['AI'] });

    render(<RecentSection variant="library" onNavigateImport={vi.fn()} />);
    await screen.findByText('甲条');

    fireEvent.click(screen.getByRole('button', { name: /^AI/ }));
    expect(await screen.findByText('筛选结果 · 2 条命中')).toBeTruthy();
    expect(screen.getByRole('button', { name: '清除全部筛选' })).toBeTruthy();

    // 搜索叠加：AI 前提下标题含「甲」仅 1 条
    fireEvent.change(screen.getByRole('textbox', { name: '搜索收藏' }), {
      target: { value: '甲' },
    });
    expect(await screen.findByText('1 条结果')).toBeTruthy();
    expect(screen.queryByText('乙条')).toBeNull();

    // 清除全部筛选 → 回到「全部收藏」默认视图（仍全量 3 条，不回到截断态）
    fireEvent.click(screen.getByRole('button', { name: '清除全部筛选' }));
    expect(await screen.findByText('全部收藏')).toBeTruthy();
    expect(screen.getByText('乙条')).toBeTruthy();
  });

  it('空收藏库显示空态提示与去导入引导（场景3）', async () => {
    const onNavigateImport = vi.fn();
    render(<RecentSection variant="library" onNavigateImport={onNavigateImport} />);

    expect(await screen.findByText(/收藏库还是空的/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /导入已有书签/ }));
    expect(onNavigateImport).toHaveBeenCalledOnce();
  });
});

describe('页头：大标题 + 副标题（task-home-layout）', () => {
  it('「全部收藏」页头含大标题与副标题「把收藏变成可再次遇见的线索。」', async () => {
    await seed({ url: 'https://a.example/1', title: '甲条', daysAgo: 0 });
    render(<RecentSection variant="library" onNavigateImport={vi.fn()} />);

    await screen.findByText('甲条');
    const head = document.querySelector('.page-head');
    expect(head).not.toBeNull();
    expect(head?.querySelector('.page-title')?.textContent).toBe('全部收藏');
    expect(head?.querySelector('.page-tagline')?.textContent).toBe('把收藏变成可再次遇见的线索。');
  });

  it('「最近新增」页头含大标题「最近添加」与一句副标题', async () => {
    await seed({ url: 'https://a.example/1', title: '甲条', daysAgo: 0 });
    render(<RecentSection onNavigateImport={vi.fn()} />);

    await screen.findByText('甲条');
    const head = document.querySelector('.page-head');
    expect(head?.querySelector('.page-title')?.textContent).toBe('最近添加');
    expect(head?.querySelector('.page-tagline')?.textContent ?? '').not.toBe('');
  });
});

describe('云朵同步标记（sync-archive feat03）', () => {
  it('已同步：来源信息行末尾低对比度云朵，悬停显示「已同步 · <账号邮箱>」（场景1）', async () => {
    await login({ email: 'a@x.com', syncAgo: 1 }); // 上次同步于 1 天前
    await seed({ url: 'https://a.example/1', title: '旧收藏', daysAgo: 3 }); // 收藏早于上次同步
    render(<RecentSection onNavigateImport={vi.fn()} />);

    await screen.findByText('旧收藏');
    const meta = document.querySelector('.bcard .bmeta');
    expect(meta).not.toBeNull();
    const cloud = meta?.querySelector('.sync-cloud');
    expect(cloud).not.toBeNull();
    expect(cloud?.className).toContain('synced');
    expect(cloud?.getAttribute('title')).toBe('已同步 · a@x.com');
    // 云朵在来源信息行末尾（域名 · 时间之后）
    expect((meta?.textContent ?? '').indexOf('a.example')).toBeLessThan(
      (meta?.textContent ?? '').indexOf('☁'),
    );
  });

  it('待同步：云朵以醒目待同步样式显示，与已同步样式明显区分（场景2）', async () => {
    await login({ syncAgo: 2 }); // 上次同步于 2 天前
    await seed({ url: 'https://a.example/1', title: '刚收藏', daysAgo: 0 }); // 收藏晚于上次同步
    render(<RecentSection onNavigateImport={vi.fn()} />);

    await screen.findByText('刚收藏');
    const cloud = document.querySelector('.bcard .bmeta .sync-cloud');
    expect(cloud).not.toBeNull();
    expect(cloud?.className).toContain('pending');
    expect(cloud?.className).not.toContain('synced');
  });

  it('未登录：卡片上不出现任何同步标记（场景4）', async () => {
    await seed({ url: 'https://a.example/1', title: '甲条', daysAgo: 0 });
    render(<RecentSection onNavigateImport={vi.fn()} />);

    await screen.findByText('甲条');
    expect(document.querySelector('.sync-cloud')).toBeNull();
  });
});

describe('收藏页头汇总行（sync-archive feat04）', () => {
  it('已登录且全部同步：「N 条收藏 · 已全部同步」（场景1）', async () => {
    await login({ syncAgo: 5 });
    await seed({ url: 'https://a.example/1', title: '甲条', daysAgo: 7 });
    await seed({ url: 'https://b.example/2', title: '乙条', daysAgo: 8 });
    render(<RecentSection variant="library" onNavigateImport={vi.fn()} />);

    await screen.findByText('甲条');
    expect(screen.getByText('2 条收藏 · 已全部同步')).toBeTruthy();
  });

  it('已登录且部分待同步：「N 条收藏 · M 条待同步」（场景2）', async () => {
    await login({ syncAgo: 5 });
    await seed({ url: 'https://a.example/1', title: '甲条', daysAgo: 7 }); // 已同步
    await seed({ url: 'https://b.example/2', title: '乙条', daysAgo: 3 }); // 待同步
    await seed({ url: 'https://c.example/3', title: '丙条', daysAgo: 2 }); // 待同步
    await seed({ url: 'https://d.example/4', title: '丁条', daysAgo: 1 }); // 待同步
    render(<RecentSection variant="library" onNavigateImport={vi.fn()} />);

    await screen.findByText('甲条');
    expect(screen.getByText('4 条收藏 · 3 条待同步')).toBeTruthy();
  });

  it('未登录：只显示「N 条收藏」，不出现任何同步相关文字（场景3）', async () => {
    await seed({ url: 'https://a.example/1', title: '甲条', daysAgo: 0 });
    await seed({ url: 'https://b.example/2', title: '乙条', daysAgo: 1 });
    render(<RecentSection variant="library" onNavigateImport={vi.fn()} />);

    await screen.findByText('甲条');
    expect(screen.getByText('2 条收藏')).toBeTruthy();
    const summary = document.querySelector('.page-summary');
    expect(summary?.textContent ?? '').not.toContain('同步');
  });

  it('收藏库为空：沿用现有空态，不显示汇总行（场景4）', async () => {
    await login({ syncAgo: 1 });
    render(<RecentSection variant="library" onNavigateImport={vi.fn()} />);

    expect(await screen.findByText(/收藏库还是空的/)).toBeTruthy();
    expect(document.querySelector('.page-summary')).toBeNull();
  });

  it('筛选与搜索时不改变汇总行：始终按整库口径统计', async () => {
    await login({ syncAgo: 5 });
    await seed({ url: 'https://a.example/1', title: '甲条', daysAgo: 7, topics: ['AI'] });
    await seed({ url: 'https://b.example/2', title: '乙条', daysAgo: 3 });
    render(<RecentSection variant="library" onNavigateImport={vi.fn()} />);

    await screen.findByText('甲条');
    fireEvent.click(screen.getByRole('button', { name: /^AI/ }));
    expect(await screen.findByText('筛选结果 · 1 条命中')).toBeTruthy();
    expect(screen.getByText('2 条收藏 · 1 条待同步')).toBeTruthy(); // 整库口径不随命中数变化
  });
});

describe('同步状态免刷新翻转（sync-archive feat03 场景3/场景5）', () => {
  it('后台同步完成（另一上下文写当前库 lastSyncAt）：云朵与汇总行即时翻转，无需刷新（场景3）', async () => {
    await login({ syncAgo: 2 }); // 上次同步于 2 天前
    await seed({ url: 'https://a.example/1', title: '刚收藏', daysAgo: 0 });
    render(<RecentSection onNavigateImport={vi.fn()} />);

    // 初始：待同步样式 + 汇总行报待同步
    const cloud = await screen.findByTitle('待同步');
    expect(cloud.className).toContain('pending');
    expect(screen.getByText('1 条收藏 · 1 条待同步')).toBeTruthy();

    // 自动同步在后台完成：写当前库 lastSyncAt = 现在（用户没有刷新页面）
    await writeLastSyncAt(db, NOW.toISOString());

    // 云朵翻转为已同步，汇总行即时更新
    const flipped = await screen.findByTitle('已同步 · a@x.com');
    expect(flipped.className).toContain('synced');
    expect(screen.getByText('1 条收藏 · 已全部同步')).toBeTruthy();
  });

  it('同步失败（lastSyncAt 不推进）：云朵保持待同步样式，不误报已同步（场景5）', async () => {
    await login({ syncAgo: 2 });
    await seed({ url: 'https://a.example/1', title: '刚收藏', daysAgo: 0 });
    render(<RecentSection onNavigateImport={vi.fn()} />);

    await screen.findByTitle('待同步');
    // 模拟一次失败的同步尝试：服务器不可达，本地只有无关写入（lastSyncAt 不动）
    await db.meta.put({ key: 'unrelated', value: 'x' });
    await new Promise((resolve) => setTimeout(resolve, 30)); // 真实计时器：给任何误订阅留触发窗口

    expect(screen.getByTitle('待同步')).toBeTruthy();
    expect(screen.queryByTitle(/已同步/)).toBeNull();
    expect(screen.getByText('1 条收藏 · 1 条待同步')).toBeTruthy();
  });

  it('未登录：不建立 lastSyncAt 订阅，default 库写入不产生同步元素（feat01 场景1）', async () => {
    await seed({ url: 'https://a.example/1', title: '甲条', daysAgo: 0 });
    render(<RecentSection onNavigateImport={vi.fn()} />);

    await screen.findByText('甲条');
    await db.meta.put({ key: 'lastSyncAt', value: NOW.toISOString() });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(document.querySelector('.sync-cloud')).toBeNull();
    expect(screen.getByText('1 条收藏')).toBeTruthy(); // 未登录汇总行永远只有条数
  });
});

describe('按「待同步」筛选（sync-archive feat06）', () => {
  it('点击「待同步」：列表只剩待同步条目，标题「筛选结果 · N 条命中」，可一键清除（场景1）', async () => {
    await login({ syncAgo: 5 });
    await seed({ url: 'https://a.example/1', title: '旧甲', daysAgo: 7 }); // 已同步
    await seed({ url: 'https://b.example/2', title: '新乙', daysAgo: 3 }); // 待同步
    await seed({ url: 'https://c.example/3', title: '新丙', daysAgo: 1 }); // 待同步
    render(<RecentSection variant="library" onNavigateImport={vi.fn()} />);

    await screen.findByText('旧甲');
    fireEvent.click(screen.getByRole('button', { name: '待同步' }));

    expect(await screen.findByText('筛选结果 · 2 条命中')).toBeTruthy();
    const titles = Array.from(document.querySelectorAll('.bcard .btitle')).map(
      (el) => el.textContent ?? '',
    );
    expect(titles).toEqual(['新丙', '新乙']); // 收藏时间新到旧
    expect(screen.queryByText('旧甲')).toBeNull();
    // 复用清除交互
    fireEvent.click(screen.getByRole('button', { name: '清除全部筛选' }));
    expect(await screen.findByText('全部收藏')).toBeTruthy();
    expect(screen.getByText('旧甲')).toBeTruthy();
  });

  it('全部已同步时点击「待同步」：空态「没有待同步的收藏，一切都已在服务器上」（场景2）', async () => {
    await login({ syncAgo: 1 });
    await seed({ url: 'https://a.example/1', title: '旧甲', daysAgo: 3 }); // 早于上次同步
    render(<RecentSection variant="library" onNavigateImport={vi.fn()} />);

    await screen.findByText('旧甲');
    fireEvent.click(screen.getByRole('button', { name: '待同步' }));

    expect(await screen.findByText('没有待同步的收藏，一切都已在服务器上')).toBeTruthy();
    expect(document.querySelectorAll('.bcard')).toHaveLength(0);
    expect(screen.getByText('筛选结果 · 0 条命中')).toBeTruthy();
  });

  it('未登录：筛选区不出现「待同步」入口（场景3）', async () => {
    await seed({ url: 'https://a.example/1', title: '甲条', daysAgo: 0 });
    render(<RecentSection variant="library" onNavigateImport={vi.fn()} />);

    await screen.findByText('甲条');
    expect(screen.queryByRole('button', { name: '待同步' })).toBeNull();
  });
});
