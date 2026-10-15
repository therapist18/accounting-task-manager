// Generates the desktop app/tray icon set from the web app's own logo.
//
//   build/icon.ico           - Windows executable, installer and shortcut icon
//   public/electron-icon.png - window + tray icon at runtime
//
// Source is public/BCL logo.png - the same mark the sidebar shows, drawn the same
// way: the teal "B" on a white rounded tile. Only the "B" is used; the BOOKSMART
// wordmark beneath it is unreadable at taskbar and tray sizes.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(root, "public", "BCL logo.png");

// The logo is the mark on top and the wordmark below, separated by a band of
// empty rows. Scanning for that gap (rather than hard-coding a crop) keeps this
// working if the logo file is re-exported at another size.
async function extractMark() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // sharp's trim() keys off the corner colour and is thrown by the faint
  // anti-aliasing haze around this logo, so the box is measured on alpha directly.
  const inked = (x, y) => data[(y * info.width + x) * info.channels + 3] > 40;
  const rowHasInk = (y) => {
    for (let x = 0; x < info.width; x += 1) if (inked(x, y)) return true;
    return false;
  };

  let top = 0;
  while (top < info.height && !rowHasInk(top)) top += 1;
  let bottom = top;
  while (bottom < info.height && rowHasInk(bottom)) bottom += 1;

  let left = info.width;
  let right = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (!inked(x, y)) continue;
      left = Math.min(left, x);
      right = Math.max(right, x + 1);
    }
  }

  return sharp(SOURCE)
    .extract({ left, top, width: right - left, height: bottom - top })
    .png()
    .toBuffer();
}

function tileSvg(size) {
  // Small sizes get a tighter corner and less padding so the mark stays legible.
  const radius = Math.round(size * (size <= 32 ? 0.18 : 0.22));
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#ffffff"/></svg>`
  );
}

async function renderIcon(mark, size) {
  const padding = Math.round(size * (size <= 32 ? 0.1 : 0.16));
  const inner = size - padding * 2;
  let scaled = await sharp(mark)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // The logo's strokes are hairline; downscaled to tray size they average out to
  // a pale smudge. Boost coverage at the smallest sizes so the B stays solid.
  if (size <= 24) {
    const { data, info } = await sharp(scaled).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) data[i + 3] = Math.min(255, data[i + 3] * 2.4);
    scaled = await sharp(data, { raw: info }).png().toBuffer();
  }

  return sharp(tileSvg(size))
    .composite([{ input: scaled, left: padding, top: padding }])
    .png()
    .toBuffer();
}

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

const mark = await extractMark();
const sizes = [16, 24, 32, 48, 64, 128, 256];
const entries = [];
for (const size of sizes) entries.push({ size, data: await renderIcon(mark, size) });

writeFileSync(path.join(root, "build", "icon.ico"), buildIco(entries));
console.log(`[icons] wrote build/icon.ico (${sizes.join(", ")} px)`);

// The runtime icon is 256px so it stays sharp on a HiDPI tray.
writeFileSync(path.join(root, "public", "electron-icon.png"), entries.at(-1).data);
console.log("[icons] wrote public/electron-icon.png (256 px)");
