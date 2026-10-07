const {
  app,
  BrowserWindow,
  Notification,
  Tray,
  Menu,
  dialog,
  ipcMain,
  nativeImage,
  powerSaveBlocker,
  safeStorage,
  shell,
} = require("electron");
const { fork, execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const isDev = !app.isPackaged;
const PRODUCT_NAME = "Task Manager";

let nextProcess;
let automationProcess;
let eventBridgeServer;
let mainWindow;
let tray;
let logFilePath;
let iconPath;
let isQuitting = false;
let blockPowerSaveId = null;
let activeJobCount = 0;

// Windows starts the app at login with this flag (see configureLaunchAtLogin): it then stays in the
// tray instead of opening the window, so notifications arrive without anyone opening the app.
const LAUNCH_AT_LOGIN_ARGS = ["--hidden"];
const launchedHidden = process.argv.includes("--hidden");

// One running copy only. Starting at login means a copy is usually already in the tray, so opening
// the app again from the Start menu must show that window rather than boot a second Next server.
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => showMainWindow());
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ---------------------------------------------------------------- logging

function appendLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  console.log(line.trim());

  if (logFilePath) {
    try {
      fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
      fs.appendFileSync(logFilePath, line, "utf8");
    } catch (error) {
      console.error(`Failed to write log: ${error.message}`);
    }
  }
}

// ------------------------------------------------------- process lifecycle

// A plain child.kill() on Windows only terminates the direct child. Any headed
// Chromium window launched by a Playwright automation is a grandchild, so it
// survives and then blocks (or gets reused by) the next automation run. Always
// take the whole tree down.
function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    execFile("taskkill", ["/PID", String(pid), "/T", "/F"], () => {});
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
  }
}

function getLockFilePath() {
  return path.join(app.getPath("userData"), "server.lock.json");
}

// Safety net for a session that ended without a clean shutdown (crash,
// force-close, power loss): an automation left mid-run still holds a headed
// browser and a Supabase row stuck in 'running'. Reap the orphans and reset any
// job this machine left behind so the UI doesn't show a permanently spinning run.
function cleanupStaleProcesses() {
  const lockPath = getLockFilePath();
  if (!fs.existsSync(lockPath)) return;

  try {
    const { nextPid, automationPid, userId } = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    for (const pid of [nextPid, automationPid]) {
      if (pid) {
        appendLog(`Cleaning up leftover process from a previous session: PID ${pid}`);
        killProcessTree(pid);
      }
    }
    if (userId) {
      appendLog(`Resetting stale automation runs for user ${userId}`);
      resetStaleRuns(userId).catch((error) =>
        appendLog(`Failed to reset stale runs: ${error.message}`)
      );
    }
  } catch (error) {
    appendLog(`Failed to clean up stale processes: ${error.message}`);
  }

  fs.rmSync(lockPath, { force: true });
}

function writeLockFile(userId = null) {
  try {
    fs.writeFileSync(
      getLockFilePath(),
      JSON.stringify({
        nextPid: nextProcess?.pid || null,
        automationPid: automationProcess?.pid || null,
        userId,
      }),
      "utf8"
    );
  } catch (error) {
    appendLog(`Failed to write server lock file: ${error.message}`);
  }
}

// Any run still marked pending/running belongs to a process that no longer
// exists. Release it so the automations page shows it as interrupted rather
// than spinning forever.
async function resetStaleRuns(userId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(url, key);
  const { error } = await supabase
    .from("tm_automation_runs")
    .update({
      status: "interrupted",
      error: "Application closed before the automation finished.",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .in("status", ["pending", "running"]);
  if (error) throw new Error(error.message);
}

// -------------------------------------------------------------- env files

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (!key) continue;

    const quote = value[0];
    if (quote === '"' || quote === "'") {
      if (value.length > 1 && value.endsWith(quote)) {
        value = value.slice(1, -1);
      } else {
        // A quoted value can span several physical lines, which is how a PEM
        // private key is normally stored. Without consuming the continuation
        // lines the value is truncated to its opening line and Firebase
        // rejects the key with "Invalid PEM formatted message".
        const parts = [value.slice(1)];
        while (i + 1 < lines.length) {
          i += 1;
          const closingIndex = lines[i].indexOf(quote);
          if (closingIndex !== -1) {
            parts.push(lines[i].slice(0, closingIndex));
            break;
          }
          parts.push(lines[i]);
        }
        value = parts.join("\n");
      }
    }

    if (process.env[key] === undefined) {
      process.env[key] = value.replace(/\\n/g, "\n");
    }
  }
}

function loadEnvironmentVariables() {
  const rootDir = app.getAppPath();
  for (const name of [".env", ".env.local", ".env.production.local"]) {
    parseEnvFile(path.join(rootDir, name));
  }

  const serverDir = path.dirname(getStandaloneServerPath());
  if (serverDir !== rootDir) {
    for (const name of [".env", ".env.local", ".env.production.local"]) {
      parseEnvFile(path.join(serverDir, name));
    }
  }
}

// ------------------------------------------------------------- networking

function findAvailablePort(startPort) {
  const maxAttempts = 20;
  return new Promise((resolvePort, rejectPort) => {
    const tryPort = (port, attempts) => {
      if (attempts >= maxAttempts) {
        rejectPort(
          new Error(`Unable to find a free port after ${maxAttempts} attempts starting at ${startPort}`)
        );
        return;
      }
      const server = net.createServer();
      server.once("error", () => tryPort(port + 1, attempts + 1));
      server.once("listening", () => server.close(() => resolvePort(port)));
      server.listen(port, "127.0.0.1");
    };

    tryPort(startPort, 0);
  });
}

function waitForServer(url, timeoutMs = 60000) {
  const startedAt = Date.now();

  return new Promise((resolveReady, rejectReady) => {
    const check = async () => {
      try {
        const response = await fetch(url);
        if (response.ok || response.status < 500) {
          resolveReady();
          return;
        }
      } catch {
        // Still booting.
      }

      if (Date.now() - startedAt > timeoutMs) {
        rejectReady(new Error(`Timed out waiting for ${url}`));
        return;
      }

      setTimeout(check, 500);
    };

    check();
  });
}

function getStandaloneServerPath() {
  if (isDev) return path.join(app.getAppPath(), ".next", "standalone", "server.js");
  return path.join(process.resourcesPath, "next-server", "server.js");
}

function getAutomationServerPath() {
  if (isDev) return path.join(app.getAppPath(), "automation-server", "server.mjs");
  return path.join(process.resourcesPath, "automation-server", "server.mjs");
}

function getBundledBrowsersPath() {
  if (isDev) return null;
  const bundledPath = path.join(process.resourcesPath, "ms-playwright");
  return fs.existsSync(bundledPath) ? bundledPath : null;
}

// ----------------------------------------------------- child process spawn

function childEnvironment(extra = {}) {
  const bundledBrowsersPath = getBundledBrowsersPath();
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    ...(bundledBrowsersPath ? { PLAYWRIGHT_BROWSERS_PATH: bundledBrowsersPath } : {}),
    ...extra,
  };
}

function attachChildLogging(child, label) {
  if (isDev) return;
  child.stdout?.on("data", (chunk) => appendLog(`[${label} stdout] ${chunk.toString().trimEnd()}`));
  child.stderr?.on("data", (chunk) => appendLog(`[${label} stderr] ${chunk.toString().trimEnd()}`));
}

function spawnNextServer(port, automationPort) {
  const serverPath = getStandaloneServerPath();
  const serverDir = path.dirname(serverPath);

  if (!fs.existsSync(serverPath)) {
    throw new Error(
      `Next standalone server not found at ${serverPath}. Run "npm run build" then "npm run desktop:prepare".`
    );
  }

  // The Next process proxies /api/automations/* to the automation server, so it
  // needs the resolved port. Passed via env rather than a new build-time public
  // var because the port is only known at runtime.
  const env = childEnvironment({
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    AUTOMATIONS_API_URL: `http://127.0.0.1:${automationPort}`,
  });

  appendLog(`Starting Next server on port ${port} (automations on ${automationPort})`);

  const child = fork(serverPath, [], {
    env,
    cwd: serverDir,
    stdio: isDev ? "inherit" : ["ignore", "pipe", "pipe", "ipc"],
  });
  attachChildLogging(child, "next");

  child.on("exit", (code) => {
    appendLog(`Next server exited with code ${code}`);
    if (code !== 0 && !isQuitting) {
      dialog.showErrorBox(
        `${PRODUCT_NAME} server stopped`,
        `The local server exited unexpectedly (code ${code}).\n\nLog file:\n${logFilePath}`
      );
    }
  });

  return child;
}

function spawnAutomationServer(port) {
  const serverPath = getAutomationServerPath();
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Automation server not found at ${serverPath}`);
  }

  // The automation logger defaults to a directory beside its own module, which
  // in a packaged app is the install folder. Point it at userData so run logs
  // survive upgrades and stay writable under a per-machine install.
  const userDataLogDir = logFilePath ? path.dirname(logFilePath) : path.join(app.getPath("userData"), "logs");
  const env = childEnvironment({ PORT: String(port), AUTOMATION_LOG_DIR: userDataLogDir });

  appendLog(`Starting automation server on port ${port} (logs: ${userDataLogDir})`);

  const child = fork(serverPath, [], {
    env,
    cwd: path.dirname(serverPath),
    stdio: isDev ? "inherit" : ["ignore", "pipe", "pipe", "ipc"],
  });
  attachChildLogging(child, "automation");

  child.on("exit", (code) => {
    appendLog(`Automation server exited with code ${code}`);
    if (code !== 0 && !isQuitting) {
      notify({
        title: "Automations unavailable",
        body: `The automation service stopped unexpectedly (code ${code}). Browser automations will fail until the app is restarted.`,
      });
      mainWindow?.webContents.send("automations:server-exit", code);
    }
  });

  return child;
}

// ---------------------------------------------------------- notifications

function updateTrayBadge() {
  if (!tray) return;
  // Windows renders a small overlay count on the tray icon; anything over 9 is
  // meaningless so clamp it rather than letting the OS draw a huge glyph.
  tray.setTitle(activeJobCount > 0 ? (activeJobCount > 9 ? "9+" : String(activeJobCount)) : "");
  tray.setContextMenu(buildTrayMenu());
}

// A headed Chromium run can take many minutes. Without this the display can
// sleep mid-run, which stalls the browser and eventually trips a navigation
// timeout for no real reason.
function acquirePowerSaveBlocker() {
  if (blockPowerSaveId !== null) return;
  blockPowerSaveId = powerSaveBlocker.start("prevent-display-sleep");
  appendLog("Power save blocker engaged (automation running)");
}

function releasePowerSaveBlocker() {
  if (blockPowerSaveId === null) return;
  if (powerSaveBlocker.isStarted(blockPowerSaveId)) {
    powerSaveBlocker.stop(blockPowerSaveId);
  }
  blockPowerSaveId = null;
  appendLog("Power save blocker released");
}

function notify({ title, body, jobId, status, navigateTo }) {
  if (!Notification.isSupported()) {
    appendLog(`Notification skipped (unsupported): ${title} - ${body}`);
    return;
  }

  const notification = new Notification({
    title,
    body,
    icon: iconPath || undefined,
    silent: false,
  });

  notification.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (jobId) {
      mainWindow.webContents.send("automation:navigate", { jobId, status });
    }
    // A page inside the app (e.g. the Task Basket). Only in-app paths are forwarded, so a renderer
    // can't use a notification click to send the window somewhere else.
    if (navigateTo && String(navigateTo).startsWith("/") && !String(navigateTo).startsWith("//")) {
      mainWindow.webContents.send("app:navigate", { path: String(navigateTo) });
    }
  });

  notification.show();
  appendLog(`Notification: ${title} - ${body}`);
}

// The automation server has no Electron handle, so it reports terminal job
// events here over loopback HTTP. Bound to an ephemeral port passed down via
// AUTOMATION_EVENTS_PORT; the shared token is checked so another local process
// can't post arbitrary notifications into this app.
function startAutomationEventBridge() {
  const token = `evt_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const server = net.createServer();

  server.on("connection", (socket) => {
    // Accumulate across packets instead of reading once. A single 'data' event is
    // not guaranteed to contain the whole request, and a body split across two
    // segments would fail to parse - silently dropping the completion
    // notification this bridge exists to deliver.
    let buffer = "";
    const respond = (status) => socket.end(`HTTP/1.1 ${status}\r\nContent-Length: 0\r\n\r\n`);

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");

      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return; // headers not complete yet

      const head = buffer.slice(0, headerEnd);
      const body = buffer.slice(headerEnd + 4);

      const contentLength = Number(/content-length:\s*(\d+)/i.exec(head)?.[1] || 0);
      if (Buffer.byteLength(body) < contentLength) return; // body still arriving

      const requestLine = head.split("\r\n")[0] || "";
      const match = /\/event\?token=([^&\s]+)/.exec(requestLine);

      if (!match || match[1] !== token) {
        respond("403 Forbidden");
        return;
      }

      let event = null;
      try {
        event = JSON.parse(body);
      } catch {
        respond("400 Bad Request");
        return;
      }

      respond("204 No Content");
      handleAutomationEvent(event);
    });

    socket.on("error", () => socket.destroy());
  });

  server.on("error", (error) => appendLog(`Automation event bridge error: ${error.message}`));

  // Resolves only once listening, so the caller can be certain the port and
  // token are in process.env before spawning the automation server. Otherwise the
  // child can inherit a missing AUTOMATION_EVENTS_PORT and silently lose every
  // notification for the life of the app.
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      process.env.AUTOMATION_EVENTS_PORT = String(port);
      process.env.AUTOMATION_EVENTS_TOKEN = token;
      appendLog(`Automation event bridge listening on 127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

function handleAutomationEvent(event) {
  if (!event || typeof event !== "object") return;

  if (event.type === "job:started") {
    activeJobCount += 1;
    updateTrayBadge();
    acquirePowerSaveBlocker();
    return;
  }

  if (
    event.type === "job:finished" ||
    event.type === "job:failed" ||
    event.type === "job:cancelled"
  ) {
    activeJobCount = Math.max(0, activeJobCount - 1);
    updateTrayBadge();
    if (activeJobCount === 0) releasePowerSaveBlocker();
  }

  // Forward to the renderer so an open page can live-update without polling.
  mainWindow?.webContents.send("automation:event", event);

  if (event.type === "job:finished") {
    notify({
      title: `${event.label || "Automation"} completed`,
      body: event.summary || "The automation finished successfully.",
      jobId: event.jobId,
      status: "completed",
    });
  } else if (event.type === "job:cancelled") {
    // Deliberate stop, so a neutral wording rather than a failure alarm.
    notify({
      title: `${event.label || "Automation"} stopped`,
      body: "You stopped this run.",
      jobId: event.jobId,
      status: "cancelled",
    });
  } else if (event.type === "job:failed") {
    notify({
      title: `${event.label || "Automation"} failed`,
      body: event.error || "The automation stopped with an error.",
      jobId: event.jobId,
      status: "failed",
    });
  }
}

// ------------------------------------------------------------ window/tray

function createTray() {
  const image = nativeImage.createFromPath(iconPath || "");
  if (image.isEmpty()) return;

  tray = new Tray(image.resize({ width: 16, height: 16 }));
  tray.setToolTip(PRODUCT_NAME);
  tray.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) mainWindow.hide();
    else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  updateTrayBadge();
}

// ------------------------------------------------------- launch at login

function isLaunchAtLoginEnabled() {
  return app.getLoginItemSettings({ args: LAUNCH_AT_LOGIN_ARGS }).openAtLogin;
}

function setLaunchAtLogin(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled, args: LAUNCH_AT_LOGIN_ARGS });
  appendLog(`Start with Windows ${enabled ? "enabled" : "disabled"}`);
}

// Turned on once by default (installed builds only); after that the tray's "Start with Windows"
// checkbox is the user's choice and is never overridden.
function configureLaunchAtLogin() {
  if (!app.isPackaged) return;
  const marker = path.join(app.getPath("userData"), "launch-at-login-initialized");
  if (fs.existsSync(marker)) return;
  setLaunchAtLogin(true);
  try {
    fs.writeFileSync(marker, new Date().toISOString());
  } catch (error) {
    appendLog(`Could not record launch-at-login default: ${error.message}`);
  }
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: activeJobCount > 0 ? `Running ${activeJobCount} automation(s)` : "No automations running",
      enabled: false,
    },
    { type: "separator" },
    { label: "Open Task Manager", click: () => showMainWindow() },
    {
      label: "Start with Windows",
      type: "checkbox",
      visible: app.isPackaged,
      checked: app.isPackaged && isLaunchAtLoginEnabled(),
      click: (item) => setLaunchAtLogin(item.checked),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}
function createWindow(startUrl) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    title: PRODUCT_NAME,
    show: false,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    // Without a tray icon there'd be no way to open a hidden window, so only stay hidden with one.
    if (launchedHidden && tray) appendLog("Started at login - staying in the tray");
    else mainWindow.show();
  });

  // Electron's BrowserWindow has no browser chrome, so Ctrl+scroll and
  // Ctrl+Plus/Minus/0 don't zoom on their own - Electron only emits
  // zoom-changed and leaves acting on it to the app.
  const ZOOM_STEP = 0.5;
  const ZOOM_MIN = -4;
  const ZOOM_MAX = 5;
  const adjustZoom = (delta) => {
    const level = mainWindow.webContents.getZoomLevel() + delta;
    mainWindow.webContents.setZoomLevel(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level)));
  };

  mainWindow.webContents.on("zoom-changed", (_event, direction) => {
    adjustZoom(direction === "in" ? ZOOM_STEP : -ZOOM_STEP);
  });

  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (!(input.control || input.meta) || input.type !== "keyDown") return;
    if (input.key === "=" || input.key === "+" || input.code === "NumpadAdd") {
      adjustZoom(ZOOM_STEP);
    } else if (input.key === "-" || input.code === "NumpadSubtract") {
      adjustZoom(-ZOOM_STEP);
    } else if (input.key === "0" || input.code === "Numpad0") {
      mainWindow.webContents.setZoomLevel(0);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Closing the window must not kill the app: automations run headed browsers
  // for minutes at a time, and the user needs to be able to switch away and
  // still get a completion notification. The tray keeps the app resident and
  // the app only really quits via the tray menu or the window close prompt.
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    if (activeJobCount > 0) {
      event.preventDefault();
      mainWindow.hide();
      appendLog(`Window hidden; ${activeJobCount} automation(s) still running`);
      return;
    }
    if (tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.loadURL(startUrl);
}

// ----------------------------------------------------------------- ipc

ipcMain.handle("app:get-info", () => ({
  name: PRODUCT_NAME,
  version: app.getVersion(),
  isPackaged: app.isPackaged,
  platform: process.platform,
}));

ipcMain.handle("app:notify", (_event, { title, body, navigateTo } = {}) => {
  if (!title) return false;
  notify({ title: String(title), body: body ? String(body) : "", navigateTo });
  return true;
});

// The renderer signs in against /api/auth/session (Firebase-backed). Once it
// knows who is logged in it hands us the id so the stale-run sweep on next
// launch is scoped to that user rather than the whole table.
ipcMain.handle("app:set-user", (_event, userId) => {
  writeLockFile(userId ? String(userId) : null);
  return true;
});

ipcMain.handle("app:get-active-jobs", () => ({ activeJobCount }));

// ------------------------------------------------------------- lifecycle

const shouldStartAutomationServer = app.isPackaged
  ? process.env.ELECTRON_ENABLE_AUTOMATION_SERVER !== "false"
  : process.env.ELECTRON_ENABLE_AUTOMATION_SERVER === "true";

app.whenReady().then(async () => {
  // A second copy just hands over to the running one (see requestSingleInstanceLock above).
  if (!hasInstanceLock) return;
  app.setAppUserModelId("com.bcl.task-manager");
  loadEnvironmentVariables();

  logFilePath = path.join(app.getPath("userData"), "logs", "desktop.log");
  configureLaunchAtLogin();
  iconPath = isDev
    ? path.join(app.getAppPath(), "public", "electron-icon.png")
    : path.join(process.resourcesPath, "next-server", "public", "electron-icon.png");
  if (!fs.existsSync(iconPath)) iconPath = undefined;

  appendLog(`${PRODUCT_NAME} desktop starting. Packaged=${app.isPackaged}`);
  appendLog(`Automation server enabled: ${shouldStartAutomationServer}`);

  cleanupStaleProcesses();
  // Awaited: the automation server inherits the bridge port/token from
  // process.env, so it must be listening before the child is spawned.
  eventBridgeServer = await startAutomationEventBridge();

  try {
    const automationPort = shouldStartAutomationServer
      ? await findAvailablePort(Number(process.env.AUTOMATION_PORT_START) || 4000)
      : 0;

    if (shouldStartAutomationServer) {
      automationProcess = spawnAutomationServer(automationPort);
      await waitForServer(`http://127.0.0.1:${automationPort}/health`, 20000);
    } else {
      appendLog("Automation server skipped. Set ELECTRON_ENABLE_AUTOMATION_SERVER=true to enable.");
    }

    const port = await findAvailablePort(Number(process.env.ELECTRON_PORT_START) || 3000);
    const startUrl = process.env.ELECTRON_START_URL || `http://127.0.0.1:${port}`;

    nextProcess = spawnNextServer(port, automationPort);
    writeLockFile();
    await waitForServer(startUrl);

    createWindow(startUrl);
    createTray();
  } catch (error) {
    appendLog(`Startup failed: ${error.stack || error.message}`);
    dialog.showErrorBox(`${PRODUCT_NAME} failed to start`, `${error.message}\n\nLog file:\n${logFilePath}`);
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && mainWindow) {
    mainWindow.show();
  }
});

// With a tray in place the app stays alive on window close; only an explicit
// quit ends the session (and takes the child servers with it).
app.on("window-all-closed", () => {
  if (!tray) app.quit();
});

app.on("before-quit", () => {
  // A second copy that's handing over owns nothing - and must not delete the running copy's lock file.
  if (!hasInstanceLock) return;
  isQuitting = true;
  releasePowerSaveBlocker();
  if (eventBridgeServer) eventBridgeServer.close();
  if (nextProcess && !nextProcess.killed) killProcessTree(nextProcess.pid);
  if (automationProcess && !automationProcess.killed) killProcessTree(automationProcess.pid);
  // Clean shutdown - nothing for the next launch to clean up.
  fs.rmSync(getLockFilePath(), { force: true });
});
