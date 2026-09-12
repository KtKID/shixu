import { describe, expect, it } from 'vitest';
import { createBookmark, type Bookmark } from '@x-threadpick/shared';
import {
  applyFilter,
  countFacetValues,
  emptyFilter,
  hasActiveFilter,
  matchesFilter,
  matchesQuery,
  toggleFilterValue,
  type FilterSelection,
} from './bookmark-filter';

/** 播种一条书签：分类四维 + 收藏时间（createdAt）可控，其余走 schema 默认形状。 */
function make(
  id: string,
  input: {
    url?: string;
    title?: string;
    note?: string | null;
    topics?: string[];
    types?: string[];
    purposes?: string[];
    status?: string;
    createdAt: string;
  },
): Bookmark {
  const bookmark = createBookmark(
    crypto.randomUUID(),
    {
      url: input.url ?? `https://${id}.example/page`,
      title: input.title ?? id,
      note: input.note ?? null,
    },
    new Date(input.createdAt),
  );
  bookmark.classification = {
    topics: input.topics ?? [],
    types: input.types ?? [],
    purposes: input.purposes ?? [],
    status: input.status ?? 'inbox',
  };
  return bookmark;
}

function selection(partial: Partial<FilterSelection>): FilterSelection {
  return { ...emptyFilter(), ...partial };
}

describe('feat05 场景1：同维度多选取「或」，结果按收藏时间新到旧', () => {
  it('主题同时选中「AI」和「世界模型」时，标有任一主题的书签都命中', () => {
    const a = make('a', { topics: ['AI'], createdAt: '2026-09-10T08:00:00.000Z' });
    const b = make('b', { topics: ['世界模型'], createdAt: '2026-09-11T09:00:00.000Z' });
    const none = make('none', { topics: ['上下文工程'], createdAt: '2026-09-11T10:00:00.000Z' });

    const filter = selection({ topics: ['AI', '世界模型'] });
    expect(matchesFilter(a, filter)).toBe(true);
    expect(matchesFilter(b, filter)).toBe(true);
    expect(matchesFilter(none, filter)).toBe(false);
  });

  it('applyFilter 返回命中集合且从新到旧排列（乱序输入仍按 createdAt 排）', () => {
    const a = make('a', { topics: ['AI'], createdAt: '2026-09-10T08:00:00.000Z' });
    const b = make('b', { topics: ['世界模型'], createdAt: '2026-09-11T09:00:00.000Z' });

    const hits = applyFilter([a, b], selection({ topics: ['AI', '世界模型'] }));
    expect(hits.map((hit) => hit.title)).toEqual(['b', 'a']);
  });

  it('空筛选命中全部', () => {
    const a = make('a', { createdAt: '2026-09-10T08:00:00.000Z' });
    const b = make('b', { createdAt: '2026-09-11T09:00:00.000Z' });
    expect(applyFilter([a, b], emptyFilter())).toHaveLength(2);
    expect(hasActiveFilter(emptyFilter())).toBe(false);
  });
});

describe('feat05 场景2：跨维度取「且」', () => {
  it('选中主题「AI」和形态「论文」时，只有同时满足两条的书签命中', () => {
    const a = make('a', { topics: ['AI'], types: ['论文'], createdAt: '2026-09-10T08:00:00.000Z' });
    const c = make('c', {
      topics: ['AI'],
      types: ['GitHub 仓库'],
      createdAt: '2026-09-11T09:00:00.000Z',
    });

    const filter = selection({ topics: ['AI'], types: ['论文'] });
    expect(matchesFilter(a, filter)).toBe(true);
    expect(matchesFilter(c, filter)).toBe(false);
    expect(applyFilter([a, c], filter).map((hit) => hit.title)).toEqual(['a']);
  });
});

describe('feat05 场景3：状态维度单选', () => {
  const reading = make('reading', { status: 'reading', createdAt: '2026-09-10T08:00:00.000Z' });
  const done = make('done', { status: 'done', createdAt: '2026-09-11T09:00:00.000Z' });

  it('状态条件只匹配单一取值', () => {
    const filter = selection({ status: 'reading' });
    expect(matchesFilter(reading, filter)).toBe(true);
    expect(matchesFilter(done, filter)).toBe(false);
    expect(applyFilter([reading, done], filter).map((hit) => hit.title)).toEqual(['reading']);
  });

  it('已选 Reading 时点 Done：仅保留 Done（点选即替换）', () => {
    const next = toggleFilterValue(selection({ status: 'reading' }), 'status', 'done');
    expect(next.status).toBe('done');
    expect(applyFilter([reading, done], next).map((hit) => hit.title)).toEqual(['done']);
  });

  it('再点一次同一状态则取消该条件', () => {
    const next = toggleFilterValue(selection({ status: 'done' }), 'status', 'done');
    expect(next.status).toBeNull();
    expect(applyFilter([reading, done], next)).toHaveLength(2);
  });
});

describe('feat05 场景4：主题「满足任一 / 全部满足」切换（仅作用于主题）', () => {
  const onlyAi = make('only-ai', { topics: ['AI'], createdAt: '2026-09-10T08:00:00.000Z' });
  const both = make('both', { topics: ['AI', '世界模型'], createdAt: '2026-09-11T09:00:00.000Z' });

  it('默认「满足任一」：标有其中任意一个即命中', () => {
    const filter = selection({ topics: ['AI', '世界模型'] });
    expect(filter.topicMatch).toBe('any');
    expect(applyFilter([onlyAi, both], filter)).toHaveLength(2);
  });

  it('切换「全部满足」：只有同时标有这两个主题的书签命中', () => {
    const filter = selection({ topics: ['AI', '世界模型'], topicMatch: 'all' });
    expect(applyFilter([onlyAi, both], filter).map((hit) => hit.title)).toEqual(['both']);
  });

  it('切回「满足任一」：标有其中任意一个即命中', () => {
    const all = selection({ topics: ['AI', '世界模型'], topicMatch: 'all' });
    const backToAny = { ...all, topicMatch: 'any' as const };
    expect(applyFilter([onlyAi, both], backToAny)).toHaveLength(2);
  });

  it('切换只作用于主题维度：形态多选在「全部满足」下仍取「或」', () => {
    const paper = make('paper', { types: ['论文'], createdAt: '2026-09-10T08:00:00.000Z' });
    const repo = make('repo', { types: ['GitHub 仓库'], createdAt: '2026-09-11T09:00:00.000Z' });
    const filter = selection({ types: ['论文', 'GitHub 仓库'], topicMatch: 'all' });
    expect(applyFilter([paper, repo], filter)).toHaveLength(2);
  });

  it('用途维度多选同样取「或」', () => {
    const x = make('x', { purposes: ['学习原理'], createdAt: '2026-09-10T08:00:00.000Z' });
    const y = make('y', { purposes: ['项目参考'], createdAt: '2026-09-11T09:00:00.000Z' });
    const filter = selection({ purposes: ['学习原理', '项目参考'] });
    expect(applyFilter([x, y], filter)).toHaveLength(2);
  });
});

describe('feat05 场景6（引擎层）：取消单个条件', () => {
  it('再点一次已选值只取消该条件，其余维度条件保持', () => {
    const filter = selection({ topics: ['AI'], types: ['论文'] });
    const next = toggleFilterValue(filter, 'topic', 'AI');
    expect(next.topics).toEqual([]);
    expect(next.types).toEqual(['论文']);
  });

  it('取消后结果随之更新', () => {
    const a = make('a', { topics: ['AI'], types: ['论文'], createdAt: '2026-09-10T08:00:00.000Z' });
    const c = make('c', {
      topics: ['AI'],
      types: ['GitHub 仓库'],
      createdAt: '2026-09-11T09:00:00.000Z',
    });
    const d = make('d', {
      topics: ['世界模型'],
      types: ['论文'],
      createdAt: '2026-09-09T08:00:00.000Z',
    });

    const before = applyFilter([a, c, d], selection({ topics: ['AI'], types: ['论文'] }));
    expect(before.map((hit) => hit.title)).toEqual(['a']);
    const after = applyFilter(
      [a, c, d],
      toggleFilterValue(selection({ topics: ['AI'], types: ['论文'] }), 'topic', 'AI'),
    );
    expect(after.map((hit) => hit.title)).toEqual(['a', 'd']);
  });
});

describe('feat05 场景7（引擎层）：没有命中', () => {
  it('无任何书签满足组合时 applyFilter 返回空数组', () => {
    const a = make('a', { topics: ['AI'], types: ['论文'], createdAt: '2026-09-10T08:00:00.000Z' });
    const hits = applyFilter([a], selection({ topics: ['AI'], types: ['GitHub 仓库'] }));
    expect(hits).toEqual([]);
  });
});

describe('feat05 场景5：候选计数按其他维度的已选条件动态计算', () => {
  const a = make('a', { topics: ['AI'], types: ['论文'], createdAt: '2026-09-10T08:00:00.000Z' });
  const b = make('b', {
    topics: ['世界模型'],
    types: ['论文'],
    createdAt: '2026-09-11T09:00:00.000Z',
  });
  const c = make('c', {
    topics: ['AI', '世界模型'],
    types: ['GitHub 仓库'],
    createdAt: '2026-09-09T08:00:00.000Z',
  });
  const library = [a, b, c];

  it('选中形态「论文」时，每个主题候选的计数 = 形态=论文前提下标有该主题的条数', () => {
    const facets = countFacetValues(library, selection({ types: ['论文'] }), 'topic', [
      'AI',
      '世界模型',
      '上下文工程',
    ]);
    expect(facets).toEqual([
      { value: 'AI', count: 1, selected: false }, // a（c 是 GitHub 仓库，不在基准）
      { value: '世界模型', count: 1, selected: false }, // b
      { value: '上下文工程', count: 0, selected: false }, // 计数为 0 仍保留
    ]);
  });

  it('计数不含本维度已选项的影响：已选主题「AI」时，主题计数仍只按形态条件计算', () => {
    const facets = countFacetValues(
      library,
      selection({ topics: ['AI'], types: ['论文'] }),
      'topic',
      ['AI', '世界模型'],
    );
    expect(facets).toEqual([
      { value: 'AI', count: 1, selected: true }, // 已选候选永远显示且带 selected 标记
      { value: '世界模型', count: 1, selected: false },
    ]);
  });

  it('状态维度计数：按其余三维条件计算基准集，单值匹配', () => {
    const reading = make('reading', {
      topics: ['AI'],
      types: ['论文'],
      status: 'reading',
      createdAt: '2026-09-12T09:00:00.000Z',
    });
    const withStatus = [a, b, c, reading];
    const facets = countFacetValues(withStatus, selection({ types: ['论文'] }), 'status', [
      'inbox',
      'reading',
      'done',
    ]);
    expect(facets).toEqual([
      { value: 'inbox', count: 2, selected: false }, // 基准 = types=[论文] 下的 a、b
      { value: 'reading', count: 1, selected: false },
      { value: 'done', count: 0, selected: false },
    ]);
  });

  it('已选状态时，状态维度计数剔除本维度条件（其余维度条件保留）', () => {
    const reading = make('reading', {
      topics: ['AI'],
      types: ['论文'],
      status: 'reading',
      createdAt: '2026-09-12T09:00:00.000Z',
    });
    const done = make('done', {
      topics: ['AI'],
      types: ['GitHub 仓库'],
      status: 'done',
      createdAt: '2026-09-12T10:00:00.000Z',
    });
    const facets = countFacetValues(
      [a, c, reading, done],
      selection({ status: 'reading', topics: ['AI'] }),
      'status',
      ['inbox', 'reading', 'done'],
    );
    // 基准 = topics=[AI]（剔除 status 自身）：a、c、reading、done 四条都命中 → inbox=2（a、c）、reading=1、done=1
    expect(facets).toEqual([
      { value: 'inbox', count: 2, selected: false },
      { value: 'reading', count: 1, selected: true },
      { value: 'done', count: 1, selected: false },
    ]);
  });

  it('形态/用途维度计数同样剔除本维度已选条件', () => {
    const facets = countFacetValues(
      library,
      selection({ types: ['论文'], topics: ['AI'] }),
      'type',
      ['论文', 'GitHub 仓库', '博客文章'],
    );
    // 基准 = topics=[AI]（剔除 type 自身）：a（论文）、c（GitHub 仓库）
    expect(facets).toEqual([
      { value: '论文', count: 1, selected: true },
      { value: 'GitHub 仓库', count: 1, selected: false },
      { value: '博客文章', count: 0, selected: false },
    ]);
  });
});

describe('feat06 场景1：关键词匹配域（标题 / 来源域名 / 收藏理由）', () => {
  it('理由包含关键词即命中：搜「action」命中理由写着「重点看 action → next state 的设计」的收藏', () => {
    const hit = make('wm-paper', {
      title: 'World Models 综述',
      note: '重点看 action → next state 的设计',
      createdAt: '2026-09-10T08:00:00.000Z',
    });
    expect(matchesQuery(hit, 'action')).toBe(true);
    expect(matchesFilter(hit, selection({ query: 'action' }))).toBe(true);
  });

  it('标题包含关键词命中，大小写不敏感（搜「worlddreamer」命中「WorldDreamer」）', () => {
    const hit = make('repo', {
      title: 'WorldDreamer: Interactive World Models',
      createdAt: '2026-09-10T08:00:00.000Z',
    });
    const other = make('other', { title: '别的项目', createdAt: '2026-09-11T09:00:00.000Z' });
    expect(matchesQuery(hit, 'worlddreamer')).toBe(true);
    expect(matchesQuery(other, 'worlddreamer')).toBe(false);
  });

  it('来源域名包含关键词命中；URL 路径不参与匹配', () => {
    const hit = make('gh', {
      url: 'https://github.com/some/repo',
      title: '某仓库',
      createdAt: '2026-09-10T08:00:00.000Z',
    });
    const pathOnly = make('path', {
      url: 'https://example.com/github-deep/path',
      title: '路径词',
      createdAt: '2026-09-11T09:00:00.000Z',
    });
    expect(matchesQuery(hit, 'github')).toBe(true);
    expect(matchesQuery(pathOnly, 'github')).toBe(false); // 「github」只在路径里，不在域名里
  });

  it('理由为 null 的收藏不因理由域命中；空关键词（含全空白）视为未搜索、恒命中', () => {
    const noNote = make('no-note', { note: null, createdAt: '2026-09-10T08:00:00.000Z' });
    expect(matchesQuery(noNote, 'action')).toBe(false);
    expect(matchesQuery(noNote, '')).toBe(true);
    expect(matchesQuery(noNote, '   ')).toBe(true);
  });

  it('搜索结果按收藏时间从新到旧排列', () => {
    const older = make('older', {
      title: 'action 旧条',
      createdAt: '2026-09-09T08:00:00.000Z',
    });
    const newer = make('newer', {
      title: 'action 新条',
      createdAt: '2026-09-11T09:00:00.000Z',
    });
    const hits = applyFilter([older, newer], selection({ query: 'action' }));
    expect(hits.map((hit) => hit.title)).toEqual(['action 新条', 'action 旧条']);
  });
});

describe('feat06 场景3：关键词与已选筛选取「且」叠加', () => {
  const a = make('a', {
    title: '世界模型论文',
    types: ['论文'],
    createdAt: '2026-09-10T08:00:00.000Z',
  });
  const b = make('b', {
    title: '世界模型视频',
    types: ['视频'],
    createdAt: '2026-09-11T09:00:00.000Z',
  });
  const c = make('c', {
    title: '别的论文',
    types: ['论文'],
    createdAt: '2026-09-12T09:00:00.000Z',
  });

  it('选中形态「论文」再搜「世界模型」：只有既满足筛选又匹配关键词的收藏命中', () => {
    const hits = applyFilter([a, b, c], selection({ types: ['论文'], query: '世界模型' }));
    expect(hits.map((hit) => hit.title)).toEqual(['世界模型论文']);
  });

  it('清空关键词后回到仅按筛选显示', () => {
    const hits = applyFilter([a, b, c], selection({ types: ['论文'], query: '' }));
    expect(hits.map((hit) => hit.title)).toEqual(['别的论文', '世界模型论文']); // 仅形态=论文，新到旧
  });
});

describe('feat06 场景2（引擎层）：没有匹配', () => {
  it('库里没有任何内容包含关键词时 applyFilter 返回空数组', () => {
    const a = make('a', {
      title: '世界模型论文',
      note: '重点看 action → next state 的设计',
      url: 'https://arxiv.example/abs/1234',
      createdAt: '2026-09-10T08:00:00.000Z',
    });
    const hits = applyFilter([a], selection({ query: '量子' }));
    expect(hits).toEqual([]);
  });
});

describe('sync-archive feat06：「待同步」筛选（引擎层）', () => {
  const SYNCED_AT = '2026-09-11T12:00:00.000Z';
  const synced = make('synced', { createdAt: '2026-09-10T08:00:00.000Z' }); // updatedAt ≤ SYNCED_AT
  const pendingA = make('pendingA', { createdAt: '2026-09-13T08:00:00.000Z' }); // updatedAt > SYNCED_AT
  const pendingB = make('pendingB', { createdAt: '2026-09-13T09:00:00.000Z' });

  it('emptyFilter 含 pendingOnly: false（默认不按同步状态过滤）', () => {
    expect(emptyFilter().pendingOnly).toBe(false);
  });

  it('pendingOnly 计入 hasActiveFilter：选中后出现「清除全部筛选」的前提（场景1 复用清除交互）', () => {
    expect(hasActiveFilter(emptyFilter())).toBe(false);
    expect(hasActiveFilter(selection({ pendingOnly: true }))).toBe(true);
    expect(hasActiveFilter(selection({ pendingOnly: true, query: '' }))).toBe(true);
  });

  it('pendingOnly=true 只命中 updatedAt > lastSyncAt 的条目（场景1：筛出待同步）', () => {
    const filter = selection({ pendingOnly: true });
    expect(matchesFilter(pendingA, filter, { lastSyncAt: SYNCED_AT })).toBe(true);
    expect(matchesFilter(synced, filter, { lastSyncAt: SYNCED_AT })).toBe(false);

    const hits = applyFilter([synced, pendingB, pendingA], filter, { lastSyncAt: SYNCED_AT });
    expect(hits.map((hit) => hit.title)).toEqual(['pendingB', 'pendingA']); // 新到旧
  });

  it('pendingOnly=true 且从未同步（lastSyncAt=null）：全部条目都算待同步', () => {
    const filter = selection({ pendingOnly: true });
    expect(matchesFilter(synced, filter, { lastSyncAt: null })).toBe(true);
  });

  it('pendingOnly=false 时 sync 语境不影响命中（已同步条目照常出现）', () => {
    const filter = emptyFilter();
    expect(matchesFilter(synced, filter, { lastSyncAt: SYNCED_AT })).toBe(true);
  });

  it('pendingOnly=true 且无 sync 语境（未登录误用防御）：全部不命中', () => {
    expect(matchesFilter(pendingA, selection({ pendingOnly: true }))).toBe(false);
  });

  it('候选计数以 pendingOnly 为前提 scoped（已选待同步时，主题计数只统计待同步条目）', () => {
    const taxonomy = { topic: ['AI'], type: [], purpose: [], status: ['inbox'] };
    const library = [pendingA, pendingB, synced]; // pendingA/pendingB 标 AI，synced 也标 AI
    pendingA.classification.topics = ['AI'];
    pendingB.classification.topics = ['AI'];
    synced.classification.topics = ['AI'];

    const facets = countFacetValues(
      library,
      selection({ pendingOnly: true }),
      'topic',
      taxonomy.topic,
      {
        lastSyncAt: SYNCED_AT,
      },
    );
    expect(facets).toEqual([{ value: 'AI', count: 2, selected: false }]); // 只数 2 条待同步
  });
});
