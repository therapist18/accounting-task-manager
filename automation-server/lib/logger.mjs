import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOG_DIR = fileURLToPath(new URL("../logs/", import.meta.url));
const MAX_LOG_BYTES = 2 * 1024 * 1024;

function writeToFile(level, message) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, "automation-server.log");

    // Rotate rather than grow without bound - this process can run for a long
    // time between app restarts when the window is closed to the tray.
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > MAX_LOG_BYTES) {
        fs.renameSync(file, `${file}.1`);
      }
    } catch {
      // Rotation is best-effort.
    }

    fs.appendFileSync(file, `[${new Date().toISOString()}] [${level}] ${message}\n`, "utf8");
  } catch {
    // Logging must never throw.
  }
}

function emit(level, message, meta) {
  const suffix = meta === undefined ? "" : ` ${JSON.stringify(meta)}`;
  const line = `[${new Date().toISOString()}] [${level}] ${message}${suffix}`;

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  writeToFile(level, `${message}${suffix}`);
}

export const logger = {
  info: (message, meta) => emit("info", message, meta),
  warn: (message, meta) => emit("warn", message, meta),
  error: (message, meta) => emit("error", message, meta),
  debug: (message, meta) => {
    if (process.env.AUTOMATION_DEBUG === "true") emit("info", `[debug] ${message}`, meta);
  },
  job: (jobId, level, message, step) =>
    emit(level, `[${jobId}]${step ? ` (${step})` : ""} ${message}`),
};
