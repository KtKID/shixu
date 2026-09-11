import { useEffect, useMemo, useState } from 'react';
import type { Settings } from '@x-threadpick/shared';
import { loadSettings } from '../../db/settings';
import { buildBaseUrl, splitBaseUrl } from '../../components/settings/api';
import AccountCard from '../../components/settings/AccountCard';
import DimensionsCard from '../../components/settings/DimensionsCard';
import ServerCard from '../../components/settings/ServerCard';
import RecentSection from './sections/RecentSection';
import ImportSection from './sections/ImportSection';

/**
 * 插件主页外壳：左侧导航（条目即功能分区）+ 右侧内容区。
 * 导航固定四项、无预留项（feat02 场景1/3）；内容区水平居中且有最大宽度（feat02 场景4，见 index.css）。
 * 地址 hash 指定初始条目（#network 等），供 popup「设置」按钮直达（feat01 场景2）。
 * 「网络连接」「分类维度」内的行为沿用《设置页面》spec，卡片自原 settings entrypoint 迁入公共目录。
 */

export type SectionKey = 'recent' | 'network' | 'dimensions' | 'import';

const SECTIONS: readonly { key: SectionKey; label: string; icon: string }[] = [
  { key: 'recent', label: '最近新增', icon: '⌂' },
  { key: 'network', label: '网络连接', icon: '⟡' },
  { key: 'dimensions', label: '分类维度', icon: '❖' },
  { key: 'import', label: '导入已有书签', icon: '⇩' },
];

/** '#network' → 'network'；空或未知值回退默认条目「最近新增」。 */
export function parseSectionHash(hash: string): SectionKey {
  const key = hash.replace(/^#/, '');
  const hit = SECTIONS.find((section) => section.key === key);
  return hit === undefined ? 'recent' : hit.key;
}

export default function App({ initialSection = 'recent' }: { initialSection?: SectionKey }) {
  const [section, setSection] = useState<SectionKey>(initialSection);
  // 「网络连接」分区的受控表单（接线迁自原 settings entrypoint，行为不变）
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
      .catch((err: unknown) => console.error('[home] 加载设置失败', err));
  }, []);

  const currentBaseUrl = useMemo(() => buildBaseUrl(host, port), [host, port]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark serif">✦</div>
          <div className="brand-name serif">拾绪</div>
        </div>
        <nav className="nav" aria-label="主导航">
          {SECTIONS.map((item) => {
            const active = section === item.key;
            return (
              <button
                type="button"
                key={item.key}
                className={`nav-item${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => setSection(item.key)}
              >
                <span className="ic" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-quote">
          好的信息，
          <br />
          会在合适的时候，
          <br />
          再次出现。
        </div>
      </aside>

      <main className="main">
        <div className="main-inner">
          {section === 'recent' && (
            <section className="section" aria-label="最近新增">
              <RecentSection onNavigateImport={() => setSection('import')} />
            </section>
          )}
          {section === 'network' && (
            <section className="section" aria-label="网络连接">
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
                </>
              )}
            </section>
          )}
          {section === 'dimensions' && (
            <section className="section" aria-label="分类维度">
              <DimensionsCard />
            </section>
          )}
          {section === 'import' && (
            <section className="section" aria-label="导入已有书签">
              <ImportSection />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
