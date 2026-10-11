// EFNS auto-filing, the server half: matches an EFNS notification / payment invoice to a task's
// job level + individual, then files its PDF as the matching stage document — the link this app
// cares about (Immigration Notifications ↔ Stages Management ↔ Tasks).
//
// The shared client-safe types/labels live in lib/efnsFiling.ts so the notifications page can
// render filing status without importing this server-only module. The DB shape is documented in
// supabase/migrations/20261015000000_efns_auto_filing.sql.
//
// Filing does, in one call:
//   1. resolves the task's department stage (explicit stageId on manual links)
//   2. downloads the source PDF from the `immigration` bucket
//   3. uploads it into `kyc-documents` under the individual + document type
//   4. inserts the acc_portal_directors_documents row
//   5. links it onto the task (tm_tasks.stages[stage] + source_document_id[stage]) and advances
//      the task status through the same stage ladder StageUploadDialog uses
//   6. records the whole link back on the item's filing_status / filing / filed_at columns

import "server-only"
import { createServerSupabaseClient } from "@/lib/supabase"
import {
  IMMIGRATION_BUCKET,
  immigrationPdfPath,
  paymentPermitGroup,
  shortNotifStatus,
  type ItemKind,
} from "@/lib/immigrationNotifications"
import type { EfnsFilingRecord, EfnsFilingStatus, EfnsMatchedBy } from "@/lib/efnsFiling"
import { efnsTriggerMatches, isEfnsTriggerSet } from "@/lib/efnsFiling"

export type { EfnsFilingRecord, EfnsMatchedBy }

type SupabaseClientLike = ReturnType<typeof createServerSupabaseClient>

// Same ladder DepartmentTasksManager uses to decide "these stages are done for good" — a task that
// already left the pipeline shouldn't keep matching new EFNS items.
export const EFNS_TERMINAL_STATUSES = ["write_up_completed", "endorsed", "completed", "archived", "cancel"]

// A task is still in play if it has no status yet or hasn't reached a terminal one. Matches are
// returned regardless (see is_terminal on the candidate) so a completed task stays linkable by
// hand; only the auto-filing job screens terminal ones out.
const isTerminalStatus = (status: unknown): boolean =>
  status != null && EFNS_TERMINAL_STATUSES.includes(String(status))

// ── stage → task-status mapping, mirrored from tasks/utils/taskManagerData.ts ──────────────
// Kept here (rather than imported) because that module imports the client supabase singleton and
// must not be pulled into a server bundle. See computeAdvancedTaskStatus there for the source of
// truth; STAGE_STATUS_MAPPING / STATUS_PRIORITY must stay in lock-step.
const EFNS_STAGE_STATUS_MAPPING: Record<string, string> = {
  "a19b270e-6d1e-4e6d-b2bc-f21db72cde08": "in_progress",
  "072b9710-45df-4a05-ba65-01b4ef29d61d": "write_up_completed",
  "6625f6d2-8017-4bf4-96c2-85335703164c": "endorsed",
  "caefd742-5de5-4341-a3bb-81d7b9dd2b73": "endorsed",
}
const EFNS_STATUS_PRIORITY: Record<string, number> = {
  pending: 0,
  new: 0,
  enquiry: 0,
  in_progress: 1,
  write_up_completed: 2,
  endorsed: 3,
}
const normalizeTaskStatus = (s: string | null | undefined): string => {
  if (!s) return "pending"
  return s.toLowerCase().trim().replace(/[\s-]/g, "_")
}
const computeAdvancedTaskStatus = (currentStatusRaw: string | null | undefined, stageId: string): string | null => {
  const potentialNewStatus = EFNS_STAGE_STATUS_MAPPING[stageId]
  if (!potentialNewStatus) return null
  const currentPriority = EFNS_STATUS_PRIORITY[normalizeTaskStatus(currentStatusRaw)] ?? 0
  const newPriority = EFNS_STATUS_PRIORITY[potentialNewStatus] ?? 0
  return newPriority > currentPriority ? potentialNewStatus : null
}

// ── helpers ───────────────────────────────────────────────────────────────────────────────

const normalizeText = (v: unknown): string => String(v ?? "").trim().toLowerCase()

const fetchTask = async (sb: SupabaseClientLike, taskId: number | string) => {
  const { data, error } = await sb.from("tm_tasks").select("*").eq("id", taskId).single()
  if (error || !data) throw new Error(error?.message || `Task ${taskId} not found`)
  return data
}

const fetchDepartmentStages = async (sb: SupabaseClientLike, departmentId: number | string | null | undefined) => {
  if (departmentId == null || departmentId === "") return []
  const { data, error } = await sb
    .from("tm_departments")
    .select("id, name, stages")
    .eq("id", departmentId)
    .single()
  if (error || !data) return []
  return (data.stages || []) as any[]
}

const fetchKycDisplayName = async (sb: SupabaseClientLike, kycId: string | undefined): Promise<string> => {
  if (!kycId) return "Document"
  const { data } = await sb
    .from("acc_portal_kyc")
    .select("display_name, name")
    .eq("id", kycId)
    .single()
  return (data as { display_name?: string; name?: string } | null)?.display_name
    || (data as { display_name?: string; name?: string } | null)?.name
    || "Document"
}

// ── candidate tasks for the manual link dialog ───────────────────────────────────────────

export interface EfnsCandidateTask {
  id: number
  applicant_name: string | null
  r_number: string | null
  company_name?: string | null
  individual_id: number | null
  department_id: number | null
  subdepartment_id: number | null
  class_id: string | null
  subclass_id: string | null
  status: string
  // True for tasks that already left the pipeline (write_up_completed / endorsed / …). They're
  // still offered as matches (the manual dialog can link a late-arriving document), but ranked
  // after open tasks and never auto-filed.
  is_terminal?: boolean
  job_level: any
}

// tm_tasks has no company_name column — company lives in the companies table (by company_id) or in
// the company_details JSONB, which is why only applicant_name / principal_member_name are matched
// and the dialog's company line is best-effort.
const CANDIDATE_SELECT =
  "id, applicant_name, r_number, principal_member_name, company_details, individual_id, department_id, subdepartment_id, class_id, subclass_id, status, job_level"

const taskCompanyName = (row: any): string | null => {
  const details = row?.company_details && typeof row.company_details === "object" ? row.company_details : null
  return (details?.company_name || details?.name || null) as string | null
}

// ── fuzzy name matching ──────────────────────────────────────────────────────────────────────
// The portal's printable name and the registry's task applicant_name are rarely identical ("MR
// JAIN S Sameer" vs "SAMEER JAINI" vs "Jain Sameer Singh"), so a bare ilike drops matches. We
// normalise both sides and score them with token coverage + a Sørensen–Dice coefficient over the
// space-stripped names, then keep only rows that clear a two-part gate.

// The portal often prints "COMPANY PVT LTD (APPLICANT)" or "Date Generated:... (APPLICANT)" — the
// real person is the (usually last) parenthesised segment; matching the raw string would pull
// company/date noise into the token filter.
const extractApplicantName = (raw: unknown): string => {
  const text = String(raw ?? "")
  const groups = text.match(/\(([^)]+)\)/g)
  if (groups && groups.length > 0) {
    const inner = groups[groups.length - 1].replace(/^\(|\)$/g, "").trim()
    if (inner) return inner
  }
  return text.trim()
}

// Lowercase, drop honorifics and punctuation, collapse whitespace.
const NAME_HONORIFICS = /\b(mr|mrs|ms|miss|m\/s|m\.?s|dr|sir|madam|eng|engr)\.?\s*/gi
const normalizeName = (v: unknown): string =>
  String(v ?? "")
    .toLowerCase()
    .replace(NAME_HONORIFICS, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const nameTokens = (n: string): string[] => (n ? n.split(" ") : [])

// Numeric ("2026", "29") and single-letter ("s") tokens carry no identity — drop them so the ilike
// filter and the coverage score aren't diluted by dates or initials.
const isNoiseToken = (t: string): boolean => t.length < 2 || /\d/.test(t)
const identityTokens = (n: string): string[] => nameTokens(n).filter((t) => !isNoiseToken(t))

const bigrams = (s: string): Set<string> => {
  const out = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
  return out
}

// Sørensen–Dice coefficient on the bigrams of two strings.
const dice = (a: string, b: string): number => {
  const sa = bigrams(a)
  const sb = bigrams(b)
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const g of sa) if (sb.has(g)) inter++
  return (2 * inter) / (sa.size + sb.size)
}

// 0 when the pair is not plausibly the same person, otherwise a [0,1] score for ranking. Two gates,
// both tuned against real portal/registry pairs: a surname alone ("PATEL RAJNIKANT" vs "PATEL
// DINESH", or two different JUNEJAs) must NOT match, while a reordered or typoed full name must.
//   - token coverage >= 0.6 with >= 2 shared tokens  → reordered / extra-suffix names
//   - coverage >= 0.5 AND dice >= 0.62               → typos / abbreviations ("JAINY" ≈ "JAINI")
const nameMatchScore = (query: string, candidate: string): number => {
  const nq = normalizeName(query)
  const nc = normalizeName(candidate)
  if (!nq || !nc) return 0
  if (nq === nc) return 1
  // One name fully inside the other ("JAIN SAMEER" in "JAIN SAMEER KUMAR") — but only when the
  // contained side is substantial, so a single shared surname ("patel") doesn't win on its own.
  if (nq.includes(nc) || nc.includes(nq)) {
    const shorter = nq.length <= nc.length ? nq : nc
    if (identityTokens(shorter).length >= 2 || shorter.replace(/\s/g, "").length >= 6) return 0.9
  }

  const tq = identityTokens(nq)
  const tc = identityTokens(nc)
  const shared = tq.filter((t) => tc.includes(t)).length
  const coverage = shared / Math.max(1, Math.min(tq.length, tc.length))
  const tokenScore = tq.length + tc.length > 0 ? (2 * shared) / (tq.length + tc.length) : 0
  const diceScore = dice(nq.replace(/\s/g, ""), nc.replace(/\s/g, ""))

  const accepted = (shared >= 2 && coverage >= 0.6) || (coverage >= 0.5 && diceScore >= 0.62)
  return accepted ? Math.max(tokenScore, diceScore) : 0
}

// Rows scoring 0 are "no match"; anything above is returned, ranked.
const NAME_SCORE_MIN = 0.01

// The broad ilike filter: any of the query's identity tokens appearing in applicant_name or
// principal_member_name (the person the task is filed against), so the fuzzy scorer only ranks
// plausibly-related rows.
const tokenOrFilter = (normalized: string): string =>
  identityTokens(normalized)
    .slice(0, 6)
    .map((t) => `applicant_name.ilike.%${t}%,principal_member_name.ilike.%${t}%`)
    .join(",")

/**
 * Tasks that look like the item's applicant, open ones ranked first. Tries an exact r_number hit
 * first (the strongest signal — the file number the portal printed vs. the registry's R-number),
 * then a fuzzy name match: rows where any identity token appears are ranked by nameMatchScore (vs
 * the applicant and, when present, the company), keeping only rows above the gate. Terminal-status
 * matches are included but sorted last (and flagged `is_terminal`). Both callers use this: the
 * manual dialog lists the results, the auto-job files onto an open one or falls back to no_match.
 */
export async function suggestEfnsTasks(input: {
  fileNumber?: string | null
  applicant?: string | null
  company?: string | null
  query?: string | null
  limit?: number
}): Promise<EfnsCandidateTask[]> {
  const sb = createServerSupabaseClient()
  const limit = input.limit || 25
  const fileNumber = normalizeText(input.fileNumber)

  const withCompany = (rows: any[]) =>
    rows.map((row) => ({
      ...(row as Record<string, unknown>),
      company_name: taskCompanyName(row),
      is_terminal: isTerminalStatus(row.status),
    })) as EfnsCandidateTask[]

  if (fileNumber) {
    // Case-insensitive exact R-number — the portal's printed file number vs. the registry's.
    const { data, error } = await sb
      .from("tm_tasks")
      .select(CANDIDATE_SELECT)
      .ilike("r_number", fileNumber)
      .limit(limit)
    if (!error && data && data.length > 0) {
      const openFirst = [...data].sort((a: any, b: any) => Number(isTerminalStatus(a.status)) - Number(isTerminalStatus(b.status)))
      return withCompany(openFirst)
    }
  }

  const applicantName = extractApplicantName(input.applicant || input.query || "")
  const normalized = normalizeName(applicantName)
  if (!normalized || identityTokens(normalized).length === 0) return []

  // One .or() only (two chained .or() calls produce duplicate `or=` params that PostgREST may drop);
  // the terminal/open ordering happens in JS — every row already carries `status`.
  const { data, error } = await sb
    .from("tm_tasks")
    .select(CANDIDATE_SELECT)
    .or(tokenOrFilter(normalized))
    .limit(300)
  if (error) return []

  const company = normalizeName(input.company)
  const candidates = (data || []) as any[]
  const scored = candidates
    .map((row: any): { score: number; row: any } => ({
      score: Math.max(
        nameMatchScore(applicantName, row.applicant_name || ""),
        nameMatchScore(applicantName, row.principal_member_name || ""),
        company ? nameMatchScore(company, taskCompanyName(row) || "") : 0,
      ),
      row,
    }))
    .filter((entry: { score: number; row: any }) => entry.score >= NAME_SCORE_MIN)
    // Open tasks before terminal ones, then best score first.
    .sort(
      (a: { score: number; row: any }, b: { score: number; row: any }) =>
        Number(isTerminalStatus(a.row.status)) - Number(isTerminalStatus(b.row.status)) || b.score - a.score,
    )

  return withCompany(scored.slice(0, limit).map((entry) => entry.row))
}

/** The stages (with their configured documents) a task could take an EFNS filing on. */
export async function linkStagesForTask(taskId: number | string): Promise<{
  task: EfnsCandidateTask | null
  stages: Array<{
    stageId: string
    stageName: string
    orderNum: number
    documents: Array<{ kycId: string; name: string; isRequired?: boolean }>
  }>
}> {
  const sb = createServerSupabaseClient()
  try {
    const task = await fetchTask(sb, taskId)
    const departmentId = task.job_level?.department_id ?? task.department_id
    const stages = await fetchDepartmentStages(sb, departmentId)
    const result = stages
      .filter((s: any) => Array.isArray(s.documents) && s.documents.length > 0)
      .sort((a: any, b: any) => (a.order_num || 0) - (b.order_num || 0))
      .map((s: any) => ({
        stageId: s.id,
        stageName: s.name || "Untitled stage",
        orderNum: s.order_num || 0,
        documents: (s.documents as any[])
          .filter((d: any) => !!d.kycId)
          .map((d: any) => ({ kycId: d.kycId, name: d.name || "Document", isRequired: d.isRequired })),
      }))
    return {
      task: {
        id: task.id,
        applicant_name: task.applicant_name ?? null,
        r_number: task.r_number ?? null,
        company_name: taskCompanyName(task),
        individual_id: task.individual_id ?? null,
        department_id: task.department_id ?? task.job_level?.department_id ?? null,
        subdepartment_id: task.subdepartment_id ?? task.job_level?.subdepartment_id ?? null,
        class_id: task.class_id ?? task.job_level?.class_id ?? null,
        subclass_id: task.subclass_id ?? task.job_level?.subclass_id ?? null,
        status: task.status || "",
        job_level: task.job_level ?? null,
      },
      stages: result,
    }
  } catch {
    return { task: null, stages: [] }
  }
}

// ── filing ────────────────────────────────────────────────────────────────────────────────

export interface FileEfnsItemInput {
  kind: ItemKind
  id: number
  taskId: number | string
  stageId?: string
  kycId?: string
  matchedBy: EfnsMatchedBy
  byId?: string | null
}

export interface FileEfnsItemResult {
  success: boolean
  filing: EfnsFilingRecord
  documentId?: number
  error?: string
}

/**
 * Files one EFNS item as the given task's stage document, against the task's individual, and
 * records the link on the item. `stageId` (+ optional `kycId`) selects the stage/document — manual
 * links pass the exact stage the user picked; the auto-job pre-resolves it from the stage's EFNS
 * trigger. When only `kycId` is missing and the stage has exactly one configured document, that
 * document is used.
 */
export async function fileEfnsItem(input: FileEfnsItemInput): Promise<FileEfnsItemResult> {
  const sb = createServerSupabaseClient()
  const table = input.kind === "notification" ? "immigration_notifications" : "immigration_payments"
  const now = new Date().toISOString()

  const recordError = async (filing: EfnsFilingRecord, error: string): Promise<FileEfnsItemResult> => {
    // PostgREST builders are thenables (`.then`) but don't reliably expose `.catch`, so swallow with
    // the two-arg form instead.
    await sb
      .from(table)
      .update({ filing_status: "error", filing: { ...filing, error }, filed_at: now })
      .eq("id", input.id)
      .then(
        () => {},
        () => {},
      )
    return { success: false, filing: { ...filing, error }, error }
  }

  let baseFiling: EfnsFilingRecord = {
    task_id: input.taskId,
    stage_id: input.stageId ?? "",
    matched_by: input.matchedBy,
    by_id: input.byId || null,
  }

  try {
    if (!input.stageId) return recordError(baseFiling, "stageId is required to file an item")

    const { data: itemRow, error: itemErr } = await sb.from(table).select("*").eq("id", input.id).single()
    if (itemErr || !itemRow) return recordError(baseFiling, itemErr?.message || `Item ${input.kind} ${input.id} not found`)

    const task = await fetchTask(sb, input.taskId)

    const individualId = task.individual_id ?? null
    if (!individualId) {
      return recordError(baseFiling, "Task has no individual to file the document against")
    }

    // Resolve the stage + document config.
    const departmentId = task.job_level?.department_id ?? task.department_id
    const stages = await fetchDepartmentStages(sb, departmentId)
    const stage = stages.find((s: any) => String(s.id) === String(input.stageId))
    if (!stage) return recordError(baseFiling, "Selected stage was not found in the task's department")

    let kycId = input.kycId
    if (!kycId) {
      const docs = (stage.documents || []).filter((d: any) => !!d.kycId)
      if (docs.length !== 1) {
        return recordError({ ...baseFiling, stage_name: stage.name || "" }, "Stage does not resolve to exactly one document — pass kycId explicitly")
      }
      kycId = docs[0].kycId
    }
    const stageName = stage.name || ""

    baseFiling = { ...baseFiling, stage_name: stageName, kyc_document_id: kycId, individual_id: individualId }

    // Download the source PDF.
    const pdfName = input.kind === "notification" ? itemRow.pdf_file_name : itemRow.payment_instructions_file_name
    const pdfPath = immigrationPdfPath(input.kind, pdfName)
    if (!pdfPath) return recordError(baseFiling, "Item has no PDF to file")
    const { data: blob, error: dlErr } = await sb.storage.from(IMMIGRATION_BUCKET).download(pdfPath)
    if (dlErr || !blob) return recordError(baseFiling, `Could not download source PDF: ${dlErr?.message ?? "unknown error"}`)

    // Upload into the task's own document store, same naming scheme StageUploadDialog uses.
    const safeName = String(pdfName || "efns.pdf")
      .replace(/[~`!@#$%^&*()+=\[\]{};':"\\|,<>\/?]/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_+|_+$/g, "")
    const filePath = `individual-documents/${individualId}/${kycId}/${safeName || "efns.pdf"}`
    const { error: upErr } = await sb.storage.from("kyc-documents").upload(filePath, blob, {
      upsert: true,
      cacheControl: "3600",
      contentType: "application/pdf",
    })
    if (upErr) return recordError(baseFiling, `Failed to store PDF: ${upErr.message}`)

    // Insert the document row.
    const { data: docRow, error: insErr } = await sb
      .from("acc_portal_directors_documents")
      .insert({
        director_id: individualId,
        document_id: kycId,
        file_path: filePath,
        status: "active",
        created_at: now,
        updated_at: now,
        uploaded_by: input.byId ?? null,
      })
      .select()
      .single()
    if (insErr || !docRow) return recordError(baseFiling, `Failed to create document row: ${insErr?.message ?? "unknown error"}`)

    // Link onto the task (mirrors buildStageLinkUpdate in tasks/utils/taskManagerData.ts).
    const docDisplayName = await fetchKycDisplayName(sb, kycId)
    const existingStageDocs = { ...(task.stages?.[input.stageId]?.documents || {}) }
    existingStageDocs[String(docRow.id)] = {
      id: docRow.id,
      document_id: kycId,
      name: docDisplayName,
      linked_at: now,
      status: "linked",
      linked_document_id: docRow.id,
      uploaded_by_id: input.byId ?? null,
    }
    const updatedStageEntry = {
      ...task.stages?.[input.stageId],
      status: "completed",
      date: now.split("T")[0],
      completedAt: now,
      documentsUploaded: Object.keys(existingStageDocs).length,
      lastUpdated: now,
      uploaded_by_id: input.byId ?? null,
      documents: existingStageDocs,
    }
    const existingSourceDocs: any[] = Array.isArray(task.source_document_id?.[input.stageId])
      ? task.source_document_id[input.stageId]
      : []
    const sourceDocsForStage = [
      ...existingSourceDocs.filter((d: any) => String(d.document_id) !== String(kycId)),
      { id: docRow.id, document_id: kycId, linked_at: now, status: "linked", linked_document_id: docRow.id },
    ]
    const taskUpdate: Record<string, any> = {
      stages: { ...task.stages, [input.stageId]: updatedStageEntry },
      source_document_id: { ...task.source_document_id, [input.stageId]: sourceDocsForStage },
      updated_at: now,
    }
    if (input.byId) taskUpdate.updated_by_id = input.byId
    const advancedStatus = computeAdvancedTaskStatus(task.status, input.stageId)
    if (advancedStatus) taskUpdate.status = advancedStatus

    const { error: taskUpdErr } = await sb.from("tm_tasks").update(taskUpdate).eq("id", task.id)
    if (taskUpdErr) return recordError(baseFiling, `Failed to update task: ${taskUpdErr.message}`)

    // Record the link on the item.
    const filing: EfnsFilingRecord = {
      task_id: task.id,
      stage_id: input.stageId,
      stage_name: stageName,
      kyc_document_id: kycId,
      document_id: docRow.id,
      individual_id: individualId,
      job_level: task.job_level ?? null,
      matched_by: input.matchedBy,
      by_id: input.byId || null,
    }
    const { error: filingErr } = await sb
      .from(table)
      .update({ filing_status: "filed", filing, filed_at: now })
      .eq("id", input.id)
    if (filingErr) return recordError({ ...baseFiling, task_id: task.id }, `Failed to record filing: ${filingErr.message}`)

    return { success: true, filing, documentId: docRow.id }
  } catch (e: any) {
    return recordError(baseFiling, e?.message || "Unknown filing error")
  }
}

// ── auto-filing job ────────────────────────────────────────────────────────────────────────
// Files every item that hasn't been looked at yet (or that failed last time): match the item to a
// task, resolve the stage/document from that stage's EFNS trigger, and file. "Run filing" on the
// Immigration Notifications page calls this.

export interface EfnsJobOptions {
  /** Max items to consider in one run (default 50). */
  limit?: number
  /** Re-run just these items (manual retry); when omitted, every unlooked-at / errored item. */
  ids?: Array<{ kind: ItemKind; id: number }>
  /** Session user recorded as the filer. */
  byId?: string | null
}

export interface EfnsJobItemResult {
  kind: ItemKind
  id: number
  name: string
  status: EfnsFilingStatus
  taskId?: number | string
  stageName?: string
  error?: string
}

export interface EfnsJobResult {
  success: boolean
  processed: number
  filed: number
  results: EfnsJobItemResult[]
}

// The permit group + status an item presents, using the same rules the notifications page and the
// stage-trigger picker use — so a rule configured in Stages Management matches the same item here.
const itemPermitGroupAndStatus = (kind: ItemKind, row: any): { permitGroup: string; status: string } => {
  if (kind === "notification") {
    const rawType = String(row.permit_type || row.case_type || "").trim()
    return {
      permitGroup: rawType ? rawType.toUpperCase() : "NOTIFICATION",
      status: shortNotifStatus(String(row.message || "")),
    }
  }
  const category = String(row.application_category || row.application_name || "").trim()
  return {
    permitGroup: paymentPermitGroup(category),
    status: String(row.invoice_status || "Not Paid").toUpperCase(),
  }
}

const itemApplicantName = (kind: ItemKind, row: any): string =>
  String(row.printable_applicant || (kind === "notification" ? row.name : row.applicant_name) || "").trim()

export async function runEfnsFilingJob(options: EfnsJobOptions = {}): Promise<EfnsJobResult> {
  const sb = createServerSupabaseClient()
  const limit = options.limit && options.limit > 0 ? options.limit : 50
  const results: EfnsJobItemResult[] = []

  const targets: Array<{ kind: ItemKind; row: any }> = []
  if (options.ids?.length) {
    for (const { kind, id } of options.ids.slice(0, limit)) {
      const table = kind === "notification" ? "immigration_notifications" : "immigration_payments"
      const { data } = await sb.from(table).select("*").eq("id", id).maybeSingle()
      if (data) targets.push({ kind, row: data })
    }
  } else {
    // Unlooked-at (null) or previously failed (error) items, newest first.
    for (const kind of ["notification", "payment"] as ItemKind[]) {
      const table = kind === "notification" ? "immigration_notifications" : "immigration_payments"
      const { data, error } = await sb
        .from(table)
        .select("*")
        .or("filing_status.is.null,filing_status.eq.error")
        .order("created_at", { ascending: false })
        .limit(limit)
      if (!error && data) for (const row of data) targets.push({ kind, row })
    }
  }

  for (const { kind, row } of targets.slice(0, limit)) {
    results.push(await processEfnsItem(sb, kind, row, options.byId ?? null))
  }

  return {
    success: true,
    processed: results.length,
    filed: results.filter((r) => r.status === "filed").length,
    results,
  }
}

const processEfnsItem = async (
  sb: SupabaseClientLike,
  kind: ItemKind,
  row: any,
  byId: string | null,
): Promise<EfnsJobItemResult> => {
  const table = kind === "notification" ? "immigration_notifications" : "immigration_payments"
  const id = Number(row.id)
  const name = itemApplicantName(kind, row) || `#${id}`
  const { permitGroup, status } = itemPermitGroupAndStatus(kind, row)

  const writeOutcome = async (
    outcome: EfnsFilingStatus,
    filing: EfnsFilingRecord,
    extra: Partial<EfnsJobItemResult> = {},
  ): Promise<EfnsJobItemResult> => {
    const { error } = await sb
      .from(table)
      .update({ filing_status: outcome, filing, filed_at: new Date().toISOString() })
      .eq("id", id)
    return { kind, id, name, status: outcome, ...extra, error: error?.message || extra.error }
  }

  try {
    const suggestions = await suggestEfnsTasks({
      fileNumber: row.file_number ?? null,
      applicant: itemApplicantName(kind, row) || null,
      company: row.printable_company ?? null,
    })
    const matchedBy: EfnsMatchedBy = row.file_number ? "file_number" : "name"

    // Only open tasks can be auto-filed — a completed task may still be the right person (it's kept
    // as a candidate so the "Needs a task" list shows it for a manual link) but never receives an
    // automatic filing.
    const candidates = suggestions.map((t) => ({ id: t.id, applicant_name: t.applicant_name, r_number: t.r_number }))
    const open = suggestions.filter((t) => !t.is_terminal)

    if (open.length === 0) {
      return writeOutcome("no_match", { task_id: 0, stage_id: "", matched_by: matchedBy, candidates })
    }
    if (open.length > 1) {
      return writeOutcome("ambiguous", {
        task_id: 0,
        stage_id: "",
        matched_by: matchedBy,
        candidates: open.map((t) => ({ id: t.id, applicant_name: t.applicant_name, r_number: t.r_number })),
      })
    }

    const task = open[0]
    const departmentId = task.job_level?.department_id ?? task.department_id
    const stages = await fetchDepartmentStages(sb, departmentId)
    const matches: Array<{ stageId: string; stageName: string; kycId: string }> = []
    for (const stage of stages) {
      for (const doc of (stage.documents || [])) {
        if (doc?.kycId && isEfnsTriggerSet(doc.efnsTrigger) && efnsTriggerMatches(doc.efnsTrigger, permitGroup, status)) {
          matches.push({ stageId: stage.id, stageName: stage.name || "", kycId: doc.kycId })
        }
      }
    }

    if (matches.length === 0) {
      return writeOutcome("no_rule", { task_id: task.id, stage_id: "", matched_by: matchedBy })
    }
    if (matches.length > 1) {
      return writeOutcome("ambiguous", {
        task_id: task.id,
        stage_id: "",
        matched_by: matchedBy,
        candidates: [{ id: task.id, applicant_name: task.applicant_name, r_number: task.r_number }],
      })
    }

    const match = matches[0]
    const filed = await fileEfnsItem({
      kind,
      id,
      taskId: task.id,
      stageId: match.stageId,
      kycId: match.kycId,
      matchedBy,
      byId,
    })
    return {
      kind,
      id,
      name,
      status: filed.success ? "filed" : "error",
      taskId: task.id,
      stageName: match.stageName,
      error: filed.error,
    }
  } catch (e: any) {
    return { kind, id, name, status: "error", error: e?.message || "Auto-filing failed" }
  }
}