import { useEffect, useRef, useState } from 'react';
import type { CaptureTarget } from '@x-threadpick/shared';
import { getActiveBookmarks } from '../../db/bookmarks';
import { isCapturableUrl, resolveCaptureTarget } from '../../lib/capture-invoke';

/**
 * 收藏面板骨架（task-capture-open）：顶栏 / 只读页面信息 / 理由输入 / 四维占位 / 保存按钮 / 库入口。
 * 四维取值点选与保存逻辑归 task-capture-form，这里只渲染结构占位。
 */

const DIMS = [
  { key: 'topic', name: '主题', q: '它讲什么？', mode: '可多选' },
  { key: 'type', name: '形态', q: '它是什么？', mode: '可多选' },
  { key: 'purpose', name: '用途', q: '我拿它干什么？', mode: '可多选' },
  { key: 'status', name: '状态', q: '我处理到哪了？', mode: '单选' },
] as const;

type TargetState = { status: 'loading' } | { status: 'ready'; target: CaptureTarget | null };

function faviconInitial(target: CaptureTarget): string {
  const source = target.title.trim() === '' ? target.url : target.title.trim();
  const ch = source.charAt(0);
  return ch === '' ? '✦' : ch.toUpperCase();
}

function isMacPlatform(): boolean {
  return navigator.platform.toUpperCase().includes('MAC');
}

export default function App() {
  const [targetState, setTargetState] = useState<TargetState>({ status: 'loading' });
  const [count, setCount] = useState<number | null>(null);
  const whyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    resolveCaptureTarget()
      .then((target) => setTargetState({ status: 'ready', target }))
      .catch(() => setTargetState({ status: 'ready', target: null }));
    getActiveBookmarks()
      .then((bookmarks) => setCount(bookmarks.length))
      .catch(() => setCount(null));
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

      <div className="context">
        <label htmlFor="why">
          为什么收藏？<span className="optional">可选，但这句话以后最管用</span>
        </label>
        <textarea
          id="why"
          ref={whyRef}
          rows={2}
          disabled={!capturable}
          placeholder="当时为什么觉得它值得留下…"
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
              <span className="chips-placeholder">取值点选将在下一任务接入</span>
            </div>
          </div>
        ))}
      </div>
      <div className="dims-hint">维度的取值在「设置」里统一管理，这里只做点选</div>

      <div className="footer">
        <button type="button" className="btn btn-primary" disabled={!capturable}>
          保存并关闭 Tab <span className="kbd">⏎</span>
        </button>
        <button type="button" className="btn btn-ghost" disabled={!capturable}>
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
