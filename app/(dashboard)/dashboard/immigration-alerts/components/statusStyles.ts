import { AlertCircle, ListChecks, XCircle } from "lucide-react"
import type { ImmigrationAlertStatus } from "@/lib/immigrationAlerts"

// Status tabs and stats rows styled exactly like bcl-registry's Imm Status Manager (Current
// Immigration Status): same colours, icons and labels, so the two read as the same report. Only the
// statuses an alert can have (Grace, Expired) plus All. Classes are translated from that app's
// `data-active:` to this app's Radix `data-[state=active]:`.

export type StatusTab = "all" | ImmigrationAlertStatus

export const STATUS_TABS: { value: StatusTab; label: string; icon: typeof ListChecks; className: string }[] = [
  {
    value: "all",
    label: "All",
    icon: ListChecks,
    className:
      "border-border bg-card text-foreground/70 hover:text-foreground data-[state=active]:bg-muted data-[state=active]:border-foreground/30 data-[state=active]:text-foreground",
  },
  {
    value: "grace",
    label: "Grace",
    icon: AlertCircle,
    className:
      "border-blue-200 bg-blue-50 text-blue-700/80 hover:text-blue-800 data-[state=active]:bg-blue-100 data-[state=active]:border-blue-400 data-[state=active]:text-blue-800",
  },
  {
    value: "expired",
    label: "Expired",
    icon: XCircle,
    className:
      "border-red-200 bg-red-50 text-red-700/80 hover:text-red-800 data-[state=active]:bg-red-100 data-[state=active]:border-red-400 data-[state=active]:text-red-800",
  },
]

export const STATUS_TAB_BASE_CLASS =
  "h-10 px-4 text-sm font-medium rounded-md border transition-all data-[state=active]:shadow-sm"

// Stats rows (frozen under the table header): Total / Grace / Expired, in the Imm Status Manager's colours.
export type StatsRowKey = "total" | ImmigrationAlertStatus

export const STATS_ROWS: { key: StatsRowKey; label: string; rowClass: string; borderClass: string }[] = [
  { key: "total", label: "Total", rowClass: "bg-slate-100 text-slate-800", borderClass: "border-slate-200" },
  { key: "grace", label: "Grace", rowClass: "bg-orange-50 text-orange-700", borderClass: "border-orange-200" },
  { key: "expired", label: "Expired", rowClass: "bg-red-50 text-red-700", borderClass: "border-red-200" },
]
