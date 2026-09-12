import { describe, expect, it, vi } from 'vitest';
import { fetchIconData, pickIconFromHtml, resolvePageIcon } from './page-icon';

/**
 * 站点图标规则链（task-card-brand-icon）：
 * A1 = 解析页面 <link rel=icon/apple-touch-icon> 取最大尺寸（地址相对页面补全）；
 * A2 = 约定路径 /favicon.ico；两级都要验证响应真是图片（防 SPA 软 404 返回 HTML）。
 * fetch 全部走注入 mock，不打真实网络。
 */

const PAGE = 'https://site.example/path/page?x=1';

function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function imageResponse(type = 'image/png'): Response {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-type': type },
  });
}

describe('pickIconFromHtml · 从页面声明中选图标', () => {
  it('多个尺寸声明时选最大的；无 sizes 的排最后', () => {
    const html = `
      <link rel="icon" href="/small.png" sizes="32x32">
      <link rel="icon" href="/large.png" sizes="192x192">
      <link rel="apple-touch-icon" href="/touch.png" sizes="180x180">
      <link rel="icon" href="/nosize.png">`;
    expect(pickIconFromHtml(html, PAGE)).toBe('https://site.example/large.png');
  });

  it('协议相对地址与相对路径都相对页面地址补全', () => {
    expect(pickIconFromHtml('<link rel="icon" href="//cdn.example.com/i.png">', PAGE)).toBe(
      'https://cdn.example.com/i.png',
    );
    expect(pickIconFromHtml('<link rel="shortcut icon" href="assets/i.png">', PAGE)).toBe(
      'https://site.example/path/assets/i.png',
    );
  });

  it('没有图标声明时返回 null；stylesheet 等非图标 rel 不入选', () => {
    expect(pickIconFromHtml('<link rel="stylesheet" href="/a.css">', PAGE)).toBeNull();
    expect(pickIconFromHtml('<html></html>', PAGE)).toBeNull();
  });
});

describe('resolvePageIcon · 规则链（A1 → A2，逐级验证 content-type）', () => {
  it('A1 命中：页面声明图标且验证是图片', async () => {
    const fetchFn = vi.fn((url: string) =>
      Promise.resolve(
        url === PAGE
          ? htmlResponse('<link rel="icon" sizes="64x64" href="/icon.png">')
          : imageResponse(),
      ),
    );
    await expect(resolvePageIcon(PAGE, fetchFn)).resolves.toBe('https://site.example/icon.png');
  });

  it('A1 验证失败（软 404 返回 HTML）时退回 A2 约定路径', async () => {
    const fetchFn = vi.fn((url: string) => {
      if (url === PAGE) return Promise.resolve(htmlResponse('<link rel="icon" href="/icon.png">'));
      if (url === 'https://site.example/icon.png')
        return Promise.resolve(htmlResponse('<html>404</html>'));
      return Promise.resolve(imageResponse('image/x-icon'));
    });
    await expect(resolvePageIcon(PAGE, fetchFn)).resolves.toBe('https://site.example/favicon.ico');
  });

  it('页面无声明时直接用 A2 约定路径', async () => {
    const fetchFn = vi.fn((url: string) =>
      Promise.resolve(url === PAGE ? htmlResponse('<html></html>') : imageResponse('image/x-icon')),
    );
    await expect(resolvePageIcon(PAGE, fetchFn)).resolves.toBe('https://site.example/favicon.ico');
  });

  it('全部失败（页面打不开、约定路径也非图片）→ null', async () => {
    const fetchFn = vi.fn((url: string) => {
      if (url === PAGE) return Promise.reject(new Error('network down'));
      return Promise.resolve(
        new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } }),
      );
    });
    await expect(resolvePageIcon(PAGE, fetchFn)).resolves.toBeNull();
  });

  it('非 http(s) 地址直接返回 null，不发请求', async () => {
    const fetchFn = vi.fn();
    await expect(resolvePageIcon('ftp://x.example/a', fetchFn)).resolves.toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('fetchIconData · 下载图标本体为 data URL（task-card-icon-resource）', () => {
  const ICON = 'https://x.example/icon.png';

  it('图片响应 → data URL（含真实 mime）', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      ),
    );
    await expect(fetchIconData(ICON, fetchFn)).resolves.toBe('data:image/png;base64,AQID');
  });

  it('content-type 非图片 → null（防软 404 HTML）', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(htmlResponse('<html>404</html>')));
    await expect(fetchIconData(ICON, fetchFn)).resolves.toBeNull();
  });

  it('超过 256KB → null（防异常资源撑大本地库）', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response(new Uint8Array(257 * 1024), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      ),
    );
    await expect(fetchIconData(ICON, fetchFn)).resolves.toBeNull();
  });

  it('请求失败 / 非 2xx → null', async () => {
    const down = vi.fn(() => Promise.reject(new Error('network down')));
    await expect(fetchIconData(ICON, down)).resolves.toBeNull();
    const notFound = vi.fn(() =>
      Promise.resolve(
        new Response('nope', { status: 404, headers: { 'content-type': 'image/png' } }),
      ),
    );
    await expect(fetchIconData(ICON, notFound)).resolves.toBeNull();
  });
});
