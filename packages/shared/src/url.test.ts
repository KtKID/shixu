import { describe, expect, it } from 'vitest';
import { normalizeUrl } from './url';

describe('normalizeUrl', () => {
  it('域名小写、去尾部斜杠、剥追踪参数、剩余参数排序', () => {
    expect(normalizeUrl('https://Example.com/a/?utm_source=x&b=2&a=1')).toBe(
      'https://example.com/a?a=1&b=2',
    );
  });

  it('保留 hash（SPA 路由不丢身份）', () => {
    expect(normalizeUrl('https://example.com/#/article?x=1')).toBe(
      'https://example.com/#/article?x=1',
    );
  });

  it('非法 URL 抛错（调用方决定跳过）', () => {
    expect(() => normalizeUrl('not-a-url')).toThrow();
  });
});
