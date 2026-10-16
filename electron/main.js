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
  session,
  shell,
} = require("electron");
const { fork, execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const isDev = !app.isPackaged;
const PRODUCT_NAME = "Task Manager";

// The desktop app is a shell around the hosted web app. It deliberately does not
// run Next itself: a local Next server needs the server secrets (service-role
// key, OAuth/Twilio/SMTP credentials...) on every user's PC, and anything inside
// the installer is readable by whoever has it. What has to run locally - the
// headed eTA browser - is the automation server, reached over IPC below.
//
// ELECTRON_START_URL points the shell at another deployment, e.g.
// http://localhost:3001 to try desktop features against `npm run dev`.
const APP_URL = process.env.ELECTRON_START_URL || "https://bcl-tasks.booksmartportals.com";

let automationProcess;
let automationPort = 0;
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
  // Started hidden at login: the first time it's opened, open it maximized.
  if (launchedHidden && !mainWindow.__shownOnce) mainWindow.maximize();
  mainWindow.__shownOnce = true;
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

// Runs this machine has started and not yet seen finish, keyed by runId. Each
// carries the run's own completion token, which is what lets the next launch
// close out a run a crash left behind - without the service-role key the shell
// used to need for that.
const pendingRuns = new Map();

function writeLockFile() {
  try {
    fs.writeFileSync(
      getLockFilePath(),
      JSON.stringify({
        automationPid: automationProcess?.pid || null,
        pendingRuns: [...pendingRuns.values()],
      }),
      "utf8"
    );
  } catch (error) {
    appendLog(`Failed to write server lock file: ${error.message}`);
  }
}

// Safety net for a session that ended without a clean shutdown (crash,
// force-close, power loss): an automation left mid-run still holds a headed
// browser and a row stuck in 'running'. Reap the orphan process and mark the
// runs it left behind as interrupted so the UI doesn't spin forever.
function cleanupStaleProcesses() {
  const lockPath = getLockFilePath();
  if (!fs.existsSync(lockPath)) return;

  try {
    const { automationPid, pendingRuns: leftover = [] } = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    if (automationPid) {
      appendLog(`Cleaning up leftover process from a previous session: PID ${automationPid}`);
      killProcessTree(automationPid);
    }
    for (const run of leftover) {
      settleInterruptedRun(run).catch((error) =>
        appendLog(`Failed to release interrupted run ${run.runId}: ${error.message}`)
      );
    }
  } catch (error) {
    appendLog(`Failed to clean up stale processes: ${error.message}`);
  }

  fs.rmSync(lockPath, { force: true });
}

async function settleInterruptedRun({ runId, secret, persistUrl }) {
  if (!runId || !secret || !persistUrl) return;
  appendLog(`Marking run ${runId} as interrupted`);
  const response = await fetch(`${persistUrl}/api/automations/settled`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId, secret, interrupted: true }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
    showMainWindow();
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
    // The automation server reports the outcome itself; nothing left to recover.
    if (event.runId && pendingRuns.delete(String(event.runId))) writeLockFile();
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
    else showMainWindow();
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
    // desktop.log (shell + automation server output), automation-server.log and
    // failures/ (eTA failure screenshots) all live here.
    { label: "Open logs folder", click: () => logFilePath && shell.openPath(path.dirname(logFilePath)) },
    { label: `Version ${app.getVersion()}`, enabled: false },
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
// Window Controls Overlay: no Windows frame; the OS draws only the min/max/close
// buttons over the top-right of the page, and the web app's header is the drag
// handle (see the [data-titlebar-*] rules in app/globals.css). The height
// matches the navbar (h-16) so the buttons line up with it.
const TITLEBAR_HEIGHT = 64;
const TITLEBAR_LIGHT = { color: "#00000000", symbolColor: "#475569", height: TITLEBAR_HEIGHT };
const TITLEBAR_DARK = { color: "#00000000", symbolColor: "#e2e8f0", height: TITLEBAR_HEIGHT };

const APP_ORIGIN = new URL(APP_URL).origin;

function isAppUrl(url) {
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

// Options for any window showing our own pages: same preload (the desktop
// bridge, guarded by isTrustedSender) and the same frameless title bar.
function appWindowOptions(extra = {}) {
  return {
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    title: PRODUCT_NAME,
    show: false,
    autoHideMenuBar: true,
    icon: iconPath,
    titleBarStyle: "hidden",
    titleBarOverlay: TITLEBAR_LIGHT,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
    ...extra,
  };
}

// Documents, the invoice generator and other sites opened from the app: a plain
// framed window with no preload, so third-party pages never see window.desktop.
function externalWindowOptions() {
  return {
    width: 1200,
    height: 900,
    title: PRODUCT_NAME,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  };
}

// Links that belong to another application, not a page.
function opensInOtherApp(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (!["http:", "https:", "blob:", "data:"].includes(protocol)) return true; // mailto:, tel:, ...
    return ["wa.me", "api.whatsapp.com", "web.whatsapp.com"].includes(hostname);
  } catch {
    return true;
  }
}

/**
 * Behaviour shared by every window: zoom keys, page-error logging, and what
 * happens on window.open / target="_blank".
 *
 * Those used to be handed to the default browser, so "Start application" and
 * similar "open in new tab" buttons threw the user out into Chrome. They now
 * open as windows of this app; only mail/WhatsApp links leave it.
 */
function configureContents(win) {
  const contents = win.webContents;

  // Electron's BrowserWindow has no browser chrome, so Ctrl+scroll and
  // Ctrl+Plus/Minus/0 don't zoom on their own - Electron only emits
  // zoom-changed and leaves acting on it to the app.
  const ZOOM_STEP = 0.5;
  const ZOOM_MIN = -4;
  const ZOOM_MAX = 5;
  const adjustZoom = (delta) => {
    const level = contents.getZoomLevel() + delta;
    contents.setZoomLevel(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level)));
  };

  contents.on("zoom-changed", (_event, direction) => {
    adjustZoom(direction === "in" ? ZOOM_STEP : -ZOOM_STEP);
  });

  contents.on("before-input-event", (_event, input) => {
    if (!(input.control || input.meta) || input.type !== "keyDown") return;
    if (input.key === "=" || input.key === "+" || input.code === "NumpadAdd") {
      adjustZoom(ZOOM_STEP);
    } else if (input.key === "-" || input.code === "NumpadSubtract") {
      adjustZoom(-ZOOM_STEP);
    } else if (input.key === "0" || input.code === "Numpad0") {
      contents.setZoomLevel(0);
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    if (opensInOtherApp(url)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    // "allow" (rather than creating the window ourselves) keeps blob: URLs and
    // window.opener working for document previews.
    const options = isAppUrl(url) ? appWindowOptions() : externalWindowOptions();
    return { action: "allow", overrideBrowserWindowOptions: options };
  });

  contents.on("did-create-window", (child, { url }) => {
    configureContents(child);
    if (isAppUrl(url)) {
      // Like the main window: open maximized once there's something to show.
      child.once("ready-to-show", () => {
        child.maximize();
        child.show();
      });
    }
  });

  // Page errors land in desktop.log too, so a user's log file shows what went
  // wrong in the web app as well as in the shell. Warnings and errors only.
  contents.on("console-message", (details) => {
    const level = details?.level;
    if (level !== "error" && level !== "warning") return;
    appendLog(`[page ${level}] ${details.message} (${details.sourceId || ""}:${details.lineNumber ?? ""})`);
  });
}

// The preload reports the web app's light/dark theme so the window buttons stay
// visible against the header in either.
ipcMain.on("app:theme", (event, theme) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !isTrustedSender(event) || typeof win.setTitleBarOverlay !== "function") return;
  try {
    win.setTitleBarOverlay(theme === "dark" ? TITLEBAR_DARK : TITLEBAR_LIGHT);
  } catch {
    // Window without an overlay (an external page) - nothing to recolour.
  }
});

function createWindow(startUrl) {
  mainWindow = new BrowserWindow(appWindowOptions());
  configureContents(mainWindow);

  mainWindow.once("ready-to-show", () => {
    // Without a tray icon there'd be no way to open a hidden window, so only stay hidden with one.
    if (launchedHidden && tray) {
      appendLog("Started at login - staying in the tray");
      return;
    }
    // Opens maximized; maximize() also shows the window.
    mainWindow.maximize();
    mainWindow.show();
  });

  // The app now lives on the internet, so a dropped connection is an ordinary
  // event rather than a crash. Show a retry page instead of Chromium's error page.
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // -3 is ERR_ABORTED: a navigation superseded by another, not a failure.
    if (!isMainFrame || errorCode === -3) return;
    appendLog(`Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
    mainWindow.loadFile(path.join(__dirname, "offline.html"), {
      query: { retry: validatedURL || startUrl, reason: errorDescription || "" },
    });
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

// Kept for pages that still call it. Stale-run recovery no longer needs the
// user: the shell tracks the exact runs it started (see pendingRuns).
ipcMain.handle("app:set-user", () => true);

ipcMain.handle("app:get-active-jobs", () => ({ activeJobCount }));

// Only our own pages get the automation bridge. The preload runs on whatever the
// window shows, so without this check any site the window navigated to could
// drive the eTA browser.
function isTrustedSender(event) {
  try {
    const origin = new URL(event.senderFrame?.url || "").origin;
    if (origin === new URL(APP_URL).origin) return true;
    return !app.isPackaged && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  } catch {
    return false;
  }
}

// Exactly the automation server endpoints the web app uses - not a general proxy.
const AUTOMATION_ROUTES = [
  ["GET", /^\/health$/],
  ["POST", /^\/api\/automations\/run$/],
  ["GET", /^\/api\/automations\/jobs\/[\w.-]+$/],
  ["POST", /^\/api\/automations\/jobs\/[\w.-]+\/stop$/],
];

ipcMain.handle("automations:request", async (event, { method, path: requestPath, body } = {}) => {
  if (!isTrustedSender(event)) {
    return { status: 403, payload: { success: false, error: "Not allowed from this page." } };
  }
  if (!AUTOMATION_ROUTES.some(([m, pattern]) => m === method && pattern.test(String(requestPath)))) {
    return { status: 404, payload: { success: false, error: "Unknown automation endpoint." } };
  }
  if (!automationPort) {
    return {
      status: 503,
      payload: { success: false, error: "The automation service is not running. Restart the desktop app." },
    };
  }

  try {
    const response = await fetch(`http://127.0.0.1:${automationPort}${requestPath}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));

    if (method === "POST" && requestPath === "/api/automations/run" && response.ok && payload?.success) {
      pendingRuns.set(String(body.runId), {
        runId: String(body.runId),
        secret: body.persistSecret,
        persistUrl: body.persistUrl,
      });
      writeLockFile();
    }

    return { status: response.status, payload };
  } catch {
    return {
      status: 503,
      payload: { success: false, error: "The automation service is not running. Restart the desktop app." },
    };
  }
});

// ------------------------------------------------------------- lifecycle

// ------------------------------------------------------------ auto-update

// Checks the release feed configured under "publish" in package.json (baked into
// the installer as app-update.yml). Downloads in the background and asks before
// restarting; "Later" installs on the next quit. Every failure is logged and
// swallowed - no network, or no release yet, must never stop the app opening.
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function setupAutoUpdates() {
  if (!app.isPackaged || process.env.ELECTRON_DISABLE_AUTO_UPDATE === "true") return;

  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (error) {
    appendLog(`Auto-update unavailable: ${error.message}`);
    return;
  }

  autoUpdater.logger = { info: appendLog, warn: appendLog, error: appendLog, debug: () => {} };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  let prompted = false;
  autoUpdater.on("error", (error) => appendLog(`Auto-update error: ${error?.message || error}`));
  autoUpdater.on("update-downloaded", async ({ version }) => {
    if (prompted) return;
    prompted = true;

    // Restarting mid-run would kill a headed browser halfway through a
    // government form, so defer to the next quit instead of asking.
    if (activeJobCount > 0) {
      appendLog(`Update ${version} downloaded; will install on quit (automation running)`);
      return;
    }

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Update ready",
      message: `${PRODUCT_NAME} ${version} is ready to install.`,
      detail: "Restart now to update, or it will install the next time you quit the app.",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });

  const check = () =>
    autoUpdater.checkForUpdates().catch((error) => appendLog(`Update check failed: ${error.message}`));
  check();
  setInterval(check, UPDATE_CHECK_INTERVAL_MS).unref?.();
}

// ------------------------------------------------------------- lifecycle

const shouldStartAutomationServer = process.env.ELECTRON_ENABLE_AUTOMATION_SERVER !== "false";

app.whenReady().then(async () => {
  // A second copy just hands over to the running one (see requestSingleInstanceLock above).
  if (!hasInstanceLock) return;
  app.setAppUserModelId("com.bcl.task-manager");

  logFilePath = path.join(app.getPath("userData"), "logs", "desktop.log");
  configureLaunchAtLogin();
  iconPath = isDev
    ? path.join(app.getAppPath(), "public", "electron-icon.png")
    : path.join(process.resourcesPath, "electron-icon.png");
  if (!fs.existsSync(iconPath)) iconPath = undefined;

  appendLog(`${PRODUCT_NAME} desktop ${app.getVersion()} starting. Packaged=${app.isPackaged} url=${APP_URL}`);
  appendLog(`Automation server enabled: ${shouldStartAutomationServer}`);

  cleanupStaleProcesses();
  // Awaited: the automation server inherits the bridge port/token from
  // process.env, so it must be listening before the child is spawned.
  eventBridgeServer = await startAutomationEventBridge();

  // The window opens even if the automation server fails: the rest of the app
  // still works, and the automations page reports the service as unavailable.
  if (shouldStartAutomationServer) {
    try {
      const port = await findAvailablePort(Number(process.env.AUTOMATION_PORT_START) || 4000);
      automationProcess = spawnAutomationServer(port);
      await waitForServer(`http://127.0.0.1:${port}/health`, 20000);
      automationPort = port;
      writeLockFile();
    } catch (error) {
      appendLog(`Automation server failed to start: ${error.stack || error.message}`);
      notify({
        title: "Automations unavailable",
        body: "The automation service could not start. Restart the app to try again.",
      });
    }
  } else {
    appendLog("Automation server skipped (ELECTRON_ENABLE_AUTOMATION_SERVER=false).");
  }

  // A new-window link that turns out to be a file download (a .docx, a CSV
  // export) would otherwise leave an empty window behind. The download itself
  // carries on; only the blank window goes.
  session.defaultSession.on("will-download", (_event, _item, contents) => {
    const win = contents && BrowserWindow.fromWebContents(contents);
    const url = contents?.getURL() || "";
    if (win && win !== mainWindow && (!url || url === "about:blank")) {
      setTimeout(() => {
        if (!win.isDestroyed()) win.close();
      }, 0);
    }
  });

  createWindow(APP_URL);
  createTray();
  setupAutoUpdates();
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
  if (automationProcess && !automationProcess.killed) killProcessTree(automationProcess.pid);
  // Quitting mid-run kills that run. Leave its token behind (but not the PID,
  // which is already dead and could be reused) so the next launch marks it
  // interrupted; otherwise nothing is left to clean up.
  if (pendingRuns.size > 0) {
    automationProcess = null;
    writeLockFile();
  } else {
    fs.rmSync(getLockFilePath(), { force: true });
  }
});
