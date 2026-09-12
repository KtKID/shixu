import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getResource, iconPathFor, putResource } from './resources';
import { resetLibraryRuntime } from './library';

/**
 * 统一资源库（task-card-icon-resource）：图标本体以 data URL 存本地 Dexie resources 表，
 * 书签/卡片只引用相对路径键（icons/<域名>），不存绝对地址；本地库为主，不进同步。
 */

beforeEach(async () => {
  fakeBrowser.reset();
  await resetLibraryRuntime();
});

describe('iconPathFor · 相对路径键', () => {
  it('由书签 URL 推出 icons/<域名>，无协议、无前导斜杠', () => {
    expect(iconPathFor('https://www.doubao.com/chat')).toBe('icons/www.doubao.com');
    expect(iconPathFor('http://127.0.0.1:8080/a')).toBe('icons/127.0.0.1');
    expect(iconPathFor('https://a.example/').startsWith('/')).toBe(false);
    expect(iconPathFor('https://a.example/')).not.toContain('://');
  });

  it('同域名不同页面收敛到同一个键', () => {
    expect(iconPathFor('https://a.example/x')).toBe(iconPathFor('https://a.example/y?z=1'));
  });
});

describe('putResource / getResource', () => {
  it('存 data URL 后原样取回；未存路径返回 null', async () => {
    await putResource('icons/a.example', 'data:image/png;base64,AAA');
    expect(await getResource('icons/a.example')).toBe('data:image/png;base64,AAA');
    expect(await getResource('icons/missing.example')).toBeNull();
  });

  it('同键重复写入覆盖（再下载刷新）', async () => {
    await putResource('icons/a.example', 'data:image/png;base64,AAA');
    await putResource('icons/a.example', 'data:image/png;base64,BBB');
    expect(await getResource('icons/a.example')).toBe('data:image/png;base64,BBB');
  });
});
