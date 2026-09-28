import net from "node:net";
import { logger } from "./logger.mjs";

// Terminal job events are pushed to the Electron main process so it can raise a
// native desktop notification. Without this the notification would depend on the
// renderer being open and polling, which defeats the point - the user closes the
// window to the tray and walks away.
//
// Electron opens a loopback HTTP listener on an ephemeral port and passes
// AUTOMATION_EVENTS_PORT / AUTOMATION_EVENTS_TOKEN down to this process. There
// is no Electron handle here, so loopback HTTP is the transport.
const PORT = Number(process.env.AUTOMATION_EVENTS_PORT) || 0;
const TOKEN = process.env.AUTOMATION_EVENTS_TOKEN || "";

let available = false;

export function initEventBridge() {
  if (!PORT || !TOKEN) {
    logger.info(
      "Automation event bridge disabled (no Electron parent). Desktop notifications require the packaged app."
    );
    return;
  }
  available = true;
  logger.info(`Automation event bridge targeting 127.0.0.1:${PORT}`);
}

export function emitEvent(event) {
  if (!available) {
    logger.debug(`Event (not forwarded): ${event.type} ${event.jobId ?? ""}`);
    return;
  }

  const body = JSON.stringify(event);
  const request = [
    `POST /event?token=${encodeURIComponent(TOKEN)} HTTP/1.1`,
    "Host: 127.0.0.1",
    "Content-Type: application/json",
    `Content-Length: ${Buffer.byteLength(body)}`,
    "Connection: close",
    "",
    body,
  ].join("\r\n");

  const socket = net.connect({ port: PORT, host: "127.0.0.1" }, () => {
    socket.write(request);
  });

  socket.setTimeout(5000, () => socket.destroy());
  socket.on("error", (error) => {
    // Non-fatal: a lost notification must never fail the automation run.
    logger.warn(`Failed to deliver event to desktop shell: ${error.message}`);
  });
  socket.on("data", () => socket.end());
}
