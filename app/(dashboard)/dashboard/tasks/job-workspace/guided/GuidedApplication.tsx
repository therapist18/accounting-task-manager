// @ts-nocheck
"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Check, FileSignature, LayoutGrid, ListChecks, Loader2, RefreshCw, UploadCloud, Zap, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import { useCurrentUser } from "@/lib/hooks/use-current-user"
import { UploadModal } from "@/app/generic-components/UploadModal"
import TemplateGenerationComponent from "../../../tasks-requirements/TemplateGenerationDialog"
import { fetchMasterFields, buildTemplateGenerationInfo } from "../../../tasks-requirements/utils/templateGenerationData"
import { auditActor } from "../../utils/audit"
import type { JobWorkspaceData } from "../fetchJobWorkspaceData"
import { useAutomationReadiness, type DocReadinessItem, type FieldReadinessItem } from "../useAutomationReadiness"
import { useAutomationRunner } from "./useAutomationRunner"
import { DocumentsStep, DetailsStep, RunStep } from "./GuidedSteps"

interface GuidedApplicationProps {
  data: JobWorkspaceData
  automationId?: string | null
  automationJobs?: any[] | null
  onAutomationChange: (automationId: string) => void
  onExit: () => void
  onRefresh?: () => void
}

type StepId = "documents" | "details" | "letters" | "run"

export function GuidedApplication({ data, automationId, automationJobs, onAutomationChange, onExit, onRefresh }: GuidedApplicationProps) {
  const { task, automations = [], automationLinkSources = {}, kycDocsMap } = data
  const { user } = useCurrentUser()
  const actorId = auditActor(user).by_id

  // One automation -> straight in. Several -> the user picks (usually Application vs. later stages).
  const automation = useMemo(() => {
    if (automationId) return automations.find((a: any) => String(a.id) === String(automationId)) || null
    return automations.length === 1 ? automations[0] : null
  }, [automations, automationId])

  const readiness = useAutomationReadiness(data, automation, actorId)
  const runner = useAutomationRunner({ automation, task, automationJobs, actorId, onFinished: onRefresh })

  const steps = useMemo(() => {
    const all = [
      { id: "documents" as StepId, label: "Documents", hint: "Passports, photos, supporting files", icon: UploadCloud, summary: readiness.summary.documents },
      { id: "details" as StepId, label: "Details", hint: "What the documents didn't cover", icon: ListChecks, summary: readiness.summary.fields },
      { id: "letters" as StepId, label: "Letters", hint: "Generated from templates", icon: FileSignature, summary: readiness.summary.letters },
    ].filter(s => s.summary.total > 0)
    return [...all, { id: "run" as StepId, label: "Review & run", hint: "Check and submit", icon: Zap, summary: null }]
  }, [readiness.summary])

  const [stepId, setStepId] = useState<StepId | null>(null)
  const landedFor = useRef<string | null>(null)
  // Land on the first step that still needs something, once per automation - after
  // that the user's own navigation wins, even as items get completed under them.
  useEffect(() => {
    if (readiness.status !== "ready" || !automation) return
    if (landedFor.current === String(automation.id)) return
    landedFor.current = String(automation.id)
    const firstOpen = steps.find(s => s.summary && s.summary.requiredMissing > 0)
    setStepId((runner.isActive ? "run" : firstOpen?.id) || "run")
  }, [readiness.status, automation, steps, runner.isActive])

  const currentIdx = Math.max(0, steps.findIndex(s => s.id === stepId))
  const current = steps[currentIdx]

  // ---- dialogs: upload, letter generation, view ----
  const [uploadItem, setUploadItem] = useState<DocReadinessItem | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [generation, setGeneration] = useState<{ item: DocReadinessItem; info: any } | null>(null)

  const handleView = useCallback(async (item: DocReadinessItem) => {
    if (!item.doc?.file_path) return
    setBusyKey(item.key)
    try {
      const { data: signed, error } = await supabase.storage.from("kyc-documents").createSignedUrl(item.doc.file_path, 3600)
      if (error || !signed?.signedUrl) throw error || new Error("No URL")
      window.open(signed.signedUrl, "_blank", "noopener,noreferrer")
    } catch {
      toast.error("Couldn't open the file.")
    } finally {
      setBusyKey(null)
    }
  }, [])

  const handleGenerate = useCallback(async (item: DocReadinessItem) => {
    if (!item.docMeta) { toast.error("This letter's document type isn't configured."); return }
    setBusyKey(item.key)
    try {
      const masterFields = await fetchMasterFields()
      const info = await buildTemplateGenerationInfo(
        { document: { ...item.docMeta, id: item.docId } }, task, item.col.type, item.col.id,
        masterFields, task.job_level, item.requirement?.selectedTemplateId,
      )
      if (!info) { toast.error(`No template is set up for "${item.label}" yet.`); return }
      setGeneration({ item, info })
    } catch (err) {
      console.error("[guided] template preparation failed", err)
      toast.error("Couldn't load the letter template.")
    } finally {
      setBusyKey(null)
    }
  }, [task])

  const handleSaveField = useCallback(async (item: FieldReadinessItem, value: string) => {
    try {
      const { persisted } = await readiness.saveField(item, value)
      toast.success(persisted ? `${item.label} saved` : `${item.label} set for this run`)
    } catch (err: any) {
      toast.error(err?.message || `Couldn't save ${item.label}`)
    }
  }, [readiness.saveField])

  // ---- render ----
  const applicantName = task?.applicant_name || data.individual?.full_name || "Applicant"
  const jobTitle = task?.job_description || data.subdepartment?.name || data.department?.name || ""
  const totals = ["documents", "fields", "letters"].reduce((acc, k) => {
    acc.done += readiness.summary[k].done; acc.total += readiness.summary[k].total; return acc
  }, { done: 0, total: 0 })
  const pct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0

  return (
    <div className="h-screen flex flex-col bg-[#FAFAFC] overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-custom-blue via-blue-400 to-blue-300" />

      {/* Header */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onExit} title="Back to the full workspace">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <p className="text-xs font-medium text-custom-blue uppercase tracking-wide">Guided application</p>
            <h1 className="text-lg font-semibold text-slate-900 truncate">
              {automation?.name || "Choose an application"} <span className="text-slate-400 font-normal">· {applicantName}</span>
            </h1>
            {jobTitle && <p className="text-xs text-slate-500 truncate">{jobTitle}{task?.r_number ? ` · ${task.r_number}` : ""}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {readiness.refreshing && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…</span>
          )}
          {automations.length > 1 && automation && (
            <Button variant="ghost" size="sm" onClick={() => onAutomationChange("")}>Switch application</Button>
          )}
          <Button variant="outline" size="sm" onClick={onExit}>
            <LayoutGrid className="h-4 w-4 mr-1.5" /> Full workspace
          </Button>
        </div>
      </div>

      {!automation ? (
        <AutomationPicker automations={automations} linkSources={automationLinkSources} lastRuns={automationJobs} onPick={id => onAutomationChange(String(id))} onExit={onExit} />
      ) : readiness.status === "loading" ? (
        <GuidedSkeleton name={automation.name} />
      ) : readiness.status === "error" ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-base font-semibold text-slate-800">Couldn't load what this application needs</p>
          <p className="text-sm text-slate-500 max-w-md">{readiness.error}</p>
          <Button variant="outline" onClick={readiness.reload}><RefreshCw className="h-4 w-4 mr-1.5" /> Try again</Button>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* Stepper */}
          <aside className="w-72 shrink-0 bg-white border-r border-slate-200 flex flex-col">
            <div className="px-5 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1.5">
                <span>Overall</span><span className="tabular-nums">{totals.done}/{totals.total}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-500" : "bg-custom-blue")} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto p-3">
              <ol className="space-y-1">
                {steps.map((s, i) => {
                  const active = s.id === current?.id
                  const sm = s.summary
                  const complete = sm ? sm.requiredMissing === 0 : runner.run?.status === "completed"
                  const blocked = s.id === "run" && !readiness.canRun
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => setStepId(s.id)}
                        className={cn("w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors", active ? "bg-blue-50" : "hover:bg-slate-50")}
                      >
                        <span className={cn(
                          "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5",
                          complete ? "bg-emerald-500 text-white" : active ? "bg-custom-blue text-white" : "bg-slate-100 text-slate-500",
                        )}>
                          {complete ? <Check className="h-4 w-4" /> : i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block text-sm font-semibold", active ? "text-custom-blue" : "text-slate-800")}>{s.label}</span>
                          <span className="block text-xs text-slate-500 truncate">
                            {sm
                              ? sm.requiredMissing > 0
                                ? `${sm.requiredMissing} to do`
                                : sm.optionalMissing > 0 ? `Done · ${sm.optionalMissing} optional left` : "Done"
                              : runner.isActive ? "Running…" : blocked ? "Waiting on earlier steps" : s.hint}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </nav>
          </aside>

          {/* Step content */}
          <main className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto px-8 py-8">
                {current?.id === "documents" && (
                  <DocumentsStep items={readiness.documents} kind="document" busyKey={busyKey} onUpload={setUploadItem} onView={handleView} />
                )}
                {current?.id === "details" && <DetailsStep items={readiness.fields} onSave={handleSaveField} />}
                {current?.id === "letters" && (
                  <DocumentsStep items={readiness.letters} kind="letter" busyKey={busyKey} onUpload={setUploadItem} onView={handleView} onGenerate={handleGenerate} />
                )}
                {current?.id === "run" && (
                  <RunStep automation={automation} readiness={readiness} runner={runner} steps={steps} onGoTo={id => setStepId(id as StepId)} />
                )}
              </div>
            </div>
            <div className="shrink-0 bg-white border-t border-slate-200 px-8 py-3 flex items-center justify-between">
              <Button variant="ghost" disabled={currentIdx === 0} onClick={() => setStepId(steps[currentIdx - 1].id)}>
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
              </Button>
              <span className="text-xs text-slate-400">Step {currentIdx + 1} of {steps.length}</span>
              {currentIdx < steps.length - 1 ? (
                <Button className="bg-custom-blue hover:bg-custom-blue/90" onClick={() => setStepId(steps[currentIdx + 1].id)}>
                  {current?.summary?.requiredMissing ? "Skip for now" : "Continue"} <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              ) : <span className="w-24" />}
            </div>
          </main>
        </div>
      )}

      {uploadItem && (() => {
        const isCompany = uploadItem.col.type === "company"
        const docMeta = uploadItem.docMeta || kycDocsMap.get(uploadItem.docId)
        return (
          <UploadModal
            isOpen={true}
            onClose={() => setUploadItem(null)}
            onSuccess={() => { setUploadItem(null); toast.success("Uploaded - refreshing details read from the document…"); onRefresh?.() }}
            documentName={uploadItem.label}
            documentFields={docMeta?.fields || []}
            entityName={uploadItem.col.label}
            entityId={String(uploadItem.col.id)}
            selectedDoc={docMeta ? { ...docMeta, id: uploadItem.docId } : undefined}
            selectedMember={{ id: uploadItem.col.id, full_name: uploadItem.col.label, type: isCompany ? "company" : "individual", name: uploadItem.col.label }}
            selectedDocumentId={uploadItem.docId}
            targetTable={isCompany ? "acc_portal_kyc_uploads" : "acc_portal_directors_documents"}
            idFieldName={isCompany ? "company_id" : "director_id"}
            documentIdFieldName="document_id"
            isCompanyUpload={isCompany}
          />
        )
      })()}

      {generation && (
        <Dialog open onOpenChange={open => { if (!open) { setGeneration(null); onRefresh?.() } }}>
          <DialogContent className="max-w-[95vw] w-full h-[92vh] max-h-[92vh] p-0 overflow-hidden flex flex-col">
            <DialogHeader className="sr-only"><DialogTitle>{generation.item.label}</DialogTitle></DialogHeader>
            <div className="flex-1 min-h-0 flex flex-col">
              <TemplateGenerationComponent
                isOpen={true}
                task={generation.info.task}
                template={generation.info.template}
                availableTemplates={generation.info.availableTemplates}
                documentName={generation.item.label}
                masterFields={generation.info.masterFields}
                entityIdMap={generation.info.entityIdMap}
                sourceDataCache={generation.info.sourceDataCache}
                extractedData={generation.info.extractedData}
                personData={generation.info.personData}
                companyData={generation.info.companyData}
                relationshipData={generation.info.relationshipData}
                jobLevel={task.job_level}
                activeEntityType={generation.info.activeEntityType}
                activeEntityId={generation.info.activeEntityId?.toString()}
                refreshDocuments={async () => { onRefresh?.() }}
                onClose={() => { setGeneration(null); onRefresh?.() }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function GuidedSkeleton({ name }: { name: string }) {
  return (
    <div className="flex-1 flex min-h-0">
      <aside className="w-72 shrink-0 bg-white border-r border-slate-200 p-5 space-y-4">
        <Skeleton className="h-2 w-full" />
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-7 w-7 rounded-full" />
            <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-3 w-32" /></div>
          </div>
        ))}
      </aside>
      <main className="flex-1 overflow-hidden">
        <div className="max-w-4xl mx-auto px-8 py-8">
          <p className="flex items-center gap-2 text-sm text-slate-500 mb-5">
            <Loader2 className="h-4 w-4 animate-spin text-custom-blue" /> Checking what "{name}" needs…
          </p>
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-9 flex-1" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

function AutomationPicker({ automations, linkSources, lastRuns, onPick, onExit }) {
  if (!automations.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
        <Zap className="h-8 w-8 text-slate-300" />
        <p className="text-base font-semibold text-slate-800">No automation is linked to this job type</p>
        <p className="text-sm text-slate-500 max-w-md">Link one from the requirement or stage settings, then come back here.</p>
        <Button variant="outline" onClick={onExit}>Back to workspace</Button>
      </div>
    )
  }
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-10">
        <h2 className="text-xl font-semibold text-slate-900">Which application are you working on?</h2>
        <p className="text-sm text-slate-500 mt-1 mb-6">This job has more than one automated form.</p>
        <div className="space-y-3">
          {automations.map((a: any) => {
            const links = linkSources?.[String(a.id)] || { stages: [], requirements: [] }
            const where = [...links.stages.map((s: any) => s.name), ...links.requirements.map((r: any) => r.name)]
            const last = (lastRuns || []).find((j: any) => String(j.automation_id) === String(a.id))
            return (
              <button key={a.id} onClick={() => onPick(a.id)} className="w-full text-left bg-white border border-slate-200 hover:border-custom-blue hover:bg-blue-50/40 rounded-xl px-5 py-4 flex items-center justify-between gap-4 transition-colors">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-slate-900 truncate">{a.name || `Automation ${a.id}`}</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {where.length ? `Used in: ${where.join(", ")}` : `${(a.webdata || []).length} fields`}
                    {last ? ` · last run ${last.status}` : ""}
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400 shrink-0" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
