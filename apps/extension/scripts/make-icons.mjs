/**
 * 扩展图标生成器：零依赖纯 Node 实现（PNG 编码 + zlib 压缩），输出到 public/icons/。
 * 设计与主页品牌一致：赭石渐变圆角方块 + 白色四芒星（✦，astroid 内摆线），对应 home/index.css
 * 的 --accent 色系（#c25c33 → #a03f1d 渐变取自 brand-mark 的 linear-gradient）。
 * 改设计后重跑：pnpm --filter @x-threadpick/extension icons
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZES = [16, 32, 48, 128];
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

// 渐变两端（135°，左上→右下），与 index.css 的 brand-mark 渐变一致
const TOP = [0xc2, 0x5c, 0x33];
const BOTTOM = [0xa0, 0x3f, 0x1d];

// --- PNG 编码 ---------------------------------------------------------------

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 8-bit RGBA PNG，扫描线无滤波。 */
function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- 渲染 -------------------------------------------------------------------

/** 像素着色：赭石渐变圆角方块打底，白色 astroid 四芒星；3×3 超采样抗锯齿。 */
function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const SUB = 3;
  const radius = size * 0.22;
  const half = size / 2;
  const starR = size * 0.42;
  // 四芒星曲线 |x|^p + |y|^p = R^p：p=1/2 比 astroid(2/3) 更凹、臂更细长，小尺寸下仍读得出 ✦
  const P = 0.5;
  const starLimit = Math.pow(starR, P);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let cov = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const x = px + (sx + 0.5) / SUB - size / 2;
          const y = py + (sy + 0.5) / SUB - size / 2;
          // 圆角方块 SDF（中心原点）：d = len(max(q,0)) + min(max(qx,qy),0) - radius
          const qx = Math.abs(x) - (half - radius);
          const qy = Math.abs(y) - (half - radius);
          const d =
            Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
          if (d >= 0) continue;
          cov++;
          const isStar = Math.pow(Math.abs(x), P) + Math.pow(Math.abs(y), P) <= starLimit;
          if (isStar) {
            r += 255;
            g += 255;
            b += 255;
          } else {
            const t = Math.min(1, Math.max(0, (x + y + size) / (2 * size)));
            r += TOP[0] + (BOTTOM[0] - TOP[0]) * t;
            g += TOP[1] + (BOTTOM[1] - TOP[1]) * t;
            b += TOP[2] + (BOTTOM[2] - TOP[2]) * t;
          }
        }
      }
      const i = (py * size + px) * 4;
      rgba[i] = Math.round(r / (SUB * SUB));
      rgba[i + 1] = Math.round(g / (SUB * SUB));
      rgba[i + 2] = Math.round(b / (SUB * SUB));
      rgba[i + 3] = Math.round((cov / (SUB * SUB)) * 255);
    }
  }
  return rgba;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const png = encodePng(size, size, render(size));
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, png);
  console.log(`✓ ${file} (${png.length} bytes)`);
}
