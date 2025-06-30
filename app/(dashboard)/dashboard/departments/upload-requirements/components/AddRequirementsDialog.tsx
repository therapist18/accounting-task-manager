// @ts-nocheck
"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { FileText, Info, Plus, X, Zap, Webhook } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import supabase from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"

export interface RequirementForm {
  name: string
  description: string
  type: 'standard' | 'conditional' | 'optional'
  isRequired: boolean
  isVisible: boolean
  kycDocumentId?: string
  kycDocumentOption?: 'existing' | 'create_new'
  hasWebForm?: boolean
  webFormName?: string
  automationId?: string
}

interface AddRequirementsDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (requirements: RequirementForm[]) => Promise<void>
  isSubmitting: boolean
  context: {
    type: 'subdepartment' | 'class' | 'subclass'
    subdepartmentName: string
    className?: string
    subclassName?: string
  } | null
}

export function AddRequirementsDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  isSubmitting,
  context
}: AddRequirementsDialogProps) {
  const [newRequirements, setNewRequirements] = useState<RequirementForm[]>([{
    name: '',
    description: '',
    type: 'standard',
    isRequired: true,
    isVisible: true,
    kycDocumentOption: 'create_new',
    hasWebForm: false,
    webFormName: '',
    automationId: ''
  }])
  const [bulkInput, setBulkInput] = useState('')
  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [automationTypes, setAutomationTypes] = useState<AutomationType[]>([])
  const [loadingKycDocs, setLoadingKycDocs] = useState(false)
  const [loadingAutomations, setLoadingAutomations] = useState(false)

  // Fetch KYC documents and automations when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchKycDocuments()
      fetchAutomationTypes()
    }
  }, [isOpen])

  const fetchKycDocuments = async () => {
    try {
      setLoadingKycDocs(true)
      
      const { data, error } = await supabase
        .from('acc_portal_kyc')
        .select('id, name, display_name')
        .order('name')

      if (error) throw error

      setKycDocuments(data || [])
    } catch (error) {
      console.error('Error fetching KYC documents:', error)
      toast({
        title: 'Error',
        description: 'Failed to load document types',
        variant: 'destructive'
      })
    } finally {
      setLoadingKycDocs(false)
    }
  }

  const fetchAutomationTypes = async () => {
    try {
      setLoadingAutomations(true)
      
      const { data, error } = await supabase
        .from('tm_automations')
        .select('id, name, description, webhook_url, webhook_type, is_active')
        .eq('is_active', true)
        .order('name')

      if (error) throw error

      setAutomationTypes(data || [])
    } catch (error) {
      console.error('Error fetching automation types:', error)
      toast({
        title: 'Error',
        description: 'Failed to load automation types',
        variant: 'destructive'
      })
    } finally {
      setLoadingAutomations(false)
    }
  }

  const createNewKycDocument = async (requirementName: string, departmentName: string) => {
    try {
      const { data, error } = await supabase
        .from('acc_portal_kyc')
        .insert({
          name: requirementName,
          display_name: requirementName,
          department: departmentName,
          category: 'application-docs',
          fields: [],
          listed: true,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single()

      if (error) throw error

      return data.id
    } catch (error) {
      console.error('Error creating KYC document:', error)
      throw error
    }
  }

  const handleSubmit = async () => {
    const validRequirements = newRequirements.filter(req => req.name.trim() !== '')
    if (validRequirements.length === 0) {
      handleClose()
      return
    }

    try {
      // Process requirements and handle KYC document creation/linking
      const processedRequirements = await Promise.all(
        validRequirements.map(async (req) => {
          let kycDocumentId = req.kycDocumentId

          if (req.kycDocumentOption === 'create_new') {
            // Create new KYC document
            const departmentName = context?.subdepartmentName?.split(' ')[0] || 'General'
            kycDocumentId = await createNewKycDocument(req.name, departmentName)
          }

          return {
            ...req,
            kycDocumentId,
            // Ensure automation fields are included
            hasWebForm: req.hasWebForm || false,
            webFormName: req.webFormName || '',
            automationId: req.automationId || ''
          }
        })
      )

      await onSubmit(processedRequirements)
      
      // Reset the form after successful submission
      setNewRequirements([{
        name: '',
        description: '',
        type: 'standard',
        isRequired: true,
        isVisible: true,
        kycDocumentOption: 'create_new',
        hasWebForm: false,
        webFormName: '',
        automationId: ''
      }])
      setBulkInput('')
      
    } catch (error) {
      console.error('Error processing requirements:', error)
      toast({
        title: 'Error',
        description: 'Failed to process requirements',
        variant: 'destructive'
      })
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setNewRequirements([{
      name: '',
      description: '',
      type: 'standard',
      isRequired: true,
      isVisible: true,
      kycDocumentOption: 'create_new',
      hasWebForm: false,
      webFormName: '',
      automationId: ''
    }])
    setBulkInput('')
  }

  const addNewRequirement = () => {
    setNewRequirements([...newRequirements, {
      name: '',
      description: '',
      type: 'standard',
      isRequired: true,
      isVisible: true,
      kycDocumentOption: 'create_new',
      hasWebForm: false,
      webFormName: '',
      automationId: ''
    }])
  }

  const removeNewRequirement = (index: number) => {
    if (newRequirements.length > 1) {
      setNewRequirements(newRequirements.filter((_, i) => i !== index))
    }
  }

  const handleNewRequirementChange = (index: number, field: string, value: any) => {
    const updated = [...newRequirements]
    updated[index] = { ...updated[index], [field]: value }
    
    // If hasWebForm is turned off, clear the automation fields
    if (field === 'hasWebForm' && !value) {
      updated[index].webFormName = ''
      updated[index].automationId = ''
    }
    
    setNewRequirements(updated)
  }

  const handleBulkInput = (text: string) => {
    setBulkInput(text)

    if (!text.trim()) {
      setNewRequirements([{
        name: '',
        description: '',
        type: 'standard',
        isRequired: true,
        isVisible: true,
        kycDocumentOption: 'create_new',
        hasWebForm: false,
        webFormName: '',
        automationId: ''
      }])
      return
    }

    const lines = text.split('\n').filter(line => line.trim() !== '')
    const requirements = lines.map(line => ({
      name: line.trim(),
      description: '',
      type: 'standard' as const,
      isRequired: true,
      isVisible: true,
      kycDocumentOption: 'create_new' as const,
      hasWebForm: false,
      webFormName: '',
      automationId: ''
    }))

    setNewRequirements(requirements)
  }

  if (!context) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Requirements</DialogTitle>
          <DialogDescription className="space-y-2">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Adding requirements to: <span className="font-semibold">
                  {context.subdepartmentName}
                  {context.className && ` > ${context.className}`}
                  {context.subclassName && ` > ${context.subclassName}`}
                </span>
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Bulk Add Requirements (one per line)</Label>
            <Textarea
              value={bulkInput}
              onChange={(e) => handleBulkInput(e.target.value)}
              placeholder="Enter requirements, one per line"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Or add them individually below
            </p>
          </div>

          <div className="space-y-4">
            {newRequirements.map((req, idx) => (
              <div key={idx} className="border rounded-lg p-4 space-y-4 bg-card">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">Requirement {idx + 1}</Label>
                  {newRequirements.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeNewRequirement(idx)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Requirement Name *</Label>
                    <Input
                      value={req.name}
                      onChange={(e) => handleNewRequirementChange(idx, 'name', e.target.value)}
                      placeholder="Requirement name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={req.description}
                      onChange={(e) => handleNewRequirementChange(idx, 'description', e.target.value)}
                      placeholder="Description (optional)"
                    />
                  </div>
                </div>

                {/* Document Type Association */}
                <div className="space-y-4 border-t pt-4">
                  <Label className="font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Document Type Association
                  </Label>
                  
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id={`create-new-${idx}`}
                        name={`kyc-option-${idx}`}
                        checked={req.kycDocumentOption === 'create_new'}
                        onChange={() => handleNewRequirementChange(idx, 'kycDocumentOption', 'create_new')}
                      />
                      <Label htmlFor={`create-new-${idx}`} className="text-sm">
                        Create new document type
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id={`existing-${idx}`}
                        name={`kyc-option-${idx}`}
                        checked={req.kycDocumentOption === 'existing'}
                        onChange={() => handleNewRequirementChange(idx, 'kycDocumentOption', 'existing')}
                      />
                      <Label htmlFor={`existing-${idx}`} className="text-sm">
                        Link to existing document type
                      </Label>
                    </div>

                    {req.kycDocumentOption === 'existing' && (
                      <div className="ml-6 space-y-2">
                        <Label className="text-sm">Select Document Type</Label>
                        <Select
                          value={req.kycDocumentId || ''}
                          onValueChange={(value) => handleNewRequirementChange(idx, 'kycDocumentId', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a document type" />
                          </SelectTrigger>
                          <SelectContent>
                            {loadingKycDocs ? (
                              <SelectItem value="loading" disabled>
                                Loading document types...
                              </SelectItem>
                            ) : (
                              kycDocuments.map((doc) => (
                                <SelectItem key={doc.id} value={doc.id}>
                                  {doc.display_name || doc.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {req.kycDocumentOption === 'create_new' && (
                      <div className="ml-6 text-sm text-muted-foreground bg-blue-50 p-3 rounded">
                        <Info className="h-4 w-4 inline mr-2" />
                        A new document type will be created with the name "{req.name || 'Requirement Name'}"
                      </div>
                    )}
                  </div>
                </div>

                {/* Web Form Automation Section */}
                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <Label className="font-medium flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Web Form Automation
                    </Label>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`has-webform-${idx}`}
                        checked={req.hasWebForm}
                        onCheckedChange={(checked) => handleNewRequirementChange(idx, 'hasWebForm', checked)}
                      />
                      <Label htmlFor={`has-webform-${idx}`} className="text-sm">
                        Enable web form
                      </Label>
                    </div>
                  </div>

                  {req.hasWebForm && (
                    <div className="space-y-4 ml-6">
                      <div className="space-y-2">
                        <Label className="text-sm">Web Form Name</Label>
                        <Input
                          value={req.webFormName}
                          onChange={(e) => handleNewRequirementChange(idx, 'webFormName', e.target.value)}
                          placeholder="e.g., Personal Information Form, Address Verification"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm flex items-center gap-2">
                          <Webhook className="h-4 w-4" />
                          Automation Type
                        </Label>
                        <Select
                          value={req.automationId || ''}
                          onValueChange={(value) => handleNewRequirementChange(idx, 'automationId', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select automation type" />
                          </SelectTrigger>
                          <SelectContent>
                            {loadingAutomations ? (
                              <SelectItem value="loading" disabled>
                                Loading automation types...
                              </SelectItem>
                            ) : (
                              <>
                                <SelectItem value="">No automation</SelectItem>
                                {automationTypes.map((automation) => (
                                  <SelectItem key={automation.id} value={automation.id}>
                                    <div className="flex items-center gap-2">
                                      <Webhook className="h-3 w-3" />
                                      <span>{automation.name}</span>
                                      {automation.description && (
                                        <span className="text-xs text-muted-foreground">
                                          - {automation.description}
                                        </span>
                                      )}
                                    </div>
                                  </SelectItem>
                                ))}
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {req.automationId && (
                        <div className="text-sm text-muted-foreground bg-green-50 p-3 rounded">
                          <Info className="h-4 w-4 inline mr-2" />
                          This requirement will trigger the selected automation when the form is submitted.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={addNewRequirement}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Another Requirement
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !newRequirements.some(req => req.name.trim())}
          >
            {isSubmitting ? 'Saving...' : 'Save Requirements'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}