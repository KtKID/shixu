import { registerCaptureCommand } from '../lib/capture-invoke';
import { handleAutoSyncTrigger } from '../db/autosync';
import { watchNewTabTakeover } from '../lib/newtab';

export default defineBackground(() => {
  // 快捷命令唤起收藏面板
  registerCaptureCommand();
  // 自动同步（feat11）：页面只发通知，防抖与同步都在后台执行，面板关闭不影响
  browser.runtime.onMessage.addListener((raw: unknown) => {
    handleAutoSyncTrigger(raw);
  });
  // 新标签页接管（feat-newtab）：设置里勾选后才把手动新建的空白标签页换成主页，默认零干预
  watchNewTabTakeover();
  console.log('[x-threadpick] background ready');
});
