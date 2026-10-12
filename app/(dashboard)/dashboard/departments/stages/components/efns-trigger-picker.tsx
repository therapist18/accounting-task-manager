"use client"

// "Filled from EFNS" on a stage document: which EFNS notifications / invoices fill it. The filing job
// (lib/efnsFiling.server.ts) saves a matching item's PDF to the task as this document and completes
// the stage.

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Inbox } from "lucide-react"
import { cn } from "@/lib/utils"
import { EFNS_FEE_TYPES, EFNS_STATUSES, isEfnsTriggerSet, type EfnsTrigger } from "@/lib/efnsFiling"

interface Props {
  docId: string
  value: EfnsTrigger | null | undefined
  onChange: (value: EfnsTrigger | null) => void
}

function Chips({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o)
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              on ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-emerald-400",
            )}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

export function EfnsTriggerPicker({ docId, value, onChange }: Props) {
  const enabled = !!value
  // Saved rules may still carry permitGroups from before; they're dropped on the next change.
  const { permitGroups: _ignored, ...trigger }: EfnsTrigger = value ?? { statuses: [] }
  const toggle = (key: "statuses" | "feeTypes", v: string) => {
    const list = trigger[key] ?? []
    onChange({ ...trigger, [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] })
  }

  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex items-start space-x-3">
        <Checkbox
          id={`doc-efns-${docId}`}
          checked={enabled}
          onCheckedChange={(c) => onChange(c ? { statuses: [] } : null)}
          className="mt-1 data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600"
        />
        <div>
          <Label htmlFor={`doc-efns-${docId}`} className="flex items-center gap-2 font-medium text-gray-800">
            <Inbox className="h-4 w-4 text-emerald-600" /> Filled from EFNS
          </Label>
          <p className="text-xs text-muted-foreground">
            EFNS notifications / invoices with one of these statuses are saved to the task as this document, and the
            stage is completed. They're only filed to tasks whose job level this stage (and document) applies to.
          </p>
        </div>
      </div>
      {enabled && (
        <div className="space-y-3 pl-7">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-700">Status</Label>
            <Chips options={EFNS_STATUSES} selected={trigger.statuses} onToggle={(v) => toggle("statuses", v)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-700">
              Fee type <span className="font-normal text-muted-foreground">(payments only — leave empty for any)</span>
            </Label>
            <Chips options={EFNS_FEE_TYPES} selected={trigger.feeTypes ?? []} onToggle={(v) => toggle("feeTypes", v)} />
          </div>
          {!isEfnsTriggerSet(trigger) && (
            <p className="text-xs text-amber-700">Pick at least one status — until then nothing is filed here.</p>
          )}
        </div>
      )}
    </div>
  )
}
