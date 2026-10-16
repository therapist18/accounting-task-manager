// Builds the Windows installer and publishes it to GitHub Releases, where
// installed copies of the app look for updates (see "publish" in package.json).
//
// GitHub refuses to create a published release whose tag doesn't exist yet
// ("Published releases must have a valid tag"), and electron-builder only sends
// a tag name. So the tag v<version> is created here first, on the releases
// repo's default branch, and electron-builder then attaches the files to it.
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

async function github(method, url, body) {
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
}

// An existing release for this version means the version wasn't bumped -
// installed apps would never see the "new" build as an update.
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

const run = (command) => {
  const result = spawnSync(command, { cwd: root, stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run("npm run icons");
run("npm run desktop:prepare");
run("npx electron-builder --win nsis --publish always");

console.log(`\n[release] ${tag} published: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
