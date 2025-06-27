//@ts-nocheck
"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FileText, Info, Plus, X, Link2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import supabase from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"

export interface WebDataForm {
  name: string
  description: string
  type: 'standard' | 'conditional' | 'optional'
  isRequired: boolean
  isVisible: boolean
  kycDocumentId?: string
  kycDocumentOption?: 'existing' | 'create_new'
  masterFieldId?: number // Link to master field
  masterField?: any // Store master field data for display
}

interface JobField {
  id: number
  field_key: string
  label: string
  type: 'text' | 'date' | 'number' | 'select'
  is_required: boolean
  sources?: Array<{
    source_type: 'profile' | 'document' | 'company'
    table: string
    path: string
    priority: number
  }>
  options?: string[]
  created_at: string
  updated_at: string
}

interface AddWebDataDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (webData: WebDataForm[]) => Promise<void>
  isSubmitting: boolean
  context: {
    type: 'subdepartment' | 'class' | 'subclass'
    subdepartmentName: string
    className?: string
    subclassName?: string
  } | null
}

export function AddWebDataDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  isSubmitting,
  context
}: AddWebDataDialogProps) {
  const [newWebData, setNewWebData] = useState<WebDataForm[]>([{
    name: '',
    description: '',
    type: 'standard',
    isRequired: true,
    isVisible: true,
    kycDocumentOption: 'create_new'
  }])
  const [bulkInput, setBulkInput] = useState('')
  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [masterFields, setMasterFields] = useState<JobField[]>([])
  const [loadingKycDocs, setLoadingKycDocs] = useState(false)
  const [loadingMasterFields, setLoadingMasterFields] = useState(false)
  const [creationMode, setCreationMode] = useState<'manual' | 'master'>('manual')

  // Fetch KYC documents when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchKycDocuments()
      fetchMasterFields()
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

  const fetchMasterFields = async () => {
    try {
      setLoadingMasterFields(true)
      
      const { data, error } = await supabase
        .from('tm_job_fields')
        .select('*')
        .order('label')

      if (error) throw error

      setMasterFields(data || [])
    } catch (error) {
      console.error('Error fetching master fields:', error)
      toast({
        title: 'Error',
        description: 'Failed to load master fields',
        variant: 'destructive'
      })
    } finally {
      setLoadingMasterFields(false)
    }
  }

  const createNewKycDocument = async (webDataName: string, departmentName: string) => {
    try {
      const { data, error } = await supabase
        .from('acc_portal_kyc')
        .insert({
          name: webDataName,
          display_name: webDataName,
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
    const validWebData = newWebData.filter(req => req.name.trim() !== '')
    if (validWebData.length === 0) {
      handleClose()
      return
    }

    try {
      // Process webData and handle KYC document creation/linking
      const processedWebData = await Promise.all(
        validWebData.map(async (req) => {
          let kycDocumentId = req.kycDocumentId

          if (req.kycDocumentOption === 'create_new') {
            // Create new KYC document
            const departmentName = context?.subdepartmentName?.split(' ')[0] || 'General'
            kycDocumentId = await createNewKycDocument(req.name, departmentName)
          }

          return {
            ...req,
            kycDocumentId
          }
        })
      )

      await onSubmit(processedWebData)
      
      // Reset the form after successful submission
      setNewWebData([{
        name: '',
        description: '',
        type: 'standard',
        isRequired: true,
        isVisible: true,
        kycDocumentOption: 'create_new'
      }])
      setBulkInput('')
      setCreationMode('manual')
      
    } catch (error) {
      console.error('Error processing webData:', error)
      toast({
        title: 'Error',
        description: 'Failed to process webData',
        variant: 'destructive'
      })
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setNewWebData([{
      name: '',
      description: '',
      type: 'standard',
      isRequired: true,
      isVisible: true,
      kycDocumentOption: 'create_new'
    }])
    setBulkInput('')
    setCreationMode('manual')
  }

  const addNewWebData = () => {
    setNewWebData([...newWebData, {
      name: '',
      description: '',
      type: 'standard',
      isRequired: true,
      isVisible: true,
      kycDocumentOption: 'create_new'
    }])
  }

  const removeNewWebData = (index: number) => {
    if (newWebData.length > 1) {
      setNewWebData(newWebData.filter((_, i) => i !== index))
    }
  }

  const handleNewWebDataChange = (index: number, field: string, value: any) => {
    const updated = [...newWebData]
    updated[index] = { ...updated[index], [field]: value }
    setNewWebData(updated)
  }

  const handleMasterFieldSelect = (index: number, masterFieldId: string) => {
    const masterField = masterFields.find(f => f.id.toString() === masterFieldId)
    if (!masterField) return

    const updated = [...newWebData]
    updated[index] = {
      ...updated[index],
      masterFieldId: masterField.id,
      masterField: masterField,
      name: masterField.label,
      description: `Auto-populated from ${masterField.field_key}`,
      isRequired: masterField.is_required,
    }
    setNewWebData(updated)
  }

  const handleBulkInput = (text: string) => {
    setBulkInput(text)

    if (!text.trim()) {
      setNewWebData([{
        name: '',
        description: '',
        type: 'standard',
        isRequired: true,
        isVisible: true,
        kycDocumentOption: 'create_new'
      }])
      return
    }

    const lines = text.split('\n').filter(line => line.trim() !== '')
    const webData = lines.map(line => ({
      name: line.trim(),
      description: '',
      type: 'standard' as const,
      isRequired: true,
      isVisible: true,
      kycDocumentOption: 'create_new' as const
    }))

    setNewWebData(webData)
  }

  const handleAddFromMasterFields = () => {
    // Add multiple fields from master fields at once
    const selectedFields = masterFields.slice(0, 5) // Example: add first 5 fields
    const webDataFromMaster = selectedFields.map(field => ({
      name: field.label,
      description: `Auto-populated from ${field.field_key}`,
      type: 'standard' as const,
      isRequired: field.is_required,
      isVisible: true,
      kycDocumentOption: 'create_new' as const,
      masterFieldId: field.id,
      masterField: field
    }))

    setNewWebData(webDataFromMaster)
    setCreationMode('master')
  }

  if (!context) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add WebData</DialogTitle>
          <DialogDescription className="space-y-2">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Adding webData to: <span className="font-semibold">
                  {context.subdepartmentName}
                  {context.className && ` > ${context.className}`}
                  {context.subclassName && ` > ${context.subclassName}`}
                </span>
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Creation Mode Selector */}
          <Card>
            <CardContent className="p-4">
              <div className="space-y-3">
                <Label className="text-base font-medium">Creation Mode</Label>
                <div className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="manual-mode"
                      name="creation-mode"
                      checked={creationMode === 'manual'}
                      onChange={() => setCreationMode('manual')}
                    />
                    <Label htmlFor="manual-mode" className="text-sm">
                      Manual Entry
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="master-mode"
                      name="creation-mode"
                      checked={creationMode === 'master'}
                      onChange={() => setCreationMode('master')}
                    />
                    <Label htmlFor="master-mode" className="text-sm">
                      Link Master Fields
                    </Label>
                  </div>
                </div>
                {creationMode === 'master' && (
                  <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded">
                    <Info className="h-4 w-4 inline mr-2" />
                    Link existing master fields with pre-configured data sources and validation rules.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {creationMode === 'manual' && (
            <div className="space-y-2">
              <Label>Bulk Add WebData (one per line)</Label>
              <Textarea
                value={bulkInput}
                onChange={(e) => handleBulkInput(e.target.value)}
                placeholder="Enter webData, one per line"
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Or add them individually below
              </p>
            </div>
          )}

          {creationMode === 'master' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Available Master Fields</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddFromMasterFields}
                  disabled={loadingMasterFields}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Popular Fields
                </Button>
              </div>
              
              {loadingMasterFields ? (
                <div className="text-center py-4">Loading master fields...</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto">
                  {masterFields.map(field => (
                    <Card key={field.id} className="cursor-pointer hover:bg-gray-50 transition-colors">
                      <CardContent className="p-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-sm">{field.label}</h4>
                            <Badge variant={field.is_required ? "default" : "secondary"} className="text-xs">
                              {field.is_required ? "Required" : "Optional"}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-600 font-mono">{field.field_key}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{field.type}</Badge>
                            {field.sources && field.sources.length > 0 && (
                              <Badge variant="outline" className="text-xs">
                                <Link2 className="h-3 w-3 mr-1" />
                                {field.sources.length} source{field.sources.length > 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              const updated = [...newWebData]
                              if (updated.length === 1 && !updated[0].name) {
                                // Replace the empty first item
                                updated[0] = {
                                  ...updated[0],
                                  masterFieldId: field.id,
                                  masterField: field,
                                  name: field.label,
                                  description: `Auto-populated from ${field.field_key}`,
                                  isRequired: field.is_required,
                                }
                              } else {
                                // Add new item
                                updated.push({
                                  name: field.label,
                                  description: `Auto-populated from ${field.field_key}`,
                                  type: 'standard',
                                  isRequired: field.is_required,
                                  isVisible: true,
                                  kycDocumentOption: 'create_new',
                                  masterFieldId: field.id,
                                  masterField: field
                                })
                              }
                              setNewWebData(updated)
                            }}
                          >
                            Add Field
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">WebData Configuration</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addNewWebData}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Another WebData
              </Button>
            </div>

            {newWebData.map((req, idx) => (
              <div key={idx} className="border rounded-lg p-4 space-y-4 bg-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Label className="font-medium">WebData {idx + 1}</Label>
                    {req.masterField && (
                      <Badge variant="outline" className="text-xs">
                        <Link2 className="h-3 w-3 mr-1" />
                        Linked to: {req.masterField.field_key}
                      </Badge>
                    )}
                  </div>
                  {newWebData.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeNewWebData(idx)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Master Field Selector */}
                {creationMode === 'master' || req.masterField ? (
                  <div className="space-y-3">
                    <Label>Link to Master Field</Label>
                    <Select
                      value={req.masterFieldId?.toString() || ''}
                      onValueChange={(value) => handleMasterFieldSelect(idx, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a master field" />
                      </SelectTrigger>
                      <SelectContent>
                        {masterFields.map(field => (
                          <SelectItem key={field.id} value={field.id.toString()}>
                            <div className="flex items-center gap-2">
                              <span>{field.label}</span>
                              <Badge variant="outline" className="text-xs">{field.type}</Badge>
                              {field.is_required && (
                                <Badge variant="default" className="text-xs">Required</Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    {req.masterField && (
                      <Card className="bg-blue-50 border-blue-200">
                        <CardContent className="p-3">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-sm">Master Field Details</h4>
                              <Badge variant="outline">{req.masterField.type}</Badge>
                            </div>
                            <p className="text-xs text-gray-600">
                              Field Key: <code className="bg-white px-1 rounded">{req.masterField.field_key}</code>
                            </p>
                            {req.masterField.sources && req.masterField.sources.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-xs font-medium">Data Sources:</p>
                                {req.masterField.sources.map((source: any, sourceIdx: number) => (
                                  <div key={sourceIdx} className="text-xs text-gray-600 ml-2">
                                    • {source.source_type}: {source.table}.{source.path} (Priority: {source.priority})
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>WebData Name *</Label>
                    <Input
                      value={req.name}
                      onChange={(e) => handleNewWebDataChange(idx, 'name', e.target.value)}
                      placeholder="WebData name"
                      disabled={!!req.masterField}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={req.description}
                      onChange={(e) => handleNewWebDataChange(idx, 'description', e.target.value)}
                      placeholder="Description (optional)"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>WebData Type</Label>
                    <Select
                      value={req.type}
                      onValueChange={(value) => handleNewWebDataChange(idx, 'type', value)}
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
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={req.isRequired}
                        onCheckedChange={(checked) => handleNewWebDataChange(idx, 'isRequired', checked)}
                        disabled={req.masterField?.is_required}
                      />
                      <Label className="text-sm">Required</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={req.isVisible}
                        onCheckedChange={(checked) => handleNewWebDataChange(idx, 'isVisible', checked)}
                      />
                      <Label className="text-sm">Visible</Label>
                    </div>
                  </div>
                </div>

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
                        onChange={() => handleNewWebDataChange(idx, 'kycDocumentOption', 'create_new')}
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
                        onChange={() => handleNewWebDataChange(idx, 'kycDocumentOption', 'existing')}
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
                          onValueChange={(value) => handleNewWebDataChange(idx, 'kycDocumentId', value)}
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
                        A new document type will be created with the name "{req.name || 'WebData Name'}"
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !newWebData.some(req => req.name.trim())}
          >
            {isSubmitting ? 'Saving...' : 'Save WebData'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}