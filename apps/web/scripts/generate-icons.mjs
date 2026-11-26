// Gera os ícones PNG do PWA a partir do desenho do logo (o mesmo do favicon.svg), sem dependências.
// Uso: node scripts/generate-icons.mjs  →  public/icons/*.png
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const out = join(dirname(fileURLToPath(import.meta.url)), "../public/icons");
mkdirSync(out, { recursive: true });

const BG = [11, 20, 18]; // --fg (quase preto esverdeado)
const ACCENT = [50, 214, 165]; // --accent-fill
const INK = [3, 34, 25]; // --on-accent

// Contorno da cabeça do gato no grid 32×32 do favicon (arcos aproximados por pontos).
function headPolygon() {
  const pts = [
    [6, 11],
    [8.5, 3.5],
    [14, 9.5],
    [18, 9.5],
    [23.5, 3.5],
    [26, 11],
    [26, 22],
  ];
  for (let a = 0; a <= 90; a += 6) {
    const r = (a * Math.PI) / 180;
    pts.push([19 + 7 * Math.cos(r), 22 + 7 * Math.sin(r)]);
  }
  for (let a = 90; a <= 180; a += 6) {
    const r = (a * Math.PI) / 180;
    pts.push([13 + 7 * Math.cos(r), 22 + 7 * Math.sin(r)]);
  }
  return pts;
}
const HEAD = headPolygon();

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Cor do ponto (x, y) no espaço 32×32 do logo, ou null (fundo). */
function logoColor(x, y) {
  const eye = (cx, cy) => (x - cx) ** 2 + (y - cy) ** 2 <= 1.45 ** 2;
  if (eye(11.5, 17.5) || eye(20.5, 17.5)) return INK;
  // boca: arco fino de (14,21.5) a (18,21.5) passando por (16,22.7)
  const my = 21.5 + 1.2 * (1 - ((x - 16) / 2) ** 2);
  if (x >= 14 && x <= 18 && Math.abs(y - my) <= 0.55) return INK;
  return inPolygon(x, y, HEAD) ? ACCENT : null;
}

/**
 * size: lado do PNG. logoScale: quanto do lado o logo ocupa.
 * rounded: fundo com cantos arredondados (ícone comum) ou cheio (maskable / Apple).
 */
function render(size, { logoScale, rounded }) {
  const SS = 4; // supersampling para bordas suaves
  const px = Buffer.alloc(size * size * 4);
  const radius = rounded ? size * 0.22 : 0;
  const logo = size * logoScale;
  const off = (size - logo) / 2;
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = pxl + (sx + 0.5) / SS;
          const fy = py + (sy + 0.5) / SS;
          // fora do fundo arredondado = transparente
          if (rounded) {
            const cx = Math.min(Math.max(fx, radius), size - radius);
            const cy = Math.min(Math.max(fy, radius), size - radius);
            if ((fx - cx) ** 2 + (fy - cy) ** 2 > radius ** 2) continue;
          }
          const c = logoColor(((fx - off) / logo) * 32, ((fy - off) / logo) * 32) ?? BG;
          r += c[0];
          g += c[1];
          b += c[2];
          a += 255;
        }
      }
      const n = SS * SS;
      const i = (py * size + pxl) * 4;
      const cover = a / 255;
      px[i] = cover ? Math.round(r / cover) : 0;
      px[i + 1] = cover ? Math.round(g / cover) : 0;
      px[i + 2] = cover ? Math.round(b / cover) : 0;
      px[i + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, size, px);
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const files = {
  "icon-192.png": render(192, { logoScale: 0.72, rounded: true }),
  "icon-512.png": render(512, { logoScale: 0.72, rounded: true }),
  // maskable: o sistema recorta em círculo/squircle; o logo fica na zona segura (~60%)
  "icon-maskable-512.png": render(512, { logoScale: 0.56, rounded: false }),
  "apple-touch-icon.png": render(180, { logoScale: 0.68, rounded: false }),
};
for (const [name, buf] of Object.entries(files)) {
  writeFileSync(join(out, name), buf);
  console.log(`${name}  ${(buf.length / 1024).toFixed(1)} KB`);
}
