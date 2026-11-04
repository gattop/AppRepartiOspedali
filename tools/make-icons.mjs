// Rasterizes the app icon (same shape as public/icons/icon.svg) into the PNG sizes that
// Android and iOS need. Runs at image build time, so no binaries live in the repo.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const BG = [0x10, 0x10, 0x14];
const PAPER = [0xF2, 0xF1, 0xEE];
const BLUE = [0x2D, 0x81, 0xFF];

// Strokes in the 32-unit logo grid, drawn at 12x and offset by 64 on a 512 canvas:
// three stacked floors, the lowest one in the accent blue.
const LINES = [
  { pts: [[16, 6], [26, 11], [16, 16], [6, 11], [16, 6]], color: PAPER },
  { pts: [[6, 16], [16, 21], [26, 16]], color: PAPER },
  { pts: [[6, 21], [16, 26], [26, 21]], color: BLUE }
];
const SCALE = 12;
const HALF_STROKE = 1;

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Colour of the stroke under (x, y), or null for the background.
function strokeAt(x, y) {
  for (const { pts, color } of LINES) {
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(x, y, pts[i], pts[i + 1]) <= HALF_STROKE) return color;
    }
  }
  return null;
}

function render(size) {
  const SS = 4; // supersampling per axis
  const px = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / size) * 512;
          const v = ((y + (sy + 0.5) / SS) / size) * 512;
          const col = strokeAt((u - 64) / SCALE, (v - 64) / SCALE) || BG;
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
