// electron-builder afterPack hook: refuses to produce an installer that leaks
// secrets or can't update itself.
//
// Runs after the app folder is assembled and before it is wrapped into the
// installer (and before `npm run release` publishes anything), so a failure here
// stops the build outright.
//
// Background: the desktop app used to bundle a full Next server together with
// the project's .env - service-role key, OAuth/Twilio/SMTP credentials - in plain
// text under resources/. It now loads the hosted app instead; this keeps it that
// way.
const fs = require("node:fs");
const path = require("node:path");
const semver = require("semver");

const root = path.resolve(__dirname, "..");
const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".json", ".yml", ".yaml", ".html", ".txt", ".asar", ""]);
const MAX_SCAN_BYTES = 50 * 1024 * 1024;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // The bundled Chromium is ~1GB of vendor binaries; nothing of ours is in it.
      if (entry.name === "ms-playwright") continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Values from the local env files that must never ship: everything not NEXT_PUBLIC_*. */
function loadSecretValues() {
  const secrets = new Map();
  for (const name of [".env", ".env.local", ".env.production.local"]) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][\w]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      const value = rawValue.trim().replace(/^["']|["']$/g, "");
      // Short values (ports, booleans) and plain URLs are not secrets, and would
      // match vendor code by accident (e.g. a localhost URL inside express).
      if (key.startsWith("NEXT_PUBLIC_") || value.length < 16 || /^https?:\/\/[^@]*$/.test(value)) continue;
      secrets.set(key, value);
    }
  }
  // The release token comes from the shell rather than .env, so add it explicitly.
  for (const key of ["GH_TOKEN", "GITHUB_TOKEN"]) {
    const value = (process.env[key] || "").trim();
    if (value.length >= 16) secrets.set(key, value);
  }
  return secrets;
}

/** `name` and every module it requires at runtime, with the version range each is required at. */
function dependencyTree(name) {
  const found = new Map();
  const visit = (dep, range, fromDir) => {
    let manifest;
    try {
      manifest = require.resolve(`${dep}/package.json`, { paths: [fromDir] });
    } catch {
      return; // optional or platform-specific dependency not installed
    }
    const key = `${dep}@${range || "*"}`;
    if (found.has(key)) return;
    found.set(key, { name: dep, range });
    const { dependencies = {} } = JSON.parse(fs.readFileSync(manifest, "utf8"));
    for (const [child, childRange] of Object.entries(dependencies)) visit(child, childRange, path.dirname(manifest));
  };
  visit(name, null, root);
  return [...found.values()];
}

exports.default = async function verifyDesktopBundle(context) {
  const appOutDir = context.appOutDir;
  const resources = path.join(appOutDir, "resources");
  const problems = [];

  if (fs.existsSync(path.join(resources, "next-server"))) {
    problems.push("resources/next-server exists - the desktop app must load the hosted site, not bundle Next.");
  }

  const files = walk(appOutDir);
  for (const file of files) {
    if (/^\.env/i.test(path.basename(file))) {
      problems.push(`env file bundled: ${path.relative(appOutDir, file)}`);
    }
  }

  const secrets = loadSecretValues();
  for (const file of files) {
    if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    if (fs.statSync(file).size > MAX_SCAN_BYTES) continue;
    const content = fs.readFileSync(file, "latin1");
    for (const [key, value] of secrets) {
      if (content.includes(value)) {
        problems.push(`value of ${key} found in ${path.relative(appOutDir, file)}`);
      }
    }
  }

  // The updater is required lazily, so a missing module wouldn't fail the build -
  // it would just silently never update. Check it actually made it into the asar.
  const asarPath = path.join(resources, "app.asar");
  if (fs.existsSync(asarPath)) {
    try {
      const asar = require("@electron/asar");
      const listed = new Set(asar.listPackage(asarPath, {}).map((p) => p.replace(/\\/g, "/")));
      // Every module electron-updater loads, nested node_modules included (0.1.0
      // shipped without electron-updater/node_modules/fs-extra and so could
      // never update itself).
      if (!listed.has("/electron/offline.html")) problems.push("app.asar is missing /electron/offline.html");
      // electron-builder flattens nested node_modules, so a module counts as
      // present wherever it landed - as long as the version satisfies the range.
      for (const { name, range } of dependencyTree("electron-updater")) {
        const candidates = [...listed].filter((p) => p.endsWith(`/node_modules/${name}/package.json`));
        const ok = candidates.some((p) => {
          const { version } = JSON.parse(asar.extractFile(asarPath, p.slice(1).split("/").join(path.sep)).toString("utf8"));
          return !range || semver.satisfies(version, range);
        });
        if (!ok) problems.push(`app.asar is missing ${name}${range ? `@${range}` : ""}`);
      }
    } catch (error) {
      problems.push(`could not inspect app.asar: ${error.message}`);
    }
  }

  if (problems.length) {
    throw new Error(`Desktop bundle check failed:\n  - ${problems.join("\n  - ")}`);
  }
  console.log(`  • verify: bundle clean (${files.length} files checked, ${secrets.size} secret values)`);
};
