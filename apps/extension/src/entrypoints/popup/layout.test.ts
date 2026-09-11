import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * popup 高度布局契约（task-popup-height-fit 修订：用户反馈「不要有滚动，适配内容高度」）：
 * jsdom 无法验证像素级布局，把「高度随内容自适应」钉成可回归契约——
 * 不设固定高度、不做内部滚动区、宽度 360 不变。默认态一屏放下（< Chrome 600px 上限）
 * 由无头 Chrome 加载真实扩展实测复验（task ④ 记录）；超上限时交回浏览器原生滚动。
 * 注意：vitest 环境把 CSS import 置空（?raw 同样为空），故从文件系统读取；
 * 测试命令固定从包根（apps/extension）运行，cwd 即包根。
 */
const css = readFileSync(join(process.cwd(), 'src/entrypoints/popup/index.css'), 'utf8');

/** 取某选择器规则块内的属性名列表（剥注释后匹配，值里的冒号不影响属性名提取）。 */
function declProps(selector: string): string[] {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const match = noComments.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'm'));
  return (match?.[1] ?? '')
    .split(';')
    .map((decl) => decl.trim().split(':')[0]?.trim() ?? '')
    .filter(Boolean);
}

const HEIGHT_PROPS = ['height', 'min-height', 'max-height'];
const SCROLL_PROPS = ['overflow', 'overflow-x', 'overflow-y'];

describe('popup 高度布局契约（自适应内容，无内部滚动区）', () => {
  it('html 不设高度（高度随内容自适应，不固定 600）', () => {
    const props = declProps('^html');
    expect(props.length).toBeGreaterThan(0); // 规则块存在（font-smoothing）
    HEIGHT_PROPS.forEach((prop) => expect(props, `html 不应声明 ${prop}`).not.toContain(prop));
  });

  it('body 宽 360px，不设高度/overflow（整页交给浏览器，超上限用原生滚动）', () => {
    const body = declProps('^body');
    expect(body).toContain('width');
    const bodyBlock = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/^body\s*\{([^}]*)\}/m)?.[1] ?? '';
    expect(bodyBlock).toContain('width: 360px');
    [...HEIGHT_PROPS, ...SCROLL_PROPS].forEach((prop) =>
      expect(body, `body 不应声明 ${prop}`).not.toContain(prop),
    );
  });

  it('.dims 不是滚动容器（无 overflow / min-height / flex 伸缩机制）', () => {
    const dims = declProps('^\\.dims');
    expect(dims).toContain('margin');
    [...SCROLL_PROPS, 'min-height', 'flex', 'flex-grow'].forEach((prop) =>
      expect(dims, `.dims 不应声明 ${prop}`).not.toContain(prop),
    );
    expect(css).not.toMatch(/\.dims[^{]*::-webkit-scrollbar/); // 无自定义滚动条
  });

  it('.panel 与 #root 不参与高度布局（钉住/固定高度机制已移除）', () => {
    const panel = declProps('^\\.panel');
    [...HEIGHT_PROPS, 'display', 'flex-direction'].forEach((prop) =>
      expect(panel, `.panel 不应声明 ${prop}`).not.toContain(prop),
    );
    expect(css).not.toMatch(/#root\s*\{/);
  });
});
