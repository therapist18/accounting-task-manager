import { useState } from "react"
import { format } from "date-fns"
import { Plus, Calendar as CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface RatePeriod {
  id?: number
  effectiveFrom: Date
  effectiveTo: Date | null
  description: string
  copyFromPeriod: number | null
}

interface NewPeriodDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (period: Omit<RatePeriod, 'id'>) => Promise<void>
  historicalPeriods: Array<{ id: number; description: string }>
  isSaving: boolean
}

export function NewPeriodDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  historicalPeriods,
  isSaving
}: NewPeriodDialogProps) {
  const [formData, setFormData] = useState<Omit<RatePeriod, 'id'>>({
    effectiveFrom: new Date(),
    effectiveTo: null,
    description: '',
    copyFromPeriod: null
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit(formData)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create New Rate Period
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Description (Optional)</Label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="e.g., Q1 2025 Rate Update"
            />
          </div>
          
          <div className="space-y-2">
            <Label>Effective From</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(formData.effectiveFrom, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={formData.effectiveFrom}
                  onSelect={(date) => date && setFormData(prev => ({ ...prev, effectiveFrom: date }))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Effective To (Optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.effectiveTo ? format(formData.effectiveTo, "PPP") : "Select end date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={formData.effectiveTo || undefined}
                  onSelect={(date) => setFormData(prev => ({ ...prev, effectiveTo: date || null }))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Copy From (Optional)</Label>
            <Select
              value={formData.copyFromPeriod?.toString() || "none"}
              onValueChange={(value) => setFormData(prev => ({
                ...prev,
                copyFromPeriod: value !== "none" ? parseInt(value) : null
              }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a period to copy from" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Create Empty Period</SelectItem>
                {historicalPeriods.map((period) => (
                  <SelectItem key={period.id} value={period.id.toString()}>
                    {period.description || `Period ${period.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Creating..." : "Create Period"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
