import {
  DEFAULT_SETTINGS,
  SettingsSchema,
  type ServerRecord,
  type Session,
  type Settings,
} from '@x-threadpick/shared';

/**
 * 设置存取门面：browser.storage.local 单 key（'settings'）。
 * 出入过 SettingsSchema 校验；无记录或记录损坏时回退默认值（离线优先，读取不抛）。
 * 数据结构真源见 packages/shared/src/settings.ts。
 */

const STORAGE_KEY = 'settings';
const HISTORY_MAX = 20;

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const raw: unknown = stored[STORAGE_KEY];
  if (raw === undefined) return DEFAULT_SETTINGS;
  const result = SettingsSchema.safeParse(raw);
  if (!result.success) {
    console.warn('[x-threadpick] 本地设置校验失败，已回退默认值', result.error.issues);
    return DEFAULT_SETTINGS;
  }
  return result.data;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: SettingsSchema.parse(settings) });
}

/**
 * 登录成功：记录/刷新历史服务器（去重置顶、≤20、lastLoginAt=now）并设为当前，写入会话。
 * （spec feat02 场景1）
 */
export async function recordServerLogin(baseUrl: string, session: Session): Promise<Settings> {
  const current = await loadSettings();
  const record: ServerRecord = { baseUrl, lastLoginAt: new Date().toISOString() };
  const next: Settings = SettingsSchema.parse({
    ...current,
    history: [record, ...current.history.filter((s) => s.baseUrl !== baseUrl)].slice(
      0,
      HISTORY_MAX,
    ),
    activeServerUrl: baseUrl,
    session,
  });
  await saveSettings(next);
  return next;
}

/** 切换当前服务器（spec feat02 场景2）：只改指针，不动历史与会话。 */
export async function setActiveServer(baseUrl: string): Promise<Settings> {
  const current = await loadSettings();
  const next: Settings = SettingsSchema.parse({ ...current, activeServerUrl: baseUrl });
  await saveSettings(next);
  return next;
}

/**
 * 编辑历史记录（spec feat02 场景3）：改写地址；若改的是当前服务器，activeServerUrl 一并跟随。
 * 新地址与其它记录撞车时保留被编辑条、去掉重复的旧条。
 */
export async function updateServerRecord(
  oldBaseUrl: string,
  newBaseUrl: string,
): Promise<Settings> {
  const current = await loadSettings();
  if (!current.history.some((s) => s.baseUrl === oldBaseUrl)) return current;
  const rewritten = current.history.map((s) =>
    s.baseUrl === oldBaseUrl ? { ...s, baseUrl: newBaseUrl } : s,
  );
  const seen = new Set<string>();
  const history = rewritten.filter((s) => {
    if (seen.has(s.baseUrl)) return false;
    seen.add(s.baseUrl);
    return true;
  });
  const activeServerUrl =
    current.activeServerUrl === oldBaseUrl ? newBaseUrl : current.activeServerUrl;
  const next: Settings = SettingsSchema.parse({ ...current, history, activeServerUrl });
  await saveSettings(next);
  return next;
}

/** 删除历史记录（spec feat02 场景4）：当前项被删时 activeServerUrl 保留（地址栏内容不变）。 */
export async function removeServerRecord(baseUrl: string): Promise<Settings> {
  const current = await loadSettings();
  const next: Settings = SettingsSchema.parse({
    ...current,
    history: current.history.filter((s) => s.baseUrl !== baseUrl),
  });
  await saveSettings(next);
  return next;
}

/** 退出登录（spec feat04 场景1）：仅清 session；历史服务器、分类取值与本地书签不动。 */
export async function clearSession(): Promise<Settings> {
  const current = await loadSettings();
  const next: Settings = SettingsSchema.parse({ ...current, session: null });
  await saveSettings(next);
  return next;
}

/** 自动同步开关的账号键（feat11 场景3：开关跟随账号）；多库架构下同是账号库的库键。 */
export function accountKey(session: Pick<Session, 'serverUrl' | 'email'>): string {
  return `${session.serverUrl}#${session.email}`;
}

/** 设置某账号的自动同步开关（feat11 场景1/2）。 */
export async function setAutoSync(key: string, enabled: boolean): Promise<Settings> {
  const current = await loadSettings();
  const next: Settings = SettingsSchema.parse({
    ...current,
    autoSync: { ...current.autoSync, [key]: enabled },
  });
  await saveSettings(next);
  return next;
}

/** 新标签页接管开关（feat-newtab）：勾选后 background 把手动新建的空白标签页换成收藏主页。 */
export async function setNewtabEnabled(enabled: boolean): Promise<Settings> {
  const current = await loadSettings();
  const next: Settings = SettingsSchema.parse({ ...current, newtabEnabled: enabled });
  await saveSettings(next);
  return next;
}
