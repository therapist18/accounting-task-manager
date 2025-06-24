import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, X } from "lucide-react"

export interface RequirementForm {
  name: string
  description: string
  type: 'standard' | 'conditional' | 'optional'
  isRequired: boolean
  isVisible: boolean
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
    isVisible: true
  }])
  const [bulkInput, setBulkInput] = useState('')

  const handleClose = () => {
    onOpenChange(false)
    setNewRequirements([{
      name: '',
      description: '',
      type: 'standard',
      isRequired: true,
      isVisible: true
    }])
    setBulkInput('')
  }

  const addNewRequirement = () => {
    setNewRequirements([...newRequirements, {
      name: '',
      description: '',
      type: 'standard',
      isRequired: true,
      isVisible: true
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
        isVisible: true
      }])
      return
    }

    const lines = text.split('\n').filter(line => line.trim() !== '')
    const requirements = lines.map(line => ({
      name: line.trim(),
      description: '',
      type: 'standard' as const,
      isRequired: true,
      isVisible: true
    }))

    setNewRequirements(requirements)
  }

  const handleSubmit = async () => {
    const validRequirements = newRequirements.filter(req => req.name.trim() !== '')
    if (validRequirements.length === 0) {
      handleClose()
      return
    }
    await onSubmit(validRequirements)
    handleClose()
  }

  if (!context) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
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
              <div key={idx} className="flex items-start space-x-2">
                <div className="grid gap-2 flex-1">
                  <div className="flex items-center justify-between">
                    <Label>Requirement {idx + 1}</Label>
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
                  <Input
                    value={req.name}
                    onChange={(e) => handleNewRequirementChange(idx, 'name', e.target.value)}
                    placeholder="Requirement name"
                  />
                  <Textarea
                    value={req.description}
                    onChange={(e) => handleNewRequirementChange(idx, 'description', e.target.value)}
                    placeholder="Description (optional)"
                    rows={2}
                  />
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
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Save Requirements'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
