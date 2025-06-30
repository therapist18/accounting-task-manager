// @ts-nocheck
"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Upload, Calendar, Check, X, Clock, CheckCircle, FileText } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { format, parse } from "date-fns"

interface EditableStageCellProps {
  stage: any
  task: any
  value?: string | null
  onSave: (stageId: string, taskId: string, value: string) => void
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
    if (stageDate) {
      // Check if the date is already in ISO format (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(stageDate)) {
        setEditValue(stageDate);
      } else {
        // Convert DD/MM/YYYY to YYYY-MM-DD for the date input
        const dateParts = stageDate.split('/');
        if (dateParts.length === 3) {
          const [day, month, year] = dateParts;
          const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          setEditValue(isoDate);
        } else {
          setEditValue(stageDate);
        }
      }
    } else {
      setEditValue('');
    }
  }, [stageDate]);

  // Rest of the component remains the same...
  const parseDateString = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    
    // Handle DD/MM/YYYY format
    if (dateStr.includes('/')) {
      try {
        const [day, month, year] = dateStr.split('/').map(Number);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year < 2100) {
          const date = new Date(year, month - 1, day);
          if (date.getDate() === day && date.getMonth() === month - 1 && date.getFullYear() === year) {
            return date;
          }
        }
      } catch (e) {
        console.warn('Error parsing date:', e);
      }
    }
    
    // Fallback to native Date parsing for YYYY-MM-DD format
    try {
      const date = new Date(dateStr);
      return !isNaN(date.getTime()) ? date : null;
    } catch (e) {
      console.warn('Error parsing date with native parser:', e);
      return null;
    }
  };

  const formatDateDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    
    const date = parseDateString(dateStr);
    if (date) {
      return format(date, 'dd/MM/yyyy');
    }
    
    return dateStr;
  };

  // In EditableStageCell.tsx, update the handleSave function:
  const handleSave = async () => {
    if (!editValue.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid date",
        variant: "destructive"
      });
      return;
    }

    let dateObj: Date;
    
    try {
      // Handle both YYYY-MM-DD and DD/MM/YYYY formats
      if (editValue.includes('-')) {
        // Handle YYYY-MM-DD format (from date input)
        const [year, month, day] = editValue.split('-').map(Number);
        dateObj = new Date(year, month - 1, day);
      } else if (editValue.includes('/')) {
        // Handle DD/MM/YYYY format (from manual input)
        const [day, month, year] = editValue.split('/').map(Number);
        if (day > 31 || month > 12 || year < 1000) throw new Error('Invalid date');
        dateObj = new Date(year, month - 1, day);
      } else {
        throw new Error('Invalid date format');
      }

      // Validate the date
      if (isNaN(dateObj.getTime())) {
        throw new Error('Invalid date');
      }

      // Format as DD/MM/YYYY for storage
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      const formattedDate = `${day}/${month}/${year}`;

      console.log('Date conversion:', { input: editValue, formattedDate });

      setIsLoading(true);
      await onSave(stage.id, task.id, formattedDate);
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
        description: "Please enter a valid date in DD/MM/YYYY format",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    // Reset to original stage date
    if (stageDate) {
      // Check if the date is already in ISO format (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(stageDate)) {
        setEditValue(stageDate);
      } else {
        // Convert DD/MM/YYYY to YYYY-MM-DD for the input field
        const dateParts = stageDate.split('/');
        if (dateParts.length === 3) {
          const [day, month, year] = dateParts;
          const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          setEditValue(isoDate);
        } else {
          setEditValue(stageDate);
        }
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
    if (stageDate) {
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
  if (isEnquiryStage && stageDate) {
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
        >
          <Upload className="h-4 w-4" />
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          {stageDate ? (
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