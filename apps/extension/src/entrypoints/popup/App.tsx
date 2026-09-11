import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_STATUS,
  type Bookmark,
  type CaptureTarget,
  type Taxonomy,
} from '@x-threadpick/shared';
import { getActiveBookmarks, getBookmarkByUrl, captureBookmark } from '../../db/bookmarks';
import { addTaxonomyValue, getTaxonomy, removeTaxonomyValue } from '../../db/taxonomy';
import { isCapturableUrl, resolveCaptureTarget } from '../../lib/capture-invoke';

/**
 * 收藏面板：顶栏 / 只读页面信息 / 理由输入（feat03）/ 四维点选（feat04）/ 保存（feat05）/ 重复收藏预填（feat06）/ 顶栏库计数。
 * 四维卡片可就地增删取值（feat08，与设置页共享同一套 taxonomy）；增删校验与文案沿用设置页 DimensionsCard。
 * 增删入口（「×」删除钮与底部修改区）都收进修改模式（feat08 场景7/8）：顶栏「修改/完成」切换，
 * 默认不渲染，日常点选一屏放下；popup 每次打开都是全新页面加载，editing 不持久化，重开自然复位。
 * 保存链路：captureBookmark upsert → 横幅 → （保存并关闭 Tab 时）关目标标签页 → 关面板。
 */

const DIMS = [
  { key: 'topic', name: '主题', q: '它讲什么？', mode: '可多选' },
  { key: 'type', name: '形态', q: '它是什么？', mode: '可多选' },
  { key: 'purpose', name: '用途', q: '我拿它干什么？', mode: '可多选' },
  { key: 'status', name: '状态', q: '我处理到哪了？', mode: '单选' },
] as const;

type MultiDim = 'topic' | 'type' | 'purpose';

type DimKey = MultiDim | 'status';

const INPUT_PLACEHOLDER: Record<DimKey, string> = {
  topic: '新主题…',
  type: '新形态…',
  purpose: '新用途…',
  status: '新状态…',
};

/** 四维点选状态：多选维度为取值数组，状态单选为单个取值（默认 inbox）。 */
interface DimSelection {
  topic: string[];
  type: string[];
  purpose: string[];
  status: string;
}

type TargetState = { status: 'loading' } | { status: 'ready'; target: CaptureTarget | null };

function faviconInitial(target: CaptureTarget): string {
  const source = target.title.trim() === '' ? target.url : target.title.trim();
  const ch = source.charAt(0);
  return ch === '' ? '✦' : ch.toUpperCase();
}

function isMacPlatform(): boolean {
  return navigator.platform.toUpperCase().includes('MAC');
}

export interface CapturePanelProps {
  /** 保存成功横幅停留时长（ms），默认 900；测试注入 0。 */
  bannerDelayMs?: number;
}

const DEFAULT_BANNER_DELAY_MS = 900;

/** 状态取值存小写，横幅展示首字母大写（如 inbox → Inbox）。 */
function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function App(props: CapturePanelProps) {
  const [targetState, setTargetState] = useState<TargetState>({ status: 'loading' });
  const [count, setCount] = useState<number | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [why, setWhy] = useState('');
  const [existingBookmark, setExistingBookmark] = useState<Bookmark | null>(null);
  const [selection, setSelection] = useState<DimSelection>({
    topic: [],
    type: [],
    purpose: [],
    status: DEFAULT_STATUS,
  });
  const [saving, setSaving] = useState<'close' | 'only' | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  // 修改模式（feat08 场景7）：true 时取值渲染「×」删除按钮；组件内状态不持久化，重开面板即复位
  const [editing, setEditing] = useState(false);
  const [inputs, setInputs] = useState<Record<DimKey, string>>({
    topic: '',
    type: '',
    purpose: '',
    status: '',
  });
  const [errors, setErrors] = useState<Record<DimKey, string | null>>({
    topic: null,
    type: null,
    purpose: null,
    status: null,
  });
  const inputRefs = useRef<Partial<Record<DimKey, HTMLInputElement | null>>>({});
  const whyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    resolveCaptureTarget()
      .then(async (target) => {
        setTargetState({ status: 'ready', target });
        // feat06 场景1：该页面已在库中（未删除）→ 提示更新并预填理由与四维
        if (target !== null && isCapturableUrl(target.url)) {
          const existing = await getBookmarkByUrl(target.url);
          if (existing !== null && existing.deletedAt === null) {
            setExistingBookmark(existing);
            setWhy(existing.note ?? '');
            setSelection({
              topic: existing.classification.topics,
              type: existing.classification.types,
              purpose: existing.classification.purposes,
              status: existing.classification.status,
            });
          }
        }
      })
      .catch(() => setTargetState({ status: 'ready', target: null }));
    getActiveBookmarks()
      .then((bookmarks) => setCount(bookmarks.length))
      .catch(() => setCount(null));
    getTaxonomy()
      .then(setTaxonomy)
      .catch(() => setTaxonomy(null));
  }, []);

  const ready = targetState.status === 'ready';
  const target = ready ? targetState.target : null;
  const capturable = target !== null && isCapturableUrl(target.url);

  // 打开面板时光标停在理由输入框（feat01 场景1）；不可收藏页面输入框禁用，不抢焦点
  useEffect(() => {
    if (capturable) whyRef.current?.focus();
  }, [capturable]);

  /**
   * 顶栏入口（homepage feat01 场景1/2）：新标签页整页打开插件主页并落到指定条目；
   * 面板随 window.close() 销毁——未保存的理由与点选自然丢弃，不自动保存。
   */
  const openHome = (section: 'recent' | 'network'): void => {
    browser.tabs
      .create({ url: browser.runtime.getURL(`/home.html#${section}`) })
      .catch(() => undefined)
      .finally(() => window.close());
  };

  /**
   * 理由框键盘行为（feat03）：
   * Enter = 保存并关闭 Tab；组字中的 Enter（isComposing）只上屏；Shift+Enter 换行；Esc 放弃关闭。
   */
  const handleWhyKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Escape') {
      window.close();
      return;
    }
    if (event.key !== 'Enter') return;
    if (event.nativeEvent.isComposing || event.shiftKey) return;
    event.preventDefault();
    save(true).catch(() => undefined);
  };

  const toggleMulti = (dim: MultiDim, value: string): void => {
    setSelection((prev) => ({
      ...prev,
      [dim]: prev[dim].includes(value)
        ? prev[dim].filter((v) => v !== value)
        : [...prev[dim], value],
    }));
  };

  /**
   * 修改模式切换（feat08 场景7）：退出时清掉增删错误提示，
   * 「该取值已存在」等不残留到下次进入修改模式。
   */
  const toggleEditing = (): void => {
    const next = !editing;
    setEditing(next);
    if (!next) {
      setErrors({ topic: null, type: null, purpose: null, status: null });
    }
  };

  /**
   * 就地新增取值（feat08 场景1/2）：成功后刷新取值、清空输入并保持焦点；空白静默，
   * 重复/过长文案与设置页一致；再次输入时清错误。
   */
  const addValue = (dim: DimKey): void => {
    addTaxonomyValue(dim, inputs[dim] ?? '')
      .then(async (result) => {
        if (result.status === 'added') {
          setTaxonomy(await getTaxonomy());
          setInputs((prev) => ({ ...prev, [dim]: '' }));
          setErrors((prev) => ({ ...prev, [dim]: null }));
          inputRefs.current[dim]?.focus();
        } else if (result.reason === 'duplicate') {
          setErrors((prev) => ({ ...prev, [dim]: '该取值已存在' }));
        } else if (result.reason === 'too_long') {
          setErrors((prev) => ({ ...prev, [dim]: '取值过长' }));
        }
      })
      .catch((err: unknown) => console.error('[popup] 添加取值失败', err));
  };

  /**
   * 就地删除取值（feat08 场景3/4）：删的是选中值时同步取消点选，状态被删回退默认 Inbox；
   * Inbox 受保护不可删；删除不动任何书签数据（db 层保证）。
   */
  const removeValue = (dim: DimKey, value: string): void => {
    removeTaxonomyValue(dim, value)
      .then(async (result) => {
        if (result.status === 'removed') {
          setTaxonomy(await getTaxonomy());
          setErrors((prev) => ({ ...prev, [dim]: null }));
          if (dim === 'status') {
            setSelection((prev) =>
              prev.status === value ? { ...prev, status: DEFAULT_STATUS } : prev,
            );
          } else {
            setSelection((prev) => ({ ...prev, [dim]: prev[dim].filter((v) => v !== value) }));
          }
        } else if (result.reason === 'protected') {
          setErrors((prev) => ({ ...prev, [dim]: '默认状态不可删除' }));
        } else {
          setTaxonomy(await getTaxonomy());
        }
      })
      .catch((err: unknown) => console.error('[popup] 删除取值失败', err));
  };

  /**
   * 保存（feat05）：落库（新建或覆盖更新）→ 横幅 → 关目标标签页（仅 close 且未固定）→ 关面板。
   * 固定标签页不关（场景3）；目标已被关闭时 tabs.remove 抛错，照常完成（场景5）；
   * 保存进行中忽略重复触发（场景6）。
   */
  const save = async (closeTab: boolean): Promise<void> => {
    if (saving !== null || !capturable || target === null) return;
    setSaving(closeTab ? 'close' : 'only');
    try {
      await captureBookmark({
        url: target.url,
        title: target.title,
        note: why,
        classification: {
          topics: selection.topic,
          types: selection.type,
          purposes: selection.purpose,
          status: selection.status,
        },
      });
      if (closeTab && target.pinned) {
        setBanner('✓ 已保存；固定标签页未关闭');
      } else if (closeTab) {
        setBanner(`✓ 已存入 ${statusLabel(selection.status)}，Tab 即将关闭`);
        try {
          await browser.tabs.remove(target.tabId);
        } catch {
          // 目标标签页已被用户从别处关闭：保存照常完成，跳过关页
        }
      } else {
        setBanner(`✓ 已存入 ${statusLabel(selection.status)}`);
      }
      await new Promise((resolve) => {
        setTimeout(resolve, props.bannerDelayMs ?? DEFAULT_BANNER_DELAY_MS);
      });
      window.close();
    } catch (error) {
      console.error('[x-threadpick] 保存失败', error);
      setSaving(null);
    }
  };

  return (
    <div className={capturable ? 'panel' : 'panel panel-uncapturable'}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark serif">✦</div>
          <div className="brand-name">拾绪</div>
        </div>
        <div className="topbar-links">
          <span className="library-count">{count === null ? '收藏…条' : `收藏${count}条`}</span>
          <button
            type="button"
            className="topbar-link"
            onClick={() => {
              openHome('recent');
            }}
          >
            已收藏
          </button>
          <button
            type="button"
            className="topbar-link"
            onClick={() => {
              openHome('network');
            }}
          >
            设置
          </button>
          <button
            type="button"
            className={`topbar-link${editing ? ' on' : ''}`}
            aria-pressed={editing}
            onClick={toggleEditing}
          >
            {editing ? '完成' : '修改'}
          </button>
          <span className="shortcut-hint">{isMacPlatform() ? '⌘⇧S' : 'Ctrl+Shift+S'}</span>
        </div>
      </header>

      {target === null ? (
        <div className="page-info">
          <div className="favicon serif">✦</div>
          <div className="page-meta">
            <div className="page-title">{ready ? '未检测到目标页面' : '读取页面信息…'}</div>
          </div>
        </div>
      ) : (
        <div className="page-info">
          <div className="favicon serif">{faviconInitial(target)}</div>
          <div className="page-meta">
            <div className="page-title">
              {target.title.trim() === '' ? target.url : target.title}
            </div>
            <div className="page-url">{target.url}</div>
          </div>
        </div>
      )}

      {ready && !capturable && (
        <div className="uncapturable-note" role="status">
          此页面无法收藏
        </div>
      )}

      {capturable && existingBookmark !== null && (
        <div className="update-hint" role="status">
          已收藏过 · 保存将更新
        </div>
      )}

      {banner !== null && (
        <div className="saved-banner on" role="status">
          {banner}
        </div>
      )}

      <div className="context">
        <label htmlFor="why">
          为什么收藏？<span className="optional">可选，但这句话以后最管用</span>
        </label>
        <textarea
          id="why"
          ref={whyRef}
          rows={2}
          value={why}
          onChange={(event) => setWhy(event.target.value)}
          disabled={!capturable}
          placeholder="当时为什么觉得它值得留下…"
          onKeyDown={handleWhyKeyDown}
        />
      </div>

      <div className={editing ? 'dims editing' : 'dims'} aria-disabled={!capturable}>
        {DIMS.map((dim) => (
          <div className="dim" key={dim.key}>
            <div className="dim-head">
              <div className="dim-name">
                {dim.name}
                <span className="q">{dim.q}</span>
              </div>
              <span className="dim-mode">{dim.mode}</span>
            </div>
            <div className="chips">
              {taxonomy === null ? (
                <span className="chips-placeholder">读取分类取值…</span>
              ) : (
                taxonomy[dim.key].map((value) => {
                  const on =
                    dim.key === 'status'
                      ? selection.status === value
                      : selection[dim.key].includes(value);
                  return (
                    <span
                      key={value}
                      className={`chip${on ? ' on' : ''}${dim.key === 'status' ? ' flow status-chip' : ''}`}
                    >
                      <button
                        type="button"
                        className={`chip-btn${on ? ' on' : ''}`}
                        aria-pressed={on}
                        disabled={!capturable}
                        onClick={() => {
                          if (dim.key === 'status') {
                            setSelection((prev) => ({ ...prev, status: value }));
                          } else {
                            toggleMulti(dim.key, value);
                          }
                        }}
                      >
                        {value}
                      </button>
                      {editing && (
                        <button
                          type="button"
                          className="x"
                          aria-label={`删除取值 ${value}`}
                          disabled={!capturable}
                          onClick={() => removeValue(dim.key, value)}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  );
                })
              )}
            </div>
            {editing && (
              <>
                <div className="chip-add">
                  <input
                    type="text"
                    placeholder={INPUT_PLACEHOLDER[dim.key]}
                    aria-label={`新${dim.name}取值`}
                    value={inputs[dim.key]}
                    onChange={(event) => {
                      const value = event.target.value;
                      setInputs((prev) => ({ ...prev, [dim.key]: value }));
                      if (errors[dim.key] !== null) {
                        setErrors((prev) => ({ ...prev, [dim.key]: null }));
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      if (event.nativeEvent.isComposing) return;
                      addValue(dim.key);
                    }}
                    disabled={!capturable}
                    ref={(el) => {
                      inputRefs.current[dim.key] = el;
                    }}
                  />
                  <button
                    type="button"
                    title="添加"
                    aria-label={`添加${dim.name}取值`}
                    disabled={!capturable}
                    onClick={() => addValue(dim.key)}
                  >
                    +
                  </button>
                </div>
                {errors[dim.key] !== null && <p className="dim-error">{errors[dim.key]}</p>}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="footer">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!capturable || saving !== null}
          onClick={() => {
            save(true).catch(() => undefined);
          }}
        >
          保存并关闭 Tab <span className="kbd">⏎</span>
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!capturable || saving !== null}
          onClick={() => {
            save(false).catch(() => undefined);
          }}
        >
          仅保存
        </button>
      </div>
    </div>
  );
}
