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
  parseApplicant,
  paymentPermitGroup,
  shortNotifStatus,
  type ItemKind,
  type ParsedApplicant,
} from "@/lib/immigrationNotifications"
import type { EfnsFilingRecord, EfnsFilingStatus, EfnsMatchedBy } from "@/lib/efnsFiling"
import { fillEfnsDocumentFields } from "@/lib/efnsDocumentFields.server"
import { efnsTriggerMatches, IMMIGRATION_DEPARTMENT_ID, isEfnsTriggerSet, itemJobLevels, type EfnsJobLevel } from "@/lib/efnsFiling"
// The same "is this stage N/A for this task's job level / class" rule the task tables use.
import { isStageApplicableToTask } from "@/app/(dashboard)/dashboard/reports/utils/reportStageLogic"

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

const fetchDepartmentStages = async (sb: SupabaseClientLike, departmentId: number | string | null | undefined) =>
  (await fetchDepartment(sb, departmentId)).stages

/**
 * A department's stages plus the department (with its job levels) in the shape isStageApplicableToTask
 * expects, so callers can drop stages that are N/A for a task's job level / class.
 */
const fetchDepartment = async (
  sb: SupabaseClientLike,
  departmentId: number | string | null | undefined,
): Promise<{ stages: any[]; departments: any[] }> => {
  if (departmentId == null || departmentId === "") return { stages: [], departments: [] }
  const { data, error } = await sb
    .from("tm_departments")
    .select("id, name, stages, tm_subdepartments(*)")
    .eq("id", departmentId)
    .single()
  if (error || !data) return { stages: [], departments: [] }
  return { stages: (data.stages || []) as any[], departments: [data] }
}

/**
 * Whether a stage document applies to the task: a special document with target entities only applies
 * to those job levels / classes / subclasses (the "Target Entities" picker in Stages Management).
 */
const documentAppliesToTask = (doc: any, task: any): boolean => {
  const targets: any[] = doc?.isSpecial && Array.isArray(doc.targetEntities) ? doc.targetEntities : []
  if (targets.length === 0) return true
  const subdeptId = task.job_level?.subdepartment_id ?? task.subdepartment_id
  const classId = task.job_level?.class_id ?? task.class_id
  const subclassId = task.job_level?.subclass_id ?? task.subclass_id
  const same = (a: unknown, b: unknown) => a != null && b != null && String(a) === String(b)
  // The stage settings save each target as { job_level: { subdepartment_id, class_id, subclass_id } };
  // older entries kept flat subdept_id / class_id / subclass_id.
  return targets.some((t) => {
    const level = t?.job_level && typeof t.job_level === "object" ? t.job_level : t
    const tSubdept = level.subdepartment_id ?? level.subdept_id
    return (
      same(tSubdept, subdeptId) &&
      (level.class_id == null || same(level.class_id, classId)) &&
      (level.subclass_id == null || same(level.subclass_id, subclassId))
    )
  })
}

/** The task's stages that apply to its job level / class (N/A ones dropped). */
const applicableStages = (stages: any[], task: any, departments: any[]) =>
  stages.filter((stage) => isStageApplicableToTask(stage, task, departments))

/**
 * Narrows a tm_tasks query to job levels: their subdepartments, and their classes when every level
 * names one (a level without a class means "any class", so a mixed list keeps the subdepartment only).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Reads the task's job_level JSON, not its department_id / subdepartment_id / class_id columns: tasks
// created from the enquiry dialog (since Feb 2026) only fill job_level, while every task has it.
const scopeToJobLevels = (q: any, levels: EfnsJobLevel[] | null) => {
  if (!levels?.length) return q
  let scopedQuery = q
    .eq("job_level->>department_id", String(IMMIGRATION_DEPARTMENT_ID))
    .in("job_level->>subdepartment_id", [...new Set(levels.map((l) => String(l.subdepartmentId)))])
  if (levels.every((l) => l.classId)) scopedQuery = scopedQuery.in("job_level->>class_id", levels.map((l) => l.classId as string))
  return scopedQuery
}

/** PostgREST ilike treats % and _ as wildcards; a file number should match literally. */
const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`)

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
  created_at?: string | null
}

// tm_tasks has no company_name column — company lives in the companies table (by company_id) or in
// the company_details JSONB, which is why only applicant_name / principal_member_name are matched
// and the dialog's company line is best-effort.
const CANDIDATE_SELECT =
  "id, applicant_name, applicant_details, r_number, principal_member_name, company_details, individual_id, department_id, subdepartment_id, class_id, subclass_id, status, job_level, created_at"

/** The task's applicant: applicant_name, or applicant_details.name on tasks that only fill that. */
const taskApplicantName = (row: any): string | null => {
  const details = row?.applicant_details && typeof row.applicant_details === "object" ? row.applicant_details : null
  return (row?.applicant_name || details?.name || null) as string | null
}

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
    .map((t) => `applicant_name.ilike.%${t}%,applicant_details->>name.ilike.%${t}%,principal_member_name.ilike.%${t}%`)
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
  /** A dependant's principal: also scored against the task's principal_member_name. */
  principal?: string | null
  query?: string | null
  /** The item's permit type (and payment category): only tasks in their job levels are searched. */
  permitGroup?: string | null
  category?: string | null
  /** "all" searches every task, e.g. when the job-level search found nothing. */
  scope?: "job_level" | "all"
  limit?: number
}): Promise<EfnsCandidateTask[]> {
  const sb = createServerSupabaseClient()
  const limit = input.limit || 25
  const fileNumber = normalizeText(input.fileNumber)
  const levels = input.scope === "all" ? null : itemJobLevels(input.permitGroup, input.category)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scoped = (q: any) => scopeToJobLevels(q, levels)

  const withCompany = (rows: any[]) =>
    rows.map((row) => ({
      ...(row as Record<string, unknown>),
      applicant_name: taskApplicantName(row),
      company_name: taskCompanyName(row),
      is_terminal: isTerminalStatus(row.status),
    })) as EfnsCandidateTask[]

  if (fileNumber) {
    // The portal's printed file number ("File R") is the person's R-number: kept on the registry
    // individual (registry_individuals.r_number) and, once learned, on the task. Some stored values
    // carry a trailing line break, hence the prefix match plus an exact check on the trimmed value.
    const { data: people } = await sb
      .from("registry_individuals")
      .select("id, r_number")
      .ilike("r_number", `${escapeLike(fileNumber)}%`)
      .limit(50)
    const individualIds = (people || [])
      .filter((p: any) => normalizeText(p.r_number) === fileNumber)
      .map((p: any) => p.id)
    const [byIndividual, byTask] = await Promise.all([
      individualIds.length
        ? scoped(sb.from("tm_tasks").select(CANDIDATE_SELECT)).in("individual_id", individualIds).limit(limit)
        : Promise.resolve({ data: [] as any[] }),
      scoped(sb.from("tm_tasks").select(CANDIDATE_SELECT)).ilike("r_number", escapeLike(fileNumber)).limit(limit),
    ])
    const byId = new Map<string, any>()
    for (const row of [...(byIndividual.data || []), ...(byTask.data || [])]) byId.set(String(row.id), row)
    if (byId.size > 0) {
      const openFirst = [...byId.values()].sort((a: any, b: any) => Number(isTerminalStatus(a.status)) - Number(isTerminalStatus(b.status)))
      return withCompany(openFirst)
    }
  }

  const applicantName = extractApplicantName(input.applicant || input.query || "")
  const normalized = normalizeName(applicantName)
  if (!normalized || identityTokens(normalized).length === 0) return []

  // One .or() only (two chained .or() calls produce duplicate `or=` params that PostgREST may drop);
  // the terminal/open ordering happens in JS — every row already carries `status`.
  const { data, error } = await scoped(sb.from("tm_tasks").select(CANDIDATE_SELECT))
    .or(tokenOrFilter(normalized))
    .limit(300)
  if (error) return []

  const company = normalizeName(input.company)
  const principal = normalizeName(input.principal)
  const candidates = (data || []) as any[]
  const scored = candidates
    .map((row: any): { score: number; row: any } => ({
      score: Math.max(
        nameMatchScore(applicantName, taskApplicantName(row) || ""),
        nameMatchScore(applicantName, row.principal_member_name || ""),
        company ? nameMatchScore(company, taskCompanyName(row) || "") : 0,
      ) +
        // A matching principal / company only breaks ties between plausible applicants.
        (principal && nameMatchScore(principal, row.principal_member_name || "") > 0 ? 0.05 : 0),
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
export async function linkStagesForTask(
  taskId: number | string,
  /** The item being linked: its stage document is then pre-chosen from the stages' EFNS rules. */
  item?: { kind: ItemKind; id: number } | null,
): Promise<{
  task: EfnsCandidateTask | null
  stages: Array<{
    stageId: string
    stageName: string
    orderNum: number
    documents: Array<{ kycId: string; name: string; isRequired?: boolean }>
  }>
  /** What the rules pick for the item (null without an item, or when no rule takes it). */
  suggested: { stageId: string; kycId: string; stageName: string } | null
  /** Why nothing was suggested: "no_rule" or "all_filled". */
  suggestionNote?: string | null
}> {
  const sb = createServerSupabaseClient()
  try {
    const task = await fetchTask(sb, taskId)
    const departmentId = task.job_level?.department_id ?? task.department_id
    const { stages, departments } = await fetchDepartment(sb, departmentId)
    const result = applicableStages(stages, task, departments)
      .filter((s: any) => Array.isArray(s.documents) && s.documents.length > 0)
      .sort((a: any, b: any) => (a.order_num || 0) - (b.order_num || 0))
      .map((s: any) => ({
        stageId: s.id,
        stageName: s.name || "Untitled stage",
        orderNum: s.order_num || 0,
        documents: (s.documents as any[])
          .filter((d: any) => !!d.kycId && documentAppliesToTask(d, task))
          .map((d: any) => ({ kycId: d.kycId, name: d.name || "Document", isRequired: d.isRequired })),
      }))
    let suggested: { stageId: string; kycId: string; stageName: string } | null = null
    let suggestionNote: string | null = null
    if (item) {
      const table = item.kind === "notification" ? "immigration_notifications" : "immigration_payments"
      const { data: itemRow } = await sb.from(table).select("*").eq("id", item.id).maybeSingle()
      if (itemRow) {
        const { status, feeType } = itemPermitGroupAndStatus(item.kind, itemRow)
        const resolved = await resolveEfnsStage(sb, task, status, feeType)
        if (resolved.outcome === "match") {
          suggested = { stageId: resolved.match.stageId, kycId: resolved.match.kycId, stageName: resolved.match.stageName }
        } else {
          suggestionNote = resolved.outcome
        }
      }
    }
    return {
      suggested,
      suggestionNote,
      task: {
        id: task.id,
        applicant_name: taskApplicantName(task),
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
    return { task: null, stages: [], suggested: null }
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
    // Unique per filing: EFNS names files by applicant + permit + date, so two items (or a re-file)
    // would otherwise land on the same path and silently replace a document already filed.
    const filePath = `individual-documents/${individualId}/${kycId}/${Date.now()}_${input.kind}-${input.id}_${safeName || "efns.pdf"}`
    const { error: upErr } = await sb.storage.from("kyc-documents").upload(filePath, blob, {
      upsert: false,
      cacheControl: "3600",
      contentType: "application/pdf",
    })
    if (upErr) return recordError(baseFiling, `Failed to store PDF: ${upErr.message}`)

    // Fill the document type's fields (acc_portal_kyc.fields) from the PDF's own labels and the item
    // row — no AI. A type with no fields yet just gets an empty extracted_details.
    const { data: kycRow } = await sb.from("acc_portal_kyc").select("fields").eq("id", kycId).maybeSingle()
    const fill = await fillEfnsDocumentFields(
      Array.isArray(kycRow?.fields) ? kycRow.fields : [],
      new Uint8Array(await blob.arrayBuffer()),
      input.kind,
      itemRow,
    )

    // Insert the document row.
    const { data: docRow, error: insErr } = await sb
      .from("acc_portal_directors_documents")
      // acc_portal_directors_documents has no status column (writing one fails the insert).
      .insert({
        director_id: individualId,
        document_id: kycId,
        file_path: filePath,
        task_id: task.id,
        // Field values only (keyed by field name, like any extracted document): the preview's Save /
        // Re-extract rewrite this column wholesale, so where the document came from lives in metadata.
        extracted_details: fill.values,
        metadata: {
          source: "efns",
          efns_kind: input.kind,
          efns_id: input.id,
          file_number: itemRow.file_number ?? null,
          matched_by: input.matchedBy,
          fields: { sources: fill.sources, missing: fill.missing, pdf_labels: fill.pdfLabels },
        },
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
    // Learn the task's file number from what it was just filed with, so later notices for the same
    // file match it exactly (r_number) instead of by name. Never overwrites one already set.
    if (!String(task.r_number ?? "").trim() && String(itemRow.file_number ?? "").trim()) {
      taskUpdate.r_number = String(itemRow.file_number).trim()
    }
    const advancedStatus = computeAdvancedTaskStatus(task.status, input.stageId)
    if (advancedStatus) taskUpdate.status = advancedStatus

    const { error: taskUpdErr } = await sb.from("tm_tasks").update(taskUpdate).eq("id", task.id)
    if (taskUpdErr) return recordError(baseFiling, `Failed to update task: ${taskUpdErr.message}`)

    // …and on the individual the document was filed against, when the registry has none yet.
    const learnedFileNumber = String(itemRow.file_number ?? "").trim()
    if (learnedFileNumber) {
      await sb
        .from("registry_individuals")
        .update({ r_number: learnedFileNumber })
        .eq("id", individualId)
        .or("r_number.is.null,r_number.eq.")
        .then(
          () => {},
          () => {},
        )
    }

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
// `category` is a payment's application category (null for notifications), which can name a class;
// `feeType` its fee type ("Processing Fee" / "Issuance Fee"), which stage triggers can require.
export const itemPermitGroupAndStatus = (
  kind: ItemKind,
  row: any,
): { permitGroup: string; status: string; category: string | null; feeType: string | null } => {
  if (kind === "notification") {
    const rawType = String(row.permit_type || row.case_type || "").trim()
    return {
      permitGroup: rawType ? rawType.toUpperCase() : "NOTIFICATION",
      status: shortNotifStatus(String(row.message || "")),
      category: null,
      feeType: null,
    }
  }
  const category = String(row.application_category || row.application_name || "").trim()
  return {
    permitGroup: paymentPermitGroup(category),
    status: String(row.invoice_status || "Not Paid").toUpperCase(),
    category: category || null,
    feeType: String(row.fee_type || "").trim() || null,
  }
}


export type EfnsStageResolution =
  | { outcome: "match"; match: { stageId: string; stageName: string; kycId: string; orderNum: number } }
  | { outcome: "no_rule" }
  | { outcome: "all_filled"; stageNames: string[] }

/**
 * The stage document an item files to on this task, from the stages' "Filled from EFNS" rules: a
 * document whose rule takes the item's status (and fee type), on a stage and document that apply to
 * the task's job level / class. When several stages take it (e.g. "Online Received Notification 1"
 * and "… 2" both take APPLICATION RECEIVED) it's the first one, in stage order, this task hasn't
 * filled yet — so the second received notice lands in the second stage. `task` is a full tm_tasks row.
 */
export async function resolveEfnsStage(
  sb: SupabaseClientLike,
  task: any,
  status: string,
  feeType: string | null,
): Promise<EfnsStageResolution> {
  const departmentId = task.job_level?.department_id ?? task.department_id
  const { stages, departments } = await fetchDepartment(sb, departmentId)
  const matches: Array<{ stageId: string; stageName: string; kycId: string; orderNum: number }> = []
  for (const stage of applicableStages(stages, task, departments)) {
    for (const doc of stage.documents || []) {
      if (
        doc?.kycId &&
        isEfnsTriggerSet(doc.efnsTrigger) &&
        efnsTriggerMatches(doc.efnsTrigger, status, feeType) &&
        documentAppliesToTask(doc, task)
      ) {
        matches.push({ stageId: stage.id, stageName: stage.name || "", kycId: doc.kycId, orderNum: stage.order_num || 0 })
      }
    }
  }
  if (matches.length === 0) return { outcome: "no_rule" }
  const unfilled = matches
    .filter((m) => {
      const entry = task.stages?.[m.stageId]
      return !(entry?.status === "completed" || entry?.completedAt || Object.keys(entry?.documents || {}).length > 0)
    })
    .sort((a, b) => a.orderNum - b.orderNum)
  if (matches.length === 1) return { outcome: "match", match: matches[0] }
  if (unfilled.length === 0) return { outcome: "all_filled", stageNames: matches.map((m) => m.stageName) }
  return { outcome: "match", match: unfilled[0] }
}

/**
 * Re-fills a filed EFNS document's fields from its PDF and EFNS item — for documents filed before
 * their type had fields, or after the fields changed. Values it finds replace the stored ones; fields
 * it can't fill keep whatever is there (an operator's own entry survives). No AI.
 */
export async function refillEfnsDocumentFields(documentId: string): Promise<{
  success: boolean
  values?: Record<string, string>
  missing?: string[]
  error?: string
}> {
  const sb = createServerSupabaseClient()
  const { data: doc, error } = await sb
    .from("acc_portal_directors_documents")
    .select("id, document_id, file_path, extracted_details, metadata")
    .eq("id", documentId)
    .maybeSingle()
  if (error || !doc) return { success: false, error: error?.message || "Document not found" }
  const meta = doc.metadata && typeof doc.metadata === "object" ? doc.metadata : {}
  if (meta.source !== "efns" || !meta.efns_kind || !meta.efns_id) {
    return { success: false, error: "Not a document filed from EFNS" }
  }

  const table = meta.efns_kind === "notification" ? "immigration_notifications" : "immigration_payments"
  const [{ data: itemRow }, { data: kycRow }, download] = await Promise.all([
    sb.from(table).select("*").eq("id", meta.efns_id).maybeSingle(),
    sb.from("acc_portal_kyc").select("fields").eq("id", doc.document_id).maybeSingle(),
    sb.storage.from("kyc-documents").download(doc.file_path),
  ])
  const pdf = download.data ? new Uint8Array(await download.data.arrayBuffer()) : null
  const fill = await fillEfnsDocumentFields(
    Array.isArray(kycRow?.fields) ? kycRow.fields : [],
    pdf,
    meta.efns_kind,
    itemRow || {},
  )

  const existing = doc.extracted_details && typeof doc.extracted_details === "object" ? doc.extracted_details : {}
  const values = { ...existing, ...fill.values }
  const { error: updErr } = await sb
    .from("acc_portal_directors_documents")
    .update({
      extracted_details: values,
      metadata: { ...meta, fields: { sources: fill.sources, missing: fill.missing, pdf_labels: fill.pdfLabels } },
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
  if (updErr) return { success: false, error: updErr.message }
  return { success: true, values, missing: fill.missing }
}

/** How long no_rule / no_match / ambiguous items keep being retried. */
const RETRY_WINDOW_DAYS = 30

/**
 * An item arriving more than this long before a task was created belongs to an earlier application
 * (e.g. last year's permit), so it's never auto-filed onto that task — it can still be linked by hand.
 */
const ITEM_BEFORE_TASK_SLACK_MS = 24 * 60 * 60 * 1000
const arrivedForTask = (row: any, task: EfnsCandidateTask): boolean => {
  const itemAt = Date.parse(row.created_at || "")
  const taskAt = Date.parse(task.created_at || "")
  if (Number.isNaN(itemAt) || Number.isNaN(taskAt)) return true
  return itemAt >= taskAt - ITEM_BEFORE_TASK_SLACK_MS
}

/** Who the item is about (applicant + principal / company), as the notifications page shows it. */
export const itemApplicant = (kind: ItemKind, row: any): ParsedApplicant => {
  const { permitGroup } = itemPermitGroupAndStatus(kind, row)
  return parseApplicant(
    kind === "notification" ? row.name : row.applicant_name || row.application_name,
    permitGroup,
    row.printable_applicant,
    row.printable_company,
    row.printable_dependant,
  )
}

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
    // Unlooked-at (null) or failed (error) items, plus recent ones that had no rule / no task yet —
    // a stage trigger set up, or a task created, after the item arrived still gets it filed.
    const retrySince = new Date(Date.now() - RETRY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
    for (const kind of ["notification", "payment"] as ItemKind[]) {
      const table = kind === "notification" ? "immigration_notifications" : "immigration_payments"
      const { data, error } = await sb
        .from(table)
        .select("*")
        .or(`filing_status.is.null,filing_status.eq.error,and(filing_status.in.(no_rule,no_match,ambiguous),created_at.gte.${retrySince})`)
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
  const who = itemApplicant(kind, row)
  const name = who.applicant || `#${id}`
  const { permitGroup, status, category, feeType } = itemPermitGroupAndStatus(kind, row)

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
      applicant: who.applicant || null,
      company: who.company,
      principal: who.principal,
      permitGroup,
      category,
    })
    const matchedBy: EfnsMatchedBy = row.file_number ? "file_number" : "name"

    // Only open tasks can be auto-filed — a completed task may still be the right person (it's kept
    // as a candidate so the "Needs a task" list shows it for a manual link) but never receives an
    // automatic filing.
    const candidates = suggestions.map((t) => ({ id: t.id, applicant_name: t.applicant_name, r_number: t.r_number }))

    // Without a job level for the permit type, the task search spanned every task, so nothing
    // guarantees the task is the right kind — leave it for a person to link.
    if (!itemJobLevels(permitGroup, category)) {
      return writeOutcome("no_match", {
        task_id: 0,
        stage_id: "",
        matched_by: matchedBy,
        candidates,
        error: `Permit type "${permitGroup}" isn't linked to a job level, so it isn't filed automatically`,
      })
    }
    // Open tasks this item could belong to: not finished, and not created long after the item arrived.
    const open = suggestions.filter((t) => !t.is_terminal && arrivedForTask(row, t))

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
    const resolved = await resolveEfnsStage(sb, await fetchTask(sb, task.id), status, feeType)
    if (resolved.outcome === "no_rule") {
      return writeOutcome("no_rule", { task_id: task.id, stage_id: "", matched_by: matchedBy })
    }
    if (resolved.outcome === "all_filled") {
      return writeOutcome("ambiguous", {
        task_id: task.id,
        stage_id: "",
        matched_by: matchedBy,
        candidates: [{ id: task.id, applicant_name: task.applicant_name, r_number: task.r_number }],
        error: `Every stage that takes ${status} (${resolved.stageNames.join(", ")}) is already filled on this task`,
      })
    }
    const match = resolved.match

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
export interface EfnsFieldPreview {
  /** "filed": the values saved on the filed document. "preview": what filing would fill. "none": no doc type. */
  source: "filed" | "preview" | "none"
  kycId: string | null
  docTypeName: string | null
  stageName: string | null
  taskId: number | null
  /** The document type's fields (acc_portal_kyc.fields), as configured. */
  fields: any[]
  values: Record<string, string>
  /** Why there's no doc type ("no_rule") or no fields on it ("no_fields"). */
  note?: "no_rule" | "no_fields" | null
}

/**
 * The fields to show for an item in the Immigration Notifications preview — its document type's, not
 * the row's columns. A filed item shows the values saved on its filed document. An unfiled one shows
 * the type its status's "Filled from EFNS" rule picks (for the item's permit type's job levels; first
 * in stage order when several do) with the values filing would read off its PDF. No AI either way.
 */
export async function previewEfnsDocumentFields(kind: ItemKind, id: number): Promise<EfnsFieldPreview> {
  const sb = createServerSupabaseClient()
  const empty: EfnsFieldPreview = { source: "none", kycId: null, docTypeName: null, stageName: null, taskId: null, fields: [], values: {}, note: "no_rule" }
  const table = kind === "notification" ? "immigration_notifications" : "immigration_payments"
  const { data: itemRow } = await sb.from(table).select("*").eq("id", id).maybeSingle()
  if (!itemRow) return empty

  const kycInfo = async (kycId: string) => {
    const { data } = await sb.from("acc_portal_kyc").select("name, display_name, fields").eq("id", kycId).maybeSingle()
    return { name: (data?.display_name || data?.name || null) as string | null, fields: Array.isArray(data?.fields) ? data.fields : [] }
  }

  // Filed: the document's own type and saved values.
  const filing = itemRow.filing_status === "filed" ? itemRow.filing : null
  if (filing?.document_id) {
    const { data: doc } = await sb
      .from("acc_portal_directors_documents")
      .select("document_id, extracted_details")
      .eq("id", filing.document_id)
      .maybeSingle()
    const kycId = doc?.document_id || filing.kyc_document_id
    if (kycId) {
      const info = await kycInfo(kycId)
      const values = doc?.extracted_details && typeof doc.extracted_details === "object" ? doc.extracted_details : {}
      return {
        source: "filed",
        kycId,
        docTypeName: info.name,
        stageName: filing.stage_name || null,
        taskId: filing.task_id ?? null,
        fields: info.fields,
        values,
        note: info.fields.length ? null : "no_fields",
      }
    }
  }

  // Not filed: the stage document the rules pick for this status on the permit type's job levels.
  const { permitGroup, status, category, feeType } = itemPermitGroupAndStatus(kind, itemRow)
  const levels = itemJobLevels(permitGroup, category) || []
  const { stages, departments } = await fetchDepartment(sb, IMMIGRATION_DEPARTMENT_ID)
  const pseudoTasks = levels.map((l) => ({
    job_level: { department_id: IMMIGRATION_DEPARTMENT_ID, subdepartment_id: l.subdepartmentId, class_id: l.classId ?? null, subclass_id: null },
  }))
  const appliesToLevels = (fn: (task: any) => boolean) => (pseudoTasks.length ? pseudoTasks.some(fn) : true)

  let pick: { kycId: string; stageName: string; orderNum: number } | null = null
  for (const stage of stages) {
    if (!appliesToLevels((t) => isStageApplicableToTask(stage, t, departments))) continue
    for (const doc of stage.documents || []) {
      if (
        doc?.kycId &&
        isEfnsTriggerSet(doc.efnsTrigger) &&
        efnsTriggerMatches(doc.efnsTrigger, status, feeType) &&
        appliesToLevels((t) => documentAppliesToTask(doc, t)) &&
        (!pick || (stage.order_num || 0) < pick.orderNum)
      ) {
        pick = { kycId: doc.kycId, stageName: stage.name || "", orderNum: stage.order_num || 0 }
      }
    }
  }
  if (!pick) return empty

  const info = await kycInfo(pick.kycId)
  const base = { kycId: pick.kycId, docTypeName: info.name, stageName: pick.stageName, taskId: null, fields: info.fields }
  if (!info.fields.length) return { ...base, source: "preview", values: {}, note: "no_fields" }

  const pdfPath = immigrationPdfPath(kind, kind === "notification" ? itemRow.pdf_file_name : itemRow.payment_instructions_file_name)
  const download = pdfPath ? await sb.storage.from(IMMIGRATION_BUCKET).download(pdfPath) : null
  const pdf = download?.data ? new Uint8Array(await download.data.arrayBuffer()) : null
  const fill = await fillEfnsDocumentFields(info.fields, pdf, kind, itemRow)
  return { ...base, source: "preview", values: fill.values, note: null }
}
