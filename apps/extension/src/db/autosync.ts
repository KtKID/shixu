import { AutoSyncMessageSchema } from '@x-threadpick/shared';
import { accountKey, loadSettings } from './settings';

/**
 * 自动同步触发器（feat11）：
 * - 写操作调用 notifyLocalChange()，只负责向 background 发「本地有变更」消息——
 *   收藏面板保存后立即关闭，计时不能挂在页面上下文里（feat11 场景5）；
 * - background 调用 handleAutoSyncTrigger()：协议校验 → 防抖 →
 *   当前账号开启自动同步才执行 syncNow（动态引入，避免与 db/sync 的静态循环依赖）。
 */

export const AUTO_SYNC_DEBOUNCE_MS = 1500;

export function notifyLocalChange(): void {
  browser.runtime.sendMessage(AutoSyncMessageSchema.parse({ type: 'local-change' })).catch(() => {
    // background 未就绪/无接收方时静默忽略：通知失败不影响写操作本身
  });
}

let timer: ReturnType<typeof setTimeout> | null = null;

export function handleAutoSyncTrigger(raw: unknown): void {
  if (!AutoSyncMessageSchema.safeParse(raw).success) return;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    maybeAutoSync().catch((err: unknown) => console.error('[x-threadpick] 自动同步异常', err));
  }, AUTO_SYNC_DEBOUNCE_MS);
}

async function maybeAutoSync(): Promise<void> {
  const settings = await loadSettings();
  const session = settings.session;
  if (session === null || session.expiresAt <= new Date().toISOString()) return;
  if (settings.autoSync[accountKey(session)] !== true) return;
  const { syncNow } = await import('./sync');
  const result = await syncNow();
  if (result.status !== 'ok') {
    console.warn('[x-threadpick] 自动同步失败', result.status);
  }
}
