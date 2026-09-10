import { useState } from 'react';
import type { Settings } from '@x-threadpick/shared';
import { removeServerRecord, setActiveServer, updateServerRecord } from '../../db/settings';
import { buildBaseUrl, splitBaseUrl, testConnection } from './api';
import { formatDateTime } from './format';

type ConnPhase = 'idle' | 'busy' | 'ok' | 'err';

interface Props {
  settings: Settings;
  host: string;
  port: string;
  onHostChange: (host: string) => void;
  onPortChange: (port: string) => void;
  onSettingsChange: (settings: Settings) => void;
}

const DOT_CLASS: Record<ConnPhase, string> = {
  idle: 'dot',
  busy: 'dot busy',
  ok: 'dot ok',
  err: 'dot err',
};

export default function ServerCard({
  settings,
  host,
  port,
  onHostChange,
  onPortChange,
  onSettingsChange,
}: Props) {
  const [phase, setPhase] = useState<ConnPhase>('idle');
  const [connText, setConnText] = useState('尚未测试连接');
  const [connDetail, setConnDetail] = useState('');
  const [editing, setEditing] = useState<{ baseUrl: string; host: string; port: string } | null>(
    null,
  );

  const runTest = (targetHost: string, targetPort: string): void => {
    const baseUrl = buildBaseUrl(targetHost, targetPort);
    if (baseUrl === null) {
      setPhase('err');
      setConnText('连接失败');
      setConnDetail('请先填写服务器地址与端口');
      return;
    }
    setPhase('busy');
    setConnText(`正在连接 ${targetHost}:${targetPort} …`);
    setConnDetail('');
    testConnection(baseUrl)
      .then((result) => {
        setPhase('ok');
        setConnText('连接成功');
        setConnDetail(`延迟 ${result.latencyMs}ms · 服务版本 ${result.version}`);
      })
      .catch(() => {
        setPhase('err');
        setConnText('连接失败');
        setConnDetail('无法访问服务器或连接超时');
      });
  };

  const switchServer = (baseUrl: string): void => {
    const form = splitBaseUrl(baseUrl);
    onHostChange(form.host);
    onPortChange(form.port);
    setActiveServer(baseUrl)
      .then(onSettingsChange)
      .catch((err: unknown) => console.error('[settings] 切换服务器失败', err));
    runTest(form.host, form.port);
  };

  const saveEdit = (): void => {
    if (editing === null) return;
    const next = buildBaseUrl(editing.host, editing.port);
    if (next === null) return;
    const wasActive = settings.activeServerUrl === editing.baseUrl;
    updateServerRecord(editing.baseUrl, next)
      .then((nextSettings) => {
        onSettingsChange(nextSettings);
        if (wasActive) {
          const form = splitBaseUrl(next);
          onHostChange(form.host);
          onPortChange(form.port);
        }
        setEditing(null);
      })
      .catch((err: unknown) => console.error('[settings] 更新历史记录失败', err));
  };

  const deleteServer = (baseUrl: string): void => {
    removeServerRecord(baseUrl)
      .then((nextSettings) => {
        onSettingsChange(nextSettings);
        if (editing?.baseUrl === baseUrl) setEditing(null);
      })
      .catch((err: unknown) => console.error('[settings] 删除历史记录失败', err));
  };

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title serif">
          服务器<span className="en">Server</span>
        </div>
        <div className="status">
          <span className={DOT_CLASS[phase]} />
          {connText}
        </div>
      </div>
      <p className="card-desc">书签的 URL、标题、摘要、备注与分类属性将同步到此服务。</p>
      <div className="field-row">
        <div className="field">
          <label htmlFor="host">服务器地址</label>
          <input
            id="host"
            type="text"
            placeholder="sync.example.com"
            value={host}
            onChange={(e) => onHostChange(e.target.value)}
          />
        </div>
        <div className="field narrow">
          <label htmlFor="port">端口</label>
          <input
            id="port"
            type="number"
            placeholder="8443"
            value={port}
            onChange={(e) => onPortChange(e.target.value)}
          />
        </div>
      </div>
      <div className="actions">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={phase === 'busy'}
          onClick={() => runTest(host, port)}
        >
          测试连接
        </button>
        <span className="status">{connDetail}</span>
      </div>

      <div className="srv-list">
        <div className="srv-list-title">历史服务器 · 登录成功后自动记录，点击即可切换</div>
        {settings.history.length === 0 ? (
          <div className="srv-meta empty">暂无记录，登录成功后自动保存。</div>
        ) : (
          settings.history.map((record) => {
            const form = splitBaseUrl(record.baseUrl);
            const active = record.baseUrl === settings.activeServerUrl;
            if (editing?.baseUrl === record.baseUrl) {
              return (
                <div key={record.baseUrl} className="srv-item">
                  <div className="srv-edit">
                    <input
                      type="text"
                      className="e-host"
                      aria-label="历史服务器地址"
                      value={editing.host}
                      onChange={(e) => setEditing({ ...editing, host: e.target.value })}
                    />
                    <span className="srv-colon">:</span>
                    <input
                      type="number"
                      className="e-port"
                      aria-label="历史端口"
                      value={editing.port}
                      onChange={(e) => setEditing({ ...editing, port: e.target.value })}
                    />
                  </div>
                  <div className="srv-actions">
                    <button type="button" className="link-btn" onClick={saveEdit}>
                      保存
                    </button>
                    <button type="button" className="link-btn" onClick={() => setEditing(null)}>
                      取消
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div key={record.baseUrl} className={`srv-item${active ? ' active' : ''}`}>
                <button
                  type="button"
                  className="srv-radio"
                  title="切换到此服务器"
                  aria-label={`切换到 ${record.baseUrl}`}
                  onClick={() => switchServer(record.baseUrl)}
                />
                <div className="srv-info">
                  <button
                    type="button"
                    className="srv-addr"
                    onClick={() => switchServer(record.baseUrl)}
                  >
                    {form.host}
                    <span className="srv-colon">:</span>
                    {form.port}
                    {active && <span className="srv-badge">当前</span>}
                  </button>
                  <div className="srv-meta">
                    上次登录成功 · {formatDateTime(record.lastLoginAt)}
                  </div>
                </div>
                <div className="srv-actions">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() =>
                      setEditing({ baseUrl: record.baseUrl, host: form.host, port: form.port })
                    }
                  >
                    修改
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => deleteServer(record.baseUrl)}
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
