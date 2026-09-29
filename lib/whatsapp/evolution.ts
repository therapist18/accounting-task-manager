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
