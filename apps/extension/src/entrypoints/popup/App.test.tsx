import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  createBookmark,
  createDefaultTaxonomy,
  DEFAULT_STATUS,
  TAXONOMY_VALUE_MAX,
  TaxonomySchema,
  type Bookmark,
  type CaptureTarget,
  type Taxonomy,
} from '@x-threadpick/shared';
import type { Browser } from 'wxt/browser';
import { currentLibrary, openLibrary, resetLibraryRuntime, type LibraryDB } from '../../db/library';
import { recordServerLogin } from '../../db/settings';
import { CAPTURE_TARGET_KEY } from '../../lib/capture-invoke';
import App from './App';

const WEB_TARGET: CaptureTarget = {
  tabId: 1,
  url: 'https://arxiv.org/abs/2401.00001',
  title: 'World Models for Interactive Environments: A Survey',
  pinned: false,
};

async function stashTarget(target: CaptureTarget): Promise<void> {
  await browser.storage.session.set({ [CAPTURE_TARGET_KEY]: target });
}

function mockTabsQuery(tabs: Browser.tabs.Tab[]): void {
  const query = vi.fn<(queryInfo: Browser.tabs.QueryInfo) => Promise<Browser.tabs.Tab[]>>();
  query.mockResolvedValue(tabs);
  browser.tabs.query = query;
}

function mockNoActiveTab(): void {
  mockTabsQuery([]);
}

// 直接赋值的 mock 不会被 restoreAllMocks 还原，beforeEach 里显式还原
const realTabsRemove = browser.tabs.remove;
const realTabsCreate = browser.tabs.create;

/** jsdom 的 window.close 会销毁 document，桩掉以便断言调用。 */
function stubWindowClose() {
  return vi.spyOn(window, 'close').mockImplementation(() => {});
}

/** 渲染可收藏面板并等其就绪；bannerDelayMs=0 跳过横幅停留。 */
async function renderCapturable(target: CaptureTarget = WEB_TARGET) {
  await stashTarget(target);
  mockNoActiveTab();
  const close = stubWindowClose();
  const removeSpy = vi.spyOn(browser.tabs, 'remove');
  render(<App bannerDelayMs={0} />);
  await screen.findByText(target.title === '' ? '未检测到目标页面' : target.title);
  return { close, removeSpy };
}

function mockActiveTab(tab: Partial<Browser.tabs.Tab>): void {
  mockTabsQuery([
    {
      id: 1,
      index: 0,
      pinned: false,
      highlighted: true,
      windowId: 1,
      active: true,
      frozen: false,
      incognito: false,
      selected: true,
      discarded: false,
      autoDiscardable: true,
      groupId: -1,
      lastAccessed: 0,
      ...tab,
    },
  ]);
}

// 每个测试前重新解析当前库句柄（多库架构：db 不再是模块级单例）
let db: LibraryDB;

/** 写入本地 taxonomy 单行，模拟「设置」页维护过的取值集合。 */
async function seedTaxonomy(overrides: Partial<Omit<Taxonomy, 'updatedAt'>>) {
  const taxonomy = { ...createDefaultTaxonomy(), ...overrides };
  await db.taxonomies.put({ id: 'local', taxonomy });
}

/** 渲染可收藏面板并等四维取值就绪（默认集合首个主题取值为「世界模型」）；返回 render 结果供 unmount 模拟重开。 */
async function renderPanelWithDims() {
  await stashTarget(WEB_TARGET);
  mockNoActiveTab();
  const view = render(<App />);
  await screen.findByRole('button', { name: '世界模型' });
  return view;
}

/** 进入修改模式（feat08 场景7）：点顶栏「修改」，取值的「×」删除按钮随切换出现。 */
function enterEditMode() {
  fireEvent.click(screen.getByRole('button', { name: '修改' }));
}

beforeEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  fakeBrowser.reset();
  browser.tabs.remove = realTabsRemove;
  browser.tabs.create = realTabsCreate;
  await resetLibraryRuntime();
  db = await currentLibrary();
  await db.bookmarks.clear();
  await db.taxonomies.clear();
});

describe('面板骨架（feat01 场景1 / feat02 场景1）', () => {
  it('打开面板：顶栏品牌与快捷键提示、页面信息、光标停在理由输入框', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    expect(await screen.findByText('拾绪')).toBeTruthy();
    expect(document.querySelector('.shortcut-hint')?.textContent).toMatch(/^(⌘⇧S|Ctrl\+Shift\+S)$/);
    const textarea = await screen.findByRole('textbox', { name: /为什么收藏/ });
    // 焦点在 capturable 翻真后的 useEffect 里落地（App.tsx whyRef.focus()），
    // findByRole 只保证输入框已挂载；并行全量跑时焦点 effect 可能尚未执行，waitFor 等它落定。
    await waitFor(() => expect(document.activeElement).toBe(textarea));
  });

  it('页面信息只读展示：标题、地址、首字母色块，不请求外部图标', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    const title = await screen.findByText(WEB_TARGET.title);
    expect(title.classList.contains('page-title')).toBe(true);
    const url = screen.getByText(WEB_TARGET.url);
    expect(url.classList.contains('page-url')).toBe(true);
    // 首字母色块：标题首字母，无 <img>（不向外部服务请求网站图标）
    const favicon = document.querySelector('.favicon');
    expect(favicon?.textContent).toBe('W');
    expect(document.querySelector('.page-info img')).toBeNull();
  });

  it('图标直接点击打开（无命令暂存）时自行解析当前活动标签', async () => {
    mockActiveTab({ url: WEB_TARGET.url, title: WEB_TARGET.title });

    render(<App />);

    expect(await screen.findByText(WEB_TARGET.title)).toBeTruthy();
    expect(screen.getByText(WEB_TARGET.url)).toBeTruthy();
  });

  it('四维分类区骨架：四个维度名称、问题与多选/单选标注齐备', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    expect(await screen.findByText('它讲什么？')).toBeTruthy();
    expect(screen.getByText('它是什么？')).toBeTruthy();
    expect(screen.getByText('我拿它干什么？')).toBeTruthy();
    expect(screen.getByText('我处理到哪了？')).toBeTruthy();
    expect(screen.getAllByText('可多选')).toHaveLength(3);
    expect(screen.getAllByText('单选')).toHaveLength(1);
  });

  it('底部动作区：两个保存按钮在可收藏页面可用', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    await screen.findByText(WEB_TARGET.title);
    const saveClose = screen.getByRole('button', { name: /保存并关闭 Tab/ });
    const saveOnly = screen.getByRole('button', { name: '仅保存' });
    expect(saveClose).toHaveProperty('disabled', false);
    expect(saveOnly).toHaveProperty('disabled', false);
  });
});

describe('不可收藏判定与禁用态（feat01 场景4 / feat02 场景2）', () => {
  it.each([
    ['浏览器内部页', 'chrome://newtab/'],
    ['about 页', 'about:blank'],
    ['本地文件页', 'file:///Users/x/notes.html'],
    ['扩展自身页', 'chrome-extension://abc/popup.html'],
  ])('%s 显示「此页面无法收藏」且全部操作不可用', async (_label, url) => {
    await stashTarget({ tabId: 1, url, title: '内部页面', pinned: false });
    mockNoActiveTab();

    render(<App />);

    expect(await screen.findByText('此页面无法收藏')).toBeTruthy();
    expect(screen.getByRole('button', { name: /保存并关闭 Tab/ })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: '仅保存' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('textbox', { name: /为什么收藏/ })).toHaveProperty('disabled', true);
    expect(document.querySelector('.dims')?.getAttribute('aria-disabled')).toBe('true');
    // 禁用态下面板整体置灰
    expect(document.querySelector('.panel')?.classList.contains('panel-uncapturable')).toBe(true);
    // 页面信息仍然展示，供用户确认当前页
    expect(screen.getByText('内部页面')).toBeTruthy();
  });

  it('不可收藏页面不把光标放进理由输入框', async () => {
    await stashTarget({ tabId: 1, url: 'about:blank', title: '', pinned: false });
    mockNoActiveTab();

    render(<App />);

    const textarea = await screen.findByRole('textbox', { name: /为什么收藏/ });
    expect(document.activeElement).not.toBe(textarea);
  });

  it('http(s) 页面不出现「此页面无法收藏」', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    await screen.findByText(WEB_TARGET.title);
    expect(screen.queryByText('此页面无法收藏')).toBeNull();
  });
});

describe('四维点选（feat04）', () => {
  it('取值集合来自本地分类（getTaxonomy），首次使用渲染默认集合（场景3）', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    expect(await screen.findByRole('button', { name: '世界模型' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '上下文工程' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '论文' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '学习原理' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'inbox' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'reading' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'done' })).toBeTruthy();
  });

  it('渲染的是与「设置」共享的那套取值，面板内有就地增删入口（场景3，feat08 增补）', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();
    await seedTaxonomy({
      topic: ['RAG'],
      type: ['视频'],
      purpose: ['写论文'],
      status: [DEFAULT_STATUS, '归档'],
    });

    render(<App />);

    expect(await screen.findByRole('button', { name: 'RAG' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '视频' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '写论文' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '归档' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '世界模型' })).toBeNull();
    // 面板可就地增删取值（feat08）：修改区与删除按钮都收进修改模式（场景7/8 修订）
    expect(document.querySelector('.dims .chip-add')).toBeNull();
    expect(screen.queryByRole('button', { name: '删除取值 RAG' })).toBeNull();
    enterEditMode();
    expect(document.querySelectorAll('.dims .chip-add input')).toHaveLength(4);
    expect(screen.getByRole('button', { name: '添加主题取值' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '删除取值 RAG' })).toBeTruthy();
  });

  it('多选维度（主题/形态/用途）点选 toggle，同维度可同时选中多个（场景1）', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    const world = await screen.findByRole('button', { name: '世界模型' });
    const ai = screen.getByRole('button', { name: 'AI' });
    fireEvent.click(world);
    expect(world).toHaveProperty('className', expect.stringContaining('on'));
    fireEvent.click(ai);
    expect(ai).toHaveProperty('className', expect.stringContaining('on'));
    expect(world).toHaveProperty('className', expect.stringContaining('on'));
    fireEvent.click(world);
    expect(world.classList.contains('on')).toBe(false);
    expect(ai.classList.contains('on')).toBe(true);
  });

  it('状态单选：默认选中 inbox，点另一个后仅最新点击的处于选中态（场景2）', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    const inbox = await screen.findByRole('button', { name: 'inbox' });
    const reading = screen.getByRole('button', { name: 'reading' });
    const done = screen.getByRole('button', { name: 'done' });
    expect(inbox.classList.contains('on')).toBe(true);
    expect(reading.classList.contains('on')).toBe(false);

    fireEvent.click(reading);
    expect(reading.classList.contains('on')).toBe(true);
    expect(inbox.classList.contains('on')).toBe(false);
    expect(done.classList.contains('on')).toBe(false);

    fireEvent.click(done);
    expect(done.classList.contains('on')).toBe(true);
    expect(reading.classList.contains('on')).toBe(false);
  });

  it('不可收藏页面分类点选不可用（feat02 场景2）', async () => {
    await stashTarget({ tabId: 1, url: 'chrome://newtab/', title: '内部页面', pinned: false });
    mockNoActiveTab();

    render(<App />);

    const chip = await screen.findByRole('button', { name: '世界模型' });
    expect(chip).toHaveProperty('disabled', true);
    fireEvent.click(chip);
    expect(chip.classList.contains('on')).toBe(false);
  });
});

describe('面板内就地增删取值（feat08，增删均在修改模式下）', () => {
  it('场景1：修改模式下输入新取值点加号 → 取值立即可见可点选，输入框清空且保持焦点', async () => {
    await renderPanelWithDims();
    enterEditMode();

    const input = screen.getByRole('textbox', { name: '新主题取值' });
    fireEvent.change(input, { target: { value: 'Agent' } });
    fireEvent.click(screen.getByRole('button', { name: '添加主题取值' }));

    const added = await screen.findByRole('button', { name: 'Agent' });
    fireEvent.click(added);
    expect(added.classList.contains('on')).toBe(true);
    await waitFor(() => {
      expect(input).toHaveProperty('value', '');
      expect(document.activeElement).toBe(input);
    });
  });

  it('场景1：输入框内按 Enter 等同点加号', async () => {
    await renderPanelWithDims();
    enterEditMode();

    const input = screen.getByRole('textbox', { name: '新主题取值' });
    fireEvent.change(input, { target: { value: 'Agent' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByRole('button', { name: 'Agent' })).toBeTruthy();
  });

  it('场景2：纯空白提交静默忽略——不添加、无提示、不落库', async () => {
    await renderPanelWithDims();
    enterEditMode();

    const input = screen.getByRole('textbox', { name: '新主题取值' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '添加主题取值' }));

    expect(screen.queryByText('该取值已存在')).toBeNull();
    expect(screen.queryByText('取值过长')).toBeNull();
    await waitFor(() => expect(input).toHaveProperty('value', '   '));
    expect(await db.taxonomies.get('local')).toBeUndefined();
  });

  it('场景2：重复取值提示「该取值已存在」，再次输入时提示消失', async () => {
    await renderPanelWithDims();
    enterEditMode();

    const input = screen.getByRole('textbox', { name: '新主题取值' });
    fireEvent.change(input, { target: { value: '世界模型' } });
    fireEvent.click(screen.getByRole('button', { name: '添加主题取值' }));

    expect(await screen.findByText('该取值已存在')).toBeTruthy();
    fireEvent.change(input, { target: { value: '别的' } });
    await waitFor(() => expect(screen.queryByText('该取值已存在')).toBeNull());
  });

  it('场景2：超过 30 字提示「取值过长」', async () => {
    await renderPanelWithDims();
    enterEditMode();

    const input = screen.getByRole('textbox', { name: '新主题取值' });
    fireEvent.change(input, {
      target: { value: 'a'.repeat(TAXONOMY_VALUE_MAX + 1) },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加主题取值' }));

    expect(await screen.findByText('取值过长')).toBeTruthy();
  });

  it('场景3：修改模式下点 × 删除取值 → chip 消失，本地 taxonomy 同步更新', async () => {
    await renderPanelWithDims();

    enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: '删除取值 世界模型' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: '世界模型' })).toBeNull());
    const row = await db.taxonomies.get('local');
    expect(row?.taxonomy.topic).not.toContain('世界模型');
  });

  it('场景3：删除处于选中态的多选取值 → 选中同时取消', async () => {
    await renderPanelWithDims();

    fireEvent.click(screen.getByRole('button', { name: '世界模型' }));
    expect(document.querySelectorAll('.dims .chip.on .chip-btn').length).toBeGreaterThan(1);
    enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: '删除取值 世界模型' }));

    await waitFor(() => {
      // 仅剩默认选中的 inbox
      const selected = document.querySelectorAll('.dims .chip.on .chip-btn');
      expect(selected).toHaveLength(1);
      expect(selected[0]?.textContent).toBe('inbox');
    });
  });

  it('场景3：删除当前选中的状态 → 状态回退选中 Inbox', async () => {
    await renderPanelWithDims();

    fireEvent.click(screen.getByRole('button', { name: 'reading' }));
    expect(screen.getByRole('button', { name: 'reading' }).classList.contains('on')).toBe(true);
    enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: '删除取值 reading' }));

    const inbox = await screen.findByRole('button', { name: 'inbox' });
    await waitFor(() => {
      expect(inbox.classList.contains('on')).toBe(true);
      expect(screen.queryByRole('button', { name: 'reading' })).toBeNull();
    });
  });

  it('场景4：修改模式下 Inbox 不可删除，提示「默认状态不可删除」且取值保留', async () => {
    await renderPanelWithDims();

    enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: '删除取值 inbox' }));

    expect(await screen.findByText('默认状态不可删除')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'inbox' })).toBeTruthy();
    // 受保护拒绝不产生任何落库（首次使用时 taxonomy 行本就不存在）
    expect(await db.taxonomies.get('local')).toBeUndefined();
  });

  it('场景5：默认两段（标题→取值区）；修改模式下三段，修改区为末段', async () => {
    await renderPanelWithDims();

    let dims = document.querySelectorAll('.dims .dim');
    expect(dims).toHaveLength(4);
    dims.forEach((dim) => {
      const segments = Array.from(dim.children).map((el) => el.classList[0]);
      expect(segments).toEqual(['dim-head', 'chips']);
    });

    enterEditMode();
    dims = document.querySelectorAll('.dims .dim');
    dims.forEach((dim) => {
      const segments = Array.from(dim.children).map((el) => el.classList[0]);
      expect(segments).toEqual(['dim-head', 'chips', 'chip-add']);
    });
    // 修改模式下每个维度都有输入框 + 加号
    expect(document.querySelectorAll('.dims .chip-add input')).toHaveLength(4);
    expect(document.querySelectorAll('.dims .chip-add button')).toHaveLength(4);
    // 「维度的取值在设置里统一管理」提示随 feat08 移除
    expect(screen.queryByText('维度的取值在「设置」里统一管理，这里只做点选')).toBeNull();
    expect(document.querySelector('.dims-hint')).toBeNull();
  });

  it('场景6：不可收藏页面增删入口与点选一并禁用', async () => {
    await stashTarget({ tabId: 1, url: 'about:blank', title: '内部页面', pinned: false });
    mockNoActiveTab();
    render(<App />);
    await screen.findByText('此页面无法收藏');
    await screen.findByRole('button', { name: '世界模型' });

    // 默认无修改区；「修改」切换本身可用（视图切换非数据操作）
    expect(document.querySelector('.dims .chip-add')).toBeNull();
    enterEditMode();
    expect(screen.getByRole('button', { name: '完成' })).toBeTruthy();
    // 切换出的修改区输入框、加号与「×」随四维区一并禁用
    const inputs = document.querySelectorAll<HTMLInputElement>('.dims .chip-add input');
    expect(inputs).toHaveLength(4);
    inputs.forEach((input) => expect(input.disabled).toBe(true));
    expect(screen.getByRole('button', { name: '添加主题取值' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: '删除取值 世界模型' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('场景7：默认非修改模式——顶栏有「修改」按钮，取值无「×」、卡片无修改区', async () => {
    await renderPanelWithDims();

    expect(screen.getByRole('button', { name: '修改' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '完成' })).toBeNull();
    expect(screen.queryByRole('button', { name: '删除取值 世界模型' })).toBeNull();
    expect(screen.queryByRole('button', { name: '删除取值 inbox' })).toBeNull();
    expect(document.querySelector('.dims .chip-add')).toBeNull();
  });

  it('场景7：点「修改」进入（按钮变「完成」、「×」与修改区出现），点「完成」退出后全部隐藏', async () => {
    await renderPanelWithDims();

    enterEditMode();
    expect(screen.queryByRole('button', { name: '修改' })).toBeNull();
    expect(screen.getByRole('button', { name: '完成' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '删除取值 世界模型' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '删除取值 inbox' })).toBeTruthy();
    expect(document.querySelectorAll('.dims .chip-add input')).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(screen.getByRole('button', { name: '修改' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '删除取值 世界模型' })).toBeNull();
    expect(screen.queryByRole('button', { name: '删除取值 inbox' })).toBeNull();
    expect(document.querySelector('.dims .chip-add')).toBeNull();
  });

  it('场景7：退出修改模式清除增删错误提示，再次进入不残留', async () => {
    await renderPanelWithDims();

    enterEditMode();
    fireEvent.change(screen.getByRole('textbox', { name: '新主题取值' }), {
      target: { value: '世界模型' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加主题取值' }));
    expect(await screen.findByText('该取值已存在')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    enterEditMode();
    expect(screen.queryByText('该取值已存在')).toBeNull();
  });

  it('场景7：修改模式下关闭面板，重新打开回到默认非修改模式（状态不持久化）', async () => {
    const { unmount } = await renderPanelWithDims();
    enterEditMode();
    expect(screen.getByRole('button', { name: '完成' })).toBeTruthy();
    unmount();

    // popup 每次打开都是全新页面加载：重开 = 全新挂载，不延续上次的修改模式
    await renderPanelWithDims();
    expect(screen.getByRole('button', { name: '修改' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '删除取值 世界模型' })).toBeNull();
  });

  it('不变量（smoke）：面板新增的取值落进与设置共享的本地 taxonomy', async () => {
    await renderPanelWithDims();
    enterEditMode();

    fireEvent.change(screen.getByRole('textbox', { name: '新主题取值' }), {
      target: { value: 'Agent' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加主题取值' }));

    await screen.findByRole('button', { name: 'Agent' });
    const row = await db.taxonomies.get('local');
    expect(row?.taxonomy.topic).toContain('Agent');
  });
});

describe('零点选默认态（feat04 场景4）', () => {
  it('不动任何分类时：状态保持 inbox 选中，主题/形态/用途全空（落库终验归 task-capture-save）', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    const inbox = await screen.findByRole('button', { name: 'inbox' });
    expect(inbox.classList.contains('on')).toBe(true);
    // chip 由 button 改为 span 胶囊容器（内含点选与删除两个按钮，feat08），选中态断言落到内部点选按钮上
    const selected = document.querySelectorAll('.dims .chip.on .chip-btn');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toBe(inbox);
  });
});

describe('重复收藏预填（feat06 场景1）', () => {
  function seedExisting(overrides: Partial<Bookmark> = {}): Bookmark {
    const existing = createBookmark(crypto.randomUUID(), {
      url: WEB_TARGET.url,
      title: '旧标题',
      note: '旧理由',
    });
    existing.classification = { topics: ['AI'], types: ['论文'], purposes: [], status: 'reading' };
    return { ...existing, ...overrides };
  }

  it('页面已在库中 → 显示「已收藏过 · 保存将更新」，理由与四维按库中内容预填', async () => {
    await db.bookmarks.add(seedExisting());
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    expect(await screen.findByText('已收藏过 · 保存将更新')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /为什么收藏/ })).toHaveProperty('value', '旧理由');
    expect(screen.getByRole('button', { name: 'AI' }).classList.contains('on')).toBe(true);
    expect(screen.getByRole('button', { name: '论文' }).classList.contains('on')).toBe(true);
    expect(screen.getByRole('button', { name: '学习原理' }).classList.contains('on')).toBe(false);
    // 状态选中其当前状态
    expect(screen.getByRole('button', { name: 'reading' }).classList.contains('on')).toBe(true);
    expect(screen.getByRole('button', { name: 'inbox' }).classList.contains('on')).toBe(false);
  });

  it('规范化命中：带追踪参数的当前页与库中记录视为同一页（预填生效）', async () => {
    await db.bookmarks.add(seedExisting());
    await stashTarget({ ...WEB_TARGET, url: `${WEB_TARGET.url}?utm_source=newsletter` });
    mockNoActiveTab();

    render(<App />);

    expect(await screen.findByText('已收藏过 · 保存将更新')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /为什么收藏/ })).toHaveProperty('value', '旧理由');
  });

  it('页面未收藏过 → 无更新提示，理由为空、默认 Inbox', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    await screen.findByText(WEB_TARGET.title);
    await screen.findByRole('button', { name: 'inbox' });
    expect(screen.queryByText('已收藏过 · 保存将更新')).toBeNull();
    expect(screen.getByRole('textbox', { name: /为什么收藏/ })).toHaveProperty('value', '');
    expect(screen.getByRole('button', { name: 'inbox' }).classList.contains('on')).toBe(true);
  });

  it('曾被删除的记录不预填（对用户是新收藏；保存时复活同一条）', async () => {
    await db.bookmarks.add(seedExisting({ deletedAt: '2026-09-01T00:00:00.000Z' }));
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    await screen.findByText(WEB_TARGET.title);
    await screen.findByRole('button', { name: 'inbox' });
    expect(screen.queryByText('已收藏过 · 保存将更新')).toBeNull();
    expect(screen.getByRole('textbox', { name: /为什么收藏/ })).toHaveProperty('value', '');
  });
});

describe('关 Tab 边界（feat05 场景3/4/5）', () => {
  it('固定标签页：保存成功但不关页，横幅「✓ 已保存；固定标签页未关闭」（场景3）', async () => {
    const { close, removeSpy } = await renderCapturable({ ...WEB_TARGET, pinned: true });

    fireEvent.click(screen.getByRole('button', { name: /保存并关闭 Tab/ }));

    expect(await screen.findByText('✓ 已保存；固定标签页未关闭')).toBeTruthy();
    expect(removeSpy).not.toHaveBeenCalled();
    expect(await db.bookmarks.count()).toBe(1);
    await waitFor(() => expect(close).toHaveBeenCalled());
  });

  it('窗口最后一个标签页：不做特判，仅 tabs.remove 关页（浏览器自然连带关窗），不调 windows.remove（场景4）', async () => {
    const { removeSpy } = await renderCapturable();
    const windowsRemove = vi.spyOn(browser.windows, 'remove');

    fireEvent.click(screen.getByRole('button', { name: /保存并关闭 Tab/ }));

    await screen.findByText('✓ 已存入 Inbox，Tab 即将关闭');
    expect(removeSpy).toHaveBeenCalledWith(WEB_TARGET.tabId);
    expect(windowsRemove).not.toHaveBeenCalled();
  });

  it('面板打开期间目标已被关闭：tabs.remove 抛错，保存照常完成并关闭面板（场景5）', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();
    const close = stubWindowClose();
    browser.tabs.remove = vi
      .fn<(tabIds: number | number[]) => Promise<void>>()
      .mockRejectedValue(new Error('No tab with id: 1'));
    render(<App bannerDelayMs={0} />);
    await screen.findByText(WEB_TARGET.title);

    fireEvent.click(screen.getByRole('button', { name: /保存并关闭 Tab/ }));

    expect(await screen.findByText('✓ 已存入 Inbox，Tab 即将关闭')).toBeTruthy();
    expect(await db.bookmarks.count()).toBe(1);
    await waitFor(() => expect(close).toHaveBeenCalled());
  });
});

describe('理由输入框（feat03 场景1）', () => {
  it('标签与可选提示齐备，初始为空，可输入任意文字（含换行），可留空', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    const textarea = await screen.findByRole('textbox', { name: /为什么收藏/ });
    const label = document.querySelector('label[for="why"]');
    expect(label?.textContent).toContain('为什么收藏？');
    expect(label?.textContent).toContain('可选，但这句话以后最管用');
    expect(textarea).toHaveProperty('value', '');
    fireEvent.change(textarea, {
      target: { value: '想看看 action 如何影响环境预测\n以后用于游戏 Agent benchmark' },
    });
    expect(textarea).toHaveProperty(
      'value',
      '想看看 action 如何影响环境预测\n以后用于游戏 Agent benchmark',
    );
  });
});

describe('键盘行为（feat03 场景2-5）', () => {
  it('Enter 触发「保存并关闭 Tab」：落库、横幅、关目标标签页与面板（feat03 场景2 + feat05 场景1）', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();
    const close = stubWindowClose();
    const removeSpy = vi.spyOn(browser.tabs, 'remove');
    render(<App bannerDelayMs={0} />);
    const textarea = await screen.findByRole('textbox', { name: /为什么收藏/ });

    fireEvent.change(textarea, { target: { value: '想看看 action 如何影响环境预测' } });
    const prevented = fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(prevented).toBe(false); // 已 preventDefault，不插入换行
    expect(await screen.findByText('✓ 已存入 Inbox，Tab 即将关闭')).toBeTruthy();
    const rows = await db.bookmarks.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.note).toBe('想看看 action 如何影响环境预测');
    expect(rows[0]?.urlNormalized).toBe('https://arxiv.org/abs/2401.00001');
    expect(removeSpy).toHaveBeenCalledWith(WEB_TARGET.tabId);
    await waitFor(() => expect(close).toHaveBeenCalled());
  });

  it('输入法组字中的 Enter 只上屏，不触发保存（场景3）', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();
    render(<App bannerDelayMs={0} />);
    const textarea = await screen.findByRole('textbox', { name: /为什么收藏/ });

    const prevented = fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true });
    expect(prevented).toBe(true); // 未 preventDefault，候选词正常上屏
    expect(screen.queryByText(/✓ 已存入/)).toBeNull();
    expect(await db.bookmarks.count()).toBe(0);
  });

  it('Shift+Enter 在理由内换行，不触发保存（场景4）', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();
    render(<App bannerDelayMs={0} />);
    const textarea = await screen.findByRole('textbox', { name: /为什么收藏/ });

    const prevented = fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(prevented).toBe(true); // 未 preventDefault，走浏览器默认换行
    expect(screen.queryByText(/✓ 已存入/)).toBeNull();
    expect(await db.bookmarks.count()).toBe(0);
  });

  it('Esc 关闭面板且不保存，已输入草稿丢弃（场景5）', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();
    const close = stubWindowClose();
    render(<App bannerDelayMs={0} />);
    const textarea = await screen.findByRole('textbox', { name: /为什么收藏/ });

    fireEvent.change(textarea, { target: { value: '写了一半的草稿' } });
    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(close).toHaveBeenCalledOnce();
    expect(screen.queryByText(/✓ 已存入/)).toBeNull();
    expect(await db.bookmarks.count()).toBe(0);
  });
});

describe('保存动作与横幅（feat05 场景1/2/6 + feat04 场景4 + feat06 场景2）', () => {
  it('「保存并关闭 Tab」：落库 → 横幅 → 关目标标签页与面板（场景1）', async () => {
    const { close, removeSpy } = await renderCapturable();

    fireEvent.click(screen.getByRole('button', { name: /保存并关闭 Tab/ }));

    expect(await screen.findByText('✓ 已存入 Inbox，Tab 即将关闭')).toBeTruthy();
    expect(await db.bookmarks.count()).toBe(1);
    expect(removeSpy).toHaveBeenCalledWith(WEB_TARGET.tabId);
    await waitFor(() => expect(close).toHaveBeenCalled());
  });

  it('「仅保存」：横幅不含关 Tab，目标标签页保留，面板关闭（场景2）', async () => {
    const { close, removeSpy } = await renderCapturable();

    fireEvent.click(screen.getByRole('button', { name: '仅保存' }));

    expect(await screen.findByText('✓ 已存入 Inbox')).toBeTruthy();
    expect(removeSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(close).toHaveBeenCalled());
  });

  it('保存进行中忽略重复点击，不产生重复保存（场景6）', async () => {
    const { removeSpy } = await renderCapturable();
    const saveClose = screen.getByRole('button', { name: /保存并关闭 Tab/ });

    fireEvent.click(saveClose);
    expect(saveClose).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: '仅保存' })).toHaveProperty('disabled', true);
    fireEvent.click(saveClose);
    fireEvent.click(screen.getByRole('button', { name: '仅保存' }));

    await screen.findByText('✓ 已存入 Inbox，Tab 即将关闭');
    expect(await db.bookmarks.count()).toBe(1);
    expect(removeSpy).toHaveBeenCalledOnce();
  });

  it('零点选默认态经保存链路落库：主题/形态/用途全空 + 状态 Inbox（feat04 场景4 终验）', async () => {
    await renderCapturable();

    fireEvent.click(screen.getByRole('button', { name: '仅保存' }));

    await screen.findByText('✓ 已存入 Inbox');
    const rows = await db.bookmarks.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.classification).toEqual({
      topics: [],
      types: [],
      purposes: [],
      status: DEFAULT_STATUS,
    });
    expect(rows[0]?.note).toBeNull();
  });

  it('横幅状态名跟随当前选中的状态取值', async () => {
    await renderCapturable();

    fireEvent.click(await screen.findByRole('button', { name: 'reading' }));
    fireEvent.click(screen.getByRole('button', { name: '仅保存' }));

    expect(await screen.findByText('✓ 已存入 Reading')).toBeTruthy();
  });

  it('已收藏过页面保存为更新：不新增条目，理由与四维覆盖（feat06 场景2 集成）', async () => {
    const existing = createBookmark(crypto.randomUUID(), {
      url: WEB_TARGET.url,
      title: '旧标题',
      note: '旧理由',
    });
    await db.bookmarks.add(existing);
    await renderCapturable();
    await screen.findByText('已收藏过 · 保存将更新');

    fireEvent.change(screen.getByRole('textbox', { name: /为什么收藏/ }), {
      target: { value: '更新的理由' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'AI' }));
    fireEvent.click(screen.getByRole('button', { name: '仅保存' }));

    await screen.findByText('✓ 已存入 Inbox');
    const rows = await db.bookmarks.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(existing.id);
    expect(rows[0]?.note).toBe('更新的理由');
    expect(rows[0]?.classification.topics).toEqual(['AI']);
  });
});

describe('顶栏主页入口（homepage feat01 场景1/2）', () => {
  function mockTabsCreate(): ReturnType<typeof vi.fn> {
    const createdTab: Browser.tabs.Tab = {
      id: 9,
      index: 0,
      pinned: false,
      highlighted: true,
      windowId: 1,
      active: true,
      frozen: false,
      incognito: false,
      selected: true,
      discarded: false,
      autoDiscardable: true,
      groupId: -1,
      lastAccessed: 0,
    };
    const create = vi
      .fn<(createProperties: Browser.tabs.CreateProperties) => Promise<Browser.tabs.Tab>>()
      .mockResolvedValue(createdTab);
    browser.tabs.create = create;
    return create;
  }

  it('「已收藏」在新标签页整页打开主页「最近新增」，面板关闭且草稿不保存', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();
    const close = stubWindowClose();
    const create = mockTabsCreate();

    render(<App />);
    const textarea = await screen.findByRole('textbox', { name: /为什么收藏/ });
    await screen.findByRole('button', { name: '世界模型' });
    fireEvent.change(textarea, { target: { value: '没保存的理由草稿' } });
    fireEvent.click(screen.getByRole('button', { name: '世界模型' }));

    fireEvent.click(screen.getByRole('button', { name: '已收藏' }));

    expect(create).toHaveBeenCalledWith({ url: browser.runtime.getURL('/home.html#recent') });
    await waitFor(() => expect(close).toHaveBeenCalled());
    // 未保存的理由与点选不保留、也不自动保存
    expect(await db.bookmarks.count()).toBe(0);
  });

  it('「设置」同样打开主页，但落在「网络连接」条目', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();
    stubWindowClose();
    const create = mockTabsCreate();

    render(<App />);
    await screen.findByText(WEB_TARGET.title);

    fireEvent.click(screen.getByRole('button', { name: '设置' }));

    expect(create).toHaveBeenCalledWith({ url: browser.runtime.getURL('/home.html#network') });
  });
});

describe('顶栏库计数（capture feat07 修订 / homepage feat01 场景5 修订）', () => {
  it('库有 2 条 → 顶栏「已收藏」左侧显示「收藏2条」，底部计数条移除', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();
    await db.bookmarks.add(
      createBookmark(crypto.randomUUID(), { url: 'https://a.com/1', title: 'A' }),
    );
    await db.bookmarks.add(
      createBookmark(crypto.randomUUID(), { url: 'https://b.com/2', title: 'B' }),
    );

    render(<App />);

    expect(await screen.findByText('收藏2条')).toBeTruthy();
    // 计数为 .topbar-links 首位，「已收藏」按钮紧随其后（左侧紧邻）
    const links = document.querySelector('.topbar-links');
    expect(links?.firstElementChild?.classList.contains('library-count')).toBe(true);
    expect(links?.children[1]?.textContent).toBe('已收藏');
    // 底部计数条整体移除；导入入口统一为主页左侧导航的「导入已有书签」条目
    expect(document.querySelector('.library-bar')).toBeNull();
    expect(screen.queryByRole('button', { name: '打开导入器' })).toBeNull();
  });

  it('空库显示「收藏0条」，同样无导入器按钮', async () => {
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();

    render(<App />);

    expect(await screen.findByText('收藏0条')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开导入器' })).toBeNull();
  });
});

describe('账号切换刷新（task-account-libraries T8 / feat01 场景5）', () => {
  it('收到切换广播后，库计数与四维取值重读为新账号库（default → B）', async () => {
    await db.bookmarks.add(
      createBookmark(crypto.randomUUID(), { url: 'https://example.com/d', title: '默认库一条' }),
    );
    await seedTaxonomy({ topic: ['默认主题'] });
    await stashTarget(WEB_TARGET);
    mockNoActiveTab();
    render(<App />);

    expect(await screen.findByText('收藏1条')).toBeTruthy();
    expect(screen.getByRole('button', { name: '默认主题' })).toBeTruthy();

    // 主页完成登录 B：settings 写入 → storage.onChanged 广播；B 的库本机已有数据
    const S1 = 'https://s1.example:8443';
    const sessionB = {
      email: 'b@x.com',
      serverUrl: S1,
      token: 't-b',
      expiresAt: '2030-01-01T00:00:00.000Z',
    };
    const libB = await openLibrary(`${S1}#b@x.com`);
    await libB.bookmarks.bulkAdd([
      createBookmark(crypto.randomUUID(), { url: 'https://example.com/b1', title: 'B 一条' }),
      createBookmark(crypto.randomUUID(), { url: 'https://example.com/b2', title: 'B 两条' }),
    ]);
    await libB.taxonomies.put({
      id: 'local',
      taxonomy: TaxonomySchema.parse({
        ...createDefaultTaxonomy(),
        topic: ['B 主题'],
        updatedAt: '2026-09-10T00:00:00.000Z',
      }),
    });
    await recordServerLogin(S1, sessionB);

    expect(await screen.findByText('收藏2条')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'B 主题' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '默认主题' })).toBeNull();
  });
});
