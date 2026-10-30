// tools/make-icons.js — writes icons/icon-192.png and icons/icon-512.png with no dependencies.
// Draws the same mark as icons/icon.svg: black field, gold ring, indigo egg, gold sunrise dot.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x + 0.5, y + 0.5);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const GOLD = [201, 168, 76], BLACK = [8, 8, 8], INDIGO = [43, 29, 94], INK = [139, 124, 201];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function mark(size) {
  const s = size / 512;
  return (x, y) => {
    const cx = 256 * s, cy = 256 * s;
    const d = Math.hypot(x - cx, y - cy);
    let col = BLACK;
    // egg: superellipse-ish, wider at bottom
    const ey = (y - 248 * s) / (130 * s);
    const w = (1 + 0.18 * ey) * 110 * s;
    const ex = (x - cx) / w;
    const egg = ex * ex + ey * ey;
    if (egg < 1) col = INDIGO;
    if (egg >= 0.86 && egg < 1) col = mix(INDIGO, INK, (egg - 0.86) / 0.14 * 0.8 + 0.2);
    // rings
    const r1 = 196 * s, r2 = 166 * s;
    if (Math.abs(d - r1) < 3 * s) col = GOLD;
    else if (Math.abs(d - r2) < 1.2 * s) col = mix(col, GOLD, 0.5);
    // sunrise dot
    if (Math.hypot(x - cx, y - 60 * s) < 12 * s) col = GOLD;
    return col;
  };
}

for (const size of [192, 512]) {
  const out = join(here, '..', 'icons', `icon-${size}.png`);
  writeFileSync(out, png(size, mark(size)));
  console.log('wrote', out);
}
