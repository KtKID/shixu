import { registerCaptureCommand } from '../lib/capture-invoke';
import { handleAutoSyncTrigger } from '../db/autosync';

export default defineBackground(() => {
  // 快捷命令唤起收藏面板
  registerCaptureCommand();
  // 自动同步（feat11）：页面只发通知，防抖与同步都在后台执行，面板关闭不影响
  browser.runtime.onMessage.addListener((raw: unknown) => {
    handleAutoSyncTrigger(raw);
  });
  console.log('[x-threadpick] background ready');
});
