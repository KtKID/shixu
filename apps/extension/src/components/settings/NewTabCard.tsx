import { type Settings } from '@x-threadpick/shared';
import { setNewtabEnabled } from '../../db/settings';

/**
 * 新标签页卡（feat-newtab）：挂在主页「通用」分区。
 * 接管由用户在设置里主动勾选开启——background 只替换「手动新建的空白标签页」，
 * 未勾选时完全不干预浏览器行为；取消勾选立即恢复默认，无需重载扩展。
 */

interface Props {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
}

export default function NewTabCard({ settings, onSettingsChange }: Props) {
  const toggle = (enabled: boolean): void => {
    setNewtabEnabled(enabled)
      .then(onSettingsChange)
      .catch((err: unknown) => console.error('[settings] 设置新标签页失败', err));
  };

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title serif">
          新标签页<span className="en">New Tab</span>
        </div>
      </div>
      <p className="card-desc">
        把浏览器的新标签页换成拾绪收藏主页（落在「全部收藏」）。只替换手动新建的空白标签页，
        点链接、恢复会话打开的页面不受影响。
      </p>
      <div className="actions">
        <label className="check-inline">
          <input
            type="checkbox"
            checked={settings.newtabEnabled}
            onChange={(e) => toggle(e.target.checked)}
          />
          新建标签页时打开拾绪
        </label>
        <span className="status">随时可改，取消勾选立即恢复浏览器默认</span>
      </div>
    </section>
  );
}
