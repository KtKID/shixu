import { useEffect, useState } from 'react';
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  SessionSchema,
  type Session,
  type Settings,
} from '@x-threadpick/shared';
import {
  accountKey,
  clearSession,
  loadSettings,
  recordServerLogin,
  setAutoSync,
} from '../../db/settings';
import {
  getCurrentLibraryLastSyncAt,
  libraryHasLocalData,
  recallSession,
  rememberSession,
} from '../../db/library';
import {
  syncNow,
  syncSession,
  readCurrentLibraryServerBookmarksTotal,
  type SyncChangeSummary,
} from '../../db/sync';
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

/** 场景7：切换到本机没有库的账号，必须联网拉取云端收藏。 */
function needNetworkMessage(email: string): string {
  return `需要联网获取账号 ${email} 的收藏`;
}

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
  // 多库账号流（sync-archive feat01）：切换确认框 / 已登录态下的登录表单 / 上次同步随库读取
  const [pendingSwitchEmail, setPendingSwitchEmail] = useState<string | null>(null);
  const [switchingFormOpen, setSwitchingFormOpen] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  // 服务器概览（sync-archive feat05）：最近一次成功 pull 的服务器收藏总数，随库读取
  const [serverTotal, setServerTotal] = useState<number | null>(null);

  const session = settings.session;
  const sessionExpired = session !== null && session.expiresAt <= new Date().toISOString();
  const loggedIn = session !== null && !sessionExpired;
  const sessionKey = loggedIn && session !== null ? accountKey(session) : null;

  useEffect(() => {
    if (!sessionExpired) return;
    clearSession()
      .then(onSettingsChange)
      .catch((err: unknown) => console.error('[settings] 清理过期会话失败', err));
  }, [sessionExpired, onSettingsChange]);

  // 上次同步与服务器条数随当前库读取（task-account-libraries T4/T7 + sync-archive feat05）
  useEffect(() => {
    let active = true;
    Promise.all([getCurrentLibraryLastSyncAt(), readCurrentLibraryServerBookmarksTotal()])
      .then(([syncAt, total]) => {
        if (!active) return;
        setLastSyncAt(syncAt);
        setServerTotal(total);
      })
      .catch((err: unknown) => {
        if (!active) return; // 组件已卸载（库被重置/关闭）：静默
        console.error('[settings] 读取同步概览失败', err);
        setLastSyncAt(null);
        setServerTotal(null);
      });
    return () => {
      active = false;
    };
  }, [sessionKey]);

  /**
   * 登录/注册成功后的共同收尾（T7）：
   * - 本机没有该账号的库 → 先联网拉取云端收藏，失败则切换暂停（feat01 场景7）；
   * - 成功 → 记住会话（供离线切回，feat01 场景6）、写入登录态并切换界面到该账号库。
   * 返回 null 表示完成切换；返回错误文案表示暂停。
   */
  const completeLogin = async (newSession: Session): Promise<string | null> => {
    const targetKey = accountKey(newSession);
    if (!(await libraryHasLocalData(targetKey))) {
      const pull = await syncSession(newSession);
      if (pull.status !== 'ok') return needNetworkMessage(newSession.email);
    }
    await rememberSession(targetKey, newSession);
    const next = await recordServerLogin(newSession.serverUrl, newSession);
    onSettingsChange(next);
    return null;
  };

  /**
   * 登录提交（feat03 + feat01 多库）：
   * - 已登录状态下登录另一账号 → 先弹确认框（场景3：确认后 A 自动退出）；
   * - 服务器不可达时：本机有库且记得住会话 → 离线切回（场景6）；否则按是否有本地库分流提示（场景7）。
   */
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
    const targetKey = accountKey({ serverUrl: currentBaseUrl, email: parsed.data.email });
    if (loggedIn && session !== null && targetKey !== accountKey(session)) {
      setPendingSwitchEmail(parsed.data.email); // feat01 场景3：直接登录另一账号 = 切换
      return;
    }
    runLogin(parsed.data, currentBaseUrl).catch(() => undefined); // runLogin 自带兜底 catch
  };

  const confirmSwitch = (): void => {
    const target = pendingSwitchEmail;
    setPendingSwitchEmail(null);
    if (target === null || currentBaseUrl === null || phase !== 'idle') return;
    runLogin({ email: target, password }, currentBaseUrl).catch(() => undefined);
  };

  const runLogin = async (
    request: { email: string; password: string },
    baseUrl: string,
  ): Promise<void> => {
    const targetKey = accountKey({ serverUrl: baseUrl, email: request.email });
    try {
      setPhase('checking');
      try {
        await testConnection(baseUrl);
      } catch {
        setPhase('idle');
        // 场景6：本机有库 + 记得住的有效会话 → 离线切回
        const remembered = await recallSession(targetKey);
        if (
          remembered !== null &&
          remembered.email === request.email &&
          remembered.serverUrl === baseUrl &&
          remembered.expiresAt > new Date().toISOString()
        ) {
          const error = await completeLogin(remembered);
          if (error === null) {
            setPassword('');
            setSwitchingFormOpen(false);
          } else {
            setMessage(error);
          }
          return;
        }
        // 场景7：切换到本机没有库的另一账号 → 需联网拉取；其余沿用通用连接失败提示（feat03 场景3）
        const switchingAccount = loggedIn && session !== null && targetKey !== accountKey(session);
        setMessage(
          switchingAccount && !(await libraryHasLocalData(targetKey))
            ? needNetworkMessage(request.email)
            : SERVER_UNREACHABLE_MESSAGE,
        );
        return;
      }
      setPhase('submitting');
      const outcome = await login(baseUrl, request);
      if (outcome.status !== 'ok') {
        setPhase('idle');
        if (outcome.status === 'invalid_credentials') {
          setMessage('邮箱或密码不正确');
        } else if (outcome.status === 'unreachable') {
          setMessage(SERVER_UNREACHABLE_MESSAGE);
        } else {
          setMessage('登录失败，请稍后重试');
        }
        return;
      }
      const newSession = SessionSchema.parse({
        email: request.email,
        serverUrl: baseUrl,
        token: outcome.token,
        expiresAt: outcome.expiresAt,
      });
      const error = await completeLogin(newSession);
      setPhase('idle');
      if (error !== null) {
        setMessage(error); // 场景7：切换暂停，不记录登录
        return;
      }
      setPassword('');
      setSwitchingFormOpen(false);
    } catch (err: unknown) {
      console.error('[settings] 登录失败', err);
      setPhase('idle');
      setMessage(SERVER_UNREACHABLE_MESSAGE);
    }
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
          const error = await completeLogin(newSession);
          setRegPhase('idle');
          if (error !== null) {
            setRegMessage(error);
            return;
          }
          setRegisterOpen(false);
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

  /** 退出登录（feat04 场景1 / feat01 场景8）：仅清 session，界面与读写回 default 库。 */
  const logout = (): void => {
    setSwitchingFormOpen(false);
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
          // 先取齐再一次性 setState（React 批处理）：tips 与「上次同步」/服务器条数同帧刷新，避免半更新状态
          const [refreshedLastSyncAt, refreshedTotal] = await Promise.all([
            getCurrentLibraryLastSyncAt().catch(() => null),
            readCurrentLibraryServerBookmarksTotal().catch(() => null),
          ]);
          const nextSettings = await loadSettings();
          setSyncTips({ changes: result.changes, pushed: result.pushed });
          onSettingsChange(nextSettings);
          setLastSyncAt(refreshedLastSyncAt);
          setServerTotal(refreshedTotal);
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

  const loginForm = (
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
  );

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

      {loggedIn && session !== null && !switchingFormOpen ? (
        <div className="session">
          <div className="session-top">
            <div className="session-id">
              <div className="avatar serif">{session.email.charAt(0).toUpperCase() || '·'}</div>
              <div className="session-meta">
                <b>{session.email}</b>
                <small>
                  上次同步：{lastSyncAt !== null ? formatDateTime(lastSyncAt) : '尚未同步'}
                  {/* feat05 场景1/2：同步过才显示服务器条数，从未同步不出现该行 */}
                  {serverTotal !== null && <> · 服务器上共 {serverTotal} 条收藏</>}
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
          <div className="session-switch">
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setMessage(null);
                setSwitchingFormOpen(true);
              }}
            >
              切换账号
            </button>
          </div>
        </div>
      ) : (
        loginForm
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
      {pendingSwitchEmail !== null && session !== null && (
        <div className="modal-overlay">
          <div className="card modal" role="dialog" aria-label="切换账号">
            <div className="card-head">
              <div className="card-title serif">
                切换账号<span className="en">Switch</span>
              </div>
            </div>
            <p className="card-desc">
              当前已登录账号 {session.email}。直接登录账号 {pendingSwitchEmail}{' '}
              将切换到它的收藏库，账号 {session.email}{' '}
              会自动退出（本机数据保留，下次登录完整回来）。
            </p>
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={confirmSwitch}>
                确认切换
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => setPendingSwitchEmail(null)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
