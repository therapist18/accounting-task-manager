// Shared chrome tokens for the Email Center — matches the Passport Endorsement Tracking module's
// design language (rounded-full pill tabs/buttons on the custom-blue accent, soft-tint status
// badges) so this module reads as part of the same app instead of a bolted-on page.

import type { ApprovalStatus, Disposition } from "./types"

export const TAB_LIST_CLASS = "bg-slate-100 p-1 rounded-full border border-slate-200 flex-wrap"
export const TAB_TRIGGER_CLASS =
  "group gap-2 rounded-full px-4 h-9 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-white transition-colors data-[state=active]:bg-custom-blue data-[state=active]:text-white data-[state=active]:shadow-sm"
export const COUNT_BADGE_CLASS =
  "inline-flex items-center justify-center font-bold tabular-nums px-2.5 py-0.5 rounded-full text-xs min-w-[1.375rem] leading-none shadow-sm bg-custom-blue text-white group-data-[state=active]:bg-white/25 group-data-[state=active]:text-white"
export const URGENT_BADGE_CLASS =
  "inline-flex items-center justify-center font-bold tabular-nums px-2.5 py-0.5 rounded-full text-xs min-w-[1.375rem] leading-none shadow-sm bg-amber-500 text-white"

export const PILL_BUTTON_CLASS =
  "h-9 px-4 rounded-full text-sm font-bold gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
export const PILL_BUTTON_ACTIVE_CLASS = "bg-custom-blue border-custom-blue text-white hover:bg-custom-blue hover:text-white"
export const PRIMARY_PILL_BUTTON_CLASS =
  "h-10 px-6 rounded-full text-sm font-bold gap-2 text-white shadow-md transition-all disabled:opacity-70"

// Soft pill badges (bg-*-50 / text-*-700 / border-*-200) — same convention as the passport module's
// STEP_BADGE_CLASSES, gentler than solid-fill badges for a table with many rows.
export const APPROVAL_BADGE: Record<ApprovalStatus, string> = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  not_responded: "bg-slate-100 text-slate-600 border-slate-200",
  not_applicable: "bg-slate-100 text-slate-500 border-slate-200",
}

export const DISPOSITION_BADGE: Record<Disposition, string> = {
  action_required: "bg-red-50 text-red-700 border-red-200",
  update_only: "bg-blue-50 text-blue-700 border-blue-200",
  ignore: "bg-slate-100 text-slate-500 border-slate-200",
  needs_review: "bg-amber-50 text-amber-700 border-amber-200",
}

// Table header colour bands (mirrors GROUP_ACCENTS in the passport module's HandlingTable):
// each phase of the sheet keeps a distinct identity across the header row and its column tint.
export const FROM_KRA_BAND = { header: "bg-custom-blue text-white", tint: "bg-blue-50/60" }
export const RESPOND_BAND = { header: "bg-emerald-600 text-white", tint: "bg-emerald-50/60" }
export const TRACKING_BAND = { header: "bg-slate-600 text-white", tint: "bg-slate-100" }
