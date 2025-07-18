// @ts-nocheck
"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { ComboBox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, X, Clock, FileText, User, Info, MessageSquare, Trash2, Star, Check, Building2, FolderTree } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { supabase } from "@/lib/supabase/client" // Assuming these imports are correct in your environment
import { DocumentExtraction, Stage, StageDocument, TimeConfig, NewStage, EntityOption, DepartmentOption } from "../stagesdb"
import { createKYCDocument } from "../kycDocuments"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { toast } from "@/hooks/use-toast"

type DocumentExtraction = any; type Stage = any; type StageDocument = any; type TimeConfig = any; type NewStage = any; type EntityOption = any; type DepartmentOption = any;

// Helper to create the titled sections, matching the card style in the image.
const SectionWrapper = ({ title, icon, children, actionButton = null }: { title: string, icon: React.ReactNode, children: React.ReactNode, actionButton?: React.ReactNode }) => (
    <Card className="bg-white rounded-lg shadow-sm border border-slate-200/90 overflow-hidden">
      <div className="p-4 bg-blue-500 border-b border-slate-200/90 flex justify-between items-center">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          {React.cloneElement(icon as React.ReactElement, { className: "h-5 w-5 text-blue-600" })}
          {title}
        </h3>
        {actionButton}
      </div>
      <CardContent className="p-4 space-y-4">{children}</CardContent>
    </Card>
  );


// Simple UUID generator
const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// Recursive helper to transform KYC fields, handling nested arrays
const transformKycFields = (fields: any[]): DocumentExtraction[] => {
  if (!Array.isArray(fields)) return []

  return fields.map((field: any) => {
    const isArray = field.type === 'array' || field.isArray === true

    const transformedField: any = {
      id: field.id || generateId(),
      fieldName: field.name || field.fieldName || '',
      description: field.description || '',
      isRequired: field.isRequired !== false,
      fieldType: isArray ? 'array' : (field.type || field.fieldType || 'text'),
      parentField: field.parentField,
      isArray: isArray,
    }

    if (isArray && field.arrayConfig && Array.isArray(field.arrayConfig.fields)) {
      transformedField.arrayConfig = {
        maxItems: field.arrayConfig.maxItems,
        // Recursive call for nested fields
        fields: transformKycFields(field.arrayConfig.fields)
      }
    }
    
    return transformedField as DocumentExtraction
  })
}

interface KYCDocument {
  id: string
  name: string
  display_name: string
  department: string
  category: string
  fields: DocumentExtraction[]
  document_type: string
}

interface AddStageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddStages: (stages: NewStage[], departmentId: string) => Promise<void>
  departments: DepartmentOption[]
}

export function AddStageDialog({ open, onOpenChange, onAddStages, departments = [] }: AddStageDialogProps) {
  const [selectedDepartment, setSelectedDepartment] = useState<string>('')
  const [newStages, setNewStages] = useState<NewStage[]>([{
    id: generateId(),
    name: '',
    description: '',
    days: 0,
    hours: 0,
    minutes: 0,
    followUp: 'none',
    isSpecial: false,
    timeConfigs: [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }],
    documents: []
  }])
  const [saving, setSaving] = useState(false)
  const [activeStageTab, setActiveStageTab] = useState<string>('')
  const [entityOptions, setEntityOptions] = useState<EntityOption[]>([])
  const [loadingEntities, setLoadingEntities] = useState(false)
  const [kycDocuments, setKycDocuments] = useState<KYCDocument[]>([])
  const [loadingKycDocs, setLoadingKycDocs] = useState(false)

  React.useEffect(() => {
    if (newStages.length > 0 && !activeStageTab) {
      setActiveStageTab(newStages[0].id)
    }
  }, [newStages, activeStageTab])

  // Fetch entities when department is selected
  useEffect(() => {
    if (selectedDepartment) {
      fetchEntities(selectedDepartment)
      const departmentName = departments.find(d => d.id === selectedDepartment)?.name
      fetchKYCDocuments(departmentName)
    } else {
      setEntityOptions([])
      setKycDocuments([])
    }
  }, [selectedDepartment, departments])

  const fetchKYCDocuments = async (departmentName?: string) => {
    setLoadingKycDocs(true)
    try {
      let query = supabase
        .from('acc_portal_kyc')
        .select('id, name, display_name, department, category, fields, document_type')
        .order('name')
  
      const { data, error } = await query
  
      if (error) throw error
      
      // Use the new recursive transformer to handle all field types including arrays
      const transformedDocs: KYCDocument[] = (data || []).map(doc => ({
        ...doc,
        fields: transformKycFields(doc.fields)
      }))
  
      setKycDocuments(transformedDocs)
    } catch (error) {
      console.error('Error fetching KYC documents:', error)
      toast({
        title: "Error",
        description: "Failed to load existing documents. Please try again.",
        variant: "destructive"
      })
    } finally {
      setLoadingKycDocs(false)
    }
  }

  const fetchEntities = async (departmentId: string) => {
    setLoadingEntities(true)
    try {
      const { data: deptData, error } = await supabase
        .from('tm_departments')
        .select(`
          *,
          tm_subdepartments (
            *,
            classes
          )
        `)
        .eq('id', departmentId)
        .single()

      if (error) throw error

      const entities: EntityOption[] = []
      
      if (deptData?.tm_subdepartments) {
        deptData.tm_subdepartments.forEach((subdept: any) => {
          entities.push({
            id: subdept.id,
            name: subdept.name,
            type: 'subdept',
            level: 0,
            subdept_id: subdept.id
          })

          if (subdept.classes && Array.isArray(subdept.classes)) {
            subdept.classes.forEach((cls: any, clsIndex: number) => {
              const classId = cls.id || `${subdept.id}-class-${clsIndex}`
              entities.push({
                id: classId,
                name: `${cls.name}`,
                type: 'class',
                level: 1,
                subdept_id: subdept.id,
                class_id: classId
              })

              if (cls.subClasses && Array.isArray(cls.subClasses)) {
                cls.subClasses.forEach((subCls: any, subClsIndex: number) => {
                  const subclassId = subCls.id || `${subdept.id}-class-${clsIndex}-subclass-${subClsIndex}`
                  entities.push({
                    id: subclassId,
                    name: `${subCls.name}`,
                    type: 'subclass',
                    level: 2,
                    subdept_id: subdept.id,
                    class_id: classId,
                    subclass_id: subclassId
                  })
                })
              }
            })
          }
        })
      }

      setEntityOptions(entities)
    } catch (error) {
      console.error('Error fetching entities:', error)
      toast({
        title: "Error",
        description: "Failed to load entities. Please try again.",
        variant: "destructive"
      })
    } finally {
      setLoadingEntities(false)
    }
  }

  const addNewStageRow = () => {
    const newStage = {
      id: generateId(),
      name: '',
      description: '',
      days: 0,
      hours: 0,
      minutes: 0,
      followUp: 'none',
      isSpecial: false,
      timeConfigs: [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }],
      documents: []
    }
    setNewStages(prev => [...prev, newStage])
    setActiveStageTab(newStage.id)
  }

  const removeStageRow = (id: string) => {
    if (newStages.length > 1) {
      const updatedStages = newStages.filter(stage => stage.id !== id)
      setNewStages(updatedStages)
      if (activeStageTab === id && updatedStages.length > 0) {
        setActiveStageTab(updatedStages[0].id)
      }
    }
  }

  const updateNewStage = (id: string, updates: Partial<NewStage>) => {
    setNewStages(prev =>
      prev.map(stage =>
        stage.id === id ? { ...stage, ...updates } : stage
      )
    )
  }

  const addDocument = (stageId: string, isSpecial: boolean = false) => {
    const newDoc: StageDocument = {
      id: `doc-${Date.now()}`,
      name: '',
      description: '',
      isRequired: false,
      documentType: 'both',
      inputType: 'file',
      extractionSpecs: [],
      isSpecial,
      linkedKycDocument: undefined,
      ...(isSpecial && {
        entityType: undefined,
        subdept_id: undefined,
        class_id: undefined,
        subclass_id: undefined,
        entityName: undefined
      })
    }
    updateNewStage(stageId, {
      documents: [...(newStages.find(s => s.id === stageId)?.documents || []), newDoc]
    })
  }

  const updateDocument = (stageId: string, docId: string, updates: Partial<StageDocument>) => {
    const stage = newStages.find(s => s.id === stageId)
    if (!stage) return

    const updatedDocs = stage.documents.map(doc => {
      if (doc.id === docId) {
        return { ...doc, ...updates }
      }
      return doc
    })
    updateNewStage(stageId, { documents: updatedDocs })
  }

  const removeDocument = (stageId: string, docId: string) => {
    const stage = newStages.find(s => s.id === stageId)
    if (!stage) return

    const updatedDocs = stage.documents.filter(doc => doc.id !== docId)
    updateNewStage(stageId, { documents: updatedDocs })
  }

  const addExtractionField = (stageId: string, docId: string) => {
    const stage = newStages.find(s => s.id === stageId)
    if (!stage) return

    const newField: DocumentExtraction = {
      id: generateId(),
      fieldName: '',
      description: '',
      isRequired: true,
      fieldType: 'text',
      inputType: 'text'
    }

    const updatedDocs = stage.documents.map(doc =>
      doc.id === docId
        ? { ...doc, extractionSpecs: [...(doc.extractionSpecs || []), newField] }
        : doc
    )
    updateNewStage(stageId, { documents: updatedDocs })
  }

  const updateExtraction = (stageId: string, docId: string, extractionId: string, updates: Partial<DocumentExtraction>) => {
    const stage = newStages.find(s => s.id === stageId)
    if (!stage) return

    const updatedDocs = stage.documents.map(doc => {
      if (doc.id === docId) {
        const updatedExtractions = (doc.extractionSpecs || []).map(ext =>
          ext.id === extractionId ? { ...ext, ...updates } : ext
        )
        return { ...doc, extractionSpecs: updatedExtractions }
      }
      return doc
    })
    updateNewStage(stageId, { documents: updatedDocs })
  }

  const removeExtraction = (stageId: string, docId: string, extractionId: string) => {
    const stage = newStages.find(s => s.id === stageId)
    if (!stage) return

    const updatedDocs = stage.documents.map(doc => {
      if (doc.id === docId) {
        return {
          ...doc,
          extractionSpecs: doc.extractionSpecs?.filter(ext => ext.id !== extractionId) || []
        }
      }
      return doc
    })
    updateNewStage(stageId, { documents: updatedDocs })
  }

  const handleSubmit = async () => {
    if (!selectedDepartment) {
      toast({
        title: "Error",
        description: "Please select a department",
        variant: "destructive"
      })
      return
    }

    const invalidStages = newStages.filter(stage => !stage.name.trim())
    if (invalidStages.length > 0) {
      toast({
        title: "Error",
        description: "Please provide names for all stages",
        variant: "destructive"
      })
      return
    }

    setSaving(true)
    try {
      const departmentName = departments.find(d => d.id === selectedDepartment)?.name || selectedDepartment

      // First process KYC document creation with extractionSpecs
      const stagesWithKycDocs = await Promise.all(
        newStages.map(async (stage) => {
          const processedDocs = await Promise.all(
            stage.documents.map(async (doc) => {
              if (doc.name.trim() && !doc.linkedKycDocument) {
                try {
                  const kycId = await createKYCDocument({
                    name: doc.name,
                    department: departmentName,
                    category: 'application-docs',
                    document_type: 'one_off',
                    fields: doc.extractionSpecs || [],
                    display_name: doc.name,
                    metadata: doc.isSpecial ? {
                      isSpecial: true,
                      targetEntities: doc.targetEntities || []
                    } : undefined
                  })
                  return { ...doc, kycId, linkedKycDocument: kycId }
                } catch (error) {
                  console.error('Error creating KYC document:', error)
                  toast({
                    title: "Warning",
                    description: `Failed to create KYC document for "${doc.name}". Document will be saved without KYC integration.`,
                    variant: "destructive"
                  })
                  return doc
                }
              }
              return doc
            })
          )
          return { ...stage, documents: processedDocs }
        })
      )

      // Then prepare stages for tm_departments by removing extractionSpecs
      const processedStages = stagesWithKycDocs.map(stage => ({
        ...stage,
        documents: stage.documents.map(({ extractionSpecs, ...doc }) => doc)
      }))

      await onAddStages(processedStages, selectedDepartment)
      
      // Reset state on success
      setNewStages([{
        id: generateId(),
        name: '',
        description: '',
        days: 0,
        hours: 0,
        minutes: 0,
        followUp: 'none',
        isSpecial: false,
        timeConfigs: [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }],
        documents: []
      }])
      setSelectedDepartment('')
      setActiveStageTab('')
      setEntityOptions([])
      setKycDocuments([])
      onOpenChange(false); // Close dialog on success
    } catch (error) {
      console.error('Error adding stages:', error)
      toast({
        title: "Error",
        description: "Failed to add stages. Please try again.",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const isFormValid = selectedDepartment && newStages.every(stage => stage.name.trim())
  const currentStage = newStages.find(s => s.id === activeStageTab)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4" />
          Add Stage
        </Button>
      </DialogTrigger>
      {/* Updated DialogContent styling to match the image structure (p-0, bg-slate-50) */}
      <DialogContent className="max-w-6xl max-h-[95vh] p-0 bg-slate-50 flex flex-col">
        
        {/* Updated DialogHeader styling */}
        <DialogHeader className="p-6 border-b bg-white sticky top-0 z-10">
            <DialogTitle className="text-xl font-bold text-gray-800">
                Add New Stage{newStages.length > 1 ? 's' : ''} ({newStages.length})
            </DialogTitle>
            <p className="text-sm text-gray-500">
                Configure the details, timing, and required documents for the new stage(s).
            </p>
        </DialogHeader>

        {/* Main Content Area (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Department Selection - Using SectionWrapper */}
          <SectionWrapper title="Department Selection" icon={<Building2 />}>
              <div className="space-y-2">
                <Label htmlFor="department" className="text-xs font-medium text-gray-700">
                  Department
                  <span className="text-destructive ml-1">*</span>
                </Label>
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Documents will be created under this department in the KYC system.
                </p>
              </div>
          </SectionWrapper>

          {/* Stage Management - Using SectionWrapper */}
          <SectionWrapper 
            title="Stage Configuration" 
            icon={<FolderTree />}
            actionButton={
                <Button
                  type="button"
                  variant="outline"
                  onClick={addNewStageRow}
                  className="gap-2 text-white bg-blue-600 border-blue-300 hover:bg-blue-50"
                  disabled={saving}
                  size="sm"
                >
                  <Plus className="h-4 w-4" />
                  Add Another Stage
                </Button>
            }
          >
              {newStages.length > 1 ? (
                <Tabs value={activeStageTab} onValueChange={setActiveStageTab} className="w-full">
                  <TabsList className="flex w-full overflow-x-auto">
                    {newStages.map((stage, index) => (
                      <TabsTrigger key={stage.id} value={stage.id} className="relative data-[state=active]:text-blue-600 data-[state=active]:border-blue-600">
                        <span className="mr-2">{index + 1}.</span>
                        {stage.name || `Stage ${index + 1}`}
                        {newStages.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 ml-2 hover:bg-destructive/20 text-gray-500 hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeStageRow(stage.id)
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {newStages.map((stage) => (
                    <TabsContent key={stage.id} value={stage.id} className="space-y-6 mt-6">
                      <StageForm stage={stage} onUpdate={(updates) => updateNewStage(stage.id, updates)} />
                      <Separator className="my-6" />
                      <DocumentsSection
                        stage={stage}
                        entityOptions={entityOptions}
                        loadingEntities={loadingEntities}
                        kycDocuments={kycDocuments}
                        loadingKycDocs={loadingKycDocs}
                        onAddDocument={(isSpecial) => addDocument(stage.id, isSpecial)}
                        onUpdateDocument={(docId, updates) => updateDocument(stage.id, docId, updates)}
                        onRemoveDocument={(docId) => removeDocument(stage.id, docId)}
                        onAddExtraction={(docId) => addExtractionField(stage.id, docId)}
                        onUpdateExtraction={(docId, extractionId, updates) => updateExtraction(stage.id, docId, extractionId, updates)}
                        onRemoveExtraction={(docId, extractionId) => removeExtraction(stage.id, docId, extractionId)}
                      />
                    </TabsContent>
                  ))}
                </Tabs>
              ) : (
                currentStage && (
                  <div className="space-y-6">
                    <StageForm stage={currentStage} onUpdate={(updates) => updateNewStage(currentStage.id, updates)} />
                    <Separator className="my-6" />
                    <DocumentsSection
                      stage={currentStage}
                      entityOptions={entityOptions}
                      loadingEntities={loadingEntities}
                      kycDocuments={kycDocuments}
                      loadingKycDocs={loadingKycDocs}
                      onAddDocument={(isSpecial) => addDocument(currentStage.id, isSpecial)}
                      onUpdateDocument={(docId, updates) => updateDocument(currentStage.id, docId, updates)}
                      onRemoveDocument={(docId) => removeDocument(currentStage.id, docId)}
                      onAddExtraction={(docId) => addExtractionField(currentStage.id, docId)}
                      onUpdateExtraction={(docId, extractionId, updates) => updateExtraction(currentStage.id, docId, extractionId, updates)}
                      onRemoveExtraction={(docId, extractionId) => removeExtraction(currentStage.id, docId, extractionId)}
                    />
                  </div>
                )
              )}
          </SectionWrapper>
        </div>

        {/* Updated DialogFooter styling */}
        <DialogFooter className="p-4 bg-white border-t sticky z-10">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!isFormValid || saving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-muted border-t-current rounded-full animate-spin mr-2"></div>
                  Adding...
                </>
              ) : (
                <>
                  Add Stage{newStages.length > 1 ? 's' : ''}
                </>
              )}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Stage Form Component (Styling updated for consistency)
function StageForm({ stage, onUpdate }: { stage: NewStage; onUpdate: (updates: Partial<NewStage>) => void }) {
  const addTimeConfig = () => {
    onUpdate({
      timeConfigs: [
        ...stage.timeConfigs,
        { applicationType: '', days: 0, hours: 0, minutes: 0 }
      ]
    })
  }

  const removeTimeConfig = (index: number) => {
    onUpdate({
      timeConfigs: stage.timeConfigs.filter((_, i) => i !== index)
    })
  }

  const updateTimeConfig = (index: number, updates: Partial<TimeConfig>) => {
    const newTimeConfigs = [...stage.timeConfigs]
    newTimeConfigs[index] = { ...newTimeConfigs[index], ...updates }
    onUpdate({ timeConfigs: newTimeConfigs })
  }

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <Label htmlFor={`name-${stage.id}`} className="text-xs font-medium text-gray-700">
            Stage Name
            <span className="text-destructive ml-1">*</span>
          </Label>
          <Input
            id={`name-${stage.id}`}
            value={stage.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="e.g., Document Review, Client Communication"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`description-${stage.id}`} className="text-xs font-medium text-gray-700">
            Description
          </Label>
          <Input
            id={`description-${stage.id}`}
            value={stage.description || ''}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Brief description of this stage..."
          />
        </div>
      </div>

       {/* Follow Up */}
       <div className="space-y-2">
        <Label className="text-xs font-medium text-gray-700 flex items-center gap-2">
          <User className="h-4 w-4 text-blue-600" />
          Follow Up With
        </Label>
        <Select
          value={stage.followUp}
          onValueChange={(value) => onUpdate({ followUp: value })}
        >
          <SelectTrigger className="max-w-md">
            <SelectValue placeholder="Select follow up person" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No follow up required</SelectItem>
            <SelectItem value="Client">Client</SelectItem>
            <SelectItem value="Officer">Officer</SelectItem>
            <SelectItem value="BCL">BCL</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Special Time Requirements */}
      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center space-x-3">
          <Checkbox
            id={`special-${stage.id}`}
            checked={stage.isSpecial}
            onCheckedChange={(checked) => onUpdate({ isSpecial: checked === true })}
            className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
          />
          <div>
            <Label htmlFor={`special-${stage.id}`} className="font-medium flex items-center gap-2 text-gray-800">
              <Clock className="h-4 w-4 text-blue-600" />
              Variable Time Requirements
            </Label>
            <p className="text-sm text-muted-foreground">
              {stage.isSpecial
                ? 'Set different time requirements by application type.'
                : 'Set a fixed time requirement for all applications.'}
            </p>
          </div>
        </div>

        {stage.isSpecial ? (
          <Card className="shadow-none border-slate-200">
            <CardHeader className="p-4 bg-slate-50 border-b">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-semibold text-slate-800">Time Configurations</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTimeConfig}
                  className="text-white bg-blue-600 border-blue-300 hover:bg-blue-50"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Config
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              {stage.timeConfigs.map((config, index) => (
                <div key={index} className="grid md:grid-cols-6 gap-3 items-end p-3 border rounded-lg bg-slate-50/50">
                  <div className="md:col-span-2">
                    <Label className="text-xs text-gray-600">Application Type</Label>
                    <Input
                      value={config.applicationType}
                      onChange={(e) => updateTimeConfig(index, { applicationType: e.target.value })}
                      placeholder="e.g., Standard, Express"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600">Days</Label>
                    <Input
                      type="number"
                      min="0"
                      value={config.days}
                      onChange={(e) => updateTimeConfig(index, { days: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600">Hours</Label>
                    <Input
                      type="number"
                      min="0"
                      max="23"
                      value={config.hours}
                      onChange={(e) => updateTimeConfig(index, { hours: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600">Minutes</Label>
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={config.minutes}
                      onChange={(e) => updateTimeConfig(index, { minutes: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTimeConfig(index)}
                      disabled={stage.timeConfigs.length === 1}
                      className="text-gray-500 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-3 gap-3 max-w-md">
            <div>
              <Label className="text-xs text-gray-600">Days</Label>
              <Input
                type="number"
                min="0"
                value={stage.days}
                onChange={(e) => onUpdate({ days: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">Hours</Label>
              <Input
                type="number"
                min="0"
                max="23"
                value={stage.hours}
                onChange={(e) => onUpdate({ hours: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">Minutes</Label>
              <Input
                type="number"
                min="0"
                max="59"
                value={stage.minutes}
                onChange={(e) => onUpdate({ minutes: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
        )}
      </div>

     
    </div>
  )
}

// Enhanced Documents Section Component
function DocumentsSection({
  stage,
  entityOptions,
  loadingEntities,
  kycDocuments,
  loadingKycDocs,
  onAddDocument,
  onUpdateDocument,
  onRemoveDocument,
  onAddExtraction,
  onUpdateExtraction,
  onRemoveExtraction
}: {
  stage: NewStage
  entityOptions: EntityOption[]
  loadingEntities: boolean
  kycDocuments: KYCDocument[]
  loadingKycDocs: boolean
  onAddDocument: (isSpecial?: boolean) => void
  onUpdateDocument: (docId: string, updates: Partial<StageDocument>) => void
  onRemoveDocument: (docId: string) => void
  onAddExtraction: (docId: string) => void
  onUpdateExtraction: (docId: string, extractionId: string, updates: Partial<DocumentExtraction>) => void
  onRemoveExtraction: (docId: string, extractionId: string) => void
}) {
  const regularDocuments = stage.documents.filter(doc => !doc.isSpecial)
  const specialDocuments = stage.documents.filter(doc => doc.isSpecial)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="font-semibold flex items-center gap-2 text-gray-800">
            <FileText className="h-5 w-5 text-blue-600" />
            Stage Documents ({stage.documents.length})
          </h4>
          <p className="text-sm text-muted-foreground">
            Documents required for this stage will be created in the KYC system.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => onAddDocument(false)} size="sm" variant="outline" className="text-white bg-blue-600 border-blue-300 hover:bg-blue-50">
            <Plus className="h-4 w-4 mr-2" />
            Add Regular Doc
          </Button>
          <Button
            onClick={() => onAddDocument(true)}
            size="sm"
            variant="outline"
            disabled={!entityOptions.length && !loadingEntities}
            title={!entityOptions.length ? "Select a department first to add special documents" : ""}
            className="text-white bg-amber-600 border-amber-300 hover:bg-amber-50"
          >
            <Star className="h-4 w-4 mr-2" />
            Add Special Doc
          </Button>
        </div>
      </div>

      {/* Regular Documents */}
      {regularDocuments.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h5 className="font-medium text-sm text-gray-700">Regular Documents</h5>
            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
              {regularDocuments.length}
            </Badge>
          </div>
          {regularDocuments.map((doc, docIndex) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              docIndex={docIndex}
              entityOptions={entityOptions}
              loadingEntities={loadingEntities}
              kycDocuments={kycDocuments}
              loadingKycDocs={loadingKycDocs}
              onUpdateDocument={onUpdateDocument}
              onRemoveDocument={onRemoveDocument}
              onAddExtraction={onAddExtraction}
              onUpdateExtraction={onUpdateExtraction}
              onRemoveExtraction={onRemoveExtraction}
            />
          ))}
        </div>
      )}

      {/* Special Documents */}
      {specialDocuments.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h5 className="font-medium flex items-center gap-2 text-sm text-gray-700">
              <Star className="h-4 w-4 text-amber-500" />
              Special Documents
            </h5>
            <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800">
              {specialDocuments.length}
            </Badge>
          </div>
          {specialDocuments.map((doc, docIndex) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              docIndex={docIndex}
              entityOptions={entityOptions}
              loadingEntities={loadingEntities}
              kycDocuments={kycDocuments}
              loadingKycDocs={loadingKycDocs}
              onUpdateDocument={onUpdateDocument}
              onRemoveDocument={onRemoveDocument}
              onAddExtraction={onAddExtraction}
              onUpdateExtraction={onUpdateExtraction}
              onRemoveExtraction={onRemoveExtraction}
            />
          ))}
        </div>
      )}

      {stage.documents.length === 0 && (
        <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg bg-white">
          <FileText className="h-10 w-10 mx-auto mb-3 text-gray-400" />
          <h4 className="font-medium text-gray-700 mb-1">No documents added yet</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Add documents that are required for this stage.
          </p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => onAddDocument(false)} variant="outline" size="sm" className="text-blue-600 border-blue-300 hover:bg-blue-50">
              <Plus className="h-4 w-4 mr-2" />
              Add Regular Document
            </Button>
            <Button
              onClick={() => onAddDocument(true)}
              variant="outline"
              size="sm"
              disabled={!entityOptions.length && !loadingEntities}
              className="text-amber-600 border-amber-300 hover:bg-amber-50"
            >
              <Star className="h-4 w-4 mr-2" />
              Add Special Document
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Multi-select Entity Picker Component (Kept functionality, updated styling slightly)
function MultiEntityPicker({
  entities,
  selectedEntities = [],
  onSelectionChange,
  loading = false,
  placeholder = "Select target entities..."
}: {
  entities: EntityOption[]
  selectedEntities: Array<{
    entityType: 'subdept' | 'class' | 'subclass'
    subdept_id: number
    class_id?: string | number
    subclass_id?: string | number
    entityName: string
  }>
  onSelectionChange: (selectedEntities: any[]) => void
  loading?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)

  const toggleEntity = (entity: EntityOption) => {
    const entityKey = `${entity.type}-${entity.subdept_id}-${entity.class_id}-${entity.subclass_id}`
    const isSelected = selectedEntities.some(selected => {
      const selectedKey = `${selected.entityType}-${selected.subdept_id}-${selected.class_id}-${selected.subclass_id}`
      return selectedKey === entityKey
    })

    if (isSelected) {
      onSelectionChange(selectedEntities.filter(selected => {
        const selectedKey = `${selected.entityType}-${selected.subdept_id}-${selected.class_id}-${selected.subclass_id}`
        return selectedKey !== entityKey
      }))
    } else {
      const newEntity = {
        entityType: entity.type,
        subdept_id: entity.subdept_id!,
        class_id: entity.class_id,
        subclass_id: entity.subclass_id,
        entityName: entity.name
      }
      onSelectionChange([...selectedEntities, newEntity])
    }
  }

  const isEntitySelected = (entity: EntityOption) => {
    const entityKey = `${entity.type}-${entity.subdept_id}-${entity.class_id}-${entity.subclass_id}`
    return selectedEntities.some(selected => {
      const selectedKey = `${selected.entityType}-${selected.subdept_id}-${selected.class_id}-${selected.subclass_id}`
      return selectedKey === entityKey
    })
  }

  const groupedEntities = entities.reduce((acc, entity) => {
    const subdeptName = entities.find(e => e.type === 'subdept' && e.subdept_id === entity.subdept_id)?.name || 'Unknown'
    if (!acc[subdeptName]) {
      acc[subdeptName] = []
    }
    acc[subdeptName].push(entity)
    return acc
  }, {} as Record<string, EntityOption[]>)

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-white"
            disabled={loading}
          >
            {selectedEntities.length === 0 ? (
              <span className="text-muted-foreground">{loading ? "Loading entities..." : placeholder}</span>
            ) : (
              <span>{selectedEntities.length} entit{selectedEntities.length === 1 ? 'y' : 'ies'} selected</span>
            )}
            <X className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0">
          <Command>
            <CommandInput placeholder="Search entities..." />
            <CommandEmpty>No entities found.</CommandEmpty>
            <div className="max-h-72 overflow-y-auto">
              {Object.entries(groupedEntities).map(([subdeptName, subdeptEntities]) => (
                <CommandGroup key={subdeptName} heading={subdeptName}>
                  {subdeptEntities
                    .sort((a, b) => a.level - b.level)
                    .map((entity) => (
                      <CommandItem
                        key={`${entity.type}-${entity.subdept_id}-${entity.class_id}-${entity.subclass_id}`}
                        onSelect={() => toggleEntity(entity)}
                        className="flex items-center gap-2"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <div className="flex h-4 w-4 items-center justify-center">
                            {isEntitySelected(entity) && <Check className="h-3 w-3 text-blue-600" />}
                          </div>
                          <span style={{ marginLeft: `${entity.level * 12}px` }}>
                            {entity.name}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {entity.type}
                          </Badge>
                        </div>
                      </CommandItem>
                    ))}
                </CommandGroup>
              ))}
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedEntities.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selectedEntities.map((entity, index) => (
            <Badge
              key={index}
              variant="secondary"
              className="flex items-center gap-1 text-xs bg-blue-100 text-blue-800 hover:bg-blue-200"
            >
              {entity.entityName}
              <Badge variant="outline" className="text-xs ml-1 bg-white">
                {entity.entityType}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 ml-1 p-0 hover:bg-destructive hover:text-destructive-foreground rounded-full"
                onClick={() => {
                  onSelectionChange(selectedEntities.filter((_, i) => i !== index))
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

// Enhanced Document Card Component with KYC Linking (Styling heavily updated)
function DocumentCard({
  doc,
  docIndex,
  entityOptions,
  loadingEntities,
  kycDocuments,
  loadingKycDocs,
  onUpdateDocument,
  onRemoveDocument,
  onAddExtraction,
  onUpdateExtraction,
  onRemoveExtraction
}: {
  doc: StageDocument
  docIndex: number
  entityOptions: EntityOption[]
  loadingEntities: boolean
  kycDocuments: KYCDocument[]
  loadingKycDocs: boolean
  onUpdateDocument: (docId: string, updates: Partial<StageDocument>) => void
  onRemoveDocument: (docId: string) => void
  onAddExtraction: (docId: string) => void
  onUpdateExtraction: (docId: string, extractionId: string, updates: Partial<DocumentExtraction>) => void
  onRemoveExtraction: (docId: string, extractionId: string) => void
}) {
  const [documentMode, setDocumentMode] = useState<'new' | 'existing'>(
    doc.kycId && doc.linkedKycDocument ? 'existing' : 'new'
  )

  const handleModeChange = (mode: 'new' | 'existing') => {
    setDocumentMode(mode)
    if (mode === 'new') {
      onUpdateDocument(doc.id, {
        linkedKycDocument: undefined,
        kycId: undefined,
        name: '',
        extractionSpecs: []
      })
    }
  }

  const handleKycDocumentSelect = (kycDocId: string) => {
    const selectedKycDoc = kycDocuments.find(d => d.id === kycDocId)
    if (selectedKycDoc) {
      onUpdateDocument(doc.id, {
        linkedKycDocument: selectedKycDoc.id,
        kycId: selectedKycDoc.id,
        name: selectedKycDoc.display_name || selectedKycDoc.name,
        // The fields are already transformed correctly, including arrays
        extractionSpecs: selectedKycDoc.fields || []
      })
    }
  }

  // Updated Card styling to be cleaner and match the overall theme
  return (
    <Card className={`shadow-sm border-slate-200 ${doc.isSpecial ? 'border-amber-300 bg-amber-50/30' : 'bg-white'}`}>
      <CardHeader className="p-4 bg-slate-50 border-b">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h5 className="font-semibold text-sm text-gray-800">
              {doc.isSpecial && <Star className="h-4 w-4 text-amber-500 inline mr-2" />}
              Document {docIndex + 1}: {doc.name || 'Untitled'}
            </h5>
            {doc.isRequired && (
              <Badge variant="destructive" className="text-xs">Required</Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {doc.documentType}
            </Badge>
            {documentMode === 'existing' && (
              <Badge className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-100">Linked</Badge>
            )}
            {doc.isSpecial && doc.targetEntities && doc.targetEntities.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {doc.targetEntities.length} target{doc.targetEntities.length === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemoveDocument(doc.id)}
            className="text-muted-foreground hover:text-destructive h-7 w-7"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-4">
        {/* Document Mode Selection */}
        <div className="space-y-3 p-4 bg-slate-100/70 border border-slate-200 rounded-lg">
          <Label className="font-medium text-gray-700">Document Source</Label>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant={documentMode === 'new' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleModeChange('new')}
              className={`justify-start ${documentMode === 'new' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-white'}`}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create New
            </Button>
            <Button
              variant={documentMode === 'existing' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleModeChange('existing')}
              className={`justify-start ${documentMode === 'existing' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-white'}`}
              disabled={loadingKycDocs}
            >
              <FileText className="h-4 w-4 mr-2" />
              Link Existing
            </Button>
          </div>
          
          {documentMode === 'existing' && (
            <div className="space-y-2 pt-2">
              <Label className="text-sm text-gray-600">Select Existing Document</Label>
              {/* Assuming ComboBox is a custom component, ensure its styling matches */}
              <ComboBox
                options={kycDocuments.map(doc => ({
                  value: doc.id,
                  label: doc.display_name || doc.name,
                  description: `${doc.department} • ${doc.category} • ${doc.fields?.length || 0} fields`
                }))}
                value={doc.linkedKycDocument || ''}
                onValueChange={handleKycDocumentSelect}
                placeholder={loadingKycDocs ? "Loading documents..." : "Choose an existing document"}
                emptyText="No documents found"
                disabled={loadingKycDocs}
                loading={loadingKycDocs}
                className="w-full bg-white"
              />
              {doc.linkedKycDocument && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="h-3 w-3"/> Document linked successfully.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Special Document Entity Selection */}
        {doc.isSpecial && (
          <div className="space-y-2 p-4 bg-amber-50 border border-amber-300 rounded-lg">
            <Label className="font-medium flex items-center gap-2 text-amber-800">
              <Star className="h-4 w-4 text-amber-500" />
              Target Entities
            </Label>
            <MultiEntityPicker
              entities={entityOptions}
              selectedEntities={doc.targetEntities || []}
              onSelectionChange={(selectedEntities) => {
                onUpdateDocument(doc.id, { targetEntities: selectedEntities })
              }}
              loading={loadingEntities}
              placeholder="Select which entities need this document..."
            />
            <p className="text-xs text-amber-700">
              This document will only be required for the selected entities.
            </p>
          </div>
        )}

        {/* Document Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-gray-700">Document Name *</Label>
            <Input
              value={doc.name || ''}
              onChange={(e) => onUpdateDocument(doc.id, { name: e.target.value })}
              placeholder="e.g., Application Form"
              disabled={documentMode === 'existing' && doc.linkedKycDocument}
            />
            {documentMode === 'existing' && doc.linkedKycDocument && (
              <p className="text-xs text-muted-foreground">
                Name is set from the linked document.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-gray-700">Document Type</Label>
            <Select
              value={doc.documentType}
              onValueChange={(value: 'upload' | 'extraction' | 'both') =>
                onUpdateDocument(doc.id, { documentType: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upload">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Upload Only
                  </div>
                </SelectItem>
                <SelectItem value="extraction">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Data Extraction Only
                  </div>
                </SelectItem>
                <SelectItem value="both">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <Info className="h-4 w-4" />
                    Upload + Extraction
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-gray-700">Input Type</Label>
            <Select
              value={doc.inputType || 'file'}
              onValueChange={(value: 'file' | 'message' | 'both') =>
                onUpdateDocument(doc.id, { inputType: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="file">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    File Upload
                  </div>
                </SelectItem>
                <SelectItem value="message">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Message/Text
                  </div>
                </SelectItem>
                <SelectItem value="both">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <MessageSquare className="h-4 w-4" />
                    Both
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">Description</Label>
          <Textarea
            value={doc.description || ''}
            onChange={(e) => onUpdateDocument(doc.id, { description: e.target.value })}
            placeholder="Brief description of this document's purpose..."
            rows={2}
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            checked={doc.isRequired}
            onCheckedChange={(checked) => onUpdateDocument(doc.id, { isRequired: checked as boolean })}
            className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
          />
          <Label className="text-sm font-normal text-gray-700">This document is required for stage completion</Label>
        </div>

        {/* Data Extraction Fields */}
        {(doc.documentType === 'extraction' || doc.documentType === 'both') && (
          <div className="space-y-4 border-t pt-4 mt-4">
            <div className="flex justify-between items-center">
              <div>
                <Label className="text-sm font-semibold text-gray-800">Data Extraction Fields</Label>
                <p className="text-xs text-muted-foreground">
                  {documentMode === 'existing' && doc.linkedKycDocument
                    ? "Fields from the linked document (read-only)."
                    : "Define what data should be extracted from this document."
                  }
                </p>
              </div>
              {documentMode === 'new' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAddExtraction(doc.id)}
                  className="text-white bg-blue-600 border-blue-300 hover:bg-blue-50"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Field
                </Button>
              )}
            </div>

            {doc.extractionSpecs && doc.extractionSpecs.length > 0 ? (
              <div className="space-y-3">
                {doc.extractionSpecs.map((extraction) => {
                  // NEW: Conditional rendering for array types
                  if (extraction.isArray && extraction.arrayConfig) {
                    return (
                      <div key={extraction.id} className={`p-4 rounded-lg border space-y-3 ${
                        documentMode === 'existing' && doc.linkedKycDocument
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-slate-100 border-slate-200'
                      }`}>
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{extraction.fieldName}</span>
                              <Badge variant="outline">Array</Badge>
                              {extraction.isRequired && <Badge variant="destructive" className="text-xs">Required</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">{extraction.description}</p>
                          </div>
                          {documentMode === 'new' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => onRemoveExtraction(doc.id, extraction.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        
                        <div className="pl-4 border-l-2 ml-1 space-y-2">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase">Fields in this array</h4>
                          {extraction.arrayConfig.fields.map(subField => (
                            <div key={subField.id} className="flex items-center justify-between text-sm p-2 bg-white rounded border">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-xs">{subField.fieldName}</span>
                                {subField.isRequired && <span className="text-destructive font-bold ml-1">*</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                {subField.description && <span className="text-xs text-muted-foreground italic">({subField.description})</span>}
                                <Badge variant="secondary" className="text-xs">{subField.fieldType}</Badge>
                              </div>
                            </div>
                          ))}
                          {extraction.arrayConfig.fields.length === 0 && (
                            <p className="text-xs text-muted-foreground">This array has no fields defined.</p>
                          )}
                        </div>
                      </div>
                    );
                  }
                  
                  // Render regular field editor (Styling updated)
                  return (
                    <div key={extraction.id} className={`grid grid-cols-1 md:grid-cols-6 gap-3 items-end p-3 rounded-lg border ${
                      documentMode === 'existing' && doc.linkedKycDocument
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-slate-100 border-slate-200'
                    }`}>
                      <div className="space-y-1 col-span-2">
                        <Label className="text-xs text-gray-600">Field Name</Label>
                        <Input
                          value={extraction.fieldName || ''}
                          onChange={(e) => onUpdateExtraction(doc.id, extraction.id, { fieldName: e.target.value })}
                          placeholder="e.g., Application Date"
                          className="h-9 bg-white"
                          disabled={documentMode === 'existing' && doc.linkedKycDocument}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-600">Field Type</Label>
                        <Select
                          value={extraction.fieldType}
                          onValueChange={(value: 'text' | 'date' | 'number' | 'boolean' | 'file') =>
                            onUpdateExtraction(doc.id, extraction.id, { fieldType: value })
                          }
                          disabled={documentMode === 'existing' && doc.linkedKycDocument}
                        >
                          <SelectTrigger className="h-9 bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="boolean">Boolean</SelectItem>
                            <SelectItem value="file">File</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 col-span-2">
                        <Label className="text-xs text-gray-600">Description</Label>
                        <Input
                          value={extraction.description || ''}
                          onChange={(e) => onUpdateExtraction(doc.id, extraction.id, { description: e.target.value })}
                          placeholder="Optional description"
                          className="h-9 bg-white"
                          disabled={documentMode === 'existing' && doc.linkedKycDocument}
                        />
                      </div>
                      <div className="flex items-center justify-between h-9">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={extraction.isRequired}
                            onCheckedChange={(checked) => onUpdateExtraction(doc.id, extraction.id, { isRequired: checked as boolean })}
                            disabled={documentMode === 'existing' && doc.linkedKycDocument}
                            className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                          />
                          <Label className="text-xs font-normal">Required</Label>
                        </div>
                        {documentMode === 'new' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => onRemoveExtraction(doc.id, extraction.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {documentMode === 'existing' && doc.linkedKycDocument && (
                  <div className="text-center p-4 bg-blue-50 border border-blue-300 rounded-lg">
                    <Info className="h-5 w-5 mx-auto mb-2 text-blue-600" />
                    <p className="text-sm text-blue-800 font-medium">Linked Document Fields</p>
                    <p className="text-xs text-blue-600">
                      These fields are imported from the linked KYC document and cannot be edited here.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg bg-white">
                <Info className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">
                  {documentMode === 'existing'
                    ? "Select a linked document to view its extraction fields"
                    : "No extraction fields defined"
                  }
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}