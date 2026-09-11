import type { Bookmark, Dimension, Taxonomy } from '@x-threadpick/shared';
import {
  countFacetValues,
  toggleFilterValue,
  type FilterSelection,
} from '../../lib/bookmark-filter';

/**
 * 四维筛选面板（homepage feat05）：候选 chips 取自本地 taxonomy 取值，
 * 计数徽标按其他维度已选条件动态计算（lib/bookmark-filter 纯函数）。
 * 交互：多选维度点选 toggle；状态点选即替换、再点取消；
 * 主题维度独有「满足任一 / 全部满足」模式切换。
 */

const DIMENSION_META: readonly { key: Dimension; name: string; icon: string }[] = [
  { key: 'topic', name: '主题', icon: '❖' },
  { key: 'type', name: '形态', icon: '◉' },
  { key: 'purpose', name: '用途', icon: '◎' },
  { key: 'status', name: '状态', icon: '▸' },
];

/** 状态取值存小写（DEFAULT_STATUS='inbox'），展示层首字母大写（与收藏卡片一致）。 */
function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

interface FiltersPanelProps {
  /** 当前收藏库全量（用于候选计数），只读。 */
  bookmarks: readonly Bookmark[];
  taxonomy: Taxonomy;
  filter: FilterSelection;
  onChange: (next: FilterSelection) => void;
}

export default function FiltersPanel({ bookmarks, taxonomy, filter, onChange }: FiltersPanelProps) {
  return (
    <div className="filters" aria-label="按维度筛选">
      {DIMENSION_META.map((meta) => {
        const facets = countFacetValues(bookmarks, filter, meta.key, taxonomy[meta.key]);
        return (
          <div className="fdim" key={meta.key}>
            <span className="fdim-name">
              <span className="fdim-ic" aria-hidden="true">
                {meta.icon}
              </span>
              {meta.name}
            </span>
            {meta.key === 'topic' && (
              <div className="fmode" role="group" aria-label="主题匹配模式">
                <button
                  type="button"
                  aria-pressed={filter.topicMatch === 'any'}
                  onClick={() => onChange({ ...filter, topicMatch: 'any' })}
                >
                  满足任一
                </button>
                <button
                  type="button"
                  aria-pressed={filter.topicMatch === 'all'}
                  onClick={() => onChange({ ...filter, topicMatch: 'all' })}
                >
                  全部满足
                </button>
              </div>
            )}
            <div className="fchips">
              {facets.map((facet) => (
                <button
                  type="button"
                  key={facet.value}
                  className={`fchip${facet.selected ? ' on' : ''}`}
                  aria-pressed={facet.selected}
                  onClick={() => onChange(toggleFilterValue(filter, meta.key, facet.value))}
                >
                  {meta.key === 'status' ? statusLabel(facet.value) : facet.value}
                  <span className="fchip-count">{facet.count}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
