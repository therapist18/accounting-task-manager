// Generates the app/tray icon set.
//
// The desktop shell needs two files and neither existed:
//   build/icon.ico         - Windows executable + installer icon (electron-builder)
//   public/electron-icon.png - window + tray icon at runtime
//
// electron/main.js deliberately degrades gracefully without the PNG (no tray), so
// a missing icon silently degrades the app rather than failing loudly. This
// script writes a real placeholder so packaging and the tray both work, and is
// safe to re-run - replace with a designed icon when branding lands.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- PNG encoding -----------------------------------------------------------

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** Encodes an RGBA pixel buffer (size*size*4) as a PNG. */
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12: deflate compression, adaptive filtering, no interlace - all zero.

  // Each scanline is prefixed with a filter byte; 0 = None.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- the icon itself --------------------------------------------------------

// Rounded square in the app's teal, with a lighter "check" stroke, drawn with
// simple distance fields so it scales cleanly to every size in the .ico.
const BG = [13, 148, 136]; // teal-600
const FG = [240, 253, 250];

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const r = size * 0.22; // corner radius
  const inset = size * 0.06;

  // Check-mark geometry. Defined in 0..1 icon space, then scaled to pixels -
  // the distance test below runs against pixel coordinates.
  const strokeW = size * 0.11;
  const pts = [
    { x: 0.28 * size, y: 0.52 * size },
    { x: 0.44 * size, y: 0.68 * size },
    { x: 0.73 * size, y: 0.35 * size },
  ];

  const distToSegment = (px, py, a, b) => {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const wx = px - a.x;
    const wy = py - a.y;
    const len2 = vx * vx + vy * vy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
    const dx = px - (a.x + t * vx);
    const dy = py - (a.y + t * vy);
    return Math.hypot(dx, dy);
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      // Rounded-square signed distance.
      const qx = Math.abs(px - size / 2) - (size / 2 - inset - r);
      const qy = Math.abs(py - size / 2) - (size / 2 - inset - r);
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const inside = Math.min(Math.max(qx, qy), 0);
      const d = outside + inside - r;

      // Antialias across roughly one pixel.
      const bgAlpha = Math.max(0, Math.min(1, 0.5 - d));

      let dFg = Infinity;
      for (let i = 0; i < pts.length - 1; i += 1) {
        dFg = Math.min(dFg, distToSegment(px, py, pts[i], pts[i + 1]));
      }
      const fgAlpha = bgAlpha * Math.max(0, Math.min(1, strokeW / 2 - dFg + 0.5));

      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        rgba[i + c] = Math.round(BG[c] * (1 - fgAlpha) + FG[c] * fgAlpha);
      }
      rgba[i + 3] = Math.round(255 * bgAlpha);
    }
  }

  return rgba;
}

// ---- ICO container ----------------------------------------------------------

/** Packs PNG images into a Vista-style .ico (PNG-compressed entries). */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;

  entries.forEach((entry, index) => {
    const at = index * 16;
    // 256 is encoded as 0 - the field is a single byte.
    dir[at] = entry.size >= 256 ? 0 : entry.size;
    dir[at + 1] = entry.size >= 256 ? 0 : entry.size;
    dir[at + 2] = 0; // palette
    dir[at + 3] = 0; // reserved
    dir.writeUInt16LE(1, at + 4); // colour planes
    dir.writeUInt16LE(32, at + 6); // bits per pixel
    dir.writeUInt32LE(entry.data.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += entry.data.length;
  });

  return Buffer.concat([header, dir, ...entries.map((entry) => entry.data)]);
}

// ---- emit -------------------------------------------------------------------

mkdirSync(path.join(root, "build"), { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256];
const entries = sizes.map((size) => ({ size, data: encodePng(size, drawIcon(size)) }));

writeFileSync(path.join(root, "build", "icon.ico"), buildIco(entries));
console.log(`[icons] wrote build/icon.ico (${sizes.join(", ")} px)`);

// The runtime icon is 256px so it stays sharp on a HiDPI tray.
writeFileSync(path.join(root, "public", "electron-icon.png"), entries.at(-1).data);
console.log("[icons] wrote public/electron-icon.png (256 px)");
