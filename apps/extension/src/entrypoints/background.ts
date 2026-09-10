import { registerCaptureCommand } from '../lib/capture-invoke';

export default defineBackground(() => {
  // 快捷命令唤起收藏面板；同步（登录/推拉）与 Resurface 在后续切片接入。
  registerCaptureCommand();
  console.log('[x-threadpick] background ready');
});
