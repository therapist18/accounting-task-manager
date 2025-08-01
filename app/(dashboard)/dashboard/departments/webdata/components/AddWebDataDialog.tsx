//@ts-nocheck
"use client"
import { useEffect, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import supabase from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { Check, Link2, Merge, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"

// Interfaces remain the same
export interface WebDataForm {
  name: string; description: string; isRequired: boolean; masterFieldIds: string[]; masterFields: JobField[]; order: number; variableName: string; efnsDisplayName: string; fieldType: 'text' | 'number' | 'boolean' | 'date' | 'select' | 'array' | 'object'; arrayItems?: Array<{ name: string; variableName: string; type: 'text' | 'number' | 'boolean' | 'date' | 'select' }>
}

interface JobField {
  id: number; field_key: string; label: string; type: 'text' | 'date' | 'number' | 'select'; is_required: boolean; sources?: Array<{ source_type: 'profile' | 'document' | 'company'; table: string; path: string; priority: number }>; options?: string[]; created_at: string; updated_at: string
}

interface WebDataGroup {
  id: string; efnsDisplayName: string; variableName: string; fieldType: WebDataForm['fieldType']; arrayItems?: WebDataForm['arrayItems']; linkedMasterFields: JobField[]
}

interface AddWebDataDialogProps {
  isOpen: boolean; onOpenChange: (open: boolean) => void; onSubmit: (webData: WebDataForm[]) => Promise<void>; isSubmitting: boolean; context: { type: 'subdepartment' | 'class' | 'subclass'; subdepartmentName: string; className?: string; subclassName?: string } | null
}

function MasterFieldPicker({ availableFields, onSelect }: { availableFields: JobField[]; onSelect: (field: JobField) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="outline" size="xs" className="text-xs"><Plus className="mr-1 h-3 w-3" />Add</Button></PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command><CommandInput placeholder="Search master fields..." /><CommandList><CommandEmpty>No fields found.</CommandEmpty><CommandGroup>
          {availableFields.map((field) => (<CommandItem key={field.id} onSelect={() => { onSelect(field); setOpen(false) }}>{field.label}</CommandItem>))}
        </CommandGroup></CommandList></Command>
      </PopoverContent>
    </Popover>
  )
}

export function AddWebDataDialog({ isOpen, onOpenChange, onSubmit, isSubmitting, context }: AddWebDataDialogProps) {
  const [webDataGroups, setWebDataGroups] = useState<WebDataGroup[]>([])
  const [masterFields, setMasterFields] = useState<JobField[]>([])
  const [loadingMasterFields, setLoadingMasterFields] = useState(false)
  const [profileSearch, setProfileSearch] = useState('')
  const [companySearch, setCompanySearch] = useState('')
  const [selectedTopLevelFieldIds, setSelectedTopLevelFieldIds] = useState<Set<number>>(new Set())
  const [selectedGroupIdsForMerge, setSelectedGroupIdsForMerge] = useState<Set<string>>(new Set())

  useEffect(() => { if (isOpen) fetchMasterFields() }, [isOpen])

  const fetchMasterFields = async () => {
    setLoadingMasterFields(true)
    try {
      const { data, error } = await supabase.from('tm_job_fields').select('*').order('label')
      if (error) throw error
      setMasterFields(data || [])
    } catch (error) { toast({ title: 'Error', description: 'Failed to load master fields', variant: 'destructive' }) }
    finally { setLoadingMasterFields(false) }
  }
  
  const allLinkedMasterFieldIds = useMemo(() => new Set(webDataGroups.flatMap(g => g.linkedMasterFields.map(f => f.id))), [webDataGroups])
  
  // LOGIC CHANGE: These filters no longer remove fields that are in use. They just filter by source and search term.
  const filteredProfileFields = useMemo(() => masterFields.filter(f => f.sources?.some(s => s.source_type === 'profile' || s.source_type === 'document') && f.label.toLowerCase().includes(profileSearch.toLowerCase())), [masterFields, profileSearch])
  const filteredCompanyFields = useMemo(() => masterFields.filter(f => f.sources?.some(s => s.source_type === 'company') && f.label.toLowerCase().includes(companySearch.toLowerCase())), [masterFields, companySearch])
  
  // This list is still needed for the "Add" button inside a card.
  const availableForPicking = useMemo(() => masterFields.filter(f => !allLinkedMasterFieldIds.has(f.id)), [masterFields, allLinkedMasterFieldIds])

  const handleClose = () => {
    onOpenChange(false); setWebDataGroups([]); setSelectedTopLevelFieldIds(new Set()); setSelectedGroupIdsForMerge(new Set())
  }

  const handleSubmit = async () => {
    const webDataToSubmit: WebDataForm[] = webDataGroups.map((group, index) => ({
      name: group.efnsDisplayName, efnsDisplayName: group.efnsDisplayName, variableName: group.variableName, description: `Linked to: ${group.linkedMasterFields.map(f => f.label).join(', ')}`, isRequired: group.linkedMasterFields.some(f => f.is_required), order: index, fieldType: group.fieldType, arrayItems: group.arrayItems, masterFields: group.linkedMasterFields, masterFieldIds: group.linkedMasterFields.map(f => f.id.toString())
    }))
    if (webDataToSubmit.length === 0) { handleClose(); return }
    try { await onSubmit(webDataToSubmit); handleClose() } 
    catch (error) { toast({ title: 'Error', description: 'Failed to save webData', variant: 'destructive' }) }
  }

  const toggleTopLevelSelection = (fieldId: number) => {
    setSelectedTopLevelFieldIds(prev => { const newSet = new Set(prev); if (newSet.has(fieldId)) newSet.delete(fieldId); else newSet.add(fieldId); return newSet })
  }

  const addSelectedFieldsAsGroups = () => {
    const fieldsToAdd = masterFields.filter(f => selectedTopLevelFieldIds.has(f.id))
    const newGroups: WebDataGroup[] = fieldsToAdd.map(field => ({
      id: crypto.randomUUID(), efnsDisplayName: field.label, variableName: field.field_key.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase()), fieldType: 'text', linkedMasterFields: [field]
    }))
    setWebDataGroups(prev => [...prev, ...newGroups]); setSelectedTopLevelFieldIds(new Set())
  }
  
  const updateGroup = (groupId: string, field: keyof WebDataGroup, value: any) => {
    setWebDataGroups(prev => prev.map(g => {
        if (g.id !== groupId) return g;
        const updated = { ...g, [field]: value }
        if (field === 'fieldType' && value === 'array' && !updated.arrayItems) updated.arrayItems = []
        return updated
    }))
  }

  const removeGroup = (groupId: string) => setWebDataGroups(prev => prev.filter(g => g.id !== groupId))
  const linkMasterFieldToGroup = (groupId: string, field: JobField) => updateGroup(groupId, 'linkedMasterFields', [...webDataGroups.find(g => g.id === groupId)!.linkedMasterFields, field])
  const unlinkMasterFieldFromGroup = (groupId: string, fieldId: number) => updateGroup(groupId, 'linkedMasterFields', webDataGroups.find(g => g.id === groupId)!.linkedMasterFields.filter(f => f.id !== fieldId))
  const toggleGroupSelectionForMerge = (groupId: string) => setSelectedGroupIdsForMerge(prev => { const newSet = new Set(prev); if (newSet.has(groupId)) newSet.delete(groupId); else newSet.add(groupId); return newSet })

  const handleMerge = () => {
    const groupsToMerge = webDataGroups.filter(g => selectedGroupIdsForMerge.has(g.id))
    if (groupsToMerge.length < 2) return
    const firstGroup = groupsToMerge[0]; const combinedMasterFields = groupsToMerge.flatMap(g => g.linkedMasterFields)
    const newGroup: WebDataGroup = { id: crypto.randomUUID(), efnsDisplayName: firstGroup.efnsDisplayName, variableName: firstGroup.variableName, fieldType: firstGroup.fieldType, linkedMasterFields: combinedMasterFields }
    setWebDataGroups(prev => [...prev.filter(g => !selectedGroupIdsForMerge.has(g.id)), newGroup]); setSelectedGroupIdsForMerge(new Set())
  }
  
  const addArrayItem = (groupId: string) => updateGroup(groupId, 'arrayItems', [...(webDataGroups.find(g => g.id === groupId)?.arrayItems || []), { name: '', variableName: '', type: 'text' }])
  const removeArrayItem = (groupId: string, itemIndex: number) => { const g = webDataGroups.find(g => g.id === groupId); if (!g || !g.arrayItems) return; const ni = [...g.arrayItems]; ni.splice(itemIndex, 1); updateGroup(groupId, 'arrayItems', ni) }
  const handleArrayItemChange = (groupId: string, itemIndex: number, prop: string, value: string) => { const g = webDataGroups.find(g => g.id === groupId); if (!g || !g.arrayItems) return; const ni = [...g.arrayItems]; ni[itemIndex] = { ...ni[itemIndex], [prop]: value }; updateGroup(groupId, 'arrayItems', ni) }

  if (!context) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogHeader><DialogTitle>Add WebData</DialogTitle><DialogDescription>Select master fields to create web data fields. You can merge multiple fields into one later.</DialogDescription></DialogHeader>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        {/* --- Top Selection Area --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {['Profile', 'Company'].map(type => {
            const fields = type === 'Profile' ? filteredProfileFields : filteredCompanyFields;
            const searchVal = type === 'Profile' ? profileSearch : companySearch;
            const setSearch = type === 'Profile' ? setProfileSearch : setCompanySearch;
            return (
              <div className="space-y-3" key={type}>
                <Label className="text-base font-medium">{type} Fields</Label>
                <Input placeholder={`Search ${type.toLowerCase()} fields...`} value={searchVal} onChange={e => setSearch(e.target.value)} className="h-9" />
                <div className="border rounded-md p-2 h-[250px] overflow-y-auto">
                  {loadingMasterFields ? <p>Loading...</p> : fields.length > 0 ? (
                    <div className="space-y-1">{fields.map(field => {
                      // NEW LOGIC: Check if the field is already in use
                      const isInUse = allLinkedMasterFieldIds.has(field.id);
                      return (
                        <div key={field.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                          <input
                            type="checkbox"
                            id={`field-sel-${field.id}`}
                            checked={selectedTopLevelFieldIds.has(field.id)}
                            onChange={() => toggleTopLevelSelection(field.id)}
                            disabled={isInUse} // Disable if in use
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <label
                            htmlFor={`field-sel-${field.id}`}
                            className={cn(
                              "flex-1 flex items-center justify-between text-sm",
                              isInUse ? "text-muted-foreground cursor-not-allowed" : "cursor-pointer"
                            )}
                          >
                            <span>{field.label}</span>
                            {isInUse && ( // Add a visual indicator if in use
                              <Badge variant="outline" className="font-normal text-xs py-0.5 px-1.5">
                                <Link2 className="h-3 w-3 mr-1" />
                                In Use
                              </Badge>
                            )}
                          </label>
                        </div>
                      )
                    })}</div>
                  ) : <div className="h-full flex items-center justify-center text-sm text-gray-500">No fields found.</div>}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex justify-end">
          <Button onClick={addSelectedFieldsAsGroups} disabled={selectedTopLevelFieldIds.size === 0}>
            <Plus className="mr-2 h-4 w-4" /> Add Selected Fields ({selectedTopLevelFieldIds.size})
          </Button>
        </div>
        <hr />
        {/* --- Created Fields Area (No Changes Needed Here) --- */}
        <div className="flex-grow overflow-y-auto pr-2 space-y-4">
            <div className="flex justify-between items-center mb-2 sticky top-0 bg-background/95 py-2 z-10">
                <h3 className="text-lg font-semibold">Web Data Fields ({webDataGroups.length})</h3>
                {selectedGroupIdsForMerge.size > 1 && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="outline" size="sm"><Merge className="mr-2 h-4 w-4" />Merge Selected ({selectedGroupIdsForMerge.size})</Button></AlertDialogTrigger>
                        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm Merge</AlertDialogTitle><AlertDialogDescription>This will combine {selectedGroupIdsForMerge.size} fields into one. The name and type of the first selected field will be used for the new merged field. You can edit it afterward.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleMerge}>Confirm & Merge</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                    </AlertDialog>
                )}
            </div>
            {webDataGroups.length === 0 && <p className="text-sm text-gray-500 text-center py-8">Select fields from above to begin.</p>}
            {webDataGroups.map((group) => (
              <div key={group.id} className="border rounded-lg p-4 space-y-4 bg-card shadow-sm flex gap-4">
                <input type="checkbox" id={`group-sel-${group.id}`} checked={selectedGroupIdsForMerge.has(group.id)} onChange={() => toggleGroupSelectionForMerge(group.id)} className="mt-2 h-4 w-4 rounded border-gray-300"/>
                <div className="flex-grow space-y-4">
                    <div className="flex items-start justify-between">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-grow">
                          <div className="space-y-1"><Label htmlFor={`efnsDisplayName-${group.id}`}>EFNS Display Name</Label><Input id={`efnsDisplayName-${group.id}`} value={group.efnsDisplayName} onChange={(e) => updateGroup(group.id, 'efnsDisplayName', e.target.value)}/></div>
                          <div className="space-y-1"><Label htmlFor={`variableName-${group.id}`}>Variable Name</Label><Input id={`variableName-${group.id}`} value={group.variableName} onChange={(e) => updateGroup(group.id, 'variableName', e.target.value)}/></div>
                          <div className="space-y-1"><Label htmlFor={`fieldType-${group.id}`}>Field Type</Label><Select value={group.fieldType} onValueChange={(value) => updateGroup(group.id, 'fieldType', value)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="text">Text</SelectItem><SelectItem value="number">Number</SelectItem><SelectItem value="boolean">Boolean</SelectItem><SelectItem value="date">Date</SelectItem><SelectItem value="select">Select</SelectItem><SelectItem value="array">Array</SelectItem><SelectItem value="object">Object</SelectItem></SelectContent></Select></div>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 ml-4" onClick={() => removeGroup(group.id)}><X className="h-4 w-4" /></Button>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-semibold">Linked Master Fields</Label>
                        <div className="flex flex-wrap gap-2 items-center">
                            {group.linkedMasterFields.map(field => (<Badge key={field.id} variant="secondary" className="pl-2 pr-1 py-1">{field.label}<button onClick={() => unlinkMasterFieldFromGroup(group.id, field.id)} className="ml-1.5 rounded-full hover:bg-gray-400/20 p-0.5"><X className="h-3 w-3"/></button></Badge>))}
                            <MasterFieldPicker availableFields={availableForPicking} onSelect={(field) => linkMasterFieldToGroup(group.id, field)} />
                        </div>
                    </div>
                    {group.fieldType === 'array' && (
                      <div className="mt-2 p-4 border rounded-lg bg-gray-50/50 space-y-3">
                        <Label className="font-medium">Array Item Structure</Label>
                        {group.arrayItems?.map((arrayItem, itemIdx) => (<div key={itemIdx} className="flex items-end gap-2 p-3 border rounded-md bg-white"><div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-grow"><div className="space-y-1"><Label className="text-xs">Display Name</Label><Input value={arrayItem.name} onChange={(e) => handleArrayItemChange(group.id, itemIdx, 'name', e.target.value)}/></div><div className="space-y-1"><Label className="text-xs">Variable Name</Label><Input value={arrayItem.variableName} onChange={(e) => handleArrayItemChange(group.id, itemIdx, 'variableName', e.target.value)}/></div><div className="space-y-1"><Label className="text-xs">Type</Label><Select value={arrayItem.type} onValueChange={(v) => handleArrayItemChange(group.id, itemIdx, 'type', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="text">Text</SelectItem><SelectItem value="number">Number</SelectItem></SelectContent></Select></div></div><Button type="button" variant="ghost" size="icon" onClick={() => removeArrayItem(group.id, itemIdx)}><X className="h-4 w-4" /></Button></div>))}
                        <Button type="button" variant="outline" size="sm" onClick={() => addArrayItem(group.id)}><Plus className="h-4 w-4 mr-2" />Add Item</Button>
                      </div>
                    )}
                </div>
              </div>
            ))}
        </div>
        <DialogFooter className="mt-4 pt-4 border-t"><Button variant="outline" onClick={handleClose} disabled={isSubmitting}>Cancel</Button><Button type="button" onClick={handleSubmit} disabled={isSubmitting || webDataGroups.length === 0}>{isSubmitting ? 'Saving...' : 'Save WebData'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}