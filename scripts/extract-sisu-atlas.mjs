import fs from 'node:fs';
import zlib from 'node:zlib';

const INPUT = '/Users/niels/Documents/sisu-game/public/assets/sisu-raw-sheet.png';
const OUTPUT_PNG = '/Users/niels/Documents/sisu-game/public/assets/sisu-atlas.png';
const OUTPUT_JSON = '/Users/niels/Documents/sisu-game/public/assets/sisu-atlas.json';

const FRAME_XS = [282, 500, 720, 940, 1158];
const ROWS = [
  { name: 'idle', y: 84 },
  { name: 'run', y: 254 },
  { name: 'jump', y: 426 }
];
const CROP_W = 170;
const CROP_H = 116;

const CELL_W = 32;
const CELL_H = 32;

function readPng(buffer) {
  const sig = buffer.subarray(0, 8);
  const expected = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!sig.equals(expected)) throw new Error('Invalid PNG signature');

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const len = buffer.readUInt32BE(offset); offset += 4;
    const type = buffer.toString('ascii', offset, offset + 4); offset += 4;
    const data = buffer.subarray(offset, offset + len); offset += len;
    offset += 4; // crc

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8) throw new Error(`Unsupported bit depth: ${bitDepth}`);
  if (colorType !== 6 && colorType !== 2) throw new Error(`Unsupported color type: ${colorType}`);

  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = new Uint8Array(width * height * 4);

  let src = 0;
  let prev = new Uint8Array(stride);
  const row = new Uint8Array(stride);

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };

  for (let y = 0; y < height; y += 1) {
    const filter = raw[src]; src += 1;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[src++];
      const left = i >= bpp ? row[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 0) row[i] = x;
      else if (filter === 1) row[i] = (x + left) & 255;
      else if (filter === 2) row[i] = (x + up) & 255;
      else if (filter === 3) row[i] = (x + ((left + up) >> 1)) & 255;
      else if (filter === 4) row[i] = (x + paeth(left, up, upLeft)) & 255;
      else throw new Error(`Unsupported PNG filter: ${filter}`);
    }

    for (let x = 0; x < width; x += 1) {
      const di = (y * width + x) * 4;
      const si = x * bpp;
      pixels[di] = row[si];
      pixels[di + 1] = row[si + 1];
      pixels[di + 2] = row[si + 2];
      pixels[di + 3] = bpp === 4 ? row[si + 3] : 255;
    }

    prev.set(row);
  }

  return { width, height, pixels };
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function writePng(width, height, pixels) {
  const bpp = 4;
  const stride = width * bpp;
  const raw = Buffer.alloc((stride + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y += 1) {
    raw[o++] = 0; // filter none
    const start = y * stride;
    for (let i = 0; i < stride; i += 1) raw[o++] = pixels[start + i];
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function crop(img, x0, y0, w, h) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = x0 + x;
      const sy = y0 + y;
      const si = (sy * img.width + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = img.pixels[si];
      out[di + 1] = img.pixels[si + 1];
      out[di + 2] = img.pixels[si + 2];
      out[di + 3] = img.pixels[si + 3];
    }
  }
  return { width: w, height: h, pixels: out };
}

function removeBackground(img) {
  const { width: w, height: h, pixels } = img;
  const visited = new Uint8Array(w * h);
  const bg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h * 2);
  let qh = 0;
  let qt = 0;

  const push = (x, y) => { queue[qt++] = x; queue[qt++] = y; };
  const pop = () => [queue[qh++], queue[qh++]];
  const pix = (x, y) => {
    const i = (y * w + x) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2]];
  };
  const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

  for (let x = 0; x < w; x += 1) { push(x, 0); push(x, h - 1); }
  for (let y = 1; y < h - 1; y += 1) { push(0, y); push(w - 1, y); }

  const threshold = 30;

  while (qh < qt) {
    const [x, y] = pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const vi = y * w + x;
    if (visited[vi]) continue;
    visited[vi] = 1;
    bg[vi] = 1;

    const c = pix(x, y);
    const ns = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of ns) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (visited[ni]) continue;
      const nc = pix(nx, ny);
      if (dist(c, nc) <= threshold) push(nx, ny);
    }
  }

  const fg = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (bg[i]) continue;
      const p = pix(x, y);
      const lum = (p[0] + p[1] + p[2]) / 3;
      if (lum < 245) fg[i] = 1;
    }
  }

  const seen = new Uint8Array(w * h);
  let best = [];
  let bestScore = -Infinity;
  const q = new Int32Array(w * h);

  for (let i = 0; i < w * h; i += 1) {
    if (!fg[i] || seen[i]) continue;
    let qh2 = 0;
    let qt2 = 0;
    q[qt2++] = i;
    seen[i] = 1;
    const comp = [];
    let sumX = 0;
    let sumY = 0;
    let borderTouches = 0;

    while (qh2 < qt2) {
      const cur = q[qh2++];
      comp.push(cur);
      const x = cur % w;
      const y = (cur / w) | 0;
      sumX += x;
      sumY += y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        borderTouches += 1;
      }
      const ns = [cur - 1, cur + 1, cur - w, cur + w];
      const ok = [x > 0, x < w - 1, y > 0, y < h - 1];
      for (let k = 0; k < 4; k += 1) {
        if (!ok[k]) continue;
        const ni = ns[k];
        if (seen[ni] || !fg[ni]) continue;
        seen[ni] = 1;
        q[qt2++] = ni;
      }
    }

    const cx = sumX / comp.length;
    const cy = sumY / comp.length;
    const centerDist = Math.abs(cx - w / 2) + Math.abs(cy - h / 2);
    const score = comp.length - borderTouches * 3 - centerDist * 1.2;
    if (score > bestScore) {
      bestScore = score;
      best = comp;
    }
  }

  const keep = new Uint8Array(w * h);
  for (const i of best) keep[i] = 1;

  let minX = w, minY = h, maxX = -1, maxY = -1;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const pi = y * w + x;
      const si = pi * 4;
      if (keep[pi]) {
        out[si] = pixels[si];
        out[si + 1] = pixels[si + 1];
        out[si + 2] = pixels[si + 2];
        out[si + 3] = 255;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return { width: w, height: h, pixels: out };

  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;
  const trimmed = new Uint8Array(tw * th * 4);
  for (let y = 0; y < th; y += 1) {
    for (let x = 0; x < tw; x += 1) {
      const si = ((minY + y) * w + (minX + x)) * 4;
      const di = (y * tw + x) * 4;
      trimmed[di] = out[si];
      trimmed[di + 1] = out[si + 1];
      trimmed[di + 2] = out[si + 2];
      trimmed[di + 3] = out[si + 3];
    }
  }
  return { width: tw, height: th, pixels: trimmed };
}

function fitToCell(img, cellW, cellH) {
  const out = new Uint8Array(cellW * cellH * 4);
  const margin = 2;
  const scale = Math.min((cellW - margin * 2) / img.width, (cellH - margin * 2) / img.height);
  const dw = Math.max(1, Math.floor(img.width * scale));
  const dh = Math.max(1, Math.floor(img.height * scale));
  const ox = ((cellW - dw) / 2) | 0;
  const oy = cellH - dh - 1;

  for (let y = 0; y < dh; y += 1) {
    for (let x = 0; x < dw; x += 1) {
      const sx = Math.min(img.width - 1, Math.floor((x / dw) * img.width));
      const sy = Math.min(img.height - 1, Math.floor((y / dh) * img.height));
      const si = (sy * img.width + sx) * 4;
      const di = ((oy + y) * cellW + (ox + x)) * 4;
      out[di] = img.pixels[si];
      out[di + 1] = img.pixels[si + 1];
      out[di + 2] = img.pixels[si + 2];
      out[di + 3] = img.pixels[si + 3];
    }
  }

  return { width: cellW, height: cellH, pixels: out };
}

function blit(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) {
      const si = (y * src.width + x) * 4;
      const di = ((dy + y) * dst.width + (dx + x)) * 4;
      const a = src.pixels[si + 3];
      if (!a) continue;
      dst.pixels[di] = src.pixels[si];
      dst.pixels[di + 1] = src.pixels[si + 1];
      dst.pixels[di + 2] = src.pixels[si + 2];
      dst.pixels[di + 3] = a;
    }
  }
}

const src = readPng(fs.readFileSync(INPUT));
const atlas = {
  width: CELL_W * FRAME_XS.length,
  height: CELL_H * ROWS.length,
  pixels: new Uint8Array(CELL_W * FRAME_XS.length * CELL_H * ROWS.length * 4)
};

const frames = {};

for (let r = 0; r < ROWS.length; r += 1) {
  const row = ROWS[r];
  for (let c = 0; c < FRAME_XS.length; c += 1) {
    const cropped = crop(src, FRAME_XS[c], row.y, CROP_W, CROP_H);
    const masked = removeBackground(cropped);
    const fitted = fitToCell(masked, CELL_W, CELL_H);

    const dx = c * CELL_W;
    const dy = r * CELL_H;
    blit(atlas, fitted, dx, dy);

    frames[`${row.name}_${c}`] = {
      frame: { x: dx, y: dy, w: CELL_W, h: CELL_H },
      sourceSize: { w: CELL_W, h: CELL_H }
    };
  }
}

fs.writeFileSync(OUTPUT_PNG, writePng(atlas.width, atlas.height, atlas.pixels));
fs.writeFileSync(OUTPUT_JSON, JSON.stringify({
  meta: { image: 'sisu-atlas.png', size: { w: atlas.width, h: atlas.height }, scale: '1' },
  frames
}, null, 2));

console.log(`Wrote ${OUTPUT_PNG}`);
console.log(`Wrote ${OUTPUT_JSON}`);
