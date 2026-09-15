import { ServerReachabilitySchema, type ServerReachability } from '@x-threadpick/shared';
import { testConnection } from '../components/settings/api';
import { loadSettings } from '../db/settings';

/**
 * 服务器心跳：后台每 5s ping 一次同步目标的 /healthz（已登录取 session.serverUrl，否则取设置里的当前服务器），
 * 结果写入 browser.storage.session（键 serverReachability，schema 见 packages/shared/server-reachability）。
 * 设置页账号卡订阅该记录渲染「服务器已连接 / 服务器不在线无法同步」；
 * 扩展图标不打任何 badge——扩展本身离线可用，服务器状态只影响同步，不打扰图标。
 * 只在可达性翻转或目标服务器变化时写存储（避免每 5s 触发一次全局 onChanged）。
 */

export const HEARTBEAT_INTERVAL_MS = 5_000;
export const SERVER_REACHABILITY_KEY = 'serverReachability';

let probing = false;

/** 读取最近一次心跳结果；无记录或记录损坏时返回 null（边界校验，不抛错）。 */
export async function readServerReachability(): Promise<ServerReachability | null> {
  const raw = await browser.storage.session.get(SERVER_REACHABILITY_KEY);
  const parsed = ServerReachabilitySchema.safeParse(raw[SERVER_REACHABILITY_KEY]);
  return parsed.success ? parsed.data : null;
}

/** 订阅心跳结果变化（storage.onChanged 广播）；返回退订函数。 */
export function subscribeServerReachability(
  listener: (record: ServerReachability | null) => void,
): () => void {
  const handler = (changes: Record<string, unknown>, area: string): void => {
    if (area !== 'session' || !(SERVER_REACHABILITY_KEY in changes)) return;
    readServerReachability()
      .then(listener)
      .catch((err: unknown) => console.error('[x-threadpick] 读取服务器可达性失败', err));
  };
  browser.storage.onChanged.addListener(handler);
  return () => {
    browser.storage.onChanged.removeListener(handler);
  };
}

/** 单次探测；testConnection 超时（8s）大于心跳间隔，用 in-flight 锁防重叠。 */
export async function probeServerOnce(): Promise<void> {
  if (probing) return;
  probing = true;
  try {
    const settings = await loadSettings();
    const baseUrl = settings.session?.serverUrl ?? settings.activeServerUrl;
    if (baseUrl === null) return; // 未配置服务器：无可探目标，保留旧记录（订阅方按 baseUrl 自行忽略）
    let reachable = false;
    try {
      await testConnection(baseUrl);
      reachable = true;
    } catch {
      reachable = false;
    }
    const existing = await readServerReachability();
    if (existing !== null && existing.baseUrl === baseUrl && existing.reachable === reachable) {
      return; // 状态未变：不重写，避免无意义的全局广播
    }
    const record: ServerReachability = { baseUrl, reachable, checkedAt: new Date().toISOString() };
    await browser.storage.session.set({ [SERVER_REACHABILITY_KEY]: record });
  } finally {
    probing = false;
  }
}

/** background 启动时调用：立即探测一次，随后按固定间隔轮询。 */
export function startServerHeartbeat(): void {
  const tick = () => {
    probeServerOnce().catch((error: unknown) => {
      console.error('[x-threadpick] 服务器心跳探测失败', error);
    });
  };
  tick();
  setInterval(tick, HEARTBEAT_INTERVAL_MS);
}
