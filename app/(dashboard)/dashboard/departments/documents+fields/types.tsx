// @ts-nocheck
"use client"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { memo, ReactNode } from "react"
import { TableCell, TableRow } from "@/components/ui/table"


export interface DocumentField {
  id: string
  name: string
  type: string
  required?: boolean
  order?: number
  level: number
  parentId: string | null
  isArrayItem: boolean
  hasChildren: boolean
  fields?: DocumentField[]
  path?: string
  index?: number
  parentPath?: string | null
  kycdocumentid?: string
  arrayConfig?: {
    maxItems?: number
    fields?: any[]
  }
  mapping?: any
}

export interface DocumentType {
  id: string
  name: string
  display_name: string
  department: string
  category: string
  main_category: string
  main_category_number: string
  document_number: number
  custom_order: number | null
  fields: DocumentField[]
  last_extracted_details: any
  requirements: any
  validity_days: string
  reminder_days: string
  listed: boolean
  subcategory: string
  document_type: string
  kycdocumentid?: string
  hasFields?: boolean
}

export interface GroupedDocuments {
  [key: string]: {
    mainCategory: string
    mainCategoryNumber: string
    documents: DocumentType[]
  }
}

export interface SubdepartmentClass {
  id?: string | number
  name: string
  description: string | null
  requirements: any[]
  subclasses?: SubdepartmentClass[]
}

export interface Subdepartment {
  id: number
  name: string
  department_id: string
  classes?: SubdepartmentClass[]
  hasClasses: boolean
}

export interface Department {
  id: string
  name: string
  subdepartments?: Subdepartment[]
}

export interface ClientData {
  id: string
  name: string
  email: string
  company?: string
  status: string
  created_at: string
  company_name?: string
  company_prefix?: string
  company_type?: string
  registration_number?: string
  office_phone_number?: string
  current_communication_email?: string
  country?: string
  city?: string
  road_name?: string
  website?: string
  industry?: string
  first_name?: string
  middle_name?: string
  last_name?: string
  national_id?: string
  phone_number?: string
  occupation?: string
  kra_pin?: string
  nssf_id?: string
  nhif_id?: string
  [key: string]: any
}

interface SectionHeaderProps {
  title: string
  icon: React.ElementType
  count: number
}

// Optimized SectionHeader with stable props
export const SectionHeader = memo(({ title, icon: Icon, count }: SectionHeaderProps) => (
  <tr className="bg-blue-500 border-y-2 border-slate-300">
    <td className="sticky left-0 bg-blue-500 border-r z-[5] text-center font-bold text-white w-16">
      <Icon className="h-4 w-4 mx-auto" />
    </td>
    <td className="sticky left-16 bg-blue-500 border-r z-[5] w-[300px]">
      <div className="flex items-center gap-2 px-4 py-2">
        <span className="font-bold text-white text-lg">{title}</span>
        <span className="text-sm bg-slate-200 text-white px-2 py-1 rounded-full ml-2">{count}</span>
      </div>
    </td>
    <td colSpan={100} className="bg-blue-500 border-r">
      <div className="h-px bg-slate-300 w-full"></div>
    </td>
  </tr>
))
SectionHeader.displayName = 'SectionHeader'

interface TruncatedTextProps {
  text: string
  maxLength?: number
  className?: string
}

// Optimized TruncatedText with better memoization
export const TruncatedText = memo(({ text, maxLength = 30, className = '' }: TruncatedTextProps) => {
  const truncatedText = text?.length > maxLength ? `${text.substring(0, maxLength)}...` : text
  
  if (!text) return null
  if (text.length <= maxLength) {
    return <span className={className}>{text}</span>
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('cursor-help', className)}>{truncatedText}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[300px] break-words">
        {text}
      </TooltipContent>
    </Tooltip>
  )
})
TruncatedText.displayName = 'TruncatedText'
