import {
  HealthResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  RegisterRequestSchema,
  SnapshotCreateRequestSchema,
  SnapshotCreateResponseSchema,
  SnapshotDeleteResponseSchema,
  SnapshotDetailResponseSchema,
  SnapshotListResponseSchema,
  SyncPullResponseSchema,
  SyncPushRequestSchema,
  SyncPushResponseSchema,
  type LoginRequest,
  type RegisterRequest,
  type SnapshotCreateRequest,
  type SnapshotCreateResponse,
  type SnapshotDeleteResponse,
  type SnapshotDetailResponse,
  type SnapshotListResponse,
  type SyncPullResponse,
  type SyncPushRequest,
  type SyncPushResponse,
} from '@x-threadpick/shared';

/**
 * 设置页协议客户端：所有出入服务器的数据经 packages/shared schema 校验（面向协议开发）。
 * ServerRecord 存完整 baseUrl（含协议）；host/端口拆分输入由本模块负责拼装与还原。
 */

const REQUEST_TIMEOUT_MS = 8000;

/** 服务器状态周期复测间隔（feat12 场景4）：页面停留期间每分钟安静复测一次 */
export const SERVER_PROBE_INTERVAL_MS = 60_000;

function isBracketedIpv6(host: string): boolean {
  return /^\[[0-9a-f:.]+\]$/i.test(host);
}

function isLocalHostname(host: string): boolean {
  return (
    host === 'localhost' ||
    host.startsWith('127.') ||
    host === '[::1]' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.')
  );
}

/**
 * host 栏可带协议（http(s)://…），也可整段粘贴 host:port（端口栏为空时拆出）。
 * 缺省协议：localhost / 环回 / 内网地址用 http（本地开发服务），其余 https。
 * 地址或端口缺失/不合法时返回 null，由 UI 提示「请先填写服务器地址与端口」（feat01 场景2）。
 */
export function buildBaseUrl(hostInput: string, portInput: string): string | null {
  let host = hostInput.trim();
  let port = portInput.trim();

  let scheme = '';
  const schemeMatch = /^(https?):\/\//i.exec(host);
  if (schemeMatch !== null) {
    scheme = (schemeMatch[1] ?? '').toLowerCase();
    host = host.slice(schemeMatch[0].length);
  }

  if (port === '') {
    const embedded = /^(.+):(\d{1,5})$/.exec(host);
    if (embedded !== null) {
      const maybeHost = embedded[1] ?? '';
      if (isBracketedIpv6(maybeHost) || !maybeHost.includes(':')) {
        host = maybeHost;
        port = embedded[2] ?? '';
      }
    }
  }

  if (host === '' || port === '' || !/^\d{1,5}$/.test(port)) return null;
  const portNum = Number(port);
  if (portNum < 1 || portNum > 65535) return null;
  if (!/^[a-z0-9.-]+$/i.test(host) && !isBracketedIpv6(host)) return null;
  if (scheme === '') scheme = isLocalHostname(host) ? 'http' : 'https';
  return `${scheme}://${host}:${port}`;
}

export interface ServerFormValue {
  host: string;
  port: string;
}

/** baseUrl → 地址/端口表单值；无显式端口时按协议补默认端口（https 443 / http 80）。 */
export function splitBaseUrl(baseUrl: string): ServerFormValue {
  const url = new URL(baseUrl);
  const port = url.port !== '' ? url.port : url.protocol === 'https:' ? '443' : '80';
  return { host: url.hostname, port };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface ConnectionTestResult {
  latencyMs: number;
  version: string;
}

/** GET /healthz：成功返回往返延迟与服务版本；网络失败 / 非 2xx / 协议不符时抛错（feat01）。 */
export async function testConnection(baseUrl: string): Promise<ConnectionTestResult> {
  const start = performance.now();
  const response = await fetchWithTimeout(`${baseUrl}/healthz`, { method: 'GET' });
  if (!response.ok) throw new Error(`healthz 返回 ${response.status}`);
  const raw: unknown = await response.json();
  const health = HealthResponseSchema.parse(raw);
  return { latencyMs: Math.max(0, Math.round(performance.now() - start)), version: health.version };
}

export type LoginOutcome =
  | { status: 'ok'; token: string; expiresAt: string }
  | { status: 'invalid_credentials' }
  | { status: 'unreachable' }
  | { status: 'server_error' };

/** POST /auth/login：401 → invalid_credentials；网络异常 → unreachable；协议不符 → server_error。 */
export async function login(baseUrl: string, request: LoginRequest): Promise<LoginOutcome> {
  const body = JSON.stringify(LoginRequestSchema.parse(request));
  try {
    const response = await fetchWithTimeout(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (response.status === 401) return { status: 'invalid_credentials' };
    if (!response.ok) return { status: 'server_error' };
    const raw: unknown = await response.json();
    const parsed = LoginResponseSchema.safeParse(raw);
    if (!parsed.success) return { status: 'server_error' };
    return { status: 'ok', token: parsed.data.token, expiresAt: parsed.data.expiresAt };
  } catch {
    return { status: 'unreachable' };
  }
}

export type RegisterOutcome =
  | { status: 'ok'; token: string; expiresAt: string }
  | { status: 'email_taken' }
  | { status: 'unreachable' }
  | { status: 'server_error' };

/** POST /auth/register：409 → email_taken；网络异常 → unreachable；协议不符 → server_error。 */
export async function register(
  baseUrl: string,
  request: RegisterRequest,
): Promise<RegisterOutcome> {
  const body = JSON.stringify(RegisterRequestSchema.parse(request));
  try {
    const response = await fetchWithTimeout(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (response.status === 409) return { status: 'email_taken' };
    if (!response.ok) return { status: 'server_error' };
    const raw: unknown = await response.json();
    const parsed = LoginResponseSchema.safeParse(raw);
    if (!parsed.success) return { status: 'server_error' };
    return { status: 'ok', token: parsed.data.token, expiresAt: parsed.data.expiresAt };
  } catch {
    return { status: 'unreachable' };
  }
}

export type SyncOutcome<T> =
  | { status: 'ok'; data: T }
  | { status: 'unauthorized' }
  | { status: 'unreachable' }
  | { status: 'server_error' };

/** GET /sync?since=：401 → unauthorized；网络异常 → unreachable；协议不符 → server_error。 */
export async function syncPull(
  baseUrl: string,
  token: string,
  since: string | null,
): Promise<SyncOutcome<SyncPullResponse>> {
  const url =
    since === null ? `${baseUrl}/sync` : `${baseUrl}/sync?since=${encodeURIComponent(since)}`;
  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 401) return { status: 'unauthorized' };
    if (!response.ok) return { status: 'server_error' };
    const raw: unknown = await response.json();
    const parsed = SyncPullResponseSchema.safeParse(raw);
    if (!parsed.success) return { status: 'server_error' };
    return { status: 'ok', data: parsed.data };
  } catch {
    return { status: 'unreachable' };
  }
}

/** POST /sync：推送本地变更批次；状态映射同 syncPull。 */
export async function syncPush(
  baseUrl: string,
  token: string,
  body: SyncPushRequest,
): Promise<SyncOutcome<SyncPushResponse>> {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(SyncPushRequestSchema.parse(body)),
    });
    if (response.status === 401) return { status: 'unauthorized' };
    if (!response.ok) return { status: 'server_error' };
    const raw: unknown = await response.json();
    const parsed = SyncPushResponseSchema.safeParse(raw);
    if (!parsed.success) return { status: 'server_error' };
    return { status: 'ok', data: parsed.data };
  } catch {
    return { status: 'unreachable' };
  }
}

// ---- 快照存档（sync-archive feat07/feat08/feat09）：状态映射同 syncPush ----

/** POST /snapshots：把整库存档上传到当前账号名下。 */
export async function createSnapshot(
  baseUrl: string,
  token: string,
  body: SnapshotCreateRequest,
): Promise<SyncOutcome<SnapshotCreateResponse>> {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(SnapshotCreateRequestSchema.parse(body)),
    });
    if (response.status === 401) return { status: 'unauthorized' };
    if (!response.ok) return { status: 'server_error' };
    const raw: unknown = await response.json();
    const parsed = SnapshotCreateResponseSchema.safeParse(raw);
    if (!parsed.success) return { status: 'server_error' };
    return { status: 'ok', data: parsed.data };
  } catch {
    return { status: 'unreachable' };
  }
}

/** GET /snapshots：当前账号的快照列表（新到旧，仅 meta）。 */
export async function listSnapshots(
  baseUrl: string,
  token: string,
): Promise<SyncOutcome<SnapshotListResponse>> {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/snapshots`, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 401) return { status: 'unauthorized' };
    if (!response.ok) return { status: 'server_error' };
    const raw: unknown = await response.json();
    const parsed = SnapshotListResponseSchema.safeParse(raw);
    if (!parsed.success) return { status: 'server_error' };
    return { status: 'ok', data: parsed.data };
  } catch {
    return { status: 'unreachable' };
  }
}

/** GET /snapshots/:id：单份快照全量载荷（恢复用）。 */
export async function getSnapshot(
  baseUrl: string,
  token: string,
  id: string,
): Promise<SyncOutcome<SnapshotDetailResponse>> {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/snapshots/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 401) return { status: 'unauthorized' };
    if (!response.ok) return { status: 'server_error' };
    const raw: unknown = await response.json();
    const parsed = SnapshotDetailResponseSchema.safeParse(raw);
    if (!parsed.success) return { status: 'server_error' };
    return { status: 'ok', data: parsed.data };
  } catch {
    return { status: 'unreachable' };
  }
}

/** DELETE /snapshots/:id：删除一份快照（只动快照，不动收藏库）。 */
export async function deleteSnapshot(
  baseUrl: string,
  token: string,
  id: string,
): Promise<SyncOutcome<SnapshotDeleteResponse>> {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/snapshots/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 401) return { status: 'unauthorized' };
    if (!response.ok) return { status: 'server_error' };
    const raw: unknown = await response.json();
    const parsed = SnapshotDeleteResponseSchema.safeParse(raw);
    if (!parsed.success) return { status: 'server_error' };
    return { status: 'ok', data: parsed.data };
  } catch {
    return { status: 'unreachable' };
  }
}
