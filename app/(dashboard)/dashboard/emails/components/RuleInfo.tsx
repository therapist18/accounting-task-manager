"use client"

import { Info } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { CategoryOption, RuleRow } from "./shared"

// What a rule does, in the words the tables use — shared by every rule sidebar (In Progress, Completed,
// Update, Notifications, Ignored) so the same rule reads the same way everywhere.

export function ruleKind(rule: RuleRow): string {
  return rule.is_ignore ? (rule.hard_ignore ? "Ignore and delete" : "Ignore") : rule.is_notify ? "Important notification" : "Classify"
}

// The category a rule's mail shows in the tables' Category column: the rule's category for a classify
// rule, "Notification" for a notify rule, and for an ignore rule (which names no category) the rule
// itself is what the Ignored table shows there — so this just says it ignores.
export function ruleCategory(rule: RuleRow, categories: CategoryOption[]): string {
  if (rule.is_ignore) return rule.hard_ignore ? "Ignored · deleted, not stored" : "Ignored"
  const key = rule.is_notify ? "notification" : rule.category_key
  return categories.find((c) => c.key === key)?.name ?? key ?? ""
}

// "All companies" / "Only: A, B" / "All except: A, B" — names resolved through `names` (company id -> name),
// falling back to a count when a name isn't known.
export function ruleScopeLabel(rule: Pick<RuleRow, "company_scope" | "company_ids">, names?: Record<string, string>): string {
  const scope = rule.company_scope ?? "all"
  if (scope === "all") return "All companies"
  const ids = rule.company_ids ?? []
  const label = ids.map((id) => names?.[id]).filter(Boolean).join(", ") || `${ids.length} compan${ids.length === 1 ? "y" : "ies"}`
  return `${scope === "only" ? "Only" : "All except"}: ${label}`
}

export function RuleInfoButton({ rule, categories, active, companyNames }: { rule: RuleRow; categories: CategoryOption[]; active?: boolean; companyNames?: Record<string, string> }) {
  const subjects = [rule.pattern, ...(rule.extra_patterns ?? [])].map((w) => w.trim()).filter(Boolean)
  const senders = [rule.sender_pattern, ...(rule.extra_sender_patterns ?? [])].map((w) => (w ?? "").trim()).filter(Boolean)
  const category = ruleCategory(rule, categories)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          // The row itself is a click target (select this rule) — the icon only opens the details.
          onClick={(ev) => ev.stopPropagation()}
          onKeyDown={(ev) => ev.stopPropagation()}
          title="About this rule"
          aria-label="About this rule"
          className={cn(
            "ml-1 shrink-0 rounded-full p-0.5 transition-colors",
            active ? "text-white/80 hover:text-white hover:bg-white/20" : "text-slate-400 hover:text-custom-blue hover:bg-slate-200/70"
          )}
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0 text-sm" onClick={(ev) => ev.stopPropagation()}>
        <div className="border-b border-slate-200 px-3.5 py-2.5">
          <p className="font-semibold text-slate-900">{ruleKind(rule)} rule{rule.is_active ? "" : " (inactive)"}</p>
          {category && <p className="text-slate-500">Category shown: <span className="font-medium text-slate-700">{category}</span></p>}
        </div>
        <dl className="space-y-2 px-3.5 py-2.5">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">From</dt>
            <dd className="text-slate-800 break-words">
              {senders.length ? senders.map((s) => <span key={s} className="block">{s}</span>) : "Any sender"}
              {rule.sender_match_type && senders.length > 0 && <span className="text-xs text-slate-400">{rule.sender_match_type === "regex" ? "pattern (regex)" : "contains"}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Subject</dt>
            <dd className="text-slate-800 break-words">
              {subjects.length ? subjects.map((s) => <span key={s} className="block">{s}</span>) : "Any subject"}
              {subjects.length > 0 && <span className="text-xs text-slate-400">{rule.match_type === "regex" ? "pattern (regex)" : "contains"}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Applies to</dt>
            <dd className="text-slate-800 break-words">{ruleScopeLabel(rule, companyNames)}</dd>
          </div>
          <div className="flex gap-6">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Confidence</dt>
              <dd className="text-slate-800 tabular-nums">{Math.round(rule.confidence * 100)}%</dd>
            </div>
            {rule.is_notify && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Priority</dt>
                <dd className="text-slate-800">{rule.notify_priority === "informational" ? "FYI" : "Urgent"}</dd>
              </div>
            )}
          </div>
          {rule.notes && (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</dt>
              <dd className="text-slate-700 break-words">{rule.notes}</dd>
            </div>
          )}
          {(rule.created_by_name || rule.created_at) && (
            <p className="text-xs text-slate-400">
              Created{rule.created_by_name ? ` by ${rule.created_by_name}` : ""}{rule.created_at ? ` · ${new Date(rule.created_at).toLocaleDateString()}` : ""}
            </p>
          )}
        </dl>
      </PopoverContent>
    </Popover>
  )
}
