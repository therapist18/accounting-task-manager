// @ts-nocheck
"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { FileText, Info, Plus, X, Zap, Webhook, Users } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import supabase from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"

export interface RequirementForm {
  name: string
  description: string
  type: 'standard' | 'conditional' | 'optional' | 'company' | 'multi-document'
  isRequired: boolean
  isVisible: boolean
  kycDocumentId?: string
  kycDocumentOption?: 'existing' | 'create_new'
  hasWebForm?: boolean
  webFormName?: string
  automationId?: string
  kycDocumentName?: string

  // New fields
  applicantType?: 'individual' | 'company' | 'both'
  requiredDocumentCount?: number
  billingEntity?: 'applicant' | 'company' | 'either'
  instructions?: string
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
    automationId: '',
    kycDocumentName: '',
    applicantType: 'individual',
    requiredDocumentCount: 1,
    billingEntity: 'applicant',
    instructions: ''
  }])
  const [bulkInput, setBulkInput] = useState('')
  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [automationTypes, setAutomationTypes] = useState<any[]>([])
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
            const departmentName = context?.subdepartmentName?.split(' ')[0] || 'General'
            const docName = req.kycDocumentName?.trim() || req.name.trim()
            if (!docName) {
              throw new Error('Document type name is required when creating a new document type')
            }
            kycDocumentId = await createNewKycDocument(docName, departmentName)
          }

          // Prepare web automation data for JSON column
          let webAutomation = null;
          if (req.hasWebForm && req.automationId) {
            const selectedAutomation = automationTypes.find(a => a.id === req.automationId);
            if (selectedAutomation) {
              webAutomation = {
                automationId: req.automationId,
                automationName: selectedAutomation.name,
                webFormName: req.webFormName?.trim(),
                webhookUrl: selectedAutomation.webhook_url,
                webhookType: selectedAutomation.webhook_type,
                isActive: selectedAutomation.is_active,
                description: selectedAutomation.description,
                createdAt: new Date().toISOString()
              };
            }
          }

          // Prepare requirement context data for JSON column
          const requirementContext = {
            applicantType: req.applicantType || 'individual',
            requiredDocumentCount: req.requiredDocumentCount || 1,
            billingEntity: req.billingEntity || 'applicant',
            instructions: req.instructions?.trim() || '',
            type: req.type,
            conditions: [],
            documentTypes: []
          };

          // Return the processed requirement
          return {
            name: req.name.trim(),
            description: req.description?.trim() || '',
            type: req.type,
            isVisible: req.isVisible,
            isRequired: req.isRequired,
            kycDocumentId: kycDocumentId || undefined,
            hasWebForm: req.hasWebForm || false,
            webFormName: req.webFormName?.trim() || '',
            automationId: req.automationId || '',

            // JSON column data
            requirement_context: requirementContext,
            web_automation: webAutomation,

            // Backward compatibility fields
            applicantType: req.applicantType || 'individual',
            requiredDocumentCount: req.requiredDocumentCount || 1,
            billingEntity: req.billingEntity || 'applicant',
            instructions: req.instructions?.trim() || ''
          };
        })
      )

      console.log('Submitting requirements with JSON data:', processedRequirements)

      await onSubmit(processedRequirements)

      // Reset form after successful submission
      setNewRequirements([{
        name: '',
        description: '',
        type: 'standard',
        isRequired: true,
        isVisible: true,
        kycDocumentOption: 'create_new',
        hasWebForm: false,
        webFormName: '',
        automationId: '',
        kycDocumentName: '',
        applicantType: 'individual',
        requiredDocumentCount: 1,
        billingEntity: 'applicant',
        instructions: ''
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
      automationId: '',
      kycDocumentName: '',
      applicantType: 'individual',
      requiredDocumentCount: 1,
      billingEntity: 'applicant',
      instructions: ''
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
      automationId: '',
      kycDocumentName: '',
      applicantType: 'individual',
      requiredDocumentCount: 1,
      billingEntity: 'applicant',
      instructions: ''
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
        automationId: '',
        kycDocumentName: '',
        applicantType: 'individual',
        requiredDocumentCount: 1,
        billingEntity: 'applicant',
        instructions: ''
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
      automationId: '',
      kycDocumentName: '',
      applicantType: 'individual' as const,
      requiredDocumentCount: 1,
      billingEntity: 'applicant' as const,
      instructions: ''
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

                {/* Requirement Type & Context Section */}
                <div className="space-y-4 border-t pt-4">
                  <Label className="font-medium flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Requirement Context
                  </Label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Requirement Type</Label>
                      <Select
                        value={req.type}
                        onValueChange={(value) => handleNewRequirementChange(idx, 'type', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="conditional">Conditional</SelectItem>
                          <SelectItem value="optional">Optional</SelectItem>
                          <SelectItem value="company">Company Document</SelectItem>
                          <SelectItem value="multi-document">Multiple Documents</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Applies To</Label>
                      <Select
                        value={req.applicantType || 'individual'}
                        onValueChange={(value) => handleNewRequirementChange(idx, 'applicantType', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select applicant type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="individual">Individual Only</SelectItem>
                          <SelectItem value="company">Company Only</SelectItem>
                          <SelectItem value="both">Both Individual & Company</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {req.type === 'company' && (
                    <div className="space-y-2">
                      <Label className="text-sm">Billing Entity</Label>
                      <Select
                        value={req.billingEntity || 'company'}
                        onValueChange={(value) => handleNewRequirementChange(idx, 'billingEntity', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select billing entity" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="company">Company Documents Required</SelectItem>
                          <SelectItem value="applicant">Applicant Must Provide</SelectItem>
                          <SelectItem value="either">Either Can Provide</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {req.type === 'multi-document' && (
                    <div className="space-y-2">
                      <Label className="text-sm">Required Document Count</Label>
                      <Input
                        type="number"
                        min="1"
                        max="10"
                        value={req.requiredDocumentCount || 1}
                        onChange={(e) => handleNewRequirementChange(idx, 'requiredDocumentCount', parseInt(e.target.value))}
                        placeholder="Number of documents required"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-sm">Special Instructions</Label>
                    <Textarea
                      value={req.instructions || ''}
                      onChange={(e) => handleNewRequirementChange(idx, 'instructions', e.target.value)}
                      placeholder="e.g., 'This document should be from the company that will be billed for this application'"
                      rows={2}
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
                        id="create-new-option"
                        name="kyc-option"
                        checked={req.kycDocumentOption === 'create_new'}
                        onChange={() => handleNewRequirementChange(idx, 'kycDocumentOption', 'create_new')}
                      />
                      <Label htmlFor="create-new-option" className="text-sm">
                        Create new document type
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="existing-option"
                        name="kyc-option"
                        checked={req.kycDocumentOption === 'existing'}
                        onChange={() => handleNewRequirementChange(idx, 'kycDocumentOption', 'existing')}
                      />
                      <Label htmlFor="existing-option" className="text-sm">
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
                                <SelectItem key={doc.id} value={doc.id.toString()}>
                                  {doc.display_name || doc.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {req.kycDocumentOption === 'create_new' && (
                      <div className="ml-6 space-y-3">
                        <div className="text-sm text-muted-foreground bg-blue-50 p-3 rounded">
                          <Info className="h-4 w-4 inline mr-2" />
                          Specify a custom name for the new document type
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Document Type Name *</Label>
                          <Input
                            value={req.kycDocumentName || ''}
                            onChange={(e) => handleNewRequirementChange(idx, 'kycDocumentName', e.target.value)}
                            placeholder="Enter custom document type name"
                          />
                          <p className="text-xs text-muted-foreground">
                            Leave empty to use requirement name
                          </p>
                        </div>
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
                                <SelectItem value="no-automation">No automation</SelectItem>
                                {automationTypes.map((automation) => (
                                  <SelectItem key={automation.id} value={automation.id.toString()}>
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

                      {req.automationId && req.automationId !== 'no-automation' && (
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