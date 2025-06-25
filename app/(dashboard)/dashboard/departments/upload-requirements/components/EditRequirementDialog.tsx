// @ts-nocheck
"use client"
import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { FileText, Info, X } from "lucide-react"
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
    kycDocumentId: ''
  })
  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [loadingKycDocs, setLoadingKycDocs] = useState(false)
  const [kycDocumentOption, setKycDocumentOption] = useState<'existing' | 'create_new' | 'none'>('none')

  useEffect(() => {
    if (requirement && isOpen) {
      setFormData({
        ...requirement,
        kycDocumentId: requirement.kycDocumentId || ''
      })

      // Determine the current KYC document option
      if (requirement.kycDocumentId) {
        setKycDocumentOption('existing')
      } else {
        setKycDocumentOption('none')
      }

      fetchKycDocuments()
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

      // Prepare the final requirement object
      const updatedRequirement: ApiRequirement = {
        ...updatedData,
        name: updatedData.name.trim(),
        description: updatedData.description?.trim() || '',
        // Ensure kycDocumentId is undefined if empty string
        kycDocumentId: updatedData.kycDocumentId || undefined
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Requirement</DialogTitle>
          <DialogDescription>
            Update the requirement details and document association
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
              <Label>Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value: 'standard' | 'conditional' | 'optional') =>
                  setFormData(prev => ({ ...prev, type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="conditional">Conditional</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={formData.description || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Description (optional)"
            />
          </div>

          {/* Requirements Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={formData.isRequired}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isRequired: Boolean(checked) }))}
              />
              <Label className="text-sm">Required</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={formData.isVisible}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isVisible: Boolean(checked) }))}
              />
              <Label className="text-sm">Visible</Label>
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
                          <SelectItem key={doc.id} value={doc.id}>
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
