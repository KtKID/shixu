import { useEffect, useMemo, useState } from 'react';
import type { Settings } from '@x-threadpick/shared';
import { loadSettings } from '../../db/settings';
import { buildBaseUrl, splitBaseUrl } from './api';
import AccountCard from './AccountCard';
import DimensionsCard from './DimensionsCard';
import ServerCard from './ServerCard';

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');

  useEffect(() => {
    loadSettings()
      .then((loaded) => {
        setSettings(loaded);
        if (loaded.activeServerUrl !== null) {
          const form = splitBaseUrl(loaded.activeServerUrl);
          setHost(form.host);
          setPort(form.port);
        }
      })
      .catch((err: unknown) => console.error('[settings] 加载设置失败', err));
  }, []);

  const currentBaseUrl = useMemo(() => buildBaseUrl(host, port), [host, port]);

  return (
    <div className="page">
      <header>
        <div className="brand">
          <div className="brand-mark serif">✦</div>
          <div className="brand-name">
            <b>拾绪</b> · 个人上下文记忆层
          </div>
        </div>
        <h1 className="serif">设置</h1>
        <p className="subtitle">连接你的同步服务，定义属于你的分类维度。</p>
      </header>

      {settings === null ? (
        <p className="loading">正在载入设置…</p>
      ) : (
        <>
          <ServerCard
            settings={settings}
            host={host}
            port={port}
            onHostChange={setHost}
            onPortChange={setPort}
            onSettingsChange={setSettings}
          />
          <AccountCard
            settings={settings}
            currentBaseUrl={currentBaseUrl}
            onSettingsChange={setSettings}
          />
          <DimensionsCard />
        </>
      )}

      <footer className="serif">Save → Understand → Resurface</footer>
    </div>
  );
}
