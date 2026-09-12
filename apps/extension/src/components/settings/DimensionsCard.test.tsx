import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { currentLibrary, resetLibraryRuntime, type LibraryDB } from '../../db/library';
import DimensionsCard from './DimensionsCard';

let db: LibraryDB;

beforeEach(async () => {
  cleanup();
  fakeBrowser.reset();
  await resetLibraryRuntime();
  db = await currentLibrary();
  await db.taxonomies.clear();
});

async function renderCard(): Promise<void> {
  render(<DimensionsCard />);
  await screen.findByText('它讲什么？');
}

function topicInput(): HTMLElement {
  return screen.getByPlaceholderText('新主题…');
}

function purposeInput(): HTMLElement {
  return screen.getByPlaceholderText('新用途…');
}

describe('新增维度取值（feat06）', () => {
  it('场景1：输入后按回车，标签出现在维度末尾，输入框清空', async () => {
    await renderCard();
    fireEvent.change(topicInput(), { target: { value: 'RAG' } });
    fireEvent.keyDown(topicInput(), { key: 'Enter' });
    expect(await screen.findByText('RAG')).toBeTruthy();
    expect(screen.queryByDisplayValue('RAG')).toBeNull();
    const chips = screen.getByText('RAG').closest('.chips');
    expect(chips?.lastElementChild?.textContent?.startsWith('RAG')).toBe(true);
  });

  it('场景1：点「＋」按钮同样添加', async () => {
    await renderCard();
    fireEvent.change(purposeInput(), { target: { value: '随手收集' } });
    fireEvent.click(screen.getByRole('button', { name: '添加用途取值' }));
    expect(await screen.findByText('随手收集')).toBeTruthy();
  });

  it('场景2：空输入不添加任何取值', async () => {
    await renderCard();
    const before = screen.getByPlaceholderText('新主题…');
    fireEvent.keyDown(before, { key: 'Enter' });
    fireEvent.change(topicInput(), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '添加主题取值' }));
    expect(screen.queryByText(/该取值已存在/)).toBeNull();
    expect(screen.getAllByText('项目管理')).toHaveLength(1);
  });

  it('场景3：重复取值提示「该取值已存在」，不产生重复标签', async () => {
    await renderCard();
    fireEvent.change(topicInput(), { target: { value: '项目管理' } });
    fireEvent.keyDown(topicInput(), { key: 'Enter' });
    expect(await screen.findByText('该取值已存在')).toBeTruthy();
    expect(screen.getAllByText('项目管理')).toHaveLength(1);
  });

  it('场景4：首尾空格去除；超长（>30 字）提示「取值过长」不保存', async () => {
    await renderCard();
    fireEvent.change(purposeInput(), { target: { value: '  新用途  ' } });
    fireEvent.keyDown(purposeInput(), { key: 'Enter' });
    expect(await screen.findByText('新用途')).toBeTruthy();
    expect(screen.queryByText('  新用途  ')).toBeNull();

    fireEvent.change(purposeInput(), { target: { value: '长'.repeat(31) } });
    fireEvent.keyDown(purposeInput(), { key: 'Enter' });
    expect(await screen.findByText('取值过长')).toBeTruthy();
    expect(screen.queryByText('长'.repeat(31))).toBeNull();
  });

  it('场景5：未登录时添加同样保存在本机并立即生效', async () => {
    await renderCard();
    fireEvent.change(topicInput(), { target: { value: '离线取值' } });
    fireEvent.keyDown(topicInput(), { key: 'Enter' });
    expect(await screen.findByText('离线取值')).toBeTruthy();
    const row = await db.taxonomies.get('local');
    expect(row?.taxonomy.topic).toContain('离线取值');
  });
});

describe('删除维度取值（feat07）', () => {
  it('场景1：点「×」后取值从列表消失', async () => {
    await renderCard();
    fireEvent.click(screen.getByRole('button', { name: '删除取值 会议纪要' }));
    await vi.waitFor(() => {
      expect(screen.queryByText('会议纪要')).toBeNull();
    });
  });

  it('场景3：默认状态 Inbox 不可删除，提示「默认状态不可删除」', async () => {
    await renderCard();
    fireEvent.click(screen.getByRole('button', { name: '删除取值 inbox' }));
    expect(await screen.findByText('默认状态不可删除')).toBeTruthy();
    expect(screen.getByText('inbox')).toBeTruthy();
  });

  it('场景4：其余状态取值可自由删除，inbox 始终保留', async () => {
    await renderCard();
    fireEvent.click(screen.getByRole('button', { name: '删除取值 进行中' }));
    await vi.waitFor(() => {
      expect(screen.queryByText('进行中')).toBeNull();
    });
    fireEvent.click(screen.getByRole('button', { name: '删除取值 已完成' }));
    await vi.waitFor(() => {
      expect(screen.queryByText('已完成')).toBeNull();
    });
    expect(screen.getByText('inbox')).toBeTruthy();
  });

  it('错误提示在继续输入时清除', async () => {
    await renderCard();
    fireEvent.change(topicInput(), { target: { value: '项目管理' } });
    fireEvent.keyDown(topicInput(), { key: 'Enter' });
    expect(await screen.findByText('该取值已存在')).toBeTruthy();
    fireEvent.change(topicInput(), { target: { value: '项目管理2' } });
    expect(screen.queryByText('该取值已存在')).toBeNull();
  });
});
