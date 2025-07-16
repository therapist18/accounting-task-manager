// @ts-nocheck
"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Upload, Calendar, Check, X, Clock, CheckCircle, FileText } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { format, parse, isValid } from "date-fns"

interface EditableStageCellProps {
  stage: any
  task: any
  value?: string | null
  onSave?: (stageId: string, taskId: string, value: string) => Promise<void> | void
  onDocumentUpload?: (task: any, stage: any) => void
  onShowDocuments?: (task: any) => void
}

export function EditableStageCell({
  stage,
  task,
  value,
  onSave,
  onDocumentUpload,
  onShowDocuments
}: EditableStageCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Get stage date from task.stages object
  const getStageDate = (task: any, stageId: string): string => {
    if (task.stages && task.stages[stageId]) {
      const stageData = task.stages[stageId];
      
      // Handle different formats
      if (typeof stageData === 'object' && stageData.date) {
        return stageData.date;
      } else if (typeof stageData === 'string') {
        return stageData;
      }
    }
    return '';
  };

  const stageDate = getStageDate(task, stage.id);

  // Check if stage requires document upload
  const requiresUpload = stage.documents && stage.documents.length > 0

  // Special handling for enquiry and confirmation stages
  const isEnquiryStage = stage.name === 'Enquiry'
  const isConfirmationStage = stage.name === 'Confirmation'

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    // Set initial edit value when stageDate changes
    if (stageDate && stageDate !== 'NaN/NaN/NaN') {
      // Convert DD/MM/YYYY to YYYY-MM-DD for the date input
      const dateParts = stageDate.split('/');
      if (dateParts.length === 3) {
        const [day, month, year] = dateParts;
        if (!isNaN(Number(day)) && !isNaN(Number(month)) && !isNaN(Number(year))) {
          const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          setEditValue(isoDate);
        } else {
          setEditValue('');
        }
      } else {
        setEditValue('');
      }
    } else {
      setEditValue('');
    }
  }, [stageDate]);

  // Create a timezone-neutral date from YYYY-MM-DD input
  const createDateFromInput = (dateString: string): Date | null => {
    if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return null;
    }

    const [year, month, day] = dateString.split('-').map(Number);
    
    // Validate date components
    if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    // Create date in local timezone to avoid UTC conversion issues
    const date = new Date(year, month - 1, day);
    
    // Verify the date is valid and matches what we expected
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }

    return date;
  };

  const parseDateString = (dateStr: string): Date | null => {
    if (!dateStr || dateStr === 'NaN/NaN/NaN') return null;
    
    try {
      // Try DD/MM/YYYY format first
      const dateParts = dateStr.split('/');
      if (dateParts.length === 3) {
        const [day, month, year] = dateParts.map(Number);
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          const date = new Date(year, month - 1, day);
          if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
            return date;
          }
        }
      }

      // Try ISO format (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return createDateFromInput(dateStr);
      }

      return null;
    } catch (e) {
      console.warn('Error parsing date:', e);
      return null;
    }
  };

  const formatDateDisplay = (dateStr: string): string => {
    if (!dateStr || dateStr === 'NaN/NaN/NaN') return '';
    
    const date = parseDateString(dateStr);
    if (date && isValid(date)) {
      return format(date, 'dd/MM/yyyy');
    }
    
    return dateStr;
  };

  const handleSave = async () => {
    if (!onSave) {
      console.error('onSave function is not provided');
      toast({
        title: "Error",
        description: "Cannot save stage: Save handler not available",
        variant: "destructive"
      });
      return;
    }

    if (!editValue.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid date",
        variant: "destructive"
      });
      return;
    }
    try {
      const dateObj = createDateFromInput(editValue);
      
      if (!dateObj || !isValid(dateObj)) {
        throw new Error('Invalid date format');
      }
  
      const formattedDate = format(dateObj, 'dd/MM/yyyy');
  
      console.log('About to save stage:', {
        stageId: stage.id,
        stageName: stage.name,
        taskId: task.id,
        formattedDate,
        editValue
      });
  
      setIsLoading(true);
      const saveResult = await onSave?.(stage.id, task.id, formattedDate);
      console.log('Save completed:', saveResult);
      setIsEditing(false);
      
      toast({
        title: "Success",
        description: isConfirmationStage 
          ? "Confirmation completed. Task moved to Work in Progress."
          : "Date saved successfully"
      });
    } catch (error) {
      console.error('Date save error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Please enter a valid date",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    // Reset to original stage date
    if (stageDate && stageDate !== 'NaN/NaN/NaN') {
      // Convert DD/MM/YYYY to YYYY-MM-DD for the input field
      const dateParts = stageDate.split('/');
      if (dateParts.length === 3) {
        const [day, month, year] = dateParts;
        if (!isNaN(Number(day)) && !isNaN(Number(month)) && !isNaN(Number(year))) {
          const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          setEditValue(isoDate);
        } else {
          setEditValue('');
        }
      } else {
        setEditValue('');
      }
    } else {
      setEditValue('');
    }
    setIsEditing(false);
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    } else if (e.ctrlKey && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
  }

  const handleBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      handleSave()
    }
  }

  const getStatusDisplay = () => {
    if (stageDate && stageDate !== 'NaN/NaN/NaN') {
      return (
        <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
          <Check className="h-3 w-3 mr-1" />
          {formatDateDisplay(stageDate)}
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="text-gray-500">
        <Clock className="h-3 w-3 mr-1" />
        Pending
      </Badge>
    )
  }

  const handleClick = () => {
    if (requiresUpload) {
      onDocumentUpload?.(task, stage)
    } else {
      setIsEditing(true)
    }
  }

  if (isEditing && !requiresUpload) {
    return (
      <div 
        className="flex items-center gap-2 min-w-[200px]"
        onBlur={handleBlur}
        tabIndex={-1}
      >
        <Input
          ref={inputRef}
          type="date"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="text-sm"
          disabled={isLoading}
        />
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-green-600 hover:text-green-800 hover:bg-green-100"
            onClick={handleSave}
            disabled={isLoading}
          >
            <Check className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-red-600 hover:text-red-800 hover:bg-red-100"
            onClick={handleCancel}
            disabled={isLoading}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    )
  }

  if (isEnquiryStage && stageDate && stageDate !== 'NaN/NaN/NaN') {
    return (
      <div className="flex items-center justify-center">
        <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
          <Check className="h-3 w-3 mr-1" />
          {formatDateDisplay(stageDate)}
        </Badge>
      </div>
    )
  }

  return (
    <div 
      className={`flex items-center justify-center min-h-[32px] cursor-pointer hover:bg-gray-50 rounded p-1 ${
        requiresUpload ? 'hover:bg-blue-50' : 'hover:bg-gray-50'
      }`}
      onClick={handleClick}
    >
      {requiresUpload ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-100"
          onClick={handleClick}
        >
          <Upload className="h-4 w-4" />
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          {stageDate && stageDate !== 'NaN/NaN/NaN' ? (
            <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
              <Check className="h-3 w-3 mr-1" />
              {formatDateDisplay(stageDate)}
            </Badge>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-gray-600 hover:text-gray-800 hover:bg-gray-100 border border-dashed border-gray-300"
            >
              <Calendar className="h-3 w-3 mr-1" />
              {isEnquiryStage ? 'Add Enquiry Date' : 
               isConfirmationStage ? 'Add Confirmation Date' : 
               'Add Date'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}