import { useEffect, useState } from 'react';
import { LoginRequestSchema, SessionSchema, type Settings } from '@x-threadpick/shared';
import { clearSession, recordServerLogin } from '../../db/settings';
import { login, testConnection } from './api';
import { formatDateTime } from './format';

type Phase = 'idle' | 'checking' | 'logging';

interface Props {
  settings: Settings;
  currentBaseUrl: string | null;
  onSettingsChange: (settings: Settings) => void;
}

const SERVER_UNREACHABLE_MESSAGE = '连接失败，请先检查服务器地址';

export default function AccountCard({ settings, currentBaseUrl, onSettingsChange }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const session = settings.session;
  const sessionExpired = session !== null && session.expiresAt <= new Date().toISOString();
  const loggedIn = session !== null && !sessionExpired;

  useEffect(() => {
    if (!sessionExpired) return;
    clearSession()
      .then(onSettingsChange)
      .catch((err: unknown) => console.error('[settings] 清理过期会话失败', err));
  }, [sessionExpired, onSettingsChange]);

  const submitLogin = (): void => {
    if (phase !== 'idle') return;
    setMessage(null);
    const parsed = LoginRequestSchema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      setMessage('请输入有效的邮箱与密码（密码至少 8 位）');
      return;
    }
    // feat03 场景3：地址未填/不可达 → 提示并停留，不进入登录中状态
    if (currentBaseUrl === null) {
      setMessage(SERVER_UNREACHABLE_MESSAGE);
      return;
    }
    const baseUrl = currentBaseUrl;
    setPhase('checking');
    testConnection(baseUrl)
      .then(() => {
        setPhase('logging');
        return login(baseUrl, parsed.data);
      })
      .then(async (outcome) => {
        if (outcome.status === 'ok') {
          const newSession = SessionSchema.parse({
            email: parsed.data.email,
            serverUrl: baseUrl,
            token: outcome.token,
            expiresAt: outcome.expiresAt,
          });
          const next = await recordServerLogin(baseUrl, newSession);
          setPhase('idle');
          setPassword('');
          onSettingsChange(next);
          return;
        }
        setPhase('idle');
        if (outcome.status === 'invalid_credentials') {
          setMessage('邮箱或密码不正确');
        } else if (outcome.status === 'unreachable') {
          setMessage(SERVER_UNREACHABLE_MESSAGE);
        } else {
          setMessage('登录失败，请稍后重试');
        }
      })
      .catch(() => {
        setPhase('idle');
        setMessage(SERVER_UNREACHABLE_MESSAGE);
      });
  };

  const logout = (): void => {
    clearSession()
      .then(onSettingsChange)
      .catch((err: unknown) => console.error('[settings] 退出登录失败', err));
  };

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title serif">
          账号<span className="en">Account</span>
        </div>
        <div className="status">
          <span className={`dot${loggedIn ? ' ok' : ''}`} />
          {loggedIn ? '已登录 · 同步开启' : '未登录'}
        </div>
      </div>

      {loggedIn && session !== null ? (
        <div className="session">
          <div className="session-id">
            <div className="avatar serif">{session.email.charAt(0).toUpperCase() || '·'}</div>
            <div className="session-meta">
              <b>{session.email}</b>
              <small>
                上次同步：
                {settings.lastSyncAt !== null ? formatDateTime(settings.lastSyncAt) : '尚未同步'}
              </small>
            </div>
          </div>
          <button type="button" className="link-btn" onClick={logout}>
            退出登录
          </button>
        </div>
      ) : (
        <div>
          <p className="card-desc">使用邮箱与密码登录，登录后开启增量同步。</p>
          <div className="field">
            <label htmlFor="email">邮箱</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={phase !== 'idle'}
              onClick={submitLogin}
            >
              {phase === 'checking' ? '检查服务器…' : phase === 'logging' ? '登录中…' : '登录'}
            </button>
            {message !== null && <span className="status err-text">{message}</span>}
          </div>
        </div>
      )}
      {/* feat03 场景5：v1 账号由服务器管理员创建，登录表单不出现注册入口 */}
    </section>
  );
}
