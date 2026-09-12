import Dexie, { type EntityTable } from 'dexie';
import {
  LegacyLastSyncAtSchema,
  SessionSchema,
  type Bookmark,
  type Session,
  type Settings,
  type Taxonomy,
} from '@x-threadpick/shared';
import { accountKey, loadSettings } from './settings';
import type { IconResourceRow } from './resources';

/**
 * 多库架构（sync-archive feat01）：
 * - 库键：未登录 = 'default'（全局唯一默认收藏库，无账号归属、能收藏、不同步）；
 *   登录 = accountKey（`${serverUrl}#${email}`，与 feat11 自动同步账号键同源）；
 * - 数据库名：default 沿用 'threadpick'，账号库 'threadpick-<编码键>'，各库互不混入、互不流动；
 * - 账号变化（登录/登出/切换）写入 settings → browser.storage.onChanged 广播，各上下文重新解析当前库；
 * - 同步进度 lastSyncAt 与各账号最近会话存各库 meta 表（Dexie v3）；
 * - 存量迁移（T3）：升级后首次解析库时判定一次——当时已登录则旧单库数据迁入该账号库，
 *   未登录则原地留在 default 库；判定结果以 marker 持久化，此后任何登录都不再迁移。
 */

export const DEFAULT_LIBRARY_KEY = 'default';

export interface TaxonomyRow {
  id: string;
  taxonomy: Taxonomy;
}

/** taxonomy 单行主键（沿用 v2 起的 'local'）。 */
export const TAXONOMY_ROW_ID = 'local';

export interface MetaRow {
  key: string;
  value: string;
}

export const LAST_SYNC_AT_META_KEY = 'lastSyncAt';
const LEGACY_MIGRATION_META_KEY = 'legacyMigration';
const SESSION_META_KEY = 'session';

export class LibraryDB extends Dexie {
  bookmarks!: EntityTable<Bookmark, 'id'>;
  taxonomies!: EntityTable<TaxonomyRow, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;
  resources!: EntityTable<IconResourceRow, 'path'>;

  constructor(name: string) {
    super(name);
    // v1/v2 为旧单库 schema（default 库沿用原 'threadpick'）；v3 新增 meta 表（lastSyncAt / 会话随库存）
    this.version(1).stores({ bookmarks: 'id, urlNormalized, updatedAt' });
    this.version(2).stores({ bookmarks: 'id, urlNormalized, updatedAt', taxonomies: 'id' });
    this.version(3).stores({
      bookmarks: 'id, urlNormalized, updatedAt',
      taxonomies: 'id',
      meta: 'key',
    });
    // v4 新增 resources 表（task-card-icon-resource：图标本体 data URL，本地统一资源库，不进同步）
    this.version(4).stores({
      bookmarks: 'id, urlNormalized, updatedAt',
      taxonomies: 'id',
      meta: 'key',
      resources: 'path',
    });
  }
}

/** 数据库名：default 沿用 'threadpick'；账号库对键做 URL 编码，地址字符不进库名且保持一一对应。 */
export function libraryDbName(key: string): string {
  return key === DEFAULT_LIBRARY_KEY ? 'threadpick' : `threadpick-${encodeURIComponent(key)}`;
}

/** 当前库键由登录态唯一决定：登录 = 账号键，未登录 = default。 */
export function libraryKeyFromSettings(settings: Settings): string {
  return settings.session !== null ? accountKey(settings.session) : DEFAULT_LIBRARY_KEY;
}

const handles = new Map<string, LibraryDB>();
const createdNames = new Set<string>([libraryDbName(DEFAULT_LIBRARY_KEY)]);
let migrationFlight: Promise<void> | null = null;

/** 直接取库句柄（走缓存，不触发存量迁移）；迁移测试的播种入口。 */
export function openLibraryDirect(key: string): LibraryDB {
  let handle = handles.get(key);
  if (handle === undefined) {
    handle = new LibraryDB(libraryDbName(key));
    handles.set(key, handle);
    createdNames.add(handle.name);
  }
  return handle;
}

/** 开库（公开入口）：先确保存量迁移已判定，再返回该键的句柄。 */
export async function openLibrary(key: string): Promise<LibraryDB> {
  migrationFlight ??= migrateLegacyData().catch((err: unknown) => {
    migrationFlight = null; // 失败允许下次重试（拷贝幂等）
    throw err;
  });
  await migrationFlight;
  return openLibraryDirect(key);
}

export async function currentLibraryKey(): Promise<string> {
  return libraryKeyFromSettings(await loadSettings());
}

export async function currentLibrary(): Promise<LibraryDB> {
  return openLibrary(await currentLibraryKey());
}

/** 账号变化广播：settings 写入（登录/登出/切换）触发，订阅方重新解析当前库。 */
export function subscribeLibrarySwitch(listener: () => void): () => void {
  const handler = (changes: Record<string, unknown>, area: string): void => {
    if (area === 'local' && 'settings' in changes) listener();
  };
  browser.storage.onChanged.addListener(handler);
  return () => {
    browser.storage.onChanged.removeListener(handler);
  };
}

// ---- lastSyncAt（同步进度随库，feat01 场景4/场景5） ----

export async function readLastSyncAt(db: LibraryDB): Promise<string | null> {
  const row = await db.meta.get(LAST_SYNC_AT_META_KEY);
  return row?.value ?? null;
}

export async function writeLastSyncAt(db: LibraryDB, value: string): Promise<void> {
  await db.meta.put({ key: LAST_SYNC_AT_META_KEY, value });
}

export async function getCurrentLibraryLastSyncAt(): Promise<string | null> {
  return readLastSyncAt(await currentLibrary());
}

// ---- 离线切回（feat01 场景6）：账号库记忆最近一次会话 ----

export async function rememberSession(key: string, session: Session): Promise<void> {
  const lib = await openLibrary(key);
  await lib.meta.put({
    key: SESSION_META_KEY,
    value: JSON.stringify(SessionSchema.parse(session)),
  });
}

export async function recallSession(key: string): Promise<Session | null> {
  const lib = await openLibrary(key);
  const row = await lib.meta.get(SESSION_META_KEY);
  if (row === undefined) return null;
  try {
    const parsed = SessionSchema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** 本机是否已有该账号的库（feat01 场景6/场景7 的判定依据）：有书签或同步过即算。 */
export async function libraryHasLocalData(key: string): Promise<boolean> {
  const lib = await openLibrary(key);
  if ((await lib.bookmarks.count()) > 0) return true;
  return (await readLastSyncAt(lib)) !== null;
}

// ---- 存量迁移（T3） ----

/** 读旧版全局 lastSyncAt（升级兼容；新版 SettingsSchema 已剔除该字段）。 */
async function readLegacySettingsLastSyncAt(): Promise<string | null> {
  const stored = await browser.storage.local.get('settings');
  const parsed = LegacyLastSyncAtSchema.safeParse(stored['settings']);
  return parsed.success ? parsed.data.lastSyncAt : null;
}

/**
 * 存量数据一次性迁移：升级后首次解析库时判定（default 库 marker 持久化）。
 * - 当时已登录：旧 threadpick 单库数据（书签/取值/全局 lastSyncAt）迁入该登录账号的库（移动语义）；
 * - 当时未登录：数据原地留在 default 库，此后任何登录都不再迁移（feat01 场景2/场景9 的升级面）。
 * 顺序 = 先完整拷入账号库（幂等）→ 清 default → 落 marker；中途失败可安全重试。
 */
export async function migrateLegacyData(): Promise<void> {
  const def = openLibraryDirect(DEFAULT_LIBRARY_KEY);
  const marker = await def.meta.get(LEGACY_MIGRATION_META_KEY);
  if (marker !== undefined) return;

  const settings = await loadSettings();
  const targetKey = libraryKeyFromSettings(settings);
  if (targetKey === DEFAULT_LIBRARY_KEY) {
    await def.meta.put({ key: LEGACY_MIGRATION_META_KEY, value: 'kept' });
    return;
  }

  const target = openLibraryDirect(targetKey);
  const bookmarks = await def.bookmarks.toArray();
  const taxonomyRow = await def.taxonomies.get(TAXONOMY_ROW_ID);
  const legacyLastSyncAt = await readLegacySettingsLastSyncAt();

  await target.bookmarks.bulkPut(bookmarks);
  if (taxonomyRow !== undefined) await target.taxonomies.put(taxonomyRow);
  if (legacyLastSyncAt !== null) {
    await target.meta.put({ key: LAST_SYNC_AT_META_KEY, value: legacyLastSyncAt });
  }
  await def.bookmarks.clear();
  await def.taxonomies.clear();
  await def.meta.put({ key: LEGACY_MIGRATION_META_KEY, value: `moved:${targetKey}` });
}

/** 测试隔离：关闭并删除本运行期开过的全部库、清迁移 memo（不触碰 browser.storage）。 */
export async function resetLibraryRuntime(): Promise<void> {
  for (const handle of handles.values()) {
    handle.close();
  }
  handles.clear();
  migrationFlight = null;
  await Promise.all([...createdNames].map((name) => Dexie.delete(name).catch(() => undefined)));
  createdNames.clear();
  createdNames.add(libraryDbName(DEFAULT_LIBRARY_KEY));
}

/** 测试用：模拟进程重启——关闭句柄、清迁移 memo，但保留全部库数据（验证 marker 持久化）。 */
export function resetLibraryHandles(): void {
  for (const handle of handles.values()) {
    handle.close();
  }
  handles.clear();
  migrationFlight = null;
}
