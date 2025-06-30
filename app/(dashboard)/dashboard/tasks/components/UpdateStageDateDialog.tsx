"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"

interface UpdateStageDateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: any
  stageId: string
  stageName: string
  onSuccess?: () => void
}

export function UpdateStageDateDialog({ 
  open, 
  onOpenChange, 
  task, 
  stageId, 
  stageName,
  onSuccess 
}: UpdateStageDateDialogProps) {
  const [date, setDate] = useState<Date | undefined>(new Date())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!date) {
      setError('Please select a date')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Get current stages data
      const currentStages = Array.isArray(task.stages) ? [...task.stages] : [];
      
      // Update or add the stage date
      const stageIndex = currentStages.findIndex((s: any) => s.id === stageId);
      const stageData = {
        id: stageId,
        name: stageName,
        date: date.toISOString(),
        status: 'completed'
      };

      if (stageIndex >= 0) {
        currentStages[stageIndex] = stageData;
      } else {
        currentStages.push(stageData);
      }

      // Update the task with the new stages data
      const { error: updateError } = await supabase
        .from('tm_tasks')
        .update({ 
          stages: currentStages,
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id);

      if (updateError) throw updateError;

      toast({
        title: "Success",
        description: `${stageName} date has been updated successfully.`,
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error(`Error updating ${stageName} date:`, error);
      setError(`Failed to update ${stageName} date. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Update {stageName} Date</DialogTitle>
          <DialogDescription>
            Set the {stageName.toLowerCase()} date for this task.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="stageDate" className="text-right">
              {stageName} Date
            </Label>
            <div className="col-span-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          {error && (
            <div className="text-sm text-red-500">{error}</div>
          )}
        </div>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
