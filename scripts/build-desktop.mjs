// Runs `next build` with the standalone output flag set.
//
// Kept as a script rather than a shell one-liner so the desktop build works the
// same on Windows and macOS - `set FOO=1 && next build` is cmd-only, and
// `FOO=1 next build` breaks on Windows.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [nextBin, "build"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NEXT_OUTPUT_STANDALONE: "1" },
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`\nnext build terminated by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
