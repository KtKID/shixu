/**
 * URL 规范化：判重前的唯一入口，前后端共用（唯一真源）。
 * - 域名小写、去默认端口（URL 标准行为）
 * - 剥追踪参数（utm_* 前缀 + 常见追踪参数）
 * - 剩余参数按名排序（参数顺序不产生新身份）
 * - 去路径尾部斜杠（仅当路径非根）
 * - 保留 hash：SPA 路由在 hash 中，剥掉会错误合并不同页面
 * 非法 URL 抛 TypeError，由调用方决定跳过或报错。
 */

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref_src',
  'spm',
  'vd_source',
]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower);
}

export function normalizeUrl(raw: string): string {
  const url = new URL(raw);
  url.username = '';
  url.password = '';

  const kept = [...url.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = '';
  for (const [name, value] of kept) {
    url.searchParams.append(name, value);
  }

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  }

  return url.toString();
}
