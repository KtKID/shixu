import { useEffect, useState } from 'react';
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  SessionSchema,
  type Settings,
} from '@x-threadpick/shared';
import {
  clearSession,
  loadSettings,
  recordServerLogin,
  setAutoSync,
  accountKey,
} from '../../db/settings';
import { syncNow, type SyncChangeSummary } from '../../db/sync';
import { login, register, testConnection } from './api';
import { formatDateTime } from './format';

type Phase = 'idle' | 'checking' | 'submitting';

interface Props {
  settings: Settings;
  currentBaseUrl: string | null;
  onSettingsChange: (settings: Settings) => void;
}

const SERVER_UNREACHABLE_MESSAGE = '连接失败，请先检查服务器地址';
const PASSWORD_RULE_MESSAGE = '密码需包含英文和数字，且大于 5 位';

export default function AccountCard({ settings, currentBaseUrl, onSettingsChange }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhase, setRegPhase] = useState<Phase>('idle');
  const [regMessage, setRegMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncTips, setSyncTips] = useState<{
    changes: SyncChangeSummary;
    pushed: number;
  } | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

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
      setMessage('请输入有效的邮箱与密码（密码至少 6 位）');
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
        setPhase('submitting');
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

  const openRegister = (): void => {
    setRegEmail(email);
    setRegPassword('');
    setRegMessage(null);
    setRegPhase('idle');
    setRegisterOpen(true);
  };

  const submitRegister = (): void => {
    if (regPhase !== 'idle') return;
    setRegMessage(null);
    const parsed = RegisterRequestSchema.safeParse({
      email: regEmail.trim(),
      password: regPassword,
    });
    if (!parsed.success) {
      setRegMessage(
        RegisterRequestSchema.shape.email.safeParse(regEmail.trim()).success
          ? PASSWORD_RULE_MESSAGE
          : '请输入有效的邮箱',
      );
      return;
    }
    // feat09 场景4：地址未填/不可达 → 提示并停留弹窗
    if (currentBaseUrl === null) {
      setRegMessage(SERVER_UNREACHABLE_MESSAGE);
      return;
    }
    const baseUrl = currentBaseUrl;
    setRegPhase('checking');
    testConnection(baseUrl)
      .then(() => {
        setRegPhase('submitting');
        return register(baseUrl, parsed.data);
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
          setRegPhase('idle');
          setRegisterOpen(false);
          onSettingsChange(next);
          return;
        }
        setRegPhase('idle');
        if (outcome.status === 'email_taken') {
          setRegMessage('该邮箱已注册');
        } else if (outcome.status === 'unreachable') {
          setRegMessage(SERVER_UNREACHABLE_MESSAGE);
        } else {
          setRegMessage('创建失败，请稍后重试');
        }
      })
      .catch(() => {
        setRegPhase('idle');
        setRegMessage(SERVER_UNREACHABLE_MESSAGE);
      });
  };

  const logout = (): void => {
    clearSession()
      .then(onSettingsChange)
      .catch((err: unknown) => console.error('[settings] 退出登录失败', err));
  };

  const runSync = (): void => {
    if (syncing) return;
    setSyncing(true);
    setSyncMessage(null);
    setSyncTips(null);
    syncNow()
      .then(async (result) => {
        setSyncing(false);
        if (result.status === 'ok') {
          setSyncTips({ changes: result.changes, pushed: result.pushed });
          onSettingsChange(await loadSettings()); // 刷新「上次同步」
          return;
        }
        if (result.status === 'unauthorized' || result.status === 'not_logged_in') {
          // feat10 场景3：登录已过期 → 提示并回到登录表单
          setSyncMessage('登录已过期，请重新登录');
          onSettingsChange(await clearSession());
          return;
        }
        setSyncMessage('同步失败，请检查服务器地址或稍后重试');
      })
      .catch((err: unknown) => {
        setSyncing(false);
        setSyncMessage('同步失败，请检查服务器地址或稍后重试');
        console.error('[settings] 同步失败', err);
      });
  };

  const toggleAutoSync = (enabled: boolean): void => {
    if (session === null) return;
    setAutoSync(accountKey(session), enabled)
      .then(onSettingsChange)
      .catch((err: unknown) => console.error('[settings] 设置自动同步失败', err));
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
          <div className="session-top">
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
          <div className="session-ops">
            <button
              type="button"
              className="btn btn-primary btn-sync"
              disabled={syncing}
              onClick={runSync}
            >
              {syncing ? '同步中…' : '同步收藏'}
            </button>
            <label className="check-inline">
              <input
                type="checkbox"
                checked={settings.autoSync[accountKey(session)] === true}
                onChange={(e) => toggleAutoSync(e.target.checked)}
              />
              自动同步
            </label>
          </div>
          {syncTips !== null && (
            <p className="sync-tips">
              {syncTips.changes.added + syncTips.changes.updated + syncTips.changes.deleted === 0 &&
              syncTips.pushed === 0 ? (
                '本次同步无变更'
              ) : (
                <>
                  <span>本次同步：</span>
                  {syncTips.changes.added > 0 && (
                    <span className="cnt-add">新增 {syncTips.changes.added}</span>
                  )}
                  {syncTips.changes.updated > 0 && (
                    <span className="cnt-upd">修改 {syncTips.changes.updated}</span>
                  )}
                  {syncTips.changes.deleted > 0 && (
                    <span className="cnt-del">删除 {syncTips.changes.deleted}</span>
                  )}
                  {syncTips.pushed > 0 && <span className="cnt-push">上传 {syncTips.pushed}</span>}
                </>
              )}
            </p>
          )}
          {syncMessage !== null && <p className="status err-text">{syncMessage}</p>}
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
              {phase === 'checking' ? '检查服务器…' : phase === 'submitting' ? '登录中…' : '登录'}
            </button>
            <button type="button" className="link-btn" onClick={openRegister}>
              创建账号
            </button>
            {message !== null && <span className="status err-text">{message}</span>}
          </div>
        </div>
      )}
      {registerOpen && (
        <div className="modal-overlay">
          <div className="card modal" role="dialog" aria-label="创建账号">
            <div className="card-head">
              <div className="card-title serif">
                创建账号<span className="en">Register</span>
              </div>
            </div>
            <p className="card-desc">在当前服务器上创建账号，创建完成自动登录。</p>
            <div className="field">
              <label htmlFor="reg-email">邮箱</label>
              <input
                id="reg-email"
                type="email"
                placeholder="you@example.com"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="reg-password">设置密码</label>
              <input
                id="reg-password"
                type="password"
                placeholder="英文+数字，大于 5 位"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
              />
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={regPhase !== 'idle'}
                onClick={submitRegister}
              >
                {regPhase === 'checking'
                  ? '检查服务器…'
                  : regPhase === 'submitting'
                    ? '创建中…'
                    : '创建'}
              </button>
              <button
                type="button"
                className="link-btn"
                disabled={regPhase !== 'idle'}
                onClick={() => setRegisterOpen(false)}
              >
                取消
              </button>
              {regMessage !== null && <span className="status err-text">{regMessage}</span>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
