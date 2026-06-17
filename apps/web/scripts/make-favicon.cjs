/* Generate a gold, tightly-cropped favicon from the green brand mark.
   Pure Node (zlib only) — no image deps in this repo. Run: node scripts/make-favicon.cjs */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const SRC = path.join(__dirname, '..', 'public', 'images', 'Stable_Press.png');
const OUT = path.join(__dirname, '..', 'public', 'images', 'favicon-gold.png');
const GOLD = [212, 168, 67]; // --gold-bright #d4a843
const SIZE = 256;            // output favicon dimension
const FILL = 0.9;            // fraction of the icon the art occupies (rest = margin)

// ── decode ──────────────────────────────────────────────────────────────
const buf = fs.readFileSync(SRC);
const W = buf.readUInt32BE(16), H = buf.readUInt32BE(20);
const colorType = buf[25];
if (colorType !== 6) throw new Error('expected RGBA (colorType 6), got ' + colorType);

let o = 8, idat = [];
while (o < buf.length) {
  const len = buf.readUInt32BE(o);
  const type = buf.toString('ascii', o + 4, o + 8);
  if (type === 'IDAT') idat.push(buf.slice(o + 8, o + 8 + len));
  o += 12 + len;
}
const raw = zlib.inflateSync(Buffer.concat(idat));
const bpp = 4, stride = W * bpp;
const img = Buffer.alloc(W * H * bpp); // reconstructed RGBA

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
let pos = 0;
for (let y = 0; y < H; y++) {
  const ft = raw[pos++];
  for (let x = 0; x < stride; x++) {
    const v = raw[pos++];
    const a = x >= bpp ? img[y * stride + x - bpp] : 0;
    const b = y > 0 ? img[(y - 1) * stride + x] : 0;
    const c = x >= bpp && y > 0 ? img[(y - 1) * stride + x - bpp] : 0;
    let r;
    switch (ft) {
      case 0: r = v; break;
      case 1: r = v + a; break;
      case 2: r = v + b; break;
      case 3: r = v + ((a + b) >> 1); break;
      case 4: r = v + paeth(a, b, c); break;
      default: throw new Error('bad filter ' + ft);
    }
    img[y * stride + x] = r & 0xff;
  }
}

// ── recolor opaque pixels to gold (keep alpha for smooth edges) ──────────
for (let i = 0; i < W * H; i++) {
  if (img[i * 4 + 3] > 0) { img[i * 4] = GOLD[0]; img[i * 4 + 1] = GOLD[1]; img[i * 4 + 2] = GOLD[2]; }
}

// ── crop to alpha bounding box ───────────────────────────────────────────
let minX = W, minY = H, maxX = -1, maxY = -1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (img[(y * W + x) * 4 + 3] > 8) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
}
const cw = maxX - minX + 1, ch = maxY - minY + 1;

// ── place centered on a square canvas with margin, then box-downscale ────
const side = Math.ceil(Math.max(cw, ch) / FILL);
const sq = Buffer.alloc(side * side * 4); // transparent
const ox = ((side - cw) >> 1), oy = ((side - ch) >> 1);
for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
  const s = ((minY + y) * W + (minX + x)) * 4;
  const d = ((oy + y) * side + (ox + x)) * 4;
  sq[d] = img[s]; sq[d + 1] = img[s + 1]; sq[d + 2] = img[s + 2]; sq[d + 3] = img[s + 3];
}

// area-average downscale (premultiplied alpha for correct edge blending)
const out = Buffer.alloc(SIZE * SIZE * 4);
const sc = side / SIZE;
for (let ty = 0; ty < SIZE; ty++) for (let tx = 0; tx < SIZE; tx++) {
  const x0 = Math.floor(tx * sc), x1 = Math.min(side, Math.ceil((tx + 1) * sc));
  const y0 = Math.floor(ty * sc), y1 = Math.min(side, Math.ceil((ty + 1) * sc));
  let pr = 0, pg = 0, pb = 0, pa = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const s = (y * side + x) * 4, al = sq[s + 3] / 255;
    pr += sq[s] * al; pg += sq[s + 1] * al; pb += sq[s + 2] * al; pa += sq[s + 3]; n++;
  }
  const d = (ty * SIZE + tx) * 4;
  if (pa > 0) {
    const aSum = pa / 255;
    out[d] = Math.round(pr / aSum); out[d + 1] = Math.round(pg / aSum); out[d + 2] = Math.round(pb / aSum);
    out[d + 3] = Math.round(pa / n);
  }
}

// ── encode PNG ───────────────────────────────────────────────────────────
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(td), 0);
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const rows = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  rows[y * (SIZE * 4 + 1)] = 0; // filter: none
  out.copy(rows, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(OUT, png);
console.log(`wrote ${OUT}  src=${W}x${H}  crop=${cw}x${ch}  out=${SIZE}x${SIZE}  ${png.length} bytes`);
