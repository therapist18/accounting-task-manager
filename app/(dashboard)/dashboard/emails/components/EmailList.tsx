"use client"

import { Paperclip, Inbox, CornerUpLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { DISPOSITION_BADGE } from "./chrome"
import { DISPOSITION_LABEL, type CategoryOption, type Disposition, type EmailRow } from "./types"
import { fmtDateTime } from "./utils"

export function EmailList({
  emails,
  categories,
  onOpen,
  onQuickClassify,
}: {
  emails: EmailRow[]
  categories: CategoryOption[]
  onOpen: (e: EmailRow) => void
  onQuickClassify: (e: EmailRow, d: Disposition) => void
}) {
  if (!emails.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2 border border-slate-200 rounded-2xl bg-white shadow-sm">
        <Inbox className="w-8 h-8" />
        <p className="text-sm font-medium">Nothing needs review right now.</p>
      </div>
    )
  }

  const byKey = new Map(categories.map((c) => [c.key, c]))

  return (
    <div className="border border-slate-200 rounded-2xl bg-white shadow-sm divide-y divide-slate-100 overflow-hidden">
      {emails.map((e) => {
        const cat = e.category_key ? byKey.get(e.category_key) : null
        return (
          <div
            key={e.id}
            onClick={() => onOpen(e)}
            className={cn("flex items-start gap-3 px-5 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors", !e.is_read && "bg-blue-50/40")}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className={cn("text-sm truncate", !e.is_read ? "font-bold text-slate-900" : "font-semibold text-slate-700")}>
                  {e.direction === "outbound" && <CornerUpLeft className="inline w-3 h-3 mr-1 text-slate-400" />}
                  {e.company_name ?? <span className="text-red-500">Unassigned</span>}
                  <span className="font-normal text-slate-400"> · {e.sender_name || e.sender_email}</span>
                </p>
                <span className="text-xs text-slate-400 shrink-0 tabular-nums">{fmtDateTime(e.received_at)}</span>
              </div>
              <p className="text-sm text-slate-800 truncate mt-0.5">{e.subject || "(no subject)"}</p>
              <p className="text-xs text-slate-400 truncate mt-0.5">{e.ai_summary || e.snippet}</p>

              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {e.disposition && (
                  <span className={cn("text-[10px] font-bold px-2.5 py-0.5 rounded-full border", DISPOSITION_BADGE[e.disposition])}>
                    {DISPOSITION_LABEL[e.disposition]}
                  </span>
                )}
                {cat && (
                  <span
                    className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border"
                    style={{ background: `${cat.color ?? "#6b7280"}14`, color: cat.color ?? "#6b7280", borderColor: `${cat.color ?? "#6b7280"}33` }}
                  >
                    {cat.name}
                  </span>
                )}
                {e.classification_source && e.category_confidence !== null && (
                  <span className="text-[10px] text-slate-400 font-medium">
                    {e.classification_source} · {Math.round(e.category_confidence * 100)}%
                  </span>
                )}
                {e.has_attachments && <Paperclip className="w-3 h-3 text-slate-400" />}
                {e.case_id && <span className="text-[10px] font-bold text-emerald-600">● in a case</span>}
              </div>
              {e.disposition === "needs_review" && e.review_reason && (
                <p className="text-[11px] text-amber-700 mt-1.5 font-medium">{e.review_reason}</p>
              )}
            </div>

            {e.disposition === "needs_review" && (
              <div className="flex gap-1.5 shrink-0" onClick={(ev) => ev.stopPropagation()}>
                <Button size="sm" variant="outline" className="h-7 px-3 rounded-full text-xs font-bold border-slate-200" onClick={() => onQuickClassify(e, "action_required")}>Action</Button>
                <Button size="sm" variant="outline" className="h-7 px-3 rounded-full text-xs font-bold border-slate-200" onClick={() => onQuickClassify(e, "update_only")}>Update</Button>
                <Button size="sm" variant="ghost" className="h-7 px-3 rounded-full text-xs font-bold text-slate-500" onClick={() => onQuickClassify(e, "ignore")}>Ignore</Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
