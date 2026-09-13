// Genera los íconos PWA (manifest + apple-touch-icon) como PNGs planos,
// sin depender de canvas/sharp: dibuja píxel por píxel (fondo de marca +
// tarjeta blanca redondeada + check) y codifica el PNG a mano (zlib +
// chunks IHDR/IDAT/IEND), para no agregar dependencias nativas solo por
// unos íconos estáticos que casi nunca cambian.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../public/icons");

const PRIMARY = [0xb4, 0x51, 0x3a]; // #B4513A
const WHITE = [0xff, 0xff, 0xff];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = chunk("IDAT", deflateSync(raw, { level: 9 }));
  return Buffer.concat([signature, chunk("IHDR", ihdrData), idat, chunk("IEND", Buffer.alloc(0))]);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq === 0 ? 0 : ((px - ax) * abx + (py - ay) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}

function inRoundedRect(x, y, x0, y0, x1, y1, radius) {
  const cx = Math.min(Math.max(x, x0 + radius), x1 - radius);
  const cy = Math.min(Math.max(y, y0 + radius), y1 - radius);
  if (x >= x0 + radius && x <= x1 - radius) return y >= y0 && y <= y1;
  if (y >= y0 + radius && y <= y1 - radius) return x >= x0 && x <= x1;
  return Math.hypot(x - cx, y - cy) <= radius;
}

/**
 * Dibuja el ícono: fondo de marca, tarjeta blanca redondeada y un
 * checkmark de marca dentro. `padding` controla el margen (los íconos
 * "maskable" necesitan más aire porque el SO recorta el ícono en un
 * círculo/superellipse y puede comerse el contenido de las esquinas).
 */
function drawIcon(size, { padding }) {
  const rgba = Buffer.alloc(size * size * 4);
  const cardX0 = size * padding;
  const cardY0 = size * padding;
  const cardX1 = size * (1 - padding);
  const cardY1 = size * (1 - padding);
  const cardRadius = size * 0.12;

  const checkScale = cardX1 - cardX0;
  const a = [cardX0 + checkScale * 0.22, cardY0 + checkScale * 0.52];
  const b = [cardX0 + checkScale * 0.42, cardY0 + checkScale * 0.72];
  const c = [cardX0 + checkScale * 0.8, cardY0 + checkScale * 0.32];
  const strokeWidth = size * 0.07;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let color = PRIMARY;

      if (inRoundedRect(x, y, cardX0, cardY0, cardX1, cardY1, cardRadius)) {
        color = WHITE;
        const dCheck = Math.min(
          distToSegment(x, y, a[0], a[1], b[0], b[1]),
          distToSegment(x, y, b[0], b[1], c[0], c[1])
        );
        if (dCheck <= strokeWidth / 2) color = PRIMARY;
      }

      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, padding: 0.14 },
  { file: "icon-512.png", size: 512, padding: 0.14 },
  { file: "maskable-512.png", size: 512, padding: 0.24 },
  { file: "apple-touch-icon.png", size: 180, padding: 0.16 }
];

for (const t of targets) {
  const rgba = drawIcon(t.size, { padding: t.padding });
  const png = encodePng(t.size, t.size, rgba);
  writeFileSync(path.join(OUT_DIR, t.file), png);
  console.log(`Generado ${t.file} (${t.size}x${t.size}, ${png.length} bytes)`);
}
