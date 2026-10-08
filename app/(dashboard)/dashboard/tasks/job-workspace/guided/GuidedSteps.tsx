// @ts-nocheck
"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle, Briefcase, Check, CheckCircle2, ChevronDown, ChevronRight, Eye, Loader2,
  Play, RefreshCw, StopCircle, UploadCloud, User, Users2, UserCheck, Wand2, XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { cn } from "@/lib/utils"
import { cleanFieldValue } from "../../utils/AutomationMappingDialog"
import type { DocReadinessItem, FieldReadinessItem } from "../useAutomationReadiness"
import type { ColDef } from "../automationShared"

// ---------- shared bits ----------

const ENTITY_STYLE: Record<string, { Icon: any; tone: string }> = {
  company: { Icon: Briefcase, tone: "bg-slate-700" },
  director: { Icon: UserCheck, tone: "bg-indigo-600" },
  dependant: { Icon: Users2, tone: "bg-blue-500" },
  principal: { Icon: UserCheck, tone: "bg-custom-blue" },
}

/** Groups items by person, in participant-column order. */
function groupByPerson<T extends { col: ColDef }>(items: T[]): { col: ColDef; items: T[] }[] {
  const groups = new Map<string, { col: ColDef; items: T[] }>()
  items.forEach(item => {
    const k = String(item.col.id)
    if (!groups.has(k)) groups.set(k, { col: item.col, items: [] })
    groups.get(k)!.items.push(item)
  })
  return Array.from(groups.values()).sort((a, b) => (a.col.priority ?? 99) - (b.col.priority ?? 99))
}

function PersonHeader({ col, done, total }: { col: ColDef; done: number; total: number }) {
  const { Icon, tone } = ENTITY_STYLE[col.type] || { Icon: User, tone: "bg-custom-blue" }
  const complete = done === total
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-white shrink-0", tone)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{col.label || "Unnamed"}</p>
          {col.subLabel && <p className="text-xs text-slate-500 capitalize">{String(col.subLabel).toLowerCase()}</p>}
        </div>
      </div>
      <span className={cn("text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full", complete ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
        {done}/{total}
      </span>
    </div>
  )
}

function StepIntro({ title, description, allDone, doneText }: { title: string; description: string; allDone: boolean; doneText: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500 mt-1">{description}</p>
      {allDone && (
        <div className="mt-3 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {doneText}
        </div>
      )}
    </div>
  )
}

function StatusDot({ satisfied, optional }: { satisfied: boolean; optional: boolean }) {
  if (satisfied) return <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
  return <div className={cn("h-5 w-5 rounded-full border-2 shrink-0", optional ? "border-slate-300 border-dashed" : "border-amber-400")} />
}

const OptionalTag = () => <Badge variant="outline" className="text-[10px] font-medium text-slate-500 border-slate-200 bg-white">Optional</Badge>

// ---------- Documents & Letters ----------

function DocRow({ item, busyKey, onUpload, onView, onGenerate }: {
  item: DocReadinessItem
  busyKey: string | null
  onUpload: (item: DocReadinessItem) => void
  onView: (item: DocReadinessItem) => void
  onGenerate?: (item: DocReadinessItem) => void
}) {
  const busy = busyKey === item.key
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0">
      <StatusDot satisfied={item.satisfied} optional={item.optional} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-800 truncate">{item.label}</p>
          {item.optional && <OptionalTag />}
        </div>
        <p className="text-xs text-slate-500 mt-0.5 truncate">
          {item.satisfied
            ? `${item.doc?.file_name || "File"} · ${item.doc?.created_at ? new Date(item.doc.created_at).toLocaleDateString() : "uploaded"}`
            : item.kind === "letter" ? "Not generated yet" : "Not uploaded yet"}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {item.satisfied && (
          <Button variant="ghost" size="sm" className="h-8 text-slate-600" disabled={busy} onClick={() => onView(item)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4 mr-1.5" />}{!busy && "View"}
          </Button>
        )}
        {item.kind === "letter" && onGenerate && (
          <Button size="sm" variant={item.satisfied ? "outline" : "default"} className={cn("h-8", !item.satisfied && "bg-custom-blue hover:bg-custom-blue/90")} disabled={busy} onClick={() => onGenerate(item)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Wand2 className="h-4 w-4 mr-1.5" />}
            {busy ? "Preparing…" : item.satisfied ? "Regenerate" : "Generate"}
          </Button>
        )}
        <Button
          size="sm"
          variant={item.satisfied || item.kind === "letter" ? "outline" : "default"}
          className={cn("h-8", !item.satisfied && item.kind !== "letter" && "bg-custom-blue hover:bg-custom-blue/90")}
          onClick={() => onUpload(item)}
          title={item.kind === "letter" ? "Upload a signed or existing copy instead" : undefined}
        >
          <UploadCloud className="h-4 w-4 mr-1.5" />
          {item.satisfied ? "Replace" : item.kind === "letter" ? "Upload copy" : "Upload"}
        </Button>
      </div>
    </div>
  )
}

export function DocumentsStep({ items, kind, busyKey, onUpload, onView, onGenerate }: {
  items: DocReadinessItem[]
  kind: "document" | "letter"
  busyKey: string | null
  onUpload: (item: DocReadinessItem) => void
  onView: (item: DocReadinessItem) => void
  onGenerate?: (item: DocReadinessItem) => void
}) {
  const groups = useMemo(() => groupByPerson(items), [items])
  const allDone = items.every(i => i.satisfied || i.optional)
  return (
    <div>
      {kind === "document" ? (
        <StepIntro
          title="Upload documents"
          description="Start here - details like names, passport numbers and dates are read from these files, so the next step gets shorter."
          allDone={allDone}
          doneText="All required documents are in."
        />
      ) : (
        <StepIntro
          title="Prepare letters"
          description="These are generated from templates using the details you've filled in. You can also upload a signed copy instead."
          allDone={allDone}
          doneText="All required letters are ready."
        />
      )}
      <div className="space-y-4">
        {groups.map(({ col, items }) => (
          <div key={String(col.id)} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <PersonHeader col={col} done={items.filter(i => i.satisfied).length} total={items.length} />
            {items.map(item => (
              <DocRow key={item.key} item={item} busyKey={busyKey} onUpload={onUpload} onView={onView} onGenerate={onGenerate} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Details ----------

function FieldRow({ item, onSave }: { item: FieldReadinessItem; onSave: (item: FieldReadinessItem, value: string) => Promise<void> }) {
  const initial = item.satisfied ? String(cleanFieldValue(item.value) ?? "") : ""
  const initialOption = item.options.find(o => o.label === initial || o.value === initial)?.value ?? initial
  const [value, setValue] = useState(item.options.length ? initialOption : initial)
  const [saving, setSaving] = useState(false)
  const baseline = item.options.length ? initialOption : initial
  useEffect(() => { setValue(baseline) }, [baseline])
  const dirty = value.trim() !== baseline.trim() && value.trim() !== ""

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    try { await onSave(item, value.trim()) } finally { setSaving(false) }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-b-0">
      <StatusDot satisfied={item.satisfied} optional={item.optional} />
      <div className="w-56 shrink-0 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-800 truncate" title={item.label}>{item.label}</p>
          {item.optional && <OptionalTag />}
        </div>
        {item.groupLabel && <p className="text-[11px] text-slate-400 truncate">{item.groupLabel}</p>}
      </div>
      <div className="flex-1 min-w-0">
        {item.options.length > 0 ? (
          <SearchableSelect
            value={value}
            onValueChange={setValue}
            options={item.options}
            placeholder="Select…"
            buttonClassName="h-9 text-sm w-full bg-white"
            disabled={saving}
          />
        ) : (
          <Input
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setValue(baseline) }}
            placeholder={item.fieldType === "date" ? "e.g. 2026-01-31" : "Enter value"}
            className="h-9 text-sm"
            disabled={saving}
          />
        )}
      </div>
      <div className="w-24 shrink-0 flex justify-end">
        {dirty ? (
          <Button size="sm" className="h-8 bg-custom-blue hover:bg-custom-blue/90" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" />Save</>}
          </Button>
        ) : !item.persistable && item.satisfied ? (
          <span className="text-[11px] text-slate-400 text-right leading-tight" title="This field isn't linked to a saved record - the value is used for runs in this session only.">This session only</span>
        ) : null}
      </div>
    </div>
  )
}

export function DetailsStep({ items, onSave }: { items: FieldReadinessItem[]; onSave: (item: FieldReadinessItem, value: string) => Promise<void> }) {
  const [showFilled, setShowFilled] = useState(false)
  const missing = items.filter(i => !i.satisfied)
  const filled = items.filter(i => i.satisfied)
  const missingGroups = useMemo(() => groupByPerson(missing.slice().sort((a, b) => Number(a.optional) - Number(b.optional))), [missing])
  const filledGroups = useMemo(() => groupByPerson(filled), [filled])
  const allDone = missing.every(i => i.optional)

  return (
    <div>
      <StepIntro
        title="Fill in missing details"
        description={`Only what's still missing is shown. ${filled.length} detail${filled.length === 1 ? " is" : "s are"} already filled from records and documents.`}
        allDone={allDone}
        doneText={missing.length === 0 ? "Every detail is filled in." : "All required details are filled in - the rest are optional."}
      />
      <div className="space-y-4">
        {missingGroups.map(({ col, items }) => (
          <div key={String(col.id)} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <PersonHeader col={col} done={0} total={items.length} />
            {items.map(item => <FieldRow key={item.key} item={item} onSave={onSave} />)}
          </div>
        ))}
      </div>

      {filled.length > 0 && (
        <div className="mt-6">
          <button className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900" onClick={() => setShowFilled(v => !v)}>
            {showFilled ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Already filled ({filled.length}) - check or correct
          </button>
          {showFilled && (
            <div className="space-y-4 mt-3">
              {filledGroups.map(({ col, items }) => (
                <div key={String(col.id)} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <PersonHeader col={col} done={items.length} total={items.length} />
                  {items.map(item => <FieldRow key={item.key} item={item} onSave={onSave} />)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Review & run ----------

type StepRef = { id: string; label: string }

function MissingList({ title, tone, items, steps, onGoTo }: {
  title: string
  tone: "red" | "amber"
  items: { item: any; stepId: string }[]
  steps: StepRef[]
  onGoTo: (stepId: string) => void
}) {
  const [open, setOpen] = useState(tone === "red")
  if (items.length === 0) return null
  const byStep = steps.map(s => ({ step: s, items: items.filter(i => i.stepId === s.id) })).filter(g => g.items.length)
  return (
    <div className={cn("rounded-xl border px-4 py-3", tone === "red" ? "bg-red-50/60 border-red-100" : "bg-amber-50/60 border-amber-100")}>
      <button className="w-full flex items-center justify-between" onClick={() => setOpen(v => !v)}>
        <span className={cn("flex items-center gap-2 text-sm font-semibold", tone === "red" ? "text-red-800" : "text-amber-800")}>
          {tone === "red" ? <XCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {title}
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {byStep.map(({ step, items }) => (
            <div key={step.id} className="flex items-start justify-between gap-4">
              <p className="text-sm text-slate-700">
                <span className="font-medium">{step.label}:</span>{" "}
                {items.slice(0, 6).map(({ item }) => `${item.label}${item.col?.label ? ` (${item.col.label})` : ""}`).join(", ")}
                {items.length > 6 && ` and ${items.length - 6} more`}
              </p>
              <Button variant="link" size="sm" className="h-auto p-0 text-custom-blue shrink-0" onClick={() => onGoTo(step.id)}>Go to step</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RunProgress({ run, onStop, onReset }: { run: any; onStop: () => void; onReset: () => void }) {
  const logsEnd = useRef<HTMLDivElement>(null)
  useEffect(() => { logsEnd.current?.scrollIntoView({ block: "nearest" }) }, [run?.logs?.length])
  const active = ["pending", "claiming", "running"].includes(run.status)
  const failed = ["failed", "cancelled", "interrupted"].includes(run.status)
  const done = run.status === "completed"

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={cn("text-base font-semibold", failed ? "text-red-700" : done ? (run.needsReview ? "text-amber-700" : "text-emerald-700") : "text-slate-900")}>
            {active ? "Running the application…" : done ? (run.needsReview ? "Filled in - needs a manual check" : "Application completed") : run.status === "cancelled" ? "Stopped" : "Run failed"}
          </p>
          <p className="text-sm text-slate-500 mt-0.5">
            {failed ? (run.error || run.message || "Unknown error") : done
              ? (run.evidenceSaved ? "The confirmation screenshot was saved to the applicant's documents." : run.message || "The automation finished.")
              : (run.currentStep ? `${run.currentStep}${run.message ? ` - ${run.message}` : ""}` : run.message || "Working…")}
          </p>
          {active && <p className="text-xs text-slate-400 mt-1">You can leave this page - the run continues in the desktop app and you'll be notified when it finishes.</p>}
        </div>
        {active ? (
          <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 shrink-0" onClick={onStop} disabled={!run.jobId}>
            <StopCircle className="h-4 w-4 mr-1.5" /> Stop
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="shrink-0" onClick={onReset}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> {failed ? "Try again" : "Run again"}
          </Button>
        )}
      </div>
      {(active || done) && <Progress value={done ? 100 : run.progress || 2} className="h-1 rounded-none" />}
      {run.logs?.length > 0 && (
        <details className="border-t border-slate-100 group">
          <summary className="px-5 py-2 text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-slate-800">Run log ({run.logs.length})</summary>
          <div className="max-h-56 overflow-y-auto bg-slate-950 text-slate-200 font-mono text-[11px] px-4 py-3 space-y-0.5">
            {run.logs.map((l: any, i: number) => (
              <div key={i} className={cn(l.level === "error" && "text-red-400", l.level === "warn" && "text-amber-300")}>{l.message}</div>
            ))}
            <div ref={logsEnd} />
          </div>
        </details>
      )}
    </div>
  )
}

export function RunStep({ automation, readiness, runner, steps, onGoTo }: {
  automation: any
  readiness: any
  runner: any
  steps: StepRef[]
  onGoTo: (stepId: string) => void
}) {
  const [showData, setShowData] = useState(false)
  const all = [
    ...readiness.documents.map((item: any) => ({ item, stepId: "documents" })),
    ...readiness.fields.map((item: any) => ({ item, stepId: "details" })),
    ...readiness.letters.map((item: any) => ({ item, stepId: "letters" })),
  ]
  const required = all.filter(x => !x.item.satisfied && !x.item.optional)
  const optional = all.filter(x => !x.item.satisfied && x.item.optional)
  const { run, lastRun, starting, isActive } = runner
  const formPreview = useMemo(() => showData ? readiness.buildFormData() : null, [showData, readiness.buildFormData])

  return (
    <div>
      <StepIntro
        title="Review & run"
        description={`Runs "${automation?.name || "the automation"}" in the desktop app using everything collected in the earlier steps.`}
        allDone={false}
        doneText=""
      />

      <div className="space-y-3">
        <MissingList title={`${required.length} required item${required.length === 1 ? "" : "s"} still missing`} tone="red" items={required} steps={steps} onGoTo={onGoTo} />
        <MissingList title={`${optional.length} optional item${optional.length === 1 ? "" : "s"} left blank - the run can go ahead without them`} tone="amber" items={optional} steps={steps} onGoTo={onGoTo} />

        {required.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Everything required is in place - {readiness.summary.documents.done + readiness.summary.letters.done} document{readiness.summary.documents.done + readiness.summary.letters.done === 1 ? "" : "s"} and {readiness.summary.fields.done} detail{readiness.summary.fields.done === 1 ? "" : "s"}.
          </div>
        )}

        {run ? (
          <RunProgress run={run} onStop={runner.stop} onReset={runner.reset} />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-base font-semibold text-slate-900">Ready to submit?</p>
              <p className="text-sm text-slate-500 mt-0.5">
                {lastRun
                  ? `Last run ${new Date(lastRun.completed_at || lastRun.created_at).toLocaleString()} - ${lastRun.result?.status === "needs_review" ? "needed review" : lastRun.status}.`
                  : "This automation hasn't been run for this task yet."}
              </p>
            </div>
            <Button
              size="lg"
              className={cn("shrink-0", optional.length > 0 && required.length === 0 ? "bg-amber-600 hover:bg-amber-700" : "bg-custom-blue hover:bg-custom-blue/90")}
              disabled={!readiness.canRun || starting || isActive}
              onClick={() => runner.start(readiness.buildFormData())}
              title={!readiness.canRun ? "Complete the required items first" : undefined}
            >
              {starting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {optional.length > 0 && required.length === 0 ? "Run anyway" : "Run automation"}
            </Button>
          </div>
        )}

        <div>
          <button className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900" onClick={() => setShowData(v => !v)}>
            {showData ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            See the data that will be sent
          </button>
          {showData && formPreview && (
            <div className="mt-3 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
              {Object.entries(formPreview).map(([key, val]) => (
                <div key={key} className="flex gap-4 px-4 py-2 text-sm">
                  <span className="w-56 shrink-0 font-mono text-xs text-slate-500 pt-0.5 truncate" title={key}>{key}</span>
                  <span className={cn("flex-1 min-w-0 break-words", val == null || val === "" ? "text-slate-300 italic" : "text-slate-800")}>
                    {val == null || val === "" ? "empty" : Array.isArray(val) ? `${val.length} row${val.length === 1 ? "" : "s"}` : typeof val === "object" ? JSON.stringify(val) : String(val).startsWith("http") ? "File attached" : String(val)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
