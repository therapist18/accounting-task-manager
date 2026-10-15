// Bridge exposed by electron/preload.js.
//
// Every member is optional: the same Next build also runs as a plain web app
// (next dev, Vercel), where there is no Electron parent and window.desktop is
// undefined. Call sites must therefore guard, which is why the desktop-specific
// behaviour degrades to in-page toasts rather than breaking.

export type DesktopAutomationEvent = {
  // job:cancelled is distinct from job:failed on purpose - a run the user
  // deliberately stopped should not be presented as a failure.
  type: "job:started" | "job:finished" | "job:failed" | "job:cancelled";
  jobId: string;
  label?: string;
  automationType?: string;
  status?: string;
  runId?: string;
  userId?: string;
  error?: string;
  summary?: string;
  startedAt?: string;
  finishedAt?: string;
};

export type DesktopNotificationClick = {
  jobId: string;
  status?: string;
};

export interface DesktopBridge {
  getAppInfo(): Promise<{
    name: string;
    version: string;
    isPackaged: boolean;
    platform: string;
  }>;

  /** Raises a native OS notification. The DOM Notification API is not available here. */
  notify(input: { title: string; body?: string }): Promise<boolean>;

  /** No-op kept for compatibility; stale-run recovery no longer needs the user. */
  setUser(userId: string | null): Promise<boolean>;

  /**
   * Calls the local automation server through the main process. Only our own
   * pages and a fixed set of endpoints are allowed. Absent in older installs.
   */
  automationRequest?(request: {
    method: "GET" | "POST";
    path: string;
    body?: unknown;
  }): Promise<{ status: number; payload: any }>;

  getActiveJobs(): Promise<{ activeJobCount: number }>;

  /** Live job lifecycle events pushed from the local automation server. Returns an unsubscribe fn. */
  onAutomationEvent(handler: (event: DesktopAutomationEvent) => void): () => void;

  /** A notification was clicked; focus the run it refers to. Returns an unsubscribe fn. */
  onNavigateToAutomation(handler: (payload: DesktopNotificationClick) => void): () => void;

  /** The automation service died. Returns an unsubscribe fn. */
  onAutomationServerExit(handler: (code: number) => void): () => void;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export {};
