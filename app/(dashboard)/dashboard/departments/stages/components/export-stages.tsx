// @ts-nocheck
"use client"
import React from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { FileSpreadsheet } from "lucide-react"
import { format } from "date-fns"
import { Department } from "../stagesdb"

interface ExportStagesProps {
  currentDept: Department | undefined
  disabled?: boolean
}

// Utility function for time conversion
const minutesToTimeString = (minutes: number | null): string => {
  if (minutes === null) return '0m'
  const days = Math.floor(minutes / (60 * 24))
  const hours = Math.floor((minutes % (60 * 24)) / 60)
  const mins = minutes % 60

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`)

  return parts.join(' ')
}

export function ExportStages({ currentDept, disabled }: ExportStagesProps) {
  const { toast } = useToast()

  const exportToCSV = () => {
    if (!currentDept || !currentDept.stages || currentDept.stages.length === 0) {
      toast({
        title: "No data to export",
        description: "Please select a department with stage data",
        variant: "destructive"
      })
      return
    }

    const headers = [
      'Order',
      'Stage Name',
      'Description',
      'Estimated Time (minutes)',
      'Duration Display',
      'Follow Up',
      'Is Special',
      'Documents Count',
      'Subdepartment',
      'Entity',
      'Entity Type',
      'Applicable',
      'Display'
    ]

    const csvData = []

    // Add stage basic info and allocation data
    currentDept.stages.forEach((stage) => {
      // First add the stage basic info
      csvData.push([
        stage.order_num,
        stage.name,
        stage.description || '',
        stage.estimated_time || 0,
        minutesToTimeString(stage.estimated_time),
        stage.follow_up || '',
        stage.isSpecial ? 'Yes' : 'No',
        stage.documents?.length || 0,
        '', // Subdepartment
        '', // Entity
        '', // Entity Type
        '', // Applicable
        '' // Display
      ])

      // Then add allocation data for each subdepartment/class/subclass
      const normalizedSubdepartments = currentDept.subdepartments && currentDept.subdepartments.length > 0
        ? currentDept.subdepartments
        : [{
          id: -1,
          name: 'N/A',
          department_id: currentDept.id,
          stages: [],
          hasClasses: false,
          classes: []
        }]

      normalizedSubdepartments.forEach((subdept) => {
        if (!subdept.hasClasses || !subdept.classes || subdept.classes.length === 0) {
          // Direct subdepartment allocation
          const stageAllocation = subdept.stages?.find(s => s.stage_id === stage.id)
          csvData.push([
            '', '', '', '', '', '', '', '',
            subdept.name,
            subdept.name,
            'Subdepartment',
            stageAllocation?.applicable ? 'Yes' : 'No',
            stageAllocation?.display ? 'Yes' : 'No'
          ])
        } else {
          // Class and subclass allocations
          subdept.classes.forEach((cls) => {
            if (!cls.subClasses || cls.subClasses.length === 0) {
              // Direct class allocation
              const stageAllocation = cls.stages?.find(s => s.stage_id === stage.id)
              csvData.push([
                '', '', '', '', '', '', '', '',
                subdept.name,
                `${subdept.name} → ${cls.name}`,
                'Class',
                stageAllocation?.applicable ? 'Yes' : 'No',
                stageAllocation?.display ? 'Yes' : 'No'
              ])
            } else {
              // Subclass allocations
              cls.subClasses.forEach((subCls) => {
                const stageAllocation = subCls.stages?.find(s => s.stage_id === stage.id)
                csvData.push([
                  '', '', '', '', '', '', '', '',
                  subdept.name,
                  `${subdept.name} → ${cls.name} → ${subCls.name}`,
                  'Subclass',
                  stageAllocation?.applicable ? 'Yes' : 'No',
                  stageAllocation?.display ? 'Yes' : 'No'
                ])
              })
            }
          })
        }
      })
    })

    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${currentDept.name}_stages_${format(new Date(), 'yyyy-MM-dd')}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: "Export Successful",
      description: `Exported ${currentDept.stages.length} stages with allocation data to CSV`,
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={exportToCSV}
      disabled={disabled}
    >
      <FileSpreadsheet className="h-4 w-4 mr-2" />
      Export CSV
    </Button>
  )
}