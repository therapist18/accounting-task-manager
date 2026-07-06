// @ts-nocheck
"use client"

import React, { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FileText, Database, HelpCircle, Loader2, Send, UploadCloud, CheckCircle2, AlertCircle, Briefcase, User, UserCheck, Users2, HeartPulse, Zap } from "lucide-react"
import supabase from "@/lib/supabase/client"
import { toast } from "sonner"

const getTaskName = (task: any) => {
  if (task?.applicant_details?.name) return task.applicant_details.name
  const principal = task?.participants_details?.find((p: any) => p.type === "individual" && (Array.isArray(p.role) ? p.role.includes("principal") : p.role === "principal"))
  return principal?.name || task?.title || "Client"
}

const normalizeDocIds = (req: any) => req?.document_ids || (req?.document_id ? [req.document_id] : [])

const ENTITY_TYPE_CONFIG = {
  company: { bgColor: "bg-slate-700", Icon: Briefcase, label: "Company" },
  director: { bgColor: "bg-indigo-600", Icon: UserCheck, label: "Director" },
  principal: { bgColor: "bg-blue-700", Icon: User, label: "Principal" },
  dependant: { bgColor: "bg-blue-500", Icon: Users2, label: "Dependant" },
  sponsor: { bgColor: "bg-green-600", Icon: HeartPulse, label: "Sponsor" },
  understudy: { bgColor: "bg-cyan-600", Icon: User, label: "Understudy" },
}

function getEntityBadges(entityTypes: string[]) {
  return (entityTypes || []).map((et: string) => {
    const cfg = ENTITY_TYPE_CONFIG[et.toLowerCase()] || { bgColor: "bg-blue-600", Icon: User, label: et }
    return { ...cfg, type: et }
  })
}

function ClientFillRequirementsContent() {
  const searchParams = useSearchParams()
  const taskId = searchParams.get("taskId")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [task, setTask] = useState<any>(null)
  const [requirements, setRequirements] = useState<any[]>([])
  const [questions, setQuestions] = useState<any[]>([])
  const [automations, setAutomations] = useState<Record<string, any>>({})
  const [jobFields, setJobFields] = useState<Record<string, any>>({})
  const [documentsMeta, setDocumentsMeta] = useState<Record<string, any>>({})
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({})
  const [docFiles, setDocFiles] = useState<Record<string, File | null>>({})
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!taskId) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const { data: taskData, error: taskError } = await supabase
          .from("tm_tasks")
          .select("*")
          .eq("id", taskId)
          .single()
        if (taskError) throw taskError
        setTask(taskData)

        const { data: classReqs, error: reqError } = await supabase
          .from("tm_class_requirements")
          .select("*")
        if (reqError) throw reqError

        const matched = (classReqs || []).find((req: any) => req.job_level?.class_id == taskData.class_id)
          || (classReqs || []).find((req: any) => req.job_level?.subdepartment_id == taskData.subdepartment_id && !req.job_level?.class_id)
          || (classReqs || []).find((req: any) => req.job_level?.department_id == taskData.department_id && !req.job_level?.subdepartment_id && !req.job_level?.class_id)

        const reqList = (matched?.requirements || []).filter((req: any) => req.is_client_requirement)
        const questionList = (matched?.job_specific_questions || []).filter((q: any) => q.is_client_requirement)
        setRequirements(reqList)
        setQuestions(questionList)

        const docIds = new Set<string>()
        reqList.forEach((req: any) => normalizeDocIds(req).forEach((id: string) => docIds.add(id)))
        if (docIds.size > 0) {
          const { data: docs } = await supabase
            .from("acc_portal_kyc")
            .select("id, name, display_name")
            .in("id", Array.from(docIds))
          setDocumentsMeta((docs || []).reduce((acc: any, doc: any) => ({ ...acc, [doc.id]: doc }), {}))
        }

        const automationIds = new Set<string>()
        ;(matched?.requirements || []).forEach((req: any) => {
          if (req.web_automation?.automationId) automationIds.add(req.web_automation.automationId)
        })
        if (automationIds.size > 0) {
          const { data: autoData, error: autoError } = await supabase
            .from("tm_automations")
            .select("id, name, webdata")
            .in("id", Array.from(automationIds))
          if (autoError) throw autoError
          setAutomations((autoData || []).reduce((acc: any, auto: any) => ({ ...acc, [auto.id]: auto }), {}))

          // Fetch linked master fields
          const linkedFieldIds = new Set<string>()
          ;(autoData || []).forEach((auto: any) => {
            ;(auto.webdata || []).forEach((field: any) => {
              ;(field.linkedMasterFields || field.masterFieldIds || []).forEach((id: any) => linkedFieldIds.add(String(id)))
              ;(field.arrayItems || []).forEach((item: any) => {
                ;(item.linkedMasterFields || item.masterFieldIds || (item.linkedMasterFieldId ? [item.linkedMasterFieldId] : [])).forEach((id: any) => linkedFieldIds.add(String(id)))
              })
            })
          })
          if (linkedFieldIds.size > 0) {
            const { data: fields } = await supabase.from('tm_job_fields').select('*').in('id', Array.from(linkedFieldIds))
            if (fields) {
              setJobFields(fields.reduce((acc: any, f: any) => ({ ...acc, [String(f.id)]: f }), {}))
            }
          }
        }
      } catch (error: any) {
        console.error("Failed to load client requirements", error)
        toast.error(error.message || "Failed to load requirements")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [taskId])

  // Prepare client fields from automations with field options from master fields
  const clientFields = useMemo(() => {
    const rows: any[] = []
    Object.entries(automations).forEach(([autoId, auto]: [string, any]) => {
      ;(auto.webdata || []).forEach((field: any) => {
        if (field.is_client_requirement && !["document", "computed", "array"].includes(field.fieldType)) {
          const options = getFieldOptions(field, jobFields)
          rows.push({
            ...field,
            options,
            automationId: autoId,
            automationName: auto.name,
            key: `${autoId}:${field.variableName}`
          })
        }
        if (field.fieldType === "array") {
          ;(field.arrayItems || []).forEach((item: any, index: number) => {
            if (!item.is_client_requirement) return
            const variableName = `${field.variableName}.${item.variableName || item.name || index}`
            const options = getFieldOptions(item, jobFields)
            rows.push({
              ...item,
              options,
              parentVariableName: field.variableName,
              variableName,
              automationId: autoId,
              automationName: auto.name,
              key: `${autoId}:${variableName}`
            })
          })
        }
      })
    })
    return rows
  }, [automations, jobFields])

  const handleSubmit = async () => {
    if (!task || !taskId) return
    setSubmitting(true)
    const toastId = toast.loading("Submitting requirements...")

    try {
      const documents: Record<string, any> = {}
      const docEntityTypes = requirements.reduce((acc: Record<string, string[]>, req: any) => {
        const entityTypes = req.entityTypes || (req.entityType ? [req.entityType] : [])
        normalizeDocIds(req).forEach((docId: string) => {
          if (!acc[docId]) acc[docId] = []
          entityTypes.forEach((et: string) => {
            if (!acc[docId].includes(et)) acc[docId].push(et)
          })
        })
        return acc
      }, {})
      for (const [docId, file] of Object.entries(docFiles)) {
        if (!file) continue
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
        const filePath = `client-requirements/${taskId}/${Date.now()}-${safeName}`
        const { error: uploadError } = await supabase.storage
          .from("kyc-documents")
          .upload(filePath, file, { upsert: true })
        if (uploadError) throw uploadError
        documents[docId] = {
          file_name: file.name,
          file_path: filePath,
          entity_types: docEntityTypes[docId] || ["individual"],
          status: "submitted",
          submitted_at: new Date().toISOString()
        }
      }

      // Build field metadata alongside values for richer server-side processing
      const fieldMetadata: Record<string, any> = {}
      Object.entries(fieldValues).forEach(([key, value]) => {
        const parts = key.split(':')
        const autoId = parts[0]
        const varName = parts.slice(1).join(':')
        const auto = automations[autoId]
        const fieldDef = auto?.webdata?.find((f: any) => f.variableName === varName)
        if (fieldDef) {
          fieldMetadata[key] = {
            value,
            automationId: autoId,
            automationName: auto?.name,
            variableName: varName,
            fieldType: fieldDef.fieldType,
            entityTypes: fieldDef.entityTypes || (fieldDef.entityType ? [fieldDef.entityType] : []),
            masterFieldIds: fieldDef.linkedMasterFields || fieldDef.masterFieldIds || [],
          }
        } else {
          // Check nested array items
          let found = false
          Object.values(automations).forEach((a: any) => {
            ;(a.webdata || []).forEach((f: any) => {
              if (f.fieldType === 'array' && f.arrayItems) {
                f.arrayItems.forEach((item: any) => {
                  const itemVar = `${f.variableName}.${item.variableName || item.name}`
                  if (itemVar === varName) {
                    fieldMetadata[key] = {
                      value,
                      automationId: autoId,
                      automationName: a.name,
                      variableName: itemVar,
                      fieldType: item.fieldType || 'text',
                      entityTypes: item.entityTypes || (item.entityType ? [item.entityType] : []),
                      masterFieldIds: item.linkedMasterFields || item.masterFieldIds || (item.linkedMasterFieldId ? [item.linkedMasterFieldId] : []),
                    }
                    found = true
                  }
                })
              }
            })
          })
          if (!found) {
            fieldMetadata[key] = { value, automationId: autoId, variableName: varName }
          }
        }
      })

      const draft = {
        status: "submitted",
        submitted_at: new Date().toISOString(),
        documents,
        questions: answers,
        fields: fieldMetadata,
      }

      const { error } = await supabase
        .from("tm_tasks")
        .update({
          registry_metadata: {
            ...(task.registry_metadata || {}),
            client_requirements_draft: draft
          },
          updated_at: new Date().toISOString()
        })
        .eq("id", taskId)
      if (error) throw error

      setSubmitted(true)
      toast.success("Submitted successfully", { id: toastId })
    } catch (error: any) {
      console.error("Client requirements submit failed", error)
      toast.error(error.message || "Failed to submit", { id: toastId })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </main>
    )
  }

  if (!taskId || !task) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Alert className="max-w-lg bg-white">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>This requirements link is invalid or no longer available.</AlertDescription>
        </Alert>
      </main>
    )
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-lg w-full border-green-200">
          <CardContent className="pt-8 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
            <h1 className="text-2xl font-bold text-slate-900">Requirements submitted</h1>
            <p className="text-sm text-slate-500">Your submission has been saved for review.</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <Badge variant="outline" className="mb-3 bg-blue-50 text-blue-700 border-blue-200">Client Requirements</Badge>
          <h1 className="text-2xl font-bold text-slate-900">{getTaskName(task)}</h1>
          <p className="text-sm text-slate-500 mt-1">Upload the requested documents and fill in any missing information below.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-blue-600" /> Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {requirements.length > 0 ? requirements.map((req: any) => {
              const entityBadges = getEntityBadges(req.entityTypes || (req.entityType ? [req.entityType] : []))
              return (
                <div key={req.id || req.name} className="border rounded-md p-4 bg-slate-50/50">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-slate-800">{req.name}</p>
                    {entityBadges.map((cfg: any) => (
                      <Badge key={cfg.type} className={`${cfg.bgColor} text-white text-[9px] border-0`}>
                        <cfg.Icon className="h-2.5 w-2.5 mr-1" />
                        {cfg.label}
                      </Badge>
                    ))}
                  </div>
                  {req.description && <p className="text-xs text-slate-500 mb-2">{req.description}</p>}
                  <div className="grid gap-3 mt-3">
                    {normalizeDocIds(req).map((docId: string) => (
                      <div key={docId} className="bg-white border rounded-md p-3">
                        <Label className="text-xs font-semibold text-slate-600">{documentsMeta[docId]?.display_name || documentsMeta[docId]?.name || "Document"}</Label>
                        <Input
                          type="file"
                          className="mt-2"
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                          onChange={(e) => setDocFiles(prev => ({ ...prev, [docId]: e.target.files?.[0] || null }))}
                        />
                        {docFiles[docId] && (
                          <p className="text-[10px] text-green-600 mt-1 font-medium">{docFiles[docId]?.name} selected</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            }) : <p className="text-sm text-slate-400 italic">No document uploads requested.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4 text-blue-600" /> Information Fields</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {clientFields.length > 0 ? clientFields.map((field: any) => {
              const entityBadges = getEntityBadges(field.entityTypes || (field.entityType ? [field.entityType] : []))
              return (
                <div key={field.key} className="space-y-2 border rounded-md p-3 bg-slate-50/30">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-slate-700">
                      {field.efnsDisplayName || field.name || field.variableName}
                    </Label>
                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">{field.fieldType || 'text'}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded font-medium">{field.automationName}</span>
                    {entityBadges.map((cfg: any) => (
                      <Badge key={cfg.type} className={`${cfg.bgColor} text-white text-[8px] border-0 py-0`}>
                        <cfg.Icon className="h-2 w-2 mr-0.5" />
                        {cfg.label}
                      </Badge>
                    ))}
                  </div>
                  {field.options && field.options.length > 0 ? (
                    <Select
                      value={fieldValues[field.key] || ""}
                      onValueChange={(val) => setFieldValues(prev => ({ ...prev, [field.key]: val }))}
                    >
                      <SelectTrigger className="h-9 text-sm bg-white">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((opt: any) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={fieldValues[field.key] || ""}
                      onChange={(e) => setFieldValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={`Enter ${field.efnsDisplayName || field.name || 'value'}...`}
                      className="bg-white h-9"
                    />
                  )}
                  {field.description && (
                    <p className="text-[10px] text-slate-400 italic">{field.description}</p>
                  )}
                </div>
              )
            }) : <p className="text-sm text-slate-400 italic md:col-span-2">No information fields requested.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><HelpCircle className="h-4 w-4 text-purple-600" /> Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {questions.length > 0 ? questions.map((question: any) => (
              <div key={question.id} className="space-y-2 bg-slate-50/30 rounded-md p-3 border">
                <Label className="text-sm font-semibold text-slate-700">
                  {question.label}{question.required ? <span className="text-red-500 ml-1">*</span> : ""}
                </Label>
                {question.description && (
                  <p className="text-[10px] text-slate-400 italic">{question.description}</p>
                )}
                {question.type === "textarea" ? (
                  <Textarea
                    value={answers[question.id] || ""}
                    onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                    placeholder="Type your answer..."
                    className="bg-white"
                    rows={3}
                  />
                ) : question.options && question.options.length > 0 ? (
                  <Select
                    value={answers[question.id] || ""}
                    onValueChange={(val) => setAnswers(prev => ({ ...prev, [question.id]: val }))}
                  >
                    <SelectTrigger className="h-9 text-sm bg-white">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {question.options.map((opt: any) => (
                        <SelectItem key={typeof opt === 'string' ? opt : opt.value} value={typeof opt === 'string' ? opt : opt.value}>
                          {typeof opt === 'string' ? opt : opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={answers[question.id] || ""}
                    onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                    placeholder="Type your answer..."
                    className="bg-white h-9"
                  />
                )}
              </div>
            )) : <p className="text-sm text-slate-400 italic">No questions requested.</p>}
          </CardContent>
        </Card>

        <div className="sticky bottom-0 bg-slate-50/95 backdrop-blur-sm border-t py-4 flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg">
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Submit Requirements
          </Button>
        </div>
      </div>
    </main>
  )
}

// Helper: extract options from linked master fields
function getFieldOptions(field: any, jobFields: Record<string, any>) {
  const mIds = field.linkedMasterFields || field.masterFieldIds || []
  if (mIds.length === 0 && field.linkedMasterFieldId) mIds.push(field.linkedMasterFieldId)
  if (mIds.length === 0) return null
  const firstMasterId = String(mIds[0])
  const masterField = jobFields[firstMasterId]
  const opts = masterField?.options
  if (Array.isArray(opts)) {
    return opts.map((o: any) => typeof o === 'string' ? { label: o, value: o } : o)
  }
  return null
}

export default function ClientFillRequirementsPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </main>
    }>
      <ClientFillRequirementsContent />
    </Suspense>
  )
}
