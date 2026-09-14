import { useEffect, useMemo, useState } from 'react';
import type { Settings } from '@x-threadpick/shared';
import { accountKey, loadSettings } from '../../db/settings';
import { DEFAULT_LIBRARY_KEY } from '../../db/library';
import { buildBaseUrl, splitBaseUrl } from '../../components/settings/api';
import { ACCOUNT_FEATURES } from '../../lib/variant';
import AccountCard from '../../components/settings/AccountCard';
import DimensionsCard from '../../components/settings/DimensionsCard';
import NewTabCard from '../../components/settings/NewTabCard';
import ServerCard from '../../components/settings/ServerCard';
import SnapshotCard from '../../components/settings/SnapshotCard';
import RecentSection from './sections/RecentSection';
import ImportSection from './sections/ImportSection';

/**
 * 插件主页外壳：左侧导航（条目即功能分区）+ 右侧内容区。
 * 导航固定项、无预留项（feat02 场景1/3，feat07 增补「全部收藏」）；内容区水平居中且有最大宽度（feat02 场景4，见 index.css）。
 * 地址 hash 指定初始条目（#network 等），供 popup「设置」按钮直达（feat01 场景2）。
 * 切换条目时 hash 跟随回写并产生浏览历史，hashchange（手动改地址/前进后退）反向同步选中条目（feat02 场景5）。
 * 「网络连接」「分类维度」内的行为沿用《设置页面》spec，卡片自原 settings entrypoint 迁入公共目录。
 * 多库架构（sync-archive feat01 / task-account-libraries T8）：数据分区按当前库键 remount——
 * 登录、登出、切换账号后界面立即换库（settings 派生 libraryKey，各库互不混入）；
 * 设置未载入前不渲染数据分区，避免登录用户的界面上闪过 default 库内容。
 * 商店无账号版（lib/variant）：「网络连接」整个分区不存在，#network hash 回退「最近新增」。
 */

export type SectionKey = 'recent' | 'library' | 'network' | 'dimensions' | 'import' | 'general';

const SECTIONS: readonly { key: SectionKey; label: string; icon: string }[] = [
  { key: 'recent', label: '最近新增', icon: '⌂' },
  { key: 'library', label: '全部收藏', icon: '▤' },
  // 「网络连接」承载账号/同步/快照，纯本地商店版不渲染该条目
  ...(ACCOUNT_FEATURES ? [{ key: 'network' as const, label: '网络连接', icon: '⟡' }] : []),
  { key: 'dimensions', label: '分类维度', icon: '❖' },
  { key: 'import', label: '导入已有书签', icon: '⇩' },
  { key: 'general', label: '通用', icon: '⚙' },
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
    const onHashChange = () => setSection(parseSectionHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (key: SectionKey) => {
    setSection(key);
    window.location.hash = key;
  };

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

  // 当前库键：登录 = 账号键，未登录 = default；settings 未载入 = null（数据分区暂不渲染）
  const libraryKey =
    settings !== null && settings.session !== null
      ? accountKey(settings.session)
      : settings !== null
        ? DEFAULT_LIBRARY_KEY
        : null;

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
                onClick={() => navigate(item.key)}
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
          {libraryKey === null && section !== 'network' && section !== 'general' && (
            <p className="loading">正在载入…</p>
          )}
          {section === 'recent' && libraryKey !== null && (
            <section className="section" aria-label="最近新增">
              <RecentSection key={libraryKey} onNavigateImport={() => navigate('import')} />
            </section>
          )}
          {section === 'library' && libraryKey !== null && (
            <section className="section" aria-label="全部收藏">
              <RecentSection
                key={libraryKey}
                variant="library"
                onNavigateImport={() => navigate('import')}
              />
            </section>
          )}
          {ACCOUNT_FEATURES && section === 'network' && (
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
                  {/* 快照存档（sync-archive feat07/feat08）：挂在账号卡下方 */}
                  <SnapshotCard settings={settings} />
                </>
              )}
            </section>
          )}
          {section === 'dimensions' && libraryKey !== null && (
            <section className="section" aria-label="分类维度">
              <DimensionsCard key={libraryKey} />
            </section>
          )}
          {section === 'import' && libraryKey !== null && (
            <section className="section" aria-label="导入已有书签">
              <ImportSection key={libraryKey} />
            </section>
          )}
          {section === 'general' && (
            <section className="section" aria-label="通用">
              {settings === null ? (
                <p className="loading">正在载入设置…</p>
              ) : (
                <NewTabCard settings={settings} onSettingsChange={setSettings} />
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
