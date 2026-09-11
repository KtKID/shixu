import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { notifyLocalChange } from './autosync';

describe('notifyLocalChange（feat11 场景5：写操作只负责通知后台）', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  it('notify_sends_message：向后台发送 local-change 消息', () => {
    const spy = vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue(undefined);
    notifyLocalChange();
    expect(spy).toHaveBeenCalledWith({ type: 'local-change' });
  });

  it('notify_silent_when_no_receiver：无接收方时静默失败，不抛错', async () => {
    // fakeBrowser 无监听者时 sendMessage 会 reject；调用方不应感知
    expect(() => notifyLocalChange()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0)); // 让潜在未处理 rejection 暴露
  });
});
