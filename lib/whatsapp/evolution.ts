// Server-only Evolution API client for outbound WhatsApp messages.
//
// SECURITY: never import this from a "use client" file. The credentials are stored under
// NEXT_PUBLIC_* names (inherited from the birthday tracker), which makes Next.js inline them
// into the browser bundle for any client component that reads them — that would leak the API
// key to every browser that loads the app. Only route handlers / server components may use
// this module, so the credentials stay on the server. Don't add a "use client" import path
// here; if you need one, put the send behind an API route instead.

export interface EvolutionConfig {
  instanceName: string;
  apiKey: string;
  baseUrl: string;
}

export interface SendResult {
  success: boolean;
  error?: string;
}

function readConfig(): EvolutionConfig {
  return {
    instanceName: process.env.NEXT_PUBLIC_EVOLUTION_INSTANCE || "main",
    apiKey: process.env.NEXT_PUBLIC_EVOLUTION_API_KEY || "",
    baseUrl: (process.env.NEXT_PUBLIC_EVOLUTION_API_URL || "https://api.evolution-api.com").replace(/\/+$/, ""),
  };
}

export function isWhatsAppConfigured(): boolean {
  const { apiKey, baseUrl, instanceName } = readConfig();
  return Boolean(apiKey && baseUrl && instanceName);
}

/**
 * Sends a plain text WhatsApp message via Evolution API.
 *
 * Evolution is called synchronously and returns as soon as it accepts the message — it does not
 * confirm handset delivery. A success here means "handed to Evolution", not "read by the
 * client", so callers shouldn't describe it as confirmed delivery in the UI.
 *
 * Returns a result rather than throwing so callers can report a failed send without having to
 * distinguish transport errors from upstream rejections.
 */
export async function sendWhatsAppText(recipient: string, message: string): Promise<SendResult> {
  const config = readConfig();
  if (!config.apiKey) {
    return { success: false, error: "WhatsApp is not configured (missing Evolution API key)." };
  }
  if (!recipient) {
    return { success: false, error: "No recipient number." };
  }
  if (!message?.trim()) {
    return { success: false, error: "Message is empty." };
  }

  try {
    const response = await fetch(`${config.baseUrl}/message/sendText/${encodeURIComponent(config.instanceName)}`, {
      method: "POST",
      headers: {
        apikey: config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number: recipient, text: message }),
      // A WhatsApp send is a user-visible action; cap it so a hung upstream can't leave the
      // dialog spinning indefinitely.
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("[whatsapp] Evolution API rejected the send:", response.status, body);
      return {
        success: false,
        // Upstream bodies can be large HTML error pages; keep the toast readable.
        error: `WhatsApp send failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
      };
    }

    return { success: true };
  } catch (error) {
    const message_ = error instanceof Error ? error.message : "Unknown error";
    console.error("[whatsapp] send failed:", error);
    return { success: false, error: message_ };
  }
}

/**
 * A recipient as kra-tools' report routing stores it, ready for Evolution: a group JID or a
 * 254-number passes through; a WhatsApp group invite code / link (letters, no '@') is resolved to
 * the group's JID first — the same handling as kra-tools' EvolutionAPIDirectService.
 */
export async function resolveWhatsAppRecipient(recipient: string): Promise<string> {
  const value = (recipient || "").trim();
  if (!value || value.includes("@") || !/[a-zA-Z]/.test(value)) {
    // Bare numbers: 07XXXXXXXX / +254… -> 254XXXXXXXXX.
    const digits = value.replace(/\D/g, "");
    if (/^0\d{9}$/.test(digits)) return `254${digits.slice(1)}`;
    return value.includes("@") ? value : digits || value;
  }
  const config = readConfig();
  const code = value.replace("https://chat.whatsapp.com/", "");
  try {
    const response = await fetch(
      `${config.baseUrl}/group/inviteInfo/${encodeURIComponent(config.instanceName)}?inviteCode=${encodeURIComponent(code)}`,
      { headers: { apikey: config.apiKey }, signal: AbortSignal.timeout(15000) },
    );
    if (response.ok) {
      const info = await response.json();
      if (info?.id) return info.id;
    }
  } catch (error) {
    console.warn("[whatsapp] could not resolve group invite code:", error);
  }
  return value;
}

/**
 * Sends a document (PDF / Excel) via Evolution's sendMedia, as base64 — the same endpoint kra-tools
 * uses for slips and receipts. Returns a result rather than throwing, like sendWhatsAppText.
 */
export async function sendWhatsAppDocument(
  recipient: string,
  file: { base64: string; fileName: string; mimeType: string },
  caption?: string,
): Promise<SendResult> {
  const config = readConfig();
  if (!config.apiKey) return { success: false, error: "WhatsApp is not configured (missing Evolution API key)." };
  if (!recipient) return { success: false, error: "No recipient." };

  try {
    const number = await resolveWhatsAppRecipient(recipient);
    const response = await fetch(`${config.baseUrl}/message/sendMedia/${encodeURIComponent(config.instanceName)}`, {
      method: "POST",
      headers: { apikey: config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        number,
        mediatype: "document",
        mimetype: file.mimeType,
        media: file.base64,
        fileName: file.fileName,
        ...(caption ? { caption } : {}),
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("[whatsapp] Evolution API rejected the document:", response.status, body);
      return { success: false, error: `WhatsApp send failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}` };
    }
    return { success: true };
  } catch (error) {
    console.error("[whatsapp] document send failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
