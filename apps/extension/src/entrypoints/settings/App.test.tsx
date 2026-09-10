import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { db } from '../../db/bookmarks';
import App from './App';

beforeEach(async () => {
  cleanup();
  fakeBrowser.reset();
  await db.taxonomies.clear();
});

describe('设置页骨架（feat05 场景2）', () => {
  it('品牌头、三张卡片与页脚齐备', async () => {
    render(<App />);
    const brand = await screen.findByText('拾绪');
    expect(brand.parentElement?.textContent).toBe('拾绪 · 个人上下文记忆层');
    expect(screen.getByText('设置', { selector: 'h1' })).toBeTruthy();
    expect(screen.getByText('连接你的同步服务，定义属于你的分类维度。')).toBeTruthy();
    expect(await screen.findByText('服务器', { selector: '.card-title' })).toBeTruthy();
    expect(screen.getByText('账号', { selector: '.card-title' })).toBeTruthy();
    expect(screen.getByText('分类维度', { selector: '.card-title' })).toBeTruthy();
    expect(screen.getByText('Save → Understand → Resurface')).toBeTruthy();
  });

  it('四个维度显示名称与它回答的问题，多选/单选标注正确（无流转语义）', async () => {
    render(<App />);
    expect(await screen.findByText('它讲什么？')).toBeTruthy();
    expect(screen.getByText('它是什么？')).toBeTruthy();
    expect(screen.getByText('我拿它干什么？')).toBeTruthy();
    expect(screen.getByText('我处理到哪了？')).toBeTruthy();
    expect(screen.getAllByText('多选')).toHaveLength(3);
    expect(screen.getAllByText('单选')).toHaveLength(1);
    expect(screen.queryByText('单选 · 流转')).toBeNull();
  });

  it('首次使用展示默认取值集合（feat05 场景1）', async () => {
    render(<App />);
    expect(await screen.findByText('世界模型')).toBeTruthy();
    expect(screen.getByText('上下文工程')).toBeTruthy();
    expect(screen.getByText('博客文章')).toBeTruthy();
    expect(screen.getByText('GitHub 仓库')).toBeTruthy();
    expect(screen.getByText('论文')).toBeTruthy();
    expect(screen.getByText('文档')).toBeTruthy();
    expect(screen.getByText('学习原理')).toBeTruthy();
    expect(screen.getByText('项目参考')).toBeTruthy();
    expect(screen.getByText('工具备用')).toBeTruthy();
    // 状态取值以 status-chip 标注（存储为小写，展示层首字母大写由 CSS 完成）
    const inbox = screen.getByText('inbox');
    expect(inbox.closest('.chip')?.classList.contains('status-chip')).toBe(true);
  });

  it('历史服务器区域空态文案（feat02 场景5）', async () => {
    render(<App />);
    expect(await screen.findByText('暂无记录，登录成功后自动保存。')).toBeTruthy();
  });
});
