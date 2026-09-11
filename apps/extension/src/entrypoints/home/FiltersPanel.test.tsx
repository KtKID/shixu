import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaxonomySchema, createBookmark, type Bookmark, type Taxonomy } from '@x-threadpick/shared';
import { emptyFilter, type FilterSelection } from '../../lib/bookmark-filter';
import FiltersPanel from './FiltersPanel';

/** 面板候选取值集合（自定义过，验证 chips 确实取自本地 taxonomy 而非硬编码）。 */
const taxonomy: Taxonomy = TaxonomySchema.parse({
  topic: ['AI', '世界模型'],
  type: ['论文', 'GitHub 仓库'],
  purpose: ['学习原理'],
  status: ['inbox', 'reading', 'done'],
  updatedAt: '2026-01-01T00:00:00.000Z',
});

/** 内存书签（面板是纯 props 组件，不经 IndexedDB）。 */
function make(
  id: string,
  input: { topics?: string[]; types?: string[]; status?: string; createdAt: string },
): Bookmark {
  const bookmark = createBookmark(
    crypto.randomUUID(),
    { url: `https://${id}.example/page`, title: id },
    new Date(input.createdAt),
  );
  bookmark.classification = {
    topics: input.topics ?? [],
    types: input.types ?? [],
    purposes: [],
    status: input.status ?? 'inbox',
  };
  return bookmark;
}

function setup(bookmarks: readonly Bookmark[], filter: FilterSelection = emptyFilter()) {
  const onChange = vi.fn();
  render(
    <FiltersPanel bookmarks={bookmarks} taxonomy={taxonomy} filter={filter} onChange={onChange} />,
  );
  return { onChange };
}

beforeEach(() => {
  cleanup();
});

describe('候选 chips 取自 taxonomy 取值（feat05 场景1 / T3）', () => {
  it('四个维度的候选都渲染（状态取值首字母大写展示）', () => {
    setup([make('a', { topics: ['AI'], createdAt: '2026-09-10T08:00:00.000Z' })]);

    expect(screen.getByRole('button', { name: /^AI/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^世界模型/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^论文/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^GitHub 仓库/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^学习原理/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Inbox/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Reading/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Done/ })).toBeTruthy();
  });

  it('多选维度连点累加：先「AI」再「世界模型」→ topics 两个都已选', () => {
    const { onChange } = setup([
      make('a', { topics: ['AI'], createdAt: '2026-09-10T08:00:00.000Z' }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: /^AI/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...emptyFilter(), topics: ['AI'] });

    // 受控组件：第二次点击基于「已选 AI」的 filter
    cleanup();
    const second = vi.fn();
    render(
      <FiltersPanel
        bookmarks={[make('a', { topics: ['AI'], createdAt: '2026-09-10T08:00:00.000Z' })]}
        taxonomy={taxonomy}
        filter={{ ...emptyFilter(), topics: ['AI'] }}
        onChange={second}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^世界模型/ }));
    expect(second).toHaveBeenLastCalledWith({ ...emptyFilter(), topics: ['AI', '世界模型'] });
  });
});

describe('状态点选即替换、再点取消（feat05 场景3）', () => {
  it('已选 Reading 时点 Done：onChange 只保留 Done', () => {
    const { onChange } = setup(
      [make('r', { status: 'reading', createdAt: '2026-09-10T08:00:00.000Z' })],
      { ...emptyFilter(), status: 'reading' },
    );

    fireEvent.click(screen.getByRole('button', { name: /^Done/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...emptyFilter(), status: 'done' });
  });

  it('再点一次同一状态则取消该条件', () => {
    const { onChange } = setup(
      [make('d', { status: 'done', createdAt: '2026-09-10T08:00:00.000Z' })],
      { ...emptyFilter(), status: 'done' },
    );

    fireEvent.click(screen.getByRole('button', { name: /^Done/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...emptyFilter(), status: null });
  });
});

describe('主题「满足任一 / 全部满足」切换，仅作用于主题维度（feat05 场景4）', () => {
  it('主题维度有模式切换组，其余维度没有', () => {
    setup([make('a', { topics: ['AI'], createdAt: '2026-09-10T08:00:00.000Z' })]);

    const modes = screen.getAllByRole('group', { name: '主题匹配模式' });
    expect(modes).toHaveLength(1);
  });

  it('默认「满足任一」按下；点「全部满足」→ onChange topicMatch=all', () => {
    const { onChange } = setup([
      make('a', { topics: ['AI'], createdAt: '2026-09-10T08:00:00.000Z' }),
    ]);

    expect(screen.getByRole('button', { name: '满足任一' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: '全部满足' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...emptyFilter(), topicMatch: 'all' });
  });

  it('已处于「全部满足」时点「满足任一」切回', () => {
    const { onChange } = setup(
      [make('a', { topics: ['AI', '世界模型'], createdAt: '2026-09-10T08:00:00.000Z' })],
      { ...emptyFilter(), topics: ['AI', '世界模型'], topicMatch: 'all' },
    );

    fireEvent.click(screen.getByRole('button', { name: '满足任一' }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...emptyFilter(),
      topics: ['AI', '世界模型'],
      topicMatch: 'any',
    });
  });
});

describe('多选维度再点取消单个条件（feat05 场景6）', () => {
  it('已选「AI」和「论文」时再点「AI」→ 仅取消 AI，论文保持', () => {
    const { onChange } = setup(
      [make('a', { topics: ['AI'], types: ['论文'], createdAt: '2026-09-10T08:00:00.000Z' })],
      {
        ...emptyFilter(),
        topics: ['AI'],
        types: ['论文'],
      },
    );

    fireEvent.click(screen.getByRole('button', { name: /^AI/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...emptyFilter(), types: ['论文'] });
  });
});

describe('候选计数随其他维度条件变化（feat05 场景5 / T3 计数徽标）', () => {
  it('选中形态「论文」时，主题「AI」chip 显示形态=论文前提下的计数', () => {
    const library = [
      make('a', { topics: ['AI'], types: ['论文'], createdAt: '2026-09-10T08:00:00.000Z' }),
      make('c', {
        topics: ['AI', '世界模型'],
        types: ['GitHub 仓库'],
        createdAt: '2026-09-09T08:00:00.000Z',
      }),
    ];
    setup(library, { ...emptyFilter(), types: ['论文'] });

    const aiChip = screen.getByRole('button', { name: /^AI/ });
    expect(aiChip.querySelector('.fchip-count')?.textContent).toBe('1'); // 仅 a
    expect(
      screen.getByRole('button', { name: /^世界模型/ }).querySelector('.fchip-count')?.textContent,
    ).toBe('0'); // 计 0 仍显示
  });

  it('已选主题 chip 带 pressed 态与计数', () => {
    const library = [
      make('a', { topics: ['AI'], types: ['论文'], createdAt: '2026-09-10T08:00:00.000Z' }),
      make('b', { topics: ['AI'], types: ['论文'], createdAt: '2026-09-11T08:00:00.000Z' }),
    ];
    setup(library, { ...emptyFilter(), topics: ['AI'], types: ['论文'] });

    const aiChip = screen.getByRole('button', { name: /^AI/ });
    expect(aiChip.getAttribute('aria-pressed')).toBe('true');
    // 计数不含本维度已选项的影响：形态=论文下标有 AI 的条数 = 2
    expect(aiChip.querySelector('.fchip-count')?.textContent).toBe('2');
  });
});
