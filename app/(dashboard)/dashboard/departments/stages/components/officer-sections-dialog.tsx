// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash2, Layers, Users, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"
import type { OfficerSection, Stage } from "../stagesdb"
import { updateOfficerSections } from "../stagesdb"

interface OfficerSectionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  departmentId: string
  departmentName?: string
  stages: Stage[]
  sections: OfficerSection[]
  onSaved: (sections: OfficerSection[]) => void
}

// A small UUID generator for section ids (mirrors generateId in the parent page).
const generateId = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function OfficerSectionsDialog({
  open,
  onOpenChange,
  departmentId,
  departmentName,
  stages,
  sections,
  onSaved,
}: OfficerSectionsDialogProps) {
  // Local draft of sections — edits only commit on Save.
  const [draft, setDraft] = useState<OfficerSection[]>([])
  const [saving, setSaving] = useState(false)

  // Only officer-follow-up stages are meaningful members of a section.
  const officerStages = useMemo(
    () => (stages || []).filter((s) => s.follow_up?.toLowerCase() === "officer"),
    [stages],
  )

  useEffect(() => {
    if (open) {
      setDraft(JSON.parse(JSON.stringify(sections || [])))
    }
  }, [open, sections])

  const addSection = () => {
    setDraft((prev) => [
      ...prev,
      { id: generateId(), name: "", stage_ids: [] },
    ])
  }

  const updateSection = (id: string, patch: Partial<OfficerSection>) => {
    setDraft((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const removeSection = (id: string) => {
    setDraft((prev) => prev.filter((s) => s.id !== id))
  }

  const toggleStageInSection = (sectionId: string, stageId: string) => {
    setDraft((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s
        const has = s.stage_ids.includes(stageId)
        return {
          ...s,
          stage_ids: has ? s.stage_ids.filter((id) => id !== stageId) : [...s.stage_ids, stageId],
        }
      }),
    )
  }

  const handleSave = async () => {
    // Drop empty / unnamed sections before persisting.
    const cleaned = draft
      .map((s) => ({ ...s, name: s.name.trim() }))
      .filter((s) => s.name !== "" && s.stage_ids.length > 0)

    setSaving(true)
    try {
      await updateOfficerSections(departmentId, cleaned)
      onSaved(cleaned)
      onOpenChange(false)
      toast({
        title: "Success",
        description: "Officer sections saved.",
        variant: "success",
      })
    } catch (err) {
      console.error("Error saving officer sections:", err)
      toast({
        title: "Error",
        description: "Failed to save officer sections. Please try again.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const validCount = draft.filter((s) => s.name.trim() !== "" && s.stage_ids.length > 0).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[60vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Officer Sections — {departmentName || "Department"}
          </DialogTitle>
          <DialogDescription>
            Group officer follow-up stages into sections so one officer handles a whole block
            (e.g. "Processing to Approval"). A stage may belong to at most one section.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-1">
          <div className="space-y-4 py-2">
            {draft.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                <Layers className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-500">No officer sections yet</p>
                <p className="text-xs text-slate-400 mt-1">Add a section and pick its officer stages below.</p>
              </div>
            ) : (
              draft.map((section, index) => (
                <div key={section.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="h-7 w-7 rounded-lg bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <Input
                      value={section.name}
                      onChange={(e) => updateSection(section.id, { name: e.target.value })}
                      placeholder="Section name (e.g. Processing to Approval)"
                      className="h-9 font-semibold"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSection(section.id)}
                      className="text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                      title="Remove section"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div>
                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">
                      Officer Stages in this section ({section.stage_ids.length})
                    </Label>
                    {officerStages.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2">
                        No officer follow-up stages exist in this department yet.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                        {officerStages.map((stage) => {
                          const checked = section.stage_ids.includes(stage.id)
                          return (
                            <label
                              key={stage.id}
                              className={cn(
                                "flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors",
                                checked
                                  ? "bg-blue-50 border-blue-200"
                                  : "bg-white border-slate-200 hover:border-slate-300",
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleStageInSection(section.id, stage.id)}
                              />
                              <span className="font-medium text-slate-700">
                                <span className="text-slate-400 mr-1">{stage.order_num}.</span>
                                {stage.name}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            <Button variant="outline" onClick={addSection} className="w-full gap-2 border-dashed">
              <Plus className="h-4 w-4" />
              Add Section
            </Button>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 pt-4 border-t">
          {validCount > 0 && (
            <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100">
              {validCount} section{validCount === 1 ? "" : "s"}
            </Badge>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="font-semibold text-slate-500">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || validCount === 0}
            className="min-w-[140px] bg-custom-blue hover:bg-[#2d5a94] h-10 font-bold"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Sections"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
