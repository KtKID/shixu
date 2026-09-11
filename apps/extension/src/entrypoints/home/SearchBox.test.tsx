import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SearchBox from './SearchBox';

afterEach(() => {
  cleanup();
});

/** 页面里与搜索无关的可聚焦元素（模拟「光标不在搜索框」）。 */
function UnrelatedButton(): JSX.Element {
  return <button type="button">无关按钮</button>;
}

describe('快捷键聚焦（feat06 场景4）', () => {
  it('光标不在搜索框时按 ⌘K（meta+K），焦点移到搜索框', () => {
    render(
      <>
        <UnrelatedButton />
        <SearchBox query="" onQueryChange={vi.fn()} hitCount={null} />
      </>,
    );
    const input = screen.getByRole('textbox', { name: '搜索收藏' });
    expect(document.activeElement).not.toBe(input); // 前置：光标不在搜索框

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(document.activeElement).toBe(input);
  });

  it('Windows/Linux 为 Ctrl+K（ctrl+K）同样聚焦', () => {
    render(<SearchBox query="" onQueryChange={vi.fn()} hitCount={null} />);
    const input = screen.getByRole('textbox', { name: '搜索收藏' });

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(input);
  });

  it('无修饰键的普通 K 键不抢焦点；⌘J 等其他组合也不聚焦', () => {
    render(
      <>
        <UnrelatedButton />
        <SearchBox query="" onQueryChange={vi.fn()} hitCount={null} />
      </>,
    );
    const input = screen.getByRole('textbox', { name: '搜索收藏' });
    expect(screen.getByRole('button', { name: '无关按钮' })).toBeTruthy(); // 对照元素存在

    fireEvent.keyDown(window, { key: 'k' });
    expect(document.activeElement).not.toBe(input);
    fireEvent.keyDown(window, { key: 'j', metaKey: true });
    expect(document.activeElement).not.toBe(input);
  });
});

describe('受控输入与命中条数展示（feat06 场景1/2 组件层）', () => {
  it('⌘K 提示是搜索框末尾的纯文本（无盒子），placeholder 不带 ⌘K（task-home-layout）', () => {
    render(<SearchBox query="" onQueryChange={vi.fn()} hitCount={null} />);

    expect(document.querySelector('.searchbox-kbd')?.textContent).toBe('⌘K');
    expect(
      screen.getByRole('textbox', { name: '搜索收藏' }).getAttribute('placeholder'),
    ).not.toContain('⌘K');
  });
  it('输入回调把新值交给父层；搜索中展示「N 条结果」，未搜索不展示', () => {
    const onQueryChange = vi.fn();
    const { rerender } = render(
      <SearchBox query="" onQueryChange={onQueryChange} hitCount={null} />,
    );
    expect(document.querySelector('.searchbox-count')).toBeNull(); // 未搜索无计数

    fireEvent.change(screen.getByRole('textbox', { name: '搜索收藏' }), {
      target: { value: 'action' },
    });
    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(onQueryChange).toHaveBeenCalledWith('action');

    rerender(<SearchBox query="action" onQueryChange={onQueryChange} hitCount={0} />);
    expect(document.querySelector('.searchbox-count')?.textContent).toBe('0 条结果');
  });
});
