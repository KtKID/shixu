import { currentLibrary } from './library';

/**
 * 统一资源库（task-card-icon-resource）：收藏时下载的图标本体以 data URL 存当前库
 * resources 表，书签/卡片只引用相对路径键（icons/<域名>），不依赖第三方绝对地址。
 * 本地库为主、不进同步：书签上的 iconUrl（同步文本）是新设备重新下载的线索，
 * 各设备下载后按同一相对键落库，多端自然收敛。远期封面/截图等更大资源可复用此表
 * （届时换 blob 存储 + 对象存储同步，相对键约定不变）。
 */

export interface IconResourceRow {
  path: string;
  dataUrl: string;
  fetchedAt: string;
}

/** 书签 URL → 图标资源相对路径键（icons/<域名>；同域名收敛一份）。 */
export function iconPathFor(pageUrl: string): string {
  try {
    return `icons/${new URL(pageUrl).hostname}`;
  } catch {
    return 'icons/_unknown';
  }
}

export async function getResource(path: string): Promise<string | null> {
  const db = await currentLibrary();
  const row = await db.resources.get(path);
  return row?.dataUrl ?? null;
}

export async function putResource(path: string, dataUrl: string): Promise<void> {
  const db = await currentLibrary();
  await db.resources.put({ path, dataUrl, fetchedAt: new Date().toISOString() });
}
