import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TimeRange } from '../../lib/bookmark-filter';
import TimeRangeDropdown from './TimeRangeDropdown';

/**
 * 收藏时间下拉（homepage feat08）：自定义样式下拉（非原生 select），
 * 固定 5 选项，受控值 + onChange；点外部 / Escape 收起。
 */

afterEach(() => cleanup());

/** 受控挂载：内部 state 模拟父层 LibrarySection 的用法。 */
function Harness({ initial = 'all' as TimeRange, onChange = vi.fn() }) {
  const [value, setValue] = useState<TimeRange>(initial);
  return (
    <TimeRangeDropdown
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('feat08 场景1：默认「全部」', () => {
  it('触发钮初始显示「全部」，面板默认收起', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: /全部/ });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('功能方向：五个固定选项', () => {
  it('点击触发钮展开，出现 今天/最近 7 天/最近一个月/最近半年/全部 五项', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /全部/ }));

    const options = screen.getAllByRole('option');
    expect(options.map((el) => el.textContent)).toEqual([
      '今天',
      '最近 7 天',
      '最近一个月',
      '最近半年',
      '全部',
    ]);
    expect(screen.getByRole('button', { name: /全部/ }).getAttribute('aria-expanded')).toBe('true');
  });
});

describe('feat08 场景2：选择时间范围', () => {
  it('点「最近 7 天」：onChange 收到 d7、面板收起、触发钮文案变为「最近 7 天」', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /全部/ }));
    fireEvent.click(screen.getByRole('option', { name: '最近 7 天' }));

    expect(onChange).toHaveBeenCalledWith('d7');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('button', { name: /最近 7 天/ })).toBeTruthy();
  });

  it('当前选中项带 aria-selected（重开面板可见选中态）', () => {
    render(<Harness initial="d30" />);
    fireEvent.click(screen.getByRole('button', { name: /最近一个月/ }));
    expect(screen.getByRole('option', { name: '最近一个月' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('option', { name: '全部' }).getAttribute('aria-selected')).toBe(
      'false',
    );
  });
});

describe('边界：收起不改动当前值', () => {
  it('展开后点面板外区域收起，值不变、onChange 不触发', () => {
    const onChange = vi.fn();
    render(
      <div>
        <span data-testid="outside">外部</span>
        <Harness onChange={onChange} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /全部/ }));
    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('展开后按 Escape 收起，值不变', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /全部/ }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
