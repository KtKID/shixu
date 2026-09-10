import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_STATUS,
  type Bookmark,
  type CaptureTarget,
  type Taxonomy,
} from '@x-threadpick/shared';
import { getActiveBookmarks, getBookmarkByUrl, captureBookmark } from '../../db/bookmarks';
import { getTaxonomy } from '../../db/taxonomy';
import { isCapturableUrl, resolveCaptureTarget } from '../../lib/capture-invoke';

/**
 * 收藏面板：顶栏 / 只读页面信息 / 理由输入（feat03）/ 四维点选（feat04）/ 保存（feat05）/ 重复收藏预填（feat06）/ 库入口。
 * 保存链路：captureBookmark upsert → 横幅 → （保存并关闭 Tab 时）关目标标签页 → 关面板。
 */

const DIMS = [
  { key: 'topic', name: '主题', q: '它讲什么？', mode: '可多选' },
  { key: 'type', name: '形态', q: '它是什么？', mode: '可多选' },
  { key: 'purpose', name: '用途', q: '我拿它干什么？', mode: '可多选' },
  { key: 'status', name: '状态', q: '我处理到哪了？', mode: '单选' },
] as const;

type MultiDim = 'topic' | 'type' | 'purpose';

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

  const openImporter = (): void => {
    browser.runtime
      .openOptionsPage()
      .then(() => window.close())
      .catch(() => window.close());
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
        <span className="shortcut-hint">{isMacPlatform() ? '⌘⇧S' : 'Ctrl+Shift+S'}</span>
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

      <div className="dims" aria-disabled={!capturable}>
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
                    <button
                      key={value}
                      type="button"
                      className={`chip${on ? ' on' : ''}${dim.key === 'status' ? ' flow status-chip' : ''}`}
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
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="dims-hint">维度的取值在「设置」里统一管理，这里只做点选</div>

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

      <div className="library-bar">
        <span className="library-count">{count === null ? '…' : `已入库 ${count} 条`}</span>
        <button type="button" className="library-link" onClick={openImporter}>
          打开导入器
        </button>
      </div>
    </div>
  );
}
