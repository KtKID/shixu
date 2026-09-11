import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createBookmark } from '@x-threadpick/shared';
import { db } from '../../db/bookmarks';
import App, { parseSectionHash } from './App';

beforeEach(async () => {
  cleanup();
  fakeBrowser.reset();
  await db.bookmarks.clear();
  await db.taxonomies.clear();
});

describe('主页左侧导航（feat02 场景1 / 场景3）', () => {
  it('导航条目从上到下依次为五项（feat07 增补「全部收藏」），默认选中「最近新增」', () => {
    render(<App />);

    const items = screen.getByRole('navigation', { name: '主导航' }).querySelectorAll('.nav-item');
    expect(items).toHaveLength(5);
    expect(items[0]?.textContent).toContain('最近新增');
    expect(items[1]?.textContent).toContain('全部收藏');
    expect(items[2]?.textContent).toContain('网络连接');
    expect(items[3]?.textContent).toContain('分类维度');
    expect(items[4]?.textContent).toContain('导入已有书签');
    expect(items[0]?.classList.contains('active')).toBe(true);
    expect(items[0]?.getAttribute('aria-current')).toBe('page');
    expect(items[1]?.getAttribute('aria-current')).toBeNull();
  });

  it('设计稿里的「视图」「回收站」等预留条目不出现（场景3）', () => {
    render(<App />);

    const nav = screen.getByRole('navigation', { name: '主导航' });
    expect(screen.queryByText('视图')).toBeNull();
    expect(screen.queryByText('回收站')).toBeNull();
    expect(nav.querySelectorAll('.nav-item')).toHaveLength(5);
  });

  it('点击条目切换选中分区', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '分类维度' }));
    const items = screen.getByRole('navigation', { name: '主导航' }).querySelectorAll('.nav-item');
    expect(items[3]?.classList.contains('active')).toBe(true);
    expect(items[0]?.classList.contains('active')).toBe(false);
  });
});

describe('「全部收藏」条目（feat07）', () => {
  it('点击「全部收藏」切换选中，内容区标题为「全部收藏」', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '全部收藏' }));
    const items = screen.getByRole('navigation', { name: '主导航' }).querySelectorAll('.nav-item');
    expect(items[1]?.classList.contains('active')).toBe(true);
    expect(await screen.findByRole('heading', { name: '全部收藏' })).toBeTruthy();
  });

  it('空收藏库时同样可达，显示空态与去导入引导', async () => {
    render(<App initialSection="library" />);

    expect(await screen.findByText(/收藏库还是空的/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /去「导入已有书签」/ })).toBeTruthy();
  });
});

describe('地址指定初始条目（feat01 场景2 的落点承载）', () => {
  it('initialSection 指定「网络连接」时该项选中（供「设置」按钮直达）', () => {
    render(<App initialSection="network" />);

    const items = screen.getByRole('navigation', { name: '主导航' }).querySelectorAll('.nav-item');
    // feat07 后导航五项，「网络连接」为第三项（index 2）
    expect(items[2]?.classList.contains('active')).toBe(true);
    expect(items[0]?.classList.contains('active')).toBe(false);
  });

  it('parseSectionHash：合法 hash 解析为对应条目，空/未知值回退「最近新增」', () => {
    expect(parseSectionHash('#recent')).toBe('recent');
    expect(parseSectionHash('#library')).toBe('library');
    expect(parseSectionHash('#network')).toBe('network');
    expect(parseSectionHash('#dimensions')).toBe('dimensions');
    expect(parseSectionHash('#import')).toBe('import');
    expect(parseSectionHash('')).toBe('recent');
    expect(parseSectionHash('#bogus')).toBe('recent');
  });
});

describe('导航切换同步地址 hash（feat02 场景5）', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('点击条目后地址 hash 跟随（nav_click_updates_hash）', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '分类维度' }));
    expect(window.location.hash).toBe('#dimensions');
  });

  it('hash 变化（手动改地址/前进后退）时选中条目跟随（hashchange_switches_section）', async () => {
    render(<App />);

    window.location.hash = '#library';
    fireEvent(window, new HashChangeEvent('hashchange'));

    const items = screen.getByRole('navigation', { name: '主导航' }).querySelectorAll('.nav-item');
    expect(items[1]?.classList.contains('active')).toBe(true);
    expect(await screen.findByRole('heading', { name: '全部收藏' })).toBeTruthy();
  });

  it('切换条目后重开页面仍落在该条目（refresh_keeps_section）', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '全部收藏' }));

    cleanup();
    render(<App initialSection={parseSectionHash(window.location.hash)} />);

    const items = screen.getByRole('navigation', { name: '主导航' }).querySelectorAll('.nav-item');
    expect(items[1]?.classList.contains('active')).toBe(true);
    expect(await screen.findByRole('heading', { name: '全部收藏' })).toBeTruthy();
  });
});

describe('导航分区内容沿用《设置页面》spec（feat02 场景1）', () => {
  it('「网络连接」内是服务器地址/端口、测试连接、历史服务器与账号登录', async () => {
    render(<App initialSection="network" />);

    expect(await screen.findByLabelText('服务器地址')).toBeTruthy();
    expect(screen.getByLabelText('端口')).toBeTruthy();
    expect(screen.getByRole('button', { name: '测试连接' })).toBeTruthy();
    expect(screen.getByText('历史服务器 · 登录成功后自动记录，点击即可切换')).toBeTruthy();
    expect(screen.getByText('暂无记录，登录成功后自动保存。')).toBeTruthy();
    expect(screen.getByLabelText('邮箱')).toBeTruthy();
    expect(screen.getByRole('button', { name: '登录' })).toBeTruthy();
  });

  it('「分类维度」内是四个维度的取值管理（默认取值集合）', async () => {
    render(<App initialSection="dimensions" />);

    expect(await screen.findByText('它讲什么？')).toBeTruthy();
    expect(screen.getByText('世界模型')).toBeTruthy();
    expect(screen.getByRole('button', { name: '删除取值 inbox' })).toBeTruthy();
  });
});

describe('切换导航不丢输入（feat02 场景2）', () => {
  it('同一次打开内：填了未测试的服务器地址，切到「分类维度」再切回，地址仍在', async () => {
    render(<App initialSection="network" />);

    const host = await screen.findByLabelText('服务器地址');
    fireEvent.change(host, { target: { value: 'sync.example.com' } });
    fireEvent.change(screen.getByLabelText('端口'), { target: { value: '8443' } });

    fireEvent.click(screen.getByRole('button', { name: '分类维度' }));
    await screen.findByText('它讲什么？');
    expect(screen.queryByLabelText('服务器地址')).toBeNull(); // 已切走

    fireEvent.click(screen.getByRole('button', { name: '网络连接' }));
    expect(await screen.findByDisplayValue('sync.example.com')).toBeTruthy();
    expect(screen.getByDisplayValue('8443')).toBeTruthy();
  });

  it('「最近新增」里的本地库内容与其他分区互不影响地并存', async () => {
    await db.bookmarks.add(
      createBookmark(crypto.randomUUID(), {
        url: 'https://local.example/page',
        title: '本地一条',
      }),
    );

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '网络连接' }));
    await screen.findByLabelText('服务器地址');

    fireEvent.click(screen.getByRole('button', { name: '最近新增' }));
    expect(await screen.findByText('最近添加')).toBeTruthy();
    expect(screen.getByText('本地一条')).toBeTruthy();
  });
});
