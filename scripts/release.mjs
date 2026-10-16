// Builds the Windows installer and publishes it to GitHub Releases, where
// installed copies of the app look for updates (see "publish" in package.json).
//
// electron-builder can't be left to create the release itself:
//   - GitHub refuses a published release whose tag doesn't exist yet
//     ("Published releases must have a valid tag"), and it only sends a name.
//   - It uploads the installer, blockmap and latest.yml in parallel, and each
//     upload that finds no release creates its own - leaving duplicates.
// So this script creates the tag and a single draft release up front,
// electron-builder (releaseType "draft") uploads everything into that draft,
// and only then is it published. Installed apps never see a half-uploaded
// release, because the updater ignores drafts.
//
// Needs GH_TOKEN: a token with Contents: Read and write on the releases repo.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const { owner, repo } = pkg.build.publish;
const tag = `v${pkg.version}`;
const token = (process.env.GH_TOKEN || "").trim();

function fail(message) {
  console.error(`\n[release] ERROR: ${message}\n`);
  process.exit(1);
}

if (!/^[\w-]{20,}$/.test(token)) {
  fail('GH_TOKEN is missing or malformed. Set it with:  $env:GH_TOKEN = (Read-Host "GitHub token").Trim()');
}

// Retries dropped connections (ECONNABORTED/ECONNRESET on a flaky link) rather
// than dying with a raw stack trace halfway through a release.
async function github(method, url, body) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${url}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      return { status: response.status, payload };
    } catch (error) {
      const reason = error.cause?.code || error.message;
      if (attempt >= 4) {
        fail(`Network error talking to GitHub (${method} ${url}): ${reason}. Check your connection and re-run - an unfinished release stays a draft and is reused.`);
      }
      console.warn(`[release] ${method} ${url} failed (${reason}), retrying (${attempt}/3)...`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    }
  }
}

// A published release for this version means the version wasn't bumped -
// installed apps would never see the "new" build as an update. (Drafts aren't
// returned by this endpoint; a leftover one from a failed run is reused below.)
const existing = await github("GET", `/releases/tags/${tag}`);
if (existing.status === 200) {
  fail(`${tag} is already released. Bump "version" in package.json before releasing again.`);
}

const repoInfo = await github("GET", "");
if (repoInfo.status !== 200) {
  fail(`Cannot read ${owner}/${repo} (HTTP ${repoInfo.status}): ${repoInfo.payload.message || "unknown error"}. Check the token's repository access.`);
}
const branch = repoInfo.payload.default_branch;

const head = await github("GET", `/git/ref/heads/${branch}`);
if (head.status !== 200) {
  fail(`${owner}/${repo} has no commits on ${branch}. Add a README on GitHub first - releases need a commit to tag.`);
}

const tagRef = await github("GET", `/git/ref/tags/${tag}`);
if (tagRef.status === 404) {
  const created = await github("POST", "/git/refs", { ref: `refs/tags/${tag}`, sha: head.payload.object.sha });
  if (created.status !== 201) {
    fail(`Could not create tag ${tag} (HTTP ${created.status}): ${created.payload.message}. The token needs Contents: Read and write.`);
  }
  console.log(`[release] created tag ${tag} on ${owner}/${repo}@${branch}`);
} else {
  console.log(`[release] tag ${tag} already exists`);
}

// Reuse a draft left by an earlier failed run, otherwise create one.
const releases = await github("GET", "/releases?per_page=100");
let draft = (Array.isArray(releases.payload) ? releases.payload : []).find((r) => r.draft && r.tag_name === tag);
if (!draft) {
  const created = await github("POST", "/releases", {
    tag_name: tag,
    name: pkg.version,
    draft: true,
    body: `Task Manager desktop ${pkg.version}`,
  });
  if (created.status !== 201) {
    fail(`Could not create the draft release (HTTP ${created.status}): ${created.payload.message}`);
  }
  draft = created.payload;
  console.log(`[release] created draft release ${tag}`);
} else {
  console.log(`[release] reusing draft release ${tag}`);
}

const run = (command) => {
  const result = spawnSync(command, { cwd: root, stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run("npm run icons");
run("npm run desktop:prepare");
// The installer upload is ~200MB in one request, which a flaky connection can
// drop. The draft is reused and assets are replaced, so retrying is safe.
for (let attempt = 1; ; attempt += 1) {
  const result = spawnSync("npx electron-builder --win nsis --publish always", {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (result.status === 0) break;
  if (attempt >= 3) fail("electron-builder failed to build or upload (see above). The release is still a draft; re-run to retry.");
  console.warn(`\n[release] build/upload failed, retrying (${attempt}/2)...\n`);
}

// Publish only once every file is attached, and only if latest.yml made it -
// without it installed apps can't see this version at all.
const assets = await github("GET", `/releases/${draft.id}/assets?per_page=100`);
const names = (Array.isArray(assets.payload) ? assets.payload : []).map((a) => a.name);
if (!names.includes("latest.yml")) {
  fail(`The draft is missing latest.yml (has: ${names.join(", ") || "nothing"}). Left as a draft; re-run to retry.`);
}
const published = await github("PATCH", `/releases/${draft.id}`, { draft: false, make_latest: "true" });
if (published.status !== 200) {
  fail(`Uploaded, but could not publish the draft (HTTP ${published.status}): ${published.payload.message}`);
}

console.log(`\n[release] ${tag} published (${names.join(", ")}): ${published.payload.html_url}`);
