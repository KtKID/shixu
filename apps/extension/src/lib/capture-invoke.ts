import { CaptureTargetSchema, type CaptureTarget } from '@x-threadpick/shared';
import type { Browser } from 'wxt/browser';

/**
 * 收藏面板唤起链路：快捷命令 → 取活动标签 → 暂存目标信息（storage.session）→ 打开面板。
 * 面板页可能与 background 不在同一窗口/上下文（Firefox MV2 无 browser.action，走小窗兜底），
 * 因此目标信息经 storage.session 传递；图标直接点击打开时 popup 自行解析当前活动标签。
 */

export const CAPTURE_COMMAND = 'capture-current-tab';
export const CAPTURE_TARGET_KEY = 'captureTarget';

/** 仅 http(s) 页面可收藏；浏览器内部页 / 本地文件页 / 扩展自身页不可（feat01 场景4）。 */
export function isCapturableUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

function toCaptureTarget(tab: Browser.tabs.Tab): CaptureTarget {
  return {
    tabId: tab.id ?? -1,
    url: tab.url ?? '',
    title: tab.title ?? '',
    pinned: tab.pinned ?? false,
  };
}

export async function getActiveTab(): Promise<Browser.tabs.Tab | null> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

export async function stashCaptureTarget(target: CaptureTarget): Promise<void> {
  await browser.storage.session.set({ [CAPTURE_TARGET_KEY]: target });
}

/** 读取暂存目标；内容缺失或不符协议时返回 null（边界校验，不抛错）。 */
export async function readCaptureTarget(): Promise<CaptureTarget | null> {
  const raw = await browser.storage.session.get(CAPTURE_TARGET_KEY);
  const parsed = CaptureTargetSchema.safeParse(raw[CAPTURE_TARGET_KEY]);
  return parsed.success ? parsed.data : null;
}

/**
 * 打开面板：action.openPopup 可用（Chrome 127+）优先；否则 windows.create 小窗兜底。
 * Firefox MV2 没有 browser.action，必走小窗路径。
 */
export async function openCapturePanel(): Promise<'popup' | 'window'> {
  if (typeof browser.action?.openPopup === 'function') {
    try {
      await browser.action.openPopup();
      return 'popup';
    } catch {
      // openPopup 调用失败（环境不支持或被浏览器拒绝）时落到小窗兜底
    }
  }
  await browser.windows.create({
    url: browser.runtime.getURL('/popup.html'),
    type: 'popup',
    width: 400,
    height: 620,
  });
  return 'window';
}

/** 快捷命令入口：暂存当前活动标签（含不可收藏页，禁用态由面板呈现）后打开面板。 */
export async function invokeCapture(): Promise<'popup' | 'window'> {
  const tab = await getActiveTab();
  if (tab !== null) {
    await stashCaptureTarget(toCaptureTarget(tab));
  }
  return await openCapturePanel();
}

/** background 注册快捷命令监听。 */
export function registerCaptureCommand(): void {
  browser.commands.onCommand.addListener((command) => {
    if (command === CAPTURE_COMMAND) {
      invokeCapture().catch((error: unknown) => {
        console.error('[x-threadpick] 唤起收藏面板失败', error);
      });
    }
  });
}

/**
 * 面板侧解析收藏目标：
 * - 活动标签是普通页面 → 优先使用（图标直接点击路径），并刷新暂存；
 * - 活动标签是面板自身（小窗兜底路径下面板独占一个窗口）或无活动标签 → 回退暂存。
 */
export async function resolveCaptureTarget(): Promise<CaptureTarget | null> {
  const tab = await getActiveTab();
  const isSelf = tab?.url !== undefined && tab.url.startsWith(browser.runtime.getURL('/'));
  if (tab != null && !isSelf) {
    const target = toCaptureTarget(tab);
    await stashCaptureTarget(target);
    return target;
  }
  const stashed = await readCaptureTarget();
  if (stashed !== null) return stashed;
  return tab == null ? null : toCaptureTarget(tab);
}
