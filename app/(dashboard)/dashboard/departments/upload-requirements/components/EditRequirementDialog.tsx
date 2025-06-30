// @ts-nocheck
"use client"
import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { FileText, Info, Zap, Webhook } from "lucide-react"
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
    automationId: ''
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
        automationId: requirement.automationId || ''
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

      // Handle KYC document selection
      if (kycDocumentOption === 'create_new') {
        try {
          // Create new KYC document
          const departmentName = context?.subdepartmentName?.split(' ')[0] || 'General'
          const newDocId = await createNewKycDocument(formData.name, departmentName)
          updatedData.kycDocumentId = newDocId
          // Refresh KYC documents list
          await fetchKycDocuments()
        } catch (error) {
          console.error('Error creating KYC document:', error)
          toast({
            title: 'Error',
            description: 'Failed to create new document type. Please try again.',
            variant: 'destructive'
          })
          return
        }
      } else if (kycDocumentOption === 'none') {
        updatedData.kycDocumentId = ''
      } else if (kycDocumentOption === 'existing' && !updatedData.kycDocumentId) {
        // If existing is selected but no document is chosen
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

      // Prepare the final requirement object
      const updatedRequirement: ApiRequirement = {
        ...updatedData,
        name: updatedData.name.trim(),
        description: updatedData.description?.trim() || '',
        // Ensure empty strings are converted to undefined for optional fields
        kycDocumentId: updatedData.kycDocumentId || undefined,
        webFormName: updatedData.webFormName?.trim() || undefined,
        automationId: updatedData.automationId || undefined,
        // Include Automations array if automation is selected
        ...(updatedData.automationId && {
          Automations: [{
            id: updatedData.automationId,
            name: automationTypes.find(a => a.id === updatedData.automationId)?.name || 'Automation',
            type: 'webhook',
            status: 'active',
            triggeredAt: new Date().toISOString()
          }]
        })
      }

      console.log('Submitting requirement:', updatedRequirement) // Debug log

      // Call the parent's onSave function
      await onSave(updatedRequirement)

      // Show success message
      toast({
        title: 'Success',
        description: 'Requirement updated successfully',
        variant: 'default'
      })

      // Close the dialog on successful save
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
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit Requirement</DialogTitle>
          <DialogDescription>
            Update the requirement details, document association, and automation settings
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
                        <SelectItem key="loading" value="loading" disabled>
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
                <div className="ml-6 text-sm text-muted-foreground bg-blue-50 p-3 rounded">
                  <Info className="h-4 w-4 inline mr-2" />
                  A new document type will be created with the name "{formData.name || 'Requirement Name'}"
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
                        automationId: value === 'no-automation' ? '' : value,
                        // Store the automation data in an Automations field
                        ...(value !== 'no-automation' && {
                          Automations: [{
                            id: value,
                            name: automationTypes.find(a => a.id === value)?.name,
                            type: 'webhook',
                            status: 'active'
                          }]
                        })
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select automation type" />
                    </SelectTrigger>
                    <SelectContent>
                      {loadingAutomations ? (
                        <SelectItem key="loading" value="loading" disabled>
                          Loading automation types...
                        </SelectItem>
                      ) : (
                        <>
                          <SelectItem key="no-automation" value="no-automation">
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