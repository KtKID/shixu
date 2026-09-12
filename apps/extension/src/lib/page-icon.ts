/**
 * 站点图标规则链（task-card-brand-icon，纯脚本规则、无 AI）：
 * A1 = 解析页面 <link rel="icon"/"shortcut icon"/"apple-touch-icon">，按 sizes 取最大，
 *      地址相对页面 URL 补全（含 //cdn 协议相对写法）；
 * A2 = 约定路径 <origin>/favicon.ico；
 * 两级候选都下载验证 content-type 是 image/* 才算数（防 SPA 软 404 返回 HTML，如 doubao）。
 * 只认 http(s) 页面；任何一步失败都不抛出，最终返回 null 由渲染层兜底。
 * 规则链经 16 条真实收藏实测：A1 命中 15、A2 命中 1（/tmp/x-threadpick-imgtest，2026-09-12）。
 */

const FETCH_TIMEOUT_MS = 8000;

interface IconCandidate {
  url: string;
  size: number;
}

/** 从页面 HTML 里选图标声明：有尺寸的按尺寸降序，无尺寸的排最后；返回补全后的绝对地址。 */
export function pickIconFromHtml(html: string, pageUrl: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const candidates: IconCandidate[] = [];
  const seen = new Set<string>();
  doc.querySelectorAll('link[rel][href]').forEach((el, order) => {
    const rel = (el.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
    if (!rel.includes('icon') && !rel.includes('apple-touch-icon')) return;
    const href = el.getAttribute('href');
    if (href === null || href.trim() === '') return;
    let url: string;
    try {
      url = new URL(href, pageUrl).href;
    } catch {
      return;
    }
    if (seen.has(url)) return;
    seen.add(url);
    let size = 0;
    for (const m of (el.getAttribute('sizes') ?? '').matchAll(/(\d+)x\d+/g)) {
      size = Math.max(size, Number(m[1]));
    }
    // 无尺寸声明保持原始文档顺序（排在有尺寸的之后）
    candidates.push({ url, size: size === 0 ? -1000 + order : size });
  });
  candidates.sort((a, b) => b.size - a.size);
  return candidates[0]?.url ?? null;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** 图标入库上限（task-card-icon-resource）：超过视为异常资源，不存本地库。 */
const MAX_ICON_BYTES = 256 * 1024;

/** 下载图标本体并转 data URL；非图片 / 超 256KB / 请求失败均返回 null（不落脏数据）。 */
export async function fetchIconData(
  iconUrl: string,
  fetchFn: FetchLike = fetch,
): Promise<string | null> {
  try {
    const res = await fetchFn(iconUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const type = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!res.ok || !type.startsWith('image/')) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_ICON_BYTES) return null;
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return `data:${type};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

/** 验证候选地址确实返回图片（content-type 为 image/* 且 2xx）。 */
async function isImageUrl(url: string, fetchFn: FetchLike): Promise<boolean> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const type = res.headers.get('content-type') ?? '';
    return res.ok && type.toLowerCase().startsWith('image/');
  } catch {
    return false;
  }
}

/** 规则链入口：A1（页面声明，需验证）→ A2（约定路径，需验证）→ null。 */
export async function resolvePageIcon(
  pageUrl: string,
  fetchFn: FetchLike = fetch,
): Promise<string | null> {
  let origin: string;
  try {
    const parsed = new URL(pageUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    origin = parsed.origin;
  } catch {
    return null;
  }

  let picked: string | null = null;
  try {
    const res = await fetchFn(pageUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.ok) picked = pickIconFromHtml(await res.text(), pageUrl);
  } catch {
    // 页面打不开仍试约定路径（A2）
  }

  if (picked !== null && (await isImageUrl(picked, fetchFn))) return picked;
  const convention = `${origin}/favicon.ico`;
  if (convention !== picked && (await isImageUrl(convention, fetchFn))) return convention;
  return null;
}
