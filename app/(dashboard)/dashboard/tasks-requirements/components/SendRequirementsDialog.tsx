// @ts-nocheck
"use client"

import React, { useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { CheckCircle2, AlertCircle, XCircle, Copy, Check, ExternalLink, Printer, FileText, Send, Database, HelpCircle } from "lucide-react"
import { resolveTargetEntityIdImpl, resolveVariableValueImpl, getArrayFieldDataImpl } from "../../tasks/utils/fieldResolution"

interface SendRequirementsDialogProps {
  isOpen: boolean
  onClose: () => void
  selectedApplicant: string
  tasks: any[]
  taskClassRequirements: Record<string, any>
  automationWebdataMap: Record<string, { name: string; webdata: any[] }>
  allCompanyDocuments: Record<string, any[]>
  allIndividualDocuments: Record<string, any[]>
  fieldSourceDataCache: Record<string, Record<string, any>>
  fieldMasterComputedCache: Record<string, any>
  jobFieldsRecord: Record<string, any>
  relationshipData: any[]
}

export function SendRequirementsDialog({
  isOpen,
  onClose,
  selectedApplicant,
  tasks,
  taskClassRequirements,
  automationWebdataMap,
  allCompanyDocuments,
  allIndividualDocuments,
  fieldSourceDataCache,
  fieldMasterComputedCache,
  jobFieldsRecord,
  relationshipData
}: SendRequirementsDialogProps) {
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState("status")

  const clientRequirements = useMemo(() => {
    const docs: any[] = []
    const questions: any[] = []
    const fields: any[] = []

    tasks.forEach((task, groupIndex) => {
      const classReqs = taskClassRequirements[task.id]
      if (!classReqs) return

      // 1. Documents
      if (classReqs.requirements) {
        classReqs.requirements.forEach((req: any) => {
          if (req.is_client_requirement) {
            docs.push({ ...req, task, groupIndex })
          }
        })
      }

      // 2. Job Questions
      if (classReqs.job_specific_questions) {
        classReqs.job_specific_questions.forEach((q: any) => {
          if (q.is_client_requirement) {
            questions.push({ ...q, task, groupIndex })
          }
        })
      }

      // 3. Automation Fields
      const reqs = classReqs.requirements || []
      reqs.forEach((req: any) => {
        if (req.web_automation?.automationId) {
          const auto = automationWebdataMap[req.web_automation.automationId]
          if (auto?.webdata) {
            auto.webdata.forEach((field: any) => {
              if (field.is_client_requirement) {
                // Avoid duplicates within the same group/task
                if (!fields.some(f => f.variableName === field.variableName && f.groupIndex === groupIndex)) {
                  fields.push({
                    ...field,
                    automationId: req.web_automation.automationId,
                    automationName: auto.name,
                    task,
                    groupIndex
                  })
                }
              }
              if (field.fieldType === 'array' && Array.isArray(field.arrayItems)) {
                field.arrayItems.forEach((item: any, itemIndex: number) => {
                  if (!item.is_client_requirement) return
                  const variableName = `${field.variableName}.${item.variableName || item.name || itemIndex}`
                  if (!fields.some(f => f.variableName === variableName && f.groupIndex === groupIndex)) {
                    fields.push({
                      ...item,
                      parentVariableName: field.variableName,
                      variableName,
                      automationId: req.web_automation.automationId,
                      automationName: auto.name,
                      task,
                      groupIndex
                    })
                  }
                })
              }
            })
          }
        }
      })
    })

    return { docs, questions, fields }
  }, [tasks, taskClassRequirements, automationWebdataMap])

  // Helper to build field context
  const buildCtx = (automationId: string, fields: any[], groupIndex: number, task: any) => ({
    sourceData: fieldSourceDataCache,
    jobFields: jobFieldsRecord,
    webData: [{ automationId, fields }],
    selectedAutomationId: automationId,
    masterFieldComputedValues: fieldMasterComputedCache,
    relationshipData: relationshipData[groupIndex],
    taskId: task?.id,
    currentIndividualId: task?.individual_id?.toString(),
    task,
  })

  // Helper to get doc status
  const getDocStatus = (docRequirement: any, task: any) => {
    const docIds = docRequirement.document_ids || (docRequirement.document_id ? [docRequirement.document_id] : [])
    if (docIds.length === 0) return { label: 'Missing', color: 'text-red-500', bgColor: 'bg-red-50', status: 'missing' }

    let foundDocs: any[] = []
    const companyId = task.company_id
    if (companyId && allCompanyDocuments[companyId]) {
      foundDocs.push(...allCompanyDocuments[companyId].filter(doc => docIds.includes(doc.document_id) && doc.status !== 'deleted'))
    }
    const individualId = task.individual_id
    if (individualId && allIndividualDocuments[individualId]) {
      foundDocs.push(...allIndividualDocuments[individualId].filter(doc => docIds.includes(doc.document_id) && doc.status !== 'deleted'))
    }

    if (foundDocs.length === 0) {
      return { label: 'Missing', color: 'text-red-500', bgColor: 'bg-red-50', status: 'missing' }
    }

    const activeDocs = foundDocs.filter(d => d.status === 'active')
    if (activeDocs.length === 0) {
      const draftDocs = foundDocs.filter(d => d.status === 'draft')
      if (draftDocs.length > 0) {
        return { label: 'Draft Uploaded', color: 'text-amber-500', bgColor: 'bg-amber-50', status: 'draft' }
      }
      return { label: 'Missing', color: 'text-red-500', bgColor: 'bg-red-50', status: 'missing' }
    }

    const latestDoc = activeDocs.reduce((prev, curr) => new Date(curr.created_at) > new Date(prev.created_at) ? curr : prev)
    if (latestDoc.expiry_date) {
      const expiry = new Date(latestDoc.expiry_date)
      if (expiry < new Date()) {
        return {
          label: `Expired (${new Date(latestDoc.expiry_date).toLocaleDateString()})`,
          color: 'text-red-650',
          bgColor: 'bg-red-50',
          status: 'expired'
        }
      }
      return {
        label: `Valid (Expires ${new Date(latestDoc.expiry_date).toLocaleDateString()})`,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        status: 'valid'
      }
    }

    return { label: 'Valid', color: 'text-green-600', bgColor: 'bg-green-50', status: 'valid' }
  }

  // Helper to check if field is missing value
  const isFieldMissingVal = (field: any, task: any, groupIndex: number) => {
    const isArray = field.fieldType === 'array'
    const isDocument = field.fieldType === 'document'
    const isComputed = field.fieldType === 'computed'

    if (isArray || isDocument || isComputed) return false

    const ctx = buildCtx(field.automationId, [field], groupIndex, task)
    const targetEntityId = resolveTargetEntityIdImpl(field, ctx)
    if (targetEntityId == null) return true

    const val = resolveVariableValueImpl(field, String(targetEntityId), ctx)
    return val === null || val === undefined || val === "" || val === "Missing"
  }

  // Helper to check if question is missing answer
  const isQuestionMissingVal = (q: any, task: any) => {
    const val = task.job_specific_answers?.[q.id]
    return val === null || val === undefined || val === ""
  }

  const clientUrl = useMemo(() => {
    if (typeof window === "undefined" || !tasks?.[0]?.id) return ""
    return `${window.location.origin}/client/fill-requirements?taskId=${tasks[0].id}`
  }, [tasks])

  const copyToClipboard = () => {
    if (!clientUrl) return
    navigator.clipboard.writeText(clientUrl)
    setCopied(true)
    toast.success("Client link copied to clipboard!")
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePrint = () => {
    const printWindow = window.open("", "_blank")
    if (!printWindow) return

    const html = `
      <html>
        <head>
          <title>Client Requirements Checklist - ${selectedApplicant}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #334155; line-height: 1.5; }
            h1 { color: #1e3a8a; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; font-size: 26px; }
            h2 { color: #2563eb; margin-top: 30px; font-size: 18px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
            th, td { border: 1px solid #e2e8f0; padding: 12px; text-align: left; }
            th { background-color: #f8fafc; font-weight: 600; color: #475569; }
            .status { font-weight: bold; text-transform: uppercase; font-size: 12px; padding: 4px 8px; border-radius: 4px; display: inline-block; }
            .missing { color: #dc2626; background-color: #fef2f2; border: 1px solid #fecaca; }
            .valid { color: #16a34a; background-color: #f0fdf4; border: 1px solid #bbf7d0; }
            .draft { color: #d97706; background-color: #fef3c7; border: 1px solid #fde68a; }
            .instructions { font-size: 12px; color: #64748b; margin-top: 4px; }
          </style>
        </head>
        <body>
          <h1>Outstanding Requirements & Information</h1>
          <p><strong>Applicant Name:</strong> ${selectedApplicant}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          
          <h2>1. Required Documents</h2>
          <table>
            <thead>
              <tr>
                <th style="width: 8%">#</th>
                <th style="width: 42%">Document Name</th>
                <th style="width: 35%">Description / Instructions</th>
                <th style="width: 15%">Status</th>
              </tr>
            </thead>
            <tbody>
              ${clientRequirements.docs.map((doc, idx) => {
                const status = getDocStatus(doc, doc.task)
                const statusClass = status.status === 'valid' ? 'valid' : status.status === 'draft' ? 'draft' : 'missing'
                return `
                  <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${doc.name}</strong></td>
                    <td>${doc.description || 'Please provide this document.'}</td>
                    <td><span class="status ${statusClass}">${status.label}</span></td>
                  </tr>
                `
              }).join('')}
            </tbody>
          </table>

          <h2>2. Required Information Fields</h2>
          <table>
            <thead>
              <tr>
                <th style="width: 8%">#</th>
                <th style="width: 42%">Field Name</th>
                <th style="width: 50%">Instructions</th>
              </tr>
            </thead>
            <tbody>
              ${[
                ...clientRequirements.questions.map(q => ({ name: q.label, type: 'Question', instructions: q.required ? 'Required *' : 'Optional' })),
                ...clientRequirements.fields.filter(f => isFieldMissingVal(f, f.task, f.groupIndex)).map(f => ({
                  name: f.efnsDisplayName || f.name || f.variableName,
                  type: 'Field',
                  instructions: f.description || `Please provide value for ${f.efnsDisplayName || f.name}.`
                }))
              ].map((item, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td><strong>${item.name}</strong></td>
                  <td><div class="instructions">${item.instructions}</div></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 500)
  }

  const missingFieldsCount = useMemo(() => {
    const missingFields = clientRequirements.fields.filter(f => isFieldMissingVal(f, f.task, f.groupIndex)).length
    const missingQuestions = clientRequirements.questions.filter(q => isQuestionMissingVal(q, q.task)).length
    return missingFields + missingQuestions
  }, [clientRequirements])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-full max-h-[85vh] flex flex-col bg-white">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-800">
            <Send className="h-5 w-5 text-blue-600" />
            Send Requirements: {selectedApplicant}
          </DialogTitle>
          <DialogDescription>
            Review client requirements and choose how to collect them.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden my-4">
          <TabsList className="grid grid-cols-3 w-full max-w-md shrink-0">
            <TabsTrigger value="status">Status Checklist</TabsTrigger>
            <TabsTrigger value="link">Client Link</TabsTrigger>
            <TabsTrigger value="pdf">Print / Export PDF</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden mt-4">
            {/* TABS CONTENT: STATUS CHECKLIST */}
            <TabsContent value="status" className="h-full flex flex-col m-0">
              <ScrollArea className="flex-1 pr-2">
                <div className="space-y-6">
                  {/* Documents Checklist */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <FileText className="h-4 w-4" />
                      Client Documents ({clientRequirements.docs.length})
                    </h3>
                    <div className="border rounded-md divide-y bg-slate-50/50">
                      {clientRequirements.docs.length > 0 ? (
                        clientRequirements.docs.map((doc, idx) => {
                          const status = getDocStatus(doc, doc.task)
                          return (
                            <div key={idx} className="p-3 flex items-center justify-between bg-white text-sm">
                              <div>
                                <p className="font-semibold text-slate-700">{doc.name}</p>
                                {doc.description && <p className="text-xs text-slate-400 line-clamp-1">{doc.description}</p>}
                              </div>
                              <Badge className={`${status.bgColor} ${status.color} border border-current shadow-sm uppercase font-bold text-[10px]`}>
                                {status.label}
                              </Badge>
                            </div>
                          )
                        })
                      ) : (
                        <p className="p-4 text-center text-sm text-slate-400 italic">No document requirements marked as Client Requirement.</p>
                      )}
                    </div>
                  </div>

                  {/* Fields Checklist */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Database className="h-4 w-4" />
                      Outstanding Fields & Questions ({missingFieldsCount})
                    </h3>
                    <div className="border rounded-md divide-y bg-slate-50/50">
                      {clientRequirements.questions.length > 0 || clientRequirements.fields.length > 0 ? (
                        <>
                          {clientRequirements.questions.map((q, idx) => {
                            const isMissing = isQuestionMissingVal(q, q.task)
                            return (
                              <div key={`q-${idx}`} className="p-3 flex items-center justify-between bg-white text-sm">
                                <div>
                                  <p className="font-semibold text-slate-700">{q.label}</p>
                                  <p className="text-[10px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded w-fit mt-1">Question</p>
                                </div>
                                <Badge variant={isMissing ? "destructive" : "secondary"} className="uppercase font-bold text-[10px]">
                                  {isMissing ? "Missing" : "Answered"}
                                </Badge>
                              </div>
                            )
                          })}
                          {clientRequirements.fields.map((f, idx) => {
                            const isMissing = isFieldMissingVal(f, f.task, f.groupIndex)
                            return (
                              <div key={`f-${idx}`} className="p-3 flex items-center justify-between bg-white text-sm">
                                <div>
                                  <p className="font-semibold text-slate-700">{f.efnsDisplayName || f.name || f.variableName}</p>
                                  <p className="text-[10px] text-blue-600 bg-blue-50 px-1 py-0.5 rounded w-fit mt-1">Automation Field ({f.automationName})</p>
                                </div>
                                <Badge variant={isMissing ? "destructive" : "secondary"} className="uppercase font-bold text-[10px]">
                                  {isMissing ? "Missing" : "Populated"}
                                </Badge>
                              </div>
                            )
                          })}
                        </>
                      ) : (
                        <p className="p-4 text-center text-sm text-slate-400 italic">No fields or questions marked as Client Requirement.</p>
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* TABS CONTENT: LINK */}
            <TabsContent value="link" className="h-full flex flex-col justify-center py-6 m-0">
              <div className="text-center space-y-4 max-w-lg mx-auto">
                <div className="bg-blue-50 p-4 rounded-full w-fit mx-auto">
                  <ExternalLink className="h-10 w-10 text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Generate Public Access Link</h3>
                <p className="text-sm text-slate-500">
                  Send this link to the client. They can securely upload missing documents and fill in any required profile fields and questionnaires.
                </p>
                <div className="flex gap-2 bg-slate-100 p-2.5 rounded-lg border border-slate-200 text-sm font-mono text-slate-700 break-all select-all text-left">
                  <span className="flex-1 truncate">{clientUrl}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-slate-400 hover:text-blue-600" onClick={copyToClipboard}>
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="pt-4 flex justify-center gap-3">
                  <Button variant="outline" className="flex items-center gap-1.5" onClick={() => window.open(clientUrl, "_blank")}>
                    <ExternalLink className="h-4 w-4" /> Open Link
                  </Button>
                  <Button variant="default" className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={copyToClipboard}>
                    <Copy className="h-4 w-4" /> Copy Link
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* TABS CONTENT: PDF */}
            <TabsContent value="pdf" className="h-full flex flex-col justify-center py-6 m-0">
              <div className="text-center space-y-4 max-w-lg mx-auto">
                <div className="bg-orange-50 p-4 rounded-full w-fit mx-auto">
                  <Printer className="h-10 w-10 text-orange-500" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Print Requirements Checklist</h3>
                <p className="text-sm text-slate-500">
                  Generate a clean, printable PDF checklist containing all missing documents and required fields to hand over to the client.
                </p>
                <div className="pt-4 flex justify-center">
                  <Button variant="default" className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white" onClick={handlePrint}>
                    <Printer className="h-4 w-4" /> Generate & Print PDF
                  </Button>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={onClose} className="w-24">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
