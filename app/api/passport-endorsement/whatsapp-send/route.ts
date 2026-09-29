import { NextRequest } from "next/server";
import { requireAppSession } from "@/lib/auth/session";
import { toAuthErrorResponse } from "@/lib/auth/errors";
import { ensurePermission } from "@/lib/auth/access-controls";
import { createServerSupabaseClient } from "@/lib/supabase";
import { sendWhatsAppText, isWhatsAppConfigured } from "@/lib/whatsapp/evolution";
import { resolveWhatsAppNumber, normalizeWhatsAppNumber, formatPhoneForDisplay } from "@/lib/registry/contact";
import { ok, badRequest, serverError } from "@/lib/utils/api";

// Sends the "ready for pickup" notification to the client over WhatsApp from the handling
// wizard. Mirrors the birthday tracker's /api/birthday-messages send path, but scoped to the
// passport module and permission-gated on passport_endorsement.view.
//
// The recipient is resolved here from the individual's registry record rather than accepted from
// the client. A client-supplied "to" number would let any authenticated user send messages to an
// arbitrary phone number through the BCL WhatsApp account. The dialog passes only an individual
// id, and this route reads the number of record — so what the staff member sees on screen is
// what actually gets dialled.
//
// Success means Evolution accepted the message, not that the handset received it; see
// sendWhatsAppText for why the two are different.
export async function POST(req: NextRequest) {
  try {
    const session = await requireAppSession(req);
    await ensurePermission(session.user, "passport_endorsement.view");

    const { individualId, message } = (await req.json().catch(() => ({}))) as {
      individualId?: unknown;
      message?: unknown;
    };

    const id = typeof individualId === "string" || typeof individualId === "number" ? String(individualId) : "";
    const text = typeof message === "string" ? message.trim() : "";

    if (!id) return badRequest("individualId is required.");
    if (!text) return badRequest("Message is required.");

    if (!isWhatsAppConfigured()) {
      return badRequest("WhatsApp is not configured. Set the Evolution API environment variables.");
    }

    const supabase = createServerSupabaseClient();
    const { data: individual, error } = await supabase
      .from("registry_individuals")
      .select("id, full_name, contact_details")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!individual) return badRequest("Client not found.");

    const stored = resolveWhatsAppNumber(individual.contact_details);
    const recipient = normalizeWhatsAppNumber(stored);

    if (!stored) {
      return badRequest(`No WhatsApp number on file for ${individual.full_name || "this client"}. Add one before sending.`);
    }
    if (!recipient) {
      // Surface what we actually read — the registry holds hand-entered numbers, and "020
      // 12345" style entries are the usual cause.
      return badRequest(`"${stored}" isn't a number WhatsApp can use. Correct it on the client's profile.`);
    }

    const result = await sendWhatsAppText(recipient, text);
    if (!result.success) {
      return badRequest(result.error || "WhatsApp send failed.");
    }

    return ok({
      sentTo: recipient,
      sentToDisplay: formatPhoneForDisplay(recipient),
      recipientName: individual.full_name || null,
    });
  } catch (err) {
    const authResponse = toAuthErrorResponse(err);
    if (authResponse) return authResponse;
    return serverError(err);
  }
}
