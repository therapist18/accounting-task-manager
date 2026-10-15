const { contextBridge, ipcRenderer } = require("electron");

// Wraps a main->renderer push channel so callers get an unsubscribe function
// instead of a bare listener reference they have to hand back for cleanup.
function subscribe(channel, handler) {
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("desktop", {
  getAppInfo: () => ipcRenderer.invoke("app:get-info"),

  // Lets the renderer raise a native toast without reaching for the DOM
  // Notification API, which Electron's sandboxed webContents does not grant
  // permission for.
  // `navigateTo` (an in-app path) makes clicking the toast open that page.
  notify: ({ title, body, navigateTo }) => ipcRenderer.invoke("app:notify", { title, body, navigateTo }),

  // A notification that carried `navigateTo` was clicked - go to that in-app path.
  onNavigate: (handler) => subscribe("app:navigate", handler),

  // No-op kept for older pages; stale-run recovery no longer needs the user.
  setUser: (userId) => ipcRenderer.invoke("app:set-user", userId),

  // Talks to the local automation server (see lib/automations/client). Main
  // checks that the caller is our own page and that the endpoint is one of the
  // few the web app uses. Resolves to { status, payload }.
  automationRequest: ({ method, path, body }) =>
    ipcRenderer.invoke("automations:request", { method, path, body }),

  getActiveJobs: () => ipcRenderer.invoke("app:get-active-jobs"),

  // Live job lifecycle events pushed from the automation server, so an open page
  // can react to a run finishing without polling.
  onAutomationEvent: (handler) => subscribe("automation:event", handler),

  // A notification was clicked - focus the run it refers to.
  onNavigateToAutomation: (handler) => subscribe("automation:navigate", handler),

  // The automation server died; browser automations will fail until restart.
  onAutomationServerExit: (handler) => subscribe("automations:server-exit", handler),
});
