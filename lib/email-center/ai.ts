import { GoogleGenerativeAI } from "@google/generative-ai"
import { generateWithFallback } from "@/lib/gemini"
import type { AiExtraction } from "./types"

const MAX_PDFS = 2
const MAX_PDF_BYTES = 8 * 1024 * 1024

const YMD = /^\d{4}-\d{2}-\d{2}$/
const cleanDate = (v: unknown) => (typeof v === "string" && YMD.test(v) ? v : null)
const cleanStr = (v: unknown, max = 1500) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null

export interface AiInput {
  mode: "kra_notice" | "bcl_reply"
  subject: string
  body: string
  senderEmail: string
  categoryKeys: string[]
  pdfs?: Array<{ filename: string; data: Buffer }>
}

// Extracts the Sheet1 fields from a KRA email (and its PDF letter, where the deadline / signing
// officer / requested documents usually live) or from BCL's reply. Returns null on any failure —
// callers treat that as "not sure" and route the email to Needs Review instead of guessing.
export async function extractWithAi(input: AiInput): Promise<AiExtraction | null> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY
  if (!apiKey) return null

  try {
    const genAI = new GoogleGenerativeAI(apiKey)

    const prompt =
      input.mode === "bcl_reply"
        ? `You read an email that BCL (a Kenyan accounting firm) SENT to the Kenya Revenue Authority.
Return JSON only:
{"contents":"<one or two sentences: what BCL asked or submitted>","promised_date":"<YYYY-MM-DD or null: the date BCL asked for / promised to deliver by, e.g. 'on or before 10.10.2026'>","confidence":<0-1>}
Dates in Kenya are day-first (10.10.2026 = 2026-10-10).

Subject: ${input.subject}
Body:
${input.body.slice(0, 5000)}`
        : `You read a Kenya Revenue Authority (KRA) email and any attached PDF letter for BCL, an accounting firm managing tax matters for client companies.
Categories: ${input.categoryKeys.join(", ")}
Return JSON only:
{
 "category_key":"<one of the categories, or null if unsure>",
 "notice_type":"<short human title of the notice>",
 "kra_pin":"<client KRA PIN like P052230924P or null>",
 "deadline_date":"<YYYY-MM-DD KRA gave BCL to respond/comply, or null>",
 "promised_date":null,
 "contents":"<1-2 sentence plain summary of what KRA wants: periods, taxes, records>",
 "signing_officer_name":"<officer who signed the letter or null>",
 "signing_officer_position":"<their position/department or null>",
 "requested_items":["<each document or action KRA requests>"],
 "approval":"<'approved' | 'rejected' if this email answers an extension/waiver request, else null>",
 "confidence":<0-1 how sure you are about category_key>
}
Dates in Kenya are day-first (04.09.2026 = 2026-09-04). If the letter says "within 14 days" compute the date from the email date only if the email date is stated; otherwise use null. Never invent values.

From: ${input.senderEmail}
Subject: ${input.subject}
Body:
${input.body.slice(0, 5000)}`

    const parts: any[] = [prompt]
    for (const pdf of (input.pdfs ?? []).slice(0, MAX_PDFS)) {
      if (pdf.data.length > MAX_PDF_BYTES) continue
      parts.push({ inlineData: { mimeType: "application/pdf", data: pdf.data.toString("base64") } })
    }

    const result = await generateWithFallback(genAI, parts, { responseMimeType: "application/json" })
    const text = result.response.text().trim().replace(/```json\n?|\n?```/g, "")
    const raw = JSON.parse(text)

    const category = cleanStr(raw.category_key, 60)
    return {
      category_key: category && input.categoryKeys.includes(category) ? category : null,
      notice_type: cleanStr(raw.notice_type, 200),
      kra_pin: cleanStr(raw.kra_pin, 20)?.toUpperCase() ?? null,
      deadline_date: cleanDate(raw.deadline_date),
      promised_date: cleanDate(raw.promised_date),
      contents: cleanStr(raw.contents),
      signing_officer_name: cleanStr(raw.signing_officer_name, 120),
      signing_officer_position: cleanStr(raw.signing_officer_position, 200),
      requested_items: Array.isArray(raw.requested_items)
        ? raw.requested_items.filter((x: unknown) => typeof x === "string").slice(0, 25)
        : [],
      approval: raw.approval === "approved" || raw.approval === "rejected" ? raw.approval : null,
      confidence:
        typeof raw.confidence === "number" ? Math.min(1, Math.max(0, raw.confidence)) : 0.5,
    }
  } catch (err) {
    console.error("[email-center/ai] extraction failed", err)
    return null
  }
}
