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
  isRequired: boolean
  masterFieldId: string
  masterField: any // Store master field data for display
  order: number
  variableName: string
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
  const [newWebData, setNewWebData] = useState<WebDataForm[]>([])
  const [bulkInput, setBulkInput] = useState('')
  const [masterFields, setMasterFields] = useState<JobField[]>([])
  const [loadingMasterFields, setLoadingMasterFields] = useState(false)
  const [profileSearch, setProfileSearch] = useState('')
  const [companySearch, setCompanySearch] = useState('')
  const [selectedFields, setSelectedFields] = useState<string[]>([])

  // Fetch master fields when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchMasterFields()
    }
  }, [isOpen])

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
    if (newWebData.length === 0) {
      handleClose()
      return
    }

    try {
      await onSubmit(newWebData)
      handleClose()
    } catch (error) {
      console.error('Error saving webData:', error)
      toast({
        title: 'Error',
        description: 'Failed to save webData',
        variant: 'destructive'
      })
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setNewWebData([])
    setSelectedFields([])
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

  const handleMasterFieldSelect = (masterFieldId: string) => {
    const masterField = masterFields.find(f => f.id.toString() === masterFieldId)
    if (!masterField) return

    // Convert field key to camelCase for default variable name
    const defaultVarName = masterField.field_key
      .toLowerCase()
      .replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase())

    const newWebDataItem = {
      name: masterField.label,
      description: `Auto-populated from ${masterField.field_key}`,
      isRequired: masterField.is_required,
      masterFieldId: masterField.id.toString(),
      masterField: masterField,
      order: newWebData.length,
      variableName: defaultVarName
    }

    setNewWebData([...newWebData, newWebDataItem])
  }

  const toggleFieldSelection = (fieldId: string) => {
    setSelectedFields(prev =>
      prev.includes(fieldId)
        ? prev.filter(id => id !== fieldId)
        : [...prev, fieldId]
    )
  }

  const addSelectedFields = () => {
    const fieldsToAdd = masterFields.filter(field => 
      selectedFields.includes(field.id.toString()) && 
      !newWebData.some(item => item.masterFieldId === field.id.toString())
    )

    const newFields = fieldsToAdd.map((field, index) => {
      // Convert field key to camelCase for default variable name
      const defaultVarName = field.field_key
        .toLowerCase()
        .replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase())

      return {
        name: field.label,
        description: `Auto-populated from ${field.field_key}`,
        isRequired: field.is_required,
        masterFieldId: field.id.toString(),
        masterField: field,
        order: newWebData.length + index,
        variableName: defaultVarName
      }
    })

    setNewWebData(prev => [...prev, ...newFields])
    setSelectedFields([])
  }

  const filteredProfileFields = masterFields
    .filter(field => !newWebData.some(item => item.masterFieldId === field.id.toString()))
    .filter(field =>
      field.sources?.some(s => s.source_type === 'profile' || s.source_type === 'document') &&
      field.label.toLowerCase().includes(profileSearch.toLowerCase())
    )

  const filteredCompanyFields = masterFields
    .filter(field => !newWebData.some(item => item.masterFieldId === field.id.toString()))
    .filter(field =>
      field.sources?.some(s => s.source_type === 'company') &&
      field.label.toLowerCase().includes(companySearch.toLowerCase())
    )

  if (!context) return null

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleClose()
    }
    onOpenChange(open)
  }

  const removeWebData = (masterFieldId: string) => {
    setNewWebData(prev => prev.filter(item => item.masterFieldId !== masterFieldId))
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
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
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="space-y-6">
          <Card>
            <CardContent className="p-4">
              <div className="space-y-3">
                <Label className="text-base font-medium">
                  Link Master Fields
                </Label>
                <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded">
                  Select fields from the master list to link to this web data.
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Profile/Individuals Section */}
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-base font-medium">Profile/Individuals Fields</Label>
                      <div className="relative">
                        <Input
                          placeholder="Search profile fields..."
                          value={profileSearch}
                          onChange={(e) => setProfileSearch(e.target.value)}
                          className="h-9" />
                      </div>
                    </div>
                    <div className="border rounded-md p-2 h-[400px] overflow-y-auto">
                      {filteredProfileFields.length > 0 ? (
                        <div className="space-y-2">
                          {filteredProfileFields.map((field) => (
                            <div key={field.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded">
                              <input
                                type="checkbox"
                                id={`field-${field.id}`}
                                checked={selectedFields.includes(field.id)}
                                onChange={() => toggleFieldSelection(field.id)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                              <label htmlFor={`field-${field.id}`} className="flex-1 flex items-center justify-between">
                                <span className="text-sm">{field.label}</span>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">{field.type}</Badge>
                                  {field.is_required && (
                                    <Badge variant="default" className="text-xs">Required</Badge>
                                  )}
                                </div>
                              </label>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center text-sm text-gray-500">
                          No profile fields found
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Company Section */}
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-base font-medium">Company Fields</Label>
                      <div className="relative">
                        <Input
                          placeholder="Search company fields..."
                          value={companySearch}
                          onChange={(e) => setCompanySearch(e.target.value)}
                          className="h-9" />
                      </div>
                    </div>
                    <div className="border rounded-md p-2 h-[400px] overflow-y-auto">
                      {filteredCompanyFields.length > 0 ? (
                        <div className="space-y-2">
                          {filteredCompanyFields.map((field) => (
                            <div key={field.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded">
                              <input
                                type="checkbox"
                                id={`field-${field.id}`}
                                checked={selectedFields.includes(field.id)}
                                onChange={() => toggleFieldSelection(field.id)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                              <label htmlFor={`field-${field.id}`} className="flex-1 flex items-center justify-between">
                                <span className="text-sm">{field.label}</span>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">{field.type}</Badge>
                                  {field.is_required && (
                                    <Badge variant="default" className="text-xs">Required</Badge>
                                  )}
                                </div>
                              </label>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center text-sm text-gray-500">
                          No company fields found
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    onClick={addSelectedFields}
                    disabled={selectedFields.length === 0}
                    className="px-6"
                  >
                    Add Selected Fields ({selectedFields.length})
                  </Button>
                </div>
              </div>
          </div>
          <div className="space-y-4">
            {newWebData.map((item, idx) => (
              <div key={`${item.masterFieldId}-${idx}`} className="border rounded-lg p-4 space-y-4 bg-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Label className="font-medium">Field {idx + 1}</Label>
                    <Badge variant="outline" className="text-xs">
                      <Link2 className="h-3 w-3 mr-1" />
                      {item.name}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeWebData(item.masterFieldId)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Field Details</Label>
                  <div className="p-3 bg-gray-50 rounded-md text-sm space-y-3">
                    <div>
                      <Label htmlFor={`variable-name-${item.masterFieldId}`} className="text-xs font-medium text-gray-700">
                        Variable Name
                      </Label>
                      <Input
                        id={`variable-name-${item.masterFieldId}`}
                        value={item.variableName}
                        onChange={(e) => {
                          const updated = [...newWebData]
                          const index = updated.findIndex(wd => wd.masterFieldId === item.masterFieldId)
                          if (index !== -1) {
                            updated[index].variableName = e.target.value
                            setNewWebData(updated)
                          }
                        }}
                        className="mt-1 h-8 text-xs"
                        placeholder="Enter variable name"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Field Key:</span>
                        <code className="bg-white px-2 py-0.5 rounded border text-xs">
                          {item.masterField?.field_key || 'N/A'}
                        </code>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Type:</span>
                        <Badge variant="outline" className="text-xs">
                          {item.masterField?.type || 'text'}
                        </Badge>
                      </div>
                      {item.isRequired && (
                        <div className="text-xs text-green-600 font-medium">This field is required</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || newWebData.length === 0}
          >
            {isSubmitting ? 'Saving...' : 'Save WebData'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}