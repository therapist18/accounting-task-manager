// Starts `next dev` together with the local automation server.
//
// In the desktop app the Electron main process forks the automation server and
// injects AUTOMATIONS_API_URL. Plain `next dev` has no such parent, so without
// this the /api/automations/* proxy routes have nothing to talk to.
import { spawn } from "node:child_process";

const children = [];

function run(name, command) {
  const child = spawn(command, { stdio: "inherit", shell: true });
  child.on("exit", (code) => {
    console.log(`[dev] ${name} exited (code ${code})`);
    shutdown(code ?? 0);
  });
  children.push(child);
}

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("automation", "node automation-server/server.mjs");
run("next", ["next dev", ...process.argv.slice(2)].join(" "));
