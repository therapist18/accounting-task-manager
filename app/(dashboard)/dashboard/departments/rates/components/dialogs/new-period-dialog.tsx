// @ts-nocheck
"use client"
import { useState } from 'react';
import { format } from 'date-fns';
import { Plus, Copy, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HistoricalRatePeriod } from '@/types/department';

interface NewPeriodDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  historicalPeriods: HistoricalRatePeriod[];
  onCreatePeriod: (formData: {
    description: string;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    copyFromPeriod: string | null;
  }) => Promise<void>;
  saving: boolean;
}

export function NewPeriodDialog({
  isOpen,
  onOpenChange,
  historicalPeriods,
  onCreatePeriod,
  saving,
}: NewPeriodDialogProps) {
  const [formData, setFormData] = useState({
    description: '',
    effectiveFrom: new Date(),
    effectiveTo: null as Date | null,
    copyFromPeriod: null as string | null,
  });

  const handleSubmit = async () => {
    await onCreatePeriod({
      ...formData,
      copyFromPeriod: formData.copyFromPeriod,
    });
    
    // Reset form after successful submission
    if (!saving) {
      setFormData({
        description: '',
        effectiveFrom: new Date(),
        effectiveTo: null,
        copyFromPeriod: null,
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New Period
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Plus className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Create New Rate Period</h3>
              <p className="text-sm text-muted-foreground">Set up a new rate period for this department</p>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Description (Optional)</Label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="e.g., Q2 2025 Rate Update"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">Add a descriptive name for this rate period</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Effective From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left">
                    <History className="mr-2 h-4 w-4" />
                    {format(formData.effectiveFrom, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
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
              <Label className="text-sm font-medium">Effective To (Optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left">
                    <History className="mr-2 h-4 w-4" />
                    {formData.effectiveTo ? format(formData.effectiveTo, "PPP") : "No end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.effectiveTo || undefined}
                    onSelect={(date) => setFormData(prev => ({ ...prev, effectiveTo: date || null }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm font-medium">Copy Rates From (Optional)</Label>
            <Select
              value={formData.copyFromPeriod || "current"}
              onValueChange={(value) => setFormData(prev => ({
                ...prev,
                copyFromPeriod: value === "current" ? null : value
              }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a period to copy rates from" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">
                  <div className="flex items-center gap-2">
                    <Copy className="h-4 w-4" />
                    Start with current rates
                  </div>
                </SelectItem>
                {historicalPeriods.map((period) => (
                  <SelectItem key={period.id} value={period.id!.toString()}>
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4" />
                      <span>
                        {format(period.effectiveFrom, "PPP")}
                        {period.description && ` - ${period.description}`}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose existing rates to copy, or start fresh with current rates
            </p>
          </div>
        </div>
        
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={saving}
            className="bg-green-600 hover:bg-green-700"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create Period
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
