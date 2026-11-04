// Rasterizes the app icon public/icons/icon.svg into the PNG sizes that Android and iOS need.
// Runs at image build time, so no binaries live in the repo. The SVG is the only source of the
// drawing: it's made of <rect>s only (viewBox 0 0 32 32), read here in painting order.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const GRID = 32;

const attr = (tag, name, d = 0) => Number(tag.match(new RegExp(`\\s${name}="([^"]+)"`))?.[1] ?? d);
const RECTS = [...fs.readFileSync(path.join(OUT, 'icon.svg'), 'utf8').matchAll(/<rect\b[^>]*>/g)].map(([tag]) => {
  const hex = tag.match(/fill="#([0-9a-f]{6})"/i)?.[1];
  if (!hex) throw new Error('icon.svg: every rect needs a #rrggbb fill: ' + tag);
  const x = attr(tag, 'x'), y = attr(tag, 'y');
  return { x0: x, y0: y, x1: x + attr(tag, 'width'), y1: y + attr(tag, 'height'), color: [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) };
});

// Colour at (x, y) in the 32-unit grid: the last rect drawn there.
function colorAt(x, y) {
  for (let i = RECTS.length - 1; i >= 0; i--) {
    const r = RECTS[i];
    if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) return r.color;
  }
  return RECTS[0].color;
}

function render(size) {
  const SS = 4; // supersampling per axis
  const px = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / size) * GRID;
          const v = ((y + (sy + 0.5) / SS) / size) * GRID;
          const col = colorAt(u, v);
          for (let c = 0; c < 3; c++) sum[c] += col[c];
        }
      }
      const o = (y * size + x) * 3;
      for (let c = 0; c < 3; c++) px[o + c] = Math.round(sum[c] / (SS * SS));
    }
  }
  return px;
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const pixels = render(size);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) pixels.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
for (const size of [180, 192, 512]) {
  fs.writeFileSync(path.join(OUT, `icon-${size}.png`), png(size));
  console.log(`icons/icon-${size}.png`);
}
