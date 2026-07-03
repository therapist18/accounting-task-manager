// @ts-nocheck
"use client"

import React, { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FileText, Database, HelpCircle, Loader2, Send, UploadCloud, CheckCircle2, AlertCircle } from "lucide-react"
import supabase from "@/lib/supabase/client"
import { toast } from "sonner"

const getTaskName = (task: any) => {
  if (task?.applicant_details?.name) return task.applicant_details.name
  const principal = task?.participants_details?.find((p: any) => p.type === "individual" && (Array.isArray(p.role) ? p.role.includes("principal") : p.role === "principal"))
  return principal?.name || task?.title || "Client"
}

const normalizeDocIds = (req: any) => req?.document_ids || (req?.document_id ? [req.document_id] : [])

function ClientFillRequirementsContent() {
  const searchParams = useSearchParams()
  const taskId = searchParams.get("taskId")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [task, setTask] = useState<any>(null)
  const [requirements, setRequirements] = useState<any[]>([])
  const [questions, setQuestions] = useState<any[]>([])
  const [automations, setAutomations] = useState<Record<string, any>>({})
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

  const clientFields = useMemo(() => {
    const rows: any[] = []
    Object.values(automations).forEach((auto: any) => {
      ;(auto.webdata || []).forEach((field: any) => {
        if (field.is_client_requirement && !["document", "computed", "array"].includes(field.fieldType)) {
          rows.push({ ...field, automationId: auto.id, automationName: auto.name, key: `${auto.id}:${field.variableName}` })
        }
        if (field.fieldType === "array") {
          ;(field.arrayItems || []).forEach((item: any, index: number) => {
            if (!item.is_client_requirement) return
            const variableName = `${field.variableName}.${item.variableName || item.name || index}`
            rows.push({ ...item, parentVariableName: field.variableName, variableName, automationId: auto.id, automationName: auto.name, key: `${auto.id}:${variableName}` })
          })
        }
      })
    })
    return rows
  }, [automations])

  const handleSubmit = async () => {
    if (!task || !taskId) return
    setSubmitting(true)
    const toastId = toast.loading("Submitting requirements...")

    try {
      const documents: Record<string, any> = {}
      const docEntityTypes = requirements.reduce((acc: Record<string, string>, req: any) => {
        const entityTypes = req.entityTypes || (req.entityType ? [req.entityType] : [])
        const entityType = entityTypes.includes("company") ? "company" : "individual"
        normalizeDocIds(req).forEach((docId: string) => { acc[docId] = entityType })
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
          entity_type: docEntityTypes[docId] || "individual",
          status: "submitted",
          submitted_at: new Date().toISOString()
        }
      }

      const draft = {
        status: "submitted",
        submitted_at: new Date().toISOString(),
        documents,
        questions: answers,
        fields: fieldValues
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
            {requirements.length > 0 ? requirements.map((req: any) => (
              <div key={req.id || req.name} className="border rounded-md p-4 bg-slate-50/50">
                <p className="font-medium text-slate-800">{req.name}</p>
                {req.description && <p className="text-xs text-slate-500 mt-1">{req.description}</p>}
                <div className="grid gap-3 mt-3">
                  {normalizeDocIds(req).map((docId: string) => (
                    <div key={docId} className="bg-white border rounded-md p-3">
                      <Label className="text-xs font-semibold text-slate-600">{documentsMeta[docId]?.display_name || documentsMeta[docId]?.name || "Document"}</Label>
                      <Input type="file" className="mt-2" onChange={(e) => setDocFiles(prev => ({ ...prev, [docId]: e.target.files?.[0] || null }))} />
                    </div>
                  ))}
                </div>
              </div>
            )) : <p className="text-sm text-slate-400 italic">No document uploads requested.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4 text-blue-600" /> Information Fields</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {clientFields.length > 0 ? clientFields.map((field: any) => (
              <div key={field.key} className="space-y-2">
                <Label>{field.efnsDisplayName || field.name || field.variableName}</Label>
                <Input value={fieldValues[field.key] || ""} onChange={(e) => setFieldValues(prev => ({ ...prev, [field.key]: e.target.value }))} />
                <p className="text-[10px] text-slate-400">{field.automationName}</p>
              </div>
            )) : <p className="text-sm text-slate-400 italic md:col-span-2">No information fields requested.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><HelpCircle className="h-4 w-4 text-purple-600" /> Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {questions.length > 0 ? questions.map((question: any) => (
              <div key={question.id} className="space-y-2">
                <Label>{question.label}{question.required ? " *" : ""}</Label>
                {question.type === "textarea" ? (
                  <Textarea value={answers[question.id] || ""} onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))} />
                ) : (
                  <Input value={answers[question.id] || ""} onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))} />
                )}
              </div>
            )) : <p className="text-sm text-slate-400 italic">No questions requested.</p>}
          </CardContent>
        </Card>

        <div className="sticky bottom-0 bg-slate-50/95 border-t py-4 flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white">
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Submit Requirements
          </Button>
        </div>
      </div>
    </main>
  )
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
