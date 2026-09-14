import { useEffect, useRef, useState } from 'react';
import type { TimeRange } from '../../lib/bookmark-filter';

/**
 * 收藏时间下拉筛选（homepage feat08）：自定义样式下拉（非原生 select），
 * 固定 5 选项，受控 value + onChange；点选项即收起，点面板外 / Escape 收起。
 */

const OPTIONS: readonly { value: TimeRange; label: string }[] = [
  { value: 'today', label: '今天' },
  { value: 'd7', label: '最近 7 天' },
  { value: 'd30', label: '最近一个月' },
  { value: 'd180', label: '最近半年' },
  { value: 'all', label: '全部' },
];

function labelOf(value: TimeRange): string {
  return OPTIONS.find((option) => option.value === value)?.label ?? '全部';
}

interface TimeRangeDropdownProps {
  value: TimeRange;
  onChange: (next: TimeRange) => void;
}

export default function TimeRangeDropdown({ value, onChange }: TimeRangeDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 展开时监听：点面板外（mousedown 先于 click，避免与选项点击竞态）或 Escape 收起。
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (
        rootRef.current !== null &&
        !(event.target instanceof Node && rootRef.current.contains(event.target))
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="timerange" ref={rootRef}>
      <span className="fdim-name">
        <span className="fdim-ic" aria-hidden="true">
          ◷
        </span>
        收藏时间
      </span>
      <div className="tr-select">
        <button
          type="button"
          className="tr-trigger"
          aria-label={`收藏时间：${labelOf(value)}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          {labelOf(value)}
          <span className="tr-caret" aria-hidden="true">
            ▾
          </span>
        </button>
        {open && (
          <ul className="tr-menu" role="listbox" aria-label="收藏时间范围">
            {OPTIONS.map((option) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={`tr-option${option.value === value ? ' on' : ''}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
