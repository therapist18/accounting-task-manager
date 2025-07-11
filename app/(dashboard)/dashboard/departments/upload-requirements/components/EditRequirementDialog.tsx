// @ts-nocheck
"use client"
import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { FileText, Info, Zap, Webhook, Users, Building, Layers } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import supabase from "@/lib/supabase/client"

interface EditRequirementDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  requirement: ApiRequirement | null
  onSave: (updatedRequirement: ApiRequirement) => Promise<void>
  isSubmitting: boolean
  context: EditingContext | null
}

export function EditRequirementDialog({
  isOpen,
  onOpenChange,
  requirement,
  onSave,
  isSubmitting: propIsSubmitting,
  context
}: EditRequirementDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ApiRequirement>({
    id: '',
    name: '',
    description: '',
    type: 'standard',
    order: 0,
    isVisible: true,
    isRequired: true,
    kycDocumentId: '',
    hasWebForm: false,
    webFormName: '',
    automationId: '',
    kycDocumentName: '',
    // New requirement context fields
    applicantType: 'individual',
    requiredDocumentCount: 1,
    billingEntity: 'applicant',
    instructions: ''
  })
  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [automationTypes, setAutomationTypes] = useState<AutomationType[]>([])
  const [loadingKycDocs, setLoadingKycDocs] = useState(false)
  const [loadingAutomations, setLoadingAutomations] = useState(false)
  const [kycDocumentOption, setKycDocumentOption] = useState<'existing' | 'create_new' | 'none'>('none')

  useEffect(() => {
    if (requirement && isOpen) {
      setFormData({
        ...requirement,
        kycDocumentId: requirement.kycDocumentId || '',
        hasWebForm: requirement.hasWebForm || false,
        webFormName: requirement.webFormName || '',
        automationId: requirement.automationId || '',
        // Set requirement context fields with defaults
        applicantType: requirement.applicantType || 'individual',
        requiredDocumentCount: requirement.requiredDocumentCount || 1,
        billingEntity: requirement.billingEntity || 'applicant',
        instructions: requirement.instructions || ''
      })

      // Determine the current KYC document option
      if (requirement.kycDocumentId) {
        setKycDocumentOption('existing')
      } else {
        setKycDocumentOption('none')
      }

      fetchKycDocuments()
      fetchAutomationTypes()
    }
  }, [requirement, isOpen])

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

      toast({
        title: "KYC Document Created",
        description: `Created new document type: ${requirementName}`,
        variant: "default"
      })

      return data.id
    } catch (error) {
      console.error('Error creating KYC document:', error)
      throw error
    }
  }

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'Requirement name is required',
        variant: 'destructive'
      })
      return
    }

    try {
      setIsSubmitting(true)

      // Create a copy of the form data to modify
      const updatedData = { ...formData }

      // Handle KYC document selection (existing code...)
      if (kycDocumentOption === 'create_new') {
        try {
          const departmentName = context?.subdepartmentName?.split(' ')[0] || 'General'
          const docName = formData.kycDocumentName?.trim() || formData.name.trim()
          if (!docName) {
            throw new Error('Document type name is required when creating a new document type')
          }
          const newDocId = await createNewKycDocument(docName, departmentName)
          updatedData.kycDocumentId = newDocId
          await fetchKycDocuments()
        } catch (error) {
          console.error('Error creating KYC document:', error)
          toast({
            title: 'Error',
            description: error instanceof Error ? error.message : 'Failed to create new document type. Please try again.',
            variant: 'destructive'
          })
          return
        }
      } else if (kycDocumentOption === 'none') {
        updatedData.kycDocumentId = ''
      } else if (kycDocumentOption === 'existing' && !updatedData.kycDocumentId) {
        toast({
          title: 'Error',
          description: 'Please select a document type or choose a different option.',
          variant: 'destructive'
        })
        return
      }

      // Validate web form fields if enabled
      if (updatedData.hasWebForm && !updatedData.webFormName?.trim()) {
        toast({
          title: 'Error',
          description: 'Web form name is required when web form is enabled.',
          variant: 'destructive'
        })
        return
      }

      // Prepare web automation data for JSON column
      let webAutomation = null;
      if (updatedData.hasWebForm && updatedData.automationId) {
        const selectedAutomation = automationTypes.find(a => a.id === updatedData.automationId);
        if (selectedAutomation) {
          webAutomation = {
            automationId: updatedData.automationId,
            automationName: selectedAutomation.name,
            webFormName: updatedData.webFormName?.trim(),
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
        applicantType: updatedData.applicantType || 'individual',
        requiredDocumentCount: updatedData.requiredDocumentCount || 1,
        billingEntity: updatedData.billingEntity || 'applicant',
        instructions: updatedData.instructions?.trim() || '',
        type: updatedData.type,
        conditions: updatedData.conditions || [],
        documentTypes: updatedData.documentTypes || []
      };

      // Prepare the final requirement object
      const updatedRequirement: ApiRequirement = {
        id: updatedData.id,
        name: updatedData.name.trim(),
        description: updatedData.description?.trim() || '',
        type: updatedData.type,
        order: updatedData.order || 0,
        isVisible: updatedData.isVisible,
        isRequired: updatedData.isRequired,
        kycDocumentId: updatedData.kycDocumentId || undefined,
        hasWebForm: updatedData.hasWebForm || false,
        webFormName: updatedData.webFormName?.trim() || '',
        automationId: updatedData.automationId || '',

        // JSON column data
        requirement_context: requirementContext,
        web_automation: webAutomation,

        // Backward compatibility fields
        applicantType: updatedData.applicantType || 'individual',
        requiredDocumentCount: updatedData.requiredDocumentCount || 1,
        billingEntity: updatedData.billingEntity || 'applicant',
        instructions: updatedData.instructions?.trim() || ''
      }

      console.log('Submitting requirement with JSON data:', updatedRequirement)

      await onSave(updatedRequirement)

      toast({
        title: 'Success',
        description: 'Requirement updated successfully',
        variant: 'default'
      })

      handleClose()

    } catch (error) {
      console.error('Error in handleSubmit:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save requirement',
        variant: 'destructive'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setKycDocumentOption('none')
  }

  if (!requirement) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Requirement</DialogTitle>
          <DialogDescription>
            Update the requirement details, document association, automation settings, and context
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Requirement Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Requirement name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.description || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
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
                  value={formData.type}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, type: value as any }))}
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
                  value={formData.applicantType || 'individual'}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, applicantType: value as any }))}
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

            {formData.type === 'company' && (
              <div className="space-y-2">
                <Label className="text-sm">Billing Entity</Label>
                <Select
                  value={formData.billingEntity || 'company'}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, billingEntity: value as any }))}
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

            {formData.type === 'multi-document' && (
              <div className="space-y-2">
                <Label className="text-sm">Required Document Count</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.requiredDocumentCount || 1}
                  onChange={(e) => setFormData(prev => ({ ...prev, requiredDocumentCount: parseInt(e.target.value) }))}
                  placeholder="Number of documents required"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm">Special Instructions</Label>
              <Textarea
                value={formData.instructions || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, instructions: e.target.value }))}
                placeholder="e.g., 'This document should be from the company that will be billed for this application'"
                rows={2}
              />
            </div>
          </div>

          {/* KYC Document Association */}
          <div className="space-y-4 border-t pt-4">
            <Label className="font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Document Type Association
            </Label>

            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="none-option"
                  name="kyc-option"
                  checked={kycDocumentOption === 'none'}
                  onChange={() => {
                    setKycDocumentOption('none')
                    setFormData(prev => ({ ...prev, kycDocumentId: '' }))
                  }}
                />
                <Label htmlFor="none-option" className="text-sm">
                  No document association
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="existing-option"
                  name="kyc-option"
                  checked={kycDocumentOption === 'existing'}
                  onChange={() => setKycDocumentOption('existing')}
                />
                <Label htmlFor="existing-option" className="text-sm">
                  Link to existing document type
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="create-new-option"
                  name="kyc-option"
                  checked={kycDocumentOption === 'create_new'}
                  onChange={() => setKycDocumentOption('create_new')}
                />
                <Label htmlFor="create-new-option" className="text-sm">
                  Create new document type
                </Label>
              </div>

              {kycDocumentOption === 'existing' && (
                <div className="ml-6 space-y-2">
                  <Label className="text-sm">Select Document Type</Label>
                  <Select
                    value={formData.kycDocumentId || ''}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, kycDocumentId: value }))}
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

              {kycDocumentOption === 'create_new' && (
                <div className="ml-6 space-y-3">
                  <div className="text-sm text-muted-foreground bg-blue-50 p-3 rounded">
                    <Info className="h-4 w-4 inline mr-2" />
                    Specify a custom name for the new document type
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Document Type Name *</Label>
                    <Input
                      value={formData.kycDocumentName || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, kycDocumentName: e.target.value }))}
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
                  id="has-webform"
                  checked={formData.hasWebForm}
                  onCheckedChange={(checked) => {
                    setFormData(prev => ({
                      ...prev,
                      hasWebForm: checked,
                      // Clear automation fields when disabling
                      webFormName: checked ? prev.webFormName : '',
                      automationId: checked ? prev.automationId : ''
                    }))
                  }}
                />
                <Label htmlFor="has-webform" className="text-sm">
                  Enable web form
                </Label>
              </div>
            </div>

            {formData.hasWebForm && (
              <div className="space-y-4 ml-6">
                <div className="space-y-2">
                  <Label className="text-sm">Web Form Name *</Label>
                  <Input
                    value={formData.webFormName || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, webFormName: e.target.value }))}
                    placeholder="e.g., Personal Information Form, Address Verification"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <Webhook className="h-4 w-4" />
                    Automation Type
                  </Label>
                  <Select
                    value={formData.automationId || ''}
                    onValueChange={(value) => {
                      setFormData(prev => ({
                        ...prev,
                        automationId: value === 'no-automation' ? '' : value
                      }));
                    }}
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
                          <SelectItem value="no-automation">
                            No automation
                          </SelectItem>
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

                {formData.automationId && (
                  <div className="text-sm text-muted-foreground bg-green-50 p-3 rounded">
                    <Info className="h-4 w-4 inline mr-2" />
                    This requirement will trigger the selected automation when the form is submitted.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.name.trim()}
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}