import type { ImmigrationItem } from "@/lib/immigrationNotifications"

// Status / record-kind badge styling for the Immigration Notifications table. Soft-tint pills
// (bg-*-50 / text-*-700 / border-*-200) in the same convention as the Email Center's approval
// badges, so a status reads identically whether it appears in a tab count or a table cell.
//
// Keyed by the status label the row already carries (`ImmigrationItem.statusKey`), which for a
// notification is the automation's short status and for a payment is its invoice status.

export const STATUS_BADGE: Record<string, string> = {
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ISSUED: "border-blue-200 bg-blue-50 text-blue-700",
  INVOICE: "border-violet-200 bg-violet-50 text-violet-700",
  "UPLOAD REQUIRED": "border-amber-200 bg-amber-50 text-amber-700",
  "APPLICATION RECEIVED": "border-sky-200 bg-sky-50 text-sky-700",
  "APPLICATION DEFERRED": "border-orange-200 bg-orange-50 text-orange-700",
  "IN PROGRESS": "border-indigo-200 bg-indigo-50 text-indigo-700",
  REMINDER: "border-rose-200 bg-rose-50 text-rose-700",
  CANCELLED: "border-red-200 bg-red-50 text-red-700",
  COMPILED: "border-teal-200 bg-teal-50 text-teal-700",
  "TO BE EDITED": "border-yellow-200 bg-yellow-50 text-yellow-700",
  NOTIFICATION: "border-slate-200 bg-slate-100 text-slate-600",
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "NOT PAID": "border-red-200 bg-red-50 text-red-700",
}

export const STATUS_BADGE_FALLBACK = "border-slate-200 bg-slate-100 text-slate-600"

// The same colours on a status TAB: a soft tint while unselected, then the solid shade while
// selected (a TabsTrigger's own data-[state=active] background would otherwise flatten it to the
// neutral `bg-background`). The active halves are the classes tailwind.config.ts safelists for the
// status filters the app builds at runtime.
const TAB_SELECTED: Record<string, string> = {
  APPROVED: "data-[state=active]:bg-emerald-600 data-[state=active]:border-emerald-600",
  ISSUED: "data-[state=active]:bg-blue-600 data-[state=active]:border-blue-600",
  INVOICE: "data-[state=active]:bg-violet-600 data-[state=active]:border-violet-600",
  "UPLOAD REQUIRED": "data-[state=active]:bg-amber-600 data-[state=active]:border-amber-600",
  "APPLICATION RECEIVED": "data-[state=active]:bg-sky-600 data-[state=active]:border-sky-600",
  "APPLICATION DEFERRED": "data-[state=active]:bg-orange-600 data-[state=active]:border-orange-600",
  "IN PROGRESS": "data-[state=active]:bg-indigo-600 data-[state=active]:border-indigo-600",
  REMINDER: "data-[state=active]:bg-rose-600 data-[state=active]:border-rose-600",
  CANCELLED: "data-[state=active]:bg-red-600 data-[state=active]:border-red-600",
  COMPILED: "data-[state=active]:bg-teal-600 data-[state=active]:border-teal-600",
  "TO BE EDITED": "data-[state=active]:bg-yellow-600 data-[state=active]:border-yellow-600",
  NOTIFICATION: "data-[state=active]:bg-slate-600 data-[state=active]:border-slate-600",
  PAID: "data-[state=active]:bg-emerald-600 data-[state=active]:border-emerald-600",
  "NOT PAID": "data-[state=active]:bg-red-600 data-[state=active]:border-red-600",
}

const withSelected = (unselected: string, selected: string) =>
  `${unselected} ${selected} data-[state=active]:text-white`

export const STATUS_TAB: Record<string, string> = Object.fromEntries(
  Object.keys(STATUS_BADGE).map((key) => [key, withSelected(STATUS_BADGE[key], TAB_SELECTED[key] ?? "data-[state=active]:bg-slate-600 data-[state=active]:border-slate-600")]),
)

export const STATUS_TAB_FALLBACK = withSelected(
  STATUS_BADGE_FALLBACK,
  "data-[state=active]:bg-slate-600 data-[state=active]:border-slate-600",
)

export const KIND_LABEL: Record<ImmigrationItem["kind"], string> = {
  notification: "Notification",
  payment: "Payment",
}

export const KIND_BADGE: Record<ImmigrationItem["kind"], string> = {
  notification: "border-slate-200 bg-slate-100 text-slate-600",
  payment: "border-violet-200 bg-violet-50 text-violet-700",
}
