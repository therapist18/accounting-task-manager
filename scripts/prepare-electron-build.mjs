// Assembles the artefacts electron-builder needs, after `next build`.
//
// A Next standalone bundle is deliberately incomplete: it traces only the server
// code it can statically see, and leaves out .next/static and public/ because a
// deployment usually serves those from a CDN. For a desktop app there is no CDN,
// so both have to be copied in by hand or the window loads unstyled HTML.
import { existsSync, cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");

function fail(message) {
  console.error(`\n[prepare] ERROR: ${message}\n`);
  process.exit(1);
}

if (!existsSync(standalone)) {
  fail(
    ".next/standalone is missing. Build with `npm run build:desktop` - a plain `next build` does not emit standalone output."
  );
}

// Fail loudly here rather than shipping a window with no stylesheet.
for (const [from, to] of [
  [path.join(root, ".next", "static"), path.join(standalone, ".next", "static")],
  [path.join(root, "public"), path.join(standalone, "public")],
]) {
  if (!existsSync(from)) {
    console.warn(`[prepare] warning: ${path.relative(root, from)} does not exist, skipping`);
    continue;
  }
  rmSync(to, { recursive: true, force: true });
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`[prepare] copied ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}

// The packaged automation server runs as a separate process from inside the
// installer, so it needs its own node_modules next to it rather than relying on
// the Next trace to have pulled express/cors in.
const automationDir = path.join(root, "automation-server");
if (!existsSync(automationDir)) {
  fail("automation-server/ is missing from the repository.");
}
if (!existsSync(path.join(automationDir, "node_modules", "express"))) {
  console.log("[prepare] installing automation-server dependencies");
  execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: automationDir,
    stdio: "inherit",
  });
} else {
  console.log("[prepare] automation-server dependencies already present");
}

// Playwright resolves browsers through PLAYWRIGHT_BROWSERS_PATH, which
// electron/main.js points at the bundled copy. Without a chromium here the app
// installs fine and then fails on its first automation, because a fresh Windows
// account has no per-user ms-playwright cache to fall back on.
const chromiumBuild = resolveChromiumBuild();
if (chromiumBuild) {
  const target = path.join(root, "build", "ms-playwright-browsers");
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  // Only the one chromium build. A full ms-playwright cache is ~1.6GB (it holds
  // firefox, webkit, several chromium versions and the headless shells), and
  // shipping that in an installer is absurd for a runner that launches chromium
  // and nothing else.
  cpSync(chromiumBuild.dir, path.join(target, chromiumBuild.name), { recursive: true });
  console.log(`[prepare] bundled ${chromiumBuild.name} (${megabytes(chromiumBuild.dir)} MB)`);
} else {
  console.warn(
    [
      "",
      "[prepare] ERROR: no Playwright chromium available for this project.",
      "",
      `  Playwright expects: ${expectedChromium()}`,
      "  Run:  npx playwright install chromium",
      "",
      "  Bundling a different chromium build will not work - Playwright looks up",
      "  its own pinned revision by name and errors if that directory is absent.",
      "",
    ].join("\n")
  );
  process.exitCode = 1;
}

function expectedChromium() {
  try {
    return require("playwright").chromium.executablePath();
  } catch {
    return "unknown";
  }
}

/**
 * Locates the single chromium directory Playwright would launch.
 *
 * PLAYWRIGHT_BROWSERS_PATH wins if set; otherwise ask Playwright for chromium's
 * executable path and take the revision directory that contains it. Resolving
 * through Playwright rather than guessing the cache location is what makes the
 * revision match - a chromium from a different Playwright version is useless.
 */
function resolveChromiumBuild() {
  const cacheRoot = resolveCacheRoot();
  if (!cacheRoot) return null;

  let executable;
  try {
    executable = require("playwright").chromium.executablePath();
  } catch (error) {
    console.warn(`[prepare] could not resolve Playwright chromium: ${error.message}`);
    return null;
  }
  if (!existsSync(executable)) return null;

  // .../ms-playwright/chromium-1234/chrome-win64/chrome.exe -> chromium-1234
  const [, tail] = executable.split(`${path.sep}chromium-`);
  if (!tail) return null;
  const name = `chromium-${tail.split(path.sep)[0]}`;
  const dir = path.join(cacheRoot, name);
  return existsSync(dir) ? { dir, name } : null;
}

function resolveCacheRoot() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(process.env.PLAYWRIGHT_BROWSERS_PATH)) {
    return process.env.PLAYWRIGHT_BROWSERS_PATH;
  }
  try {
    const { chromium } = require("playwright");
    // .../ms-playwright/chromium-1234/chrome-win64/chrome.exe
    const cacheRoot = chromium.executablePath().split(`${path.sep}chromium`)[0];
    return cacheRoot && existsSync(cacheRoot) ? cacheRoot : null;
  } catch {
    return null;
  }
}

/** Bytes under `dir`, for the bundle log line. */
function megabytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      try {
        total += statSync(path.join(entry.parentPath || entry.path, entry.name)).size;
      } catch {
        /* transient file - skip */
      }
    }
  }
  return Math.round(total / 1024 / 1024);
}

for (const icon of ["build/icon.ico", "public/electron-icon.png"]) {
  const file = path.join(root, icon);
  if (!existsSync(file) || readFileSync(file).length === 0) {
    console.warn(`[prepare] warning: ${icon} is missing - Windows will use a default icon and the tray will be disabled`);
  }
}

console.log("[prepare] done. Run `npm run desktop:build` (or `npm run dist:win`) to package.");
