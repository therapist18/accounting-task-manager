// Contact resolution for registry_individuals.
//
// The registry's contact_details column is inconsistent by nature: it is sometimes a bare object
// and sometimes an array wrapped in one, and different records populate different shapes — a
// nested one (phone.kenyan.primary / phone.whatsapp / email.primary) and a set of flat duplicate
// keys (primary_phone_kenya / whatsapp_number / primary_email). Some records also carry a stray
// numeric "0" key, which is what you get when an array has been JSON.stringify'd into an object
// and then spread as a plain object. Rather than normalise ~1700 historical rows, resolve by
// trying each known key in priority order and fall back through the rest.
//
// This module is safe to import from both server and client code — it holds no credentials.

export type ContactDetails = Record<string, any> | null | undefined;

/** Unwrap the array-or-object variance into a single plain object. */
export function normalizeContactDetails(raw: unknown): Record<string, any> {
  if (!raw) return {};
  let value: any = raw;
  if (Array.isArray(value)) value = value[0];
  if (typeof value !== "object" || value === null) return {};
  return value as Record<string, any>;
}

function firstString(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

/**
 * The number to use for WhatsApp, in priority order.
 *
 * phone.whatsapp leads because it is the field the registry means specifically for WhatsApp;
 * kenyan.primary is the general mobile number and is the next best thing to message. The flat
 * keys are last-resort fallbacks for records that never got migrated to the nested shape.
 */
export function resolveWhatsAppNumber(raw: unknown): string {
  const contact = normalizeContactDetails(raw);
  const phone = contact.phone ?? {};
  return firstString(
    phone.whatsapp,
    contact.whatsapp_number,
    contact.broadcast_whatsapp_number,
    phone.kenyan?.primary,
    phone.kenyan?.secondary,
    contact.primary_phone_kenya,
    contact.secondary_phone_kenya,
    phone.abroad?.primary,
    contact.primary_phone_abroad
  );
}

/** The general mobile number, used for display and for the "call" option. */
export function resolvePrimaryPhone(raw: unknown): string {
  const contact = normalizeContactDetails(raw);
  const phone = contact.phone ?? {};
  return firstString(
    phone.kenyan?.primary,
    contact.primary_phone_kenya,
    phone.whatsapp,
    contact.whatsapp_number,
    phone.abroad?.primary,
    contact.primary_phone_abroad
  );
}

export function resolveEmail(raw: unknown): string {
  const contact = normalizeContactDetails(raw);
  const email = contact.email;
  return firstString(
    typeof email === "string" ? email : email?.primary,
    contact.primary_email,
    contact.alternative_email
  );
}

/**
 * Normalise a Kenya number to the bare international form Evolution expects (2547XXXXXXXX — no
 * "+", no separators). Returns "" when the input can't be interpreted, so callers must check for
 * an empty result rather than sending a malformed number.
 */
export function normalizeWhatsAppNumber(input: string): string {
  if (!input) return "";

  // Group JIDs are passed through untouched; they aren't phone numbers.
  if (input.includes("@g.us") || input.includes("@s.whatsapp.net")) return input;

  let digits = input.replace(/[^\d]/g, "");
  if (!digits) return "";

  // Strip a leading 00 international prefix.
  if (digits.startsWith("00")) digits = digits.slice(2);

  // 254... already carries the country code. Guard the length so a stray local number starting
  // with "254" isn't silently accepted as if it were international, and apply the same mobile
  // prefix check as the local branch so a 2542... landline is rejected too.
  if (digits.startsWith("254") && digits.length === 12) {
    const local = digits.slice(3);
    if (local.startsWith("7") || local.startsWith("1")) return digits;
    return "";
  }

  // 07... / 01... — a local Kenyan number; 0 is the national trunk prefix. The 9 digits that
  // follow must be a valid mobile prefix (7 or 1); anything else is a landline (020 Nairobi,
  // 011 fixed line) that WhatsApp can't message, so reject rather than send a bogus 2542... .
  if (digits.startsWith("0")) {
    const local = digits.slice(1);
    if (local.length === 9 && (local.startsWith("7") || local.startsWith("1"))) return `254${local}`;
    return "";
  }

  // 7... / 1... — local number with the trunk prefix already dropped.
  if (digits.length === 9 && (digits.startsWith("7") || digits.startsWith("1"))) {
    return `254${digits}`;
  }

  // Anything else that looks like a full international number, keep as-is.
  if (digits.length >= 11) return digits;

  return "";
}

/** Human-readable rendering of a stored number, e.g. "+254 712 345 678". */
export function formatPhoneForDisplay(input: string): string {
  const raw = (input || "").trim();
  if (!raw) return "";

  // Strip everything but digits and a leading +, then rebuild in the standard grouping.
  const hasPlus = raw.startsWith("+");
  let digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 9 && (digits.startsWith("7") || digits.startsWith("1"))) digits = `0${digits}`;
  if (digits.startsWith("00")) digits = `0${digits.slice(2)}`;

  let out = digits;
  if (digits.startsWith("254") && digits.length === 12) {
    out = `0${digits.slice(3)}`;
  } else if (digits.startsWith("+254") || digits.startsWith("0254")) {
    out = digits.slice(digits.length - 9);
  }

  const local = out.replace(/^0/, "");
  if (local.length !== 9) return hasPlus ? raw : out;

  // 3-3-3 over the 9 national digits, e.g. 0712 345 678 -> 071 234 5678.
  return `0${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 9)}`;
}
