import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  DEFAULT_SETTINGS,
  DEFAULT_TAXONOMY_VALUES,
  SettingsSchema,
  createBookmark,
  createDefaultTaxonomy,
  type Bookmark,
  type Session,
} from '@x-threadpick/shared';
import { accountKey, recordServerLogin } from './settings';
import {
  DEFAULT_LIBRARY_KEY,
  currentLibrary,
  currentLibraryKey,
  libraryDbName,
  libraryHasLocalData,
  openLibrary,
  openLibraryDirect,
  readLastSyncAt,
  recallSession,
  rememberSession,
  resetLibraryHandles,
  resetLibraryRuntime,
  subscribeLibrarySwitch,
  writeLastSyncAt,
} from './library';

/**
 * 多库架构（sync-archive feat01）数据层：
 * 库键解析 / 按键开库隔离 / 切换广播 / lastSyncAt 随库 / 离线切回会话 / 存量一次性迁移（T3 高风险）。
 */

const S1 = 'https://s1.example:8443';
const KEY_A = `${S1}#a@x.com`;
const KEY_B = `${S1}#b@x.com`;
const LEGACY_SYNC = '2026-09-01T00:00:00.000Z';

function sessionOf(email: string): Session {
  return { email, serverUrl: S1, token: 'tok-1', expiresAt: '2030-01-01T00:00:00.000Z' };
}

function makeBookmark(url: string, title: string): Bookmark {
  return createBookmark(crypto.randomUUID(), { url, title });
}

/** 模拟「旧版单库升级」：default 库（threadpick）里已有书签与取值，settings 里带全局 lastSyncAt。 */
async function seedLegacyDefaultLibrary(
  bookmarks: number,
  options: { loggedIn?: Session; legacyLastSyncAt?: string } = {},
): Promise<void> {
  const def = openLibraryDirect(DEFAULT_LIBRARY_KEY);
  for (let i = 0; i < bookmarks; i++) {
    await def.bookmarks.add(makeBookmark(`https://example.com/old-${i}`, `旧收藏 ${i}`));
  }
  await def.taxonomies.put({
    id: 'local',
    taxonomy: { ...createDefaultTaxonomy(), topic: [...DEFAULT_TAXONOMY_VALUES.topic, '旧主题'] },
  });
  if (options.loggedIn !== undefined) {
    await recordServerLogin(S1, options.loggedIn);
  }
  if (options.legacyLastSyncAt !== undefined) {
    // 模拟旧版记录：settings 里带全局 lastSyncAt（新版 schema 已无此字段）
    const parsedSettings = SettingsSchema.safeParse(
      (await browser.storage.local.get('settings'))['settings'],
    );
    const current = parsedSettings.success ? parsedSettings.data : DEFAULT_SETTINGS;
    await browser.storage.local.set({
      settings: { ...current, lastSyncAt: options.legacyLastSyncAt },
    });
  }
}

beforeEach(async () => {
  fakeBrowser.reset();
  await resetLibraryRuntime();
});

describe('库键解析（feat01 场景1/场景5）', () => {
  it('未登录 → default；登录 → accountKey（serverUrl#email）', async () => {
    await expect(currentLibraryKey()).resolves.toBe(DEFAULT_LIBRARY_KEY);
    await recordServerLogin(S1, sessionOf('a@x.com'));
    await expect(currentLibraryKey()).resolves.toBe(KEY_A);
  });

  it('数据库名：default 沿用 threadpick，账号库 threadpick-<编码键>', () => {
    expect(libraryDbName(DEFAULT_LIBRARY_KEY)).toBe('threadpick');
    expect(libraryDbName(KEY_A)).toBe(`threadpick-${encodeURIComponent(KEY_A)}`);
    expect(libraryDbName(KEY_A)).not.toBe(libraryDbName(KEY_B));
  });
});

describe('按键开库：各库互不混入（feat01 场景1/场景9）', () => {
  it('default 与账号库写入互不可见；currentLibrary 跟随登录态', async () => {
    const def = await openLibrary(DEFAULT_LIBRARY_KEY);
    await def.bookmarks.add(makeBookmark('https://example.com/d', '默认库一条'));
    const libA = await openLibrary(KEY_A);
    await libA.bookmarks.add(makeBookmark('https://example.com/a', '账号 A 一条'));

    expect(await def.bookmarks.count()).toBe(1);
    expect(await libA.bookmarks.count()).toBe(1);

    // 未登录 → currentLibrary 指向 default；登录 A → 指向 A 的库
    expect((await currentLibrary()).bookmarks.count === undefined).toBe(false); // 打开成功
    await recordServerLogin(S1, sessionOf('a@x.com'));
    const active = await currentLibrary();
    const rows = await active.bookmarks.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe('账号 A 一条');
  });
});

describe('账号变化广播（feat01 场景5：切换即换库，各上下文重新解析）', () => {
  it('登录与登出都触发订阅回调（settings 写入经 browser.storage.onChanged 广播）', async () => {
    const events: string[] = [];
    const unsubscribe = subscribeLibrarySwitch(() => events.push('switch'));
    await recordServerLogin(S1, sessionOf('a@x.com'));
    await expect(currentLibraryKey()).resolves.toBe(KEY_A);
    expect(events.length).toBeGreaterThanOrEqual(1);

    await recordServerLogin(S1, sessionOf('b@x.com'));
    await expect(currentLibraryKey()).resolves.toBe(KEY_B);
    expect(events.length).toBeGreaterThanOrEqual(2);

    unsubscribe();
    await recordServerLogin(S1, sessionOf('a@x.com'));
    expect(events.length).toBe(2); // 退订后不再收
  });
});

describe('lastSyncAt 存各库 meta（feat01 场景4/场景5：同步进度随库）', () => {
  it('写入只影响本库；其他库读不到', async () => {
    const libA = await openLibrary(KEY_A);
    const libB = await openLibrary(KEY_B);
    expect(await readLastSyncAt(libA)).toBeNull();
    await writeLastSyncAt(libA, LEGACY_SYNC);
    expect(await readLastSyncAt(libA)).toBe(LEGACY_SYNC);
    expect(await readLastSyncAt(libB)).toBeNull();
  });
});

describe('本机库判定（feat01 场景6/场景7 的数据依据）', () => {
  it('全新账号键本机无库；有书签或同步过即算有库', async () => {
    await expect(libraryHasLocalData(KEY_A)).resolves.toBe(false);
    const libA = await openLibrary(KEY_A);
    await writeLastSyncAt(libA, LEGACY_SYNC);
    await expect(libraryHasLocalData(KEY_A)).resolves.toBe(true);

    const libB = await openLibrary(KEY_B);
    await libB.bookmarks.add(makeBookmark('https://example.com/b', 'B 一条'));
    await expect(libraryHasLocalData(KEY_B)).resolves.toBe(true);
  });
});

describe('离线切回：账号库记忆最近会话（feat01 场景6）', () => {
  it('rememberSession 后 recallSession 取回同值；无记录或损坏记录返回 null', async () => {
    const session = sessionOf('a@x.com');
    await expect(recallSession(KEY_A)).resolves.toBeNull();
    await rememberSession(KEY_A, session);
    await expect(recallSession(KEY_A)).resolves.toEqual(session);
    // 键含账号身份：B 的库读不到 A 的会话
    await expect(recallSession(KEY_B)).resolves.toBeNull();

    const libA = openLibraryDirect(KEY_A);
    await libA.meta.put({ key: 'session', value: 'not-json' });
    await expect(recallSession(KEY_A)).resolves.toBeNull();
  });
});

describe('存量数据一次性迁移（T3 · 手动升级路径：旧数据 + 已登录）', () => {
  it('升级首启已登录：旧单库数据（书签/取值/全局 lastSyncAt）迁入该账号库，default 清空', async () => {
    await seedLegacyDefaultLibrary(2, {
      loggedIn: sessionOf('a@x.com'),
      legacyLastSyncAt: LEGACY_SYNC,
    });

    const libA = await openLibrary(KEY_A); // 触发迁移
    expect(await libA.bookmarks.count()).toBe(2);
    const titles = (await libA.bookmarks.toArray()).map((b) => b.title).sort();
    expect(titles).toEqual(['旧收藏 0', '旧收藏 1']);
    const taxonomyRow = await libA.taxonomies.get('local');
    expect(taxonomyRow?.taxonomy.topic).toContain('旧主题');
    expect(await readLastSyncAt(libA)).toBe(LEGACY_SYNC); // 全局 lastSyncAt 随迁

    const def = openLibraryDirect(DEFAULT_LIBRARY_KEY);
    expect(await def.bookmarks.count()).toBe(0); // 移动语义：default 不再持有账号数据
  });

  it('迁移幂等：标记落库后重复运行不再搬动数据', async () => {
    await seedLegacyDefaultLibrary(1, { loggedIn: sessionOf('a@x.com') });
    await openLibrary(KEY_A);
    resetLibraryHandles(); // 模拟重启进程（清内存 memo），marker 与数据仍持久
    const libA = await openLibrary(KEY_A);
    expect(await libA.bookmarks.count()).toBe(1);

    // 重启后 default 有新收藏（登出期间），再开 A 的库不再被搬动
    await openLibraryDirect(DEFAULT_LIBRARY_KEY).bookmarks.add(
      makeBookmark('https://example.com/new', '登出期间新收藏'),
    );
    resetLibraryHandles();
    expect(await (await openLibrary(KEY_A)).bookmarks.count()).toBe(1); // 不回流也不新增
    expect(await openLibraryDirect(DEFAULT_LIBRARY_KEY).bookmarks.count()).toBe(1);
  });
});

describe('存量数据一次性迁移（T3 · 手动升级路径：旧数据 + 未登录）', () => {
  it('升级首启未登录：数据原地留在 default 库，此后登录不再迁移（feat01 场景2/场景9）', async () => {
    await seedLegacyDefaultLibrary(2, { legacyLastSyncAt: LEGACY_SYNC });

    const active = await currentLibrary(); // 未登录首次解析：原地保持
    expect(await active.bookmarks.count()).toBe(2);

    await recordServerLogin(S1, sessionOf('b@x.com')); // 之后登录 B
    const libB = await openLibrary(KEY_B);
    expect(await libB.bookmarks.count()).toBe(0); // default 数据不进 B
    const def = openLibraryDirect(DEFAULT_LIBRARY_KEY);
    expect(await def.bookmarks.count()).toBe(2); // default 原样保留
  });
});

describe('账号键与设置侧一致性', () => {
  it('accountKey 即库键：与 feat11 自动同步的账号键同源', () => {
    expect(accountKey(sessionOf('a@x.com'))).toBe(KEY_A);
  });
});
