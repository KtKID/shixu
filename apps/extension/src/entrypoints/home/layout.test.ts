import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 主页布局契约（task-home-layout）：jsdom 无法验证像素级布局，
 * 这里把「宽屏不浪费空间」的关键 CSS 决策钉成可回归的契约：
 * 内容区最大宽度、卡片网格自动多列、搜索框胶囊形。视觉验收仍靠人工。
 * 注意：vitest 环境把 CSS import 置空（?raw 同样为空），故从文件系统读取；
 * 测试命令固定从包根（apps/extension）运行，cwd 即包根。
 */
const css = readFileSync(join(process.cwd(), 'src/entrypoints/home/index.css'), 'utf8');
const cardsCss = readFileSync(join(process.cwd(), 'src/components/settings/cards.css'), 'utf8');
describe('主页布局契约（task-home-layout）', () => {
  it('内容区最大宽度 ≥ 1100px（宽屏不浪费空间）', () => {
    const match = css.match(/--content-width:\s*(\d+)px/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(1100);
  });

  it('卡片网格按容器宽度自动排列（auto-fill + minmax ≥ 230px）', () => {
    const match = css.match(
      /\.cards\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\((\d+)px/,
    );
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(230);
  });

  it('搜索框为胶囊形（border-radius: 999px）', () => {
    const match = css.match(/\.searchbox\s*\{[^}]*border-radius:\s*999px/);
    expect(match).not.toBeNull();
  });

  it('卡片首字母色块加高（.thumb 高度 ≥ 96px）', () => {
    const match = css.match(/\.thumb\s*\{[^}]*height:\s*(\d+)px/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(96);
  });

  it('设置卡片样式不外泄：cards.css 的 input/label 元素选择器都限定在 .card 内', () => {
    // input[type=text] 等裸元素选择器（特异性 0-1-1）会压过 .searchbox-input（0-1-0），
    // 把设置卡片表单的边框/圆角/底色漏到搜索框输入框上，形成「框中框」。
    const selectors = cardsCss.match(/^[^{}\n]+(?=\s*\{)/gm) ?? [];
    const bare = selectors
      .flatMap((sel) => sel.split(',').map((part) => part.trim()))
      .filter((part) => /^(input|label)(?=[:[]|\s|$)/.test(part));
    expect(bare).toEqual([]);
  });

  it('⌘K 提示为纯文本：.searchbox-kbd 不设边框与背景（用户视觉反馈）', () => {
    const match = css.match(/\.searchbox-kbd\s*\{([^}]*)\}/);
    expect(match).not.toBeNull();
    expect(match?.[1]).not.toContain('border');
    expect(match?.[1]).not.toContain('background');
  });
});
