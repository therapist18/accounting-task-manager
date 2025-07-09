import { 
  DocumentType, 
  DocumentField, 
  GroupedDocuments, 
  Subdepartment, 
  ClientData,
  SubdepartmentClass 
} from "./types";

type ColumnVisibilityOption = {
  id: string;
  label: string;
  visible: boolean;
  isDefault: boolean;
  group: string;
};
import { 
  CATEGORY_MAPPING, 
  CLASS_D_ID, 
  CACHE_DURATION, 
  DEBOUNCE_DELAY, 
  cache, 
  getCachedData, 
  setCachedData 
} from "./config";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";

// Format field values based on their type
export const formatFieldValue = (value: any, type: string): string => {
  if (!value && value !== 0) return '-'

  switch (type) {
    case 'date':
      return new Date(value).toLocaleDateString()
    case 'email':
      return value
    case 'number':
      return typeof value === 'number' ? value.toLocaleString() : value
    case 'password':
      return '••••••••'
    default:
      return String(value)
  }
}

// Process document fields recursively
export const processDocumentFields = (docs: DocumentType[]): DocumentType[] => {
  const processField = (
    field: any,
    level = 0,
    parentId: string | null = null,
    parentPath: string | null = null,
    index = 0,
    baseIndex = ""
  ): DocumentField[] => {
    const currentIndex = baseIndex ? `${baseIndex}.${index + 1}` : `${index + 1}`
    const subFields = field.arrayConfig?.fields || field.fields || []
    const hasChildren = (field.type === 'array' || field.isArray) && subFields.length > 0

    const currentField: DocumentField = {
      ...field,
      id: field.id || `${field.name}-${currentIndex}`,
      kycdocumentid: field.kycdocumentid || field.id,
      level,
      parentId,
      hasChildren,
      isArrayItem: false,
      path: currentIndex,
      index: index + 1,
      parentPath,
      required: field.required || false,
      order: field.order || index
    }

    const result: DocumentField[] = [currentField]

    if (hasChildren) {
      subFields.forEach((subField: any, subIndex: number) => {
        const subFieldResults = processField(
          subField,
          level + 1,
          currentField.id,
          currentIndex,
          subIndex,
          `${currentIndex}`
        )
        result.push(...subFieldResults)
      })
    }

    return result
  }

  return docs.map((doc, docIndex) => {
    const processedFields: DocumentField[] = []
    ;(doc.fields || []).forEach((field, index) => {
      const fieldResults = processField(field, 0, doc.id, null, index)
      processedFields.push(...fieldResults)
    })

    return {
      ...doc,
      hasFields: processedFields.length > 0,
      fields: processedFields
    }
  })
}

// Group documents by category
export const groupDocumentsByCategory = (docs: DocumentType[]): GroupedDocuments => {
  return docs.reduce<GroupedDocuments>((acc, doc) => {
    const key = doc.main_category_number || 'other'
    if (!acc[key]) {
      acc[key] = {
        mainCategory: doc.main_category || 'Other',
        mainCategoryNumber: doc.main_category_number || '',
        documents: []
      }
    }
    acc[key].documents.push(doc)
    return acc
  }, {})
}

// Filter and sort documents based on tab and other criteria
export const filterAndSortDocuments = (documents: DocumentType[], documentTab: string) => {
  if (!documents.length) return { filteredDocuments: [], groupedDocuments: {} }

  const categoryFilter = CATEGORY_MAPPING[documentTab as keyof typeof CATEGORY_MAPPING]
  const filtered = documents.filter(doc => doc.category === categoryFilter)

  const sorted = filtered.sort((a, b) => {
    const aCatNum = parseInt(a.main_category_number || '999', 10)
    const bCatNum = parseInt(b.main_category_number || '999', 10)
    if (aCatNum !== bCatNum) return aCatNum - bCatNum
    if (a.custom_order !== null && b.custom_order !== null) {
      return a.custom_order - b.custom_order
    }
    if (a.custom_order !== null) return -1
    if (b.custom_order !== null) return 1
    return (a.document_number || 0) - (b.document_number || 0)
  })

  const processed = processDocumentFields(sorted)
  const grouped = groupDocumentsByCategory(processed)

  return {
    filteredDocuments: processed,
    groupedDocuments: grouped
  }
}

// In utils.js - Fix visibility checking
export const hasVisibleColumns = (
    subdept: any,
    columnVisibility: Record<string, boolean>,
    getColumnKey: (subdeptId: number, clsIndex: number | null, subclsIndex?: number | null) => string
  ): boolean => {
    if (!subdept.hasClasses) {
      const subdeptKey = getColumnKey(subdept.id, null)
      return columnVisibility[subdeptKey] === true // Explicitly check for true
    }
  
    return subdept.classes?.some((cls: any, clsIndex: number) => {
      if (cls.subClasses?.length) {
        return cls.subClasses.some((_: any, subclsIndex: number) => {
          const subclsKey = getColumnKey(subdept.id, clsIndex, subclsIndex)
          return columnVisibility[subclsKey] === true // Explicitly check for true
        })
      } else {
        const clsKey = getColumnKey(subdept.id, clsIndex)
        return columnVisibility[clsKey] === true // Explicitly check for true
      }
    }) || false
  }

// Get the allocation status for a document or field
export const getAllocationStatus = (
  allocationId: string,
  subdeptId: number,
  classIndex: number | null,
  subclassIndex: number | null,
  columnType: 'ap' | 'dp' | 'understudy',
  documentAllocations: Record<string, any>,
  currentDepartment: any
): boolean => {
  const subdept = currentDepartment?.subdepartments?.find((sd: any) => sd.id === subdeptId)

  // Handle subdepartments without classes
  if (!subdept?.hasClasses && classIndex === null) {
    const directKey = [allocationId, subdeptId, 'direct'].join('_')
    return documentAllocations[directKey]?.[columnType] || false
  }

  // Handle specific allocation
  const keyParts = [allocationId, subdeptId]
  if (classIndex !== null) keyParts.push(String(classIndex))
  if (subclassIndex !== null) keyParts.push(String(subclassIndex))
  const allocationKey = keyParts.join('_')

  if (documentAllocations[allocationKey] !== undefined) {
    return documentAllocations[allocationKey][columnType] || false
  }

  // Handle subdepartment level checking for subdepartments with classes
  if (classIndex === null && subdept?.hasClasses) {
    return subdept.classes?.some((_: any, clsIdx: number) => {
      const classKey = [allocationId, subdeptId, clsIdx].join('_')
      return documentAllocations[classKey]?.[columnType] === true
    }) || false
  }

  return false
}

// Get column key for a subdepartment/class/subclass combination
export const getColumnKey = (subdeptId: number | string, clsIndex: number | string | null, subclsIndex: number | string | null = null): string => {
    const keyParts = [`subdept_${subdeptId}`]
    if (clsIndex !== null) keyParts.push(`cls_${clsIndex}`)
    if (subclsIndex !== null) keyParts.push(`subcls_${subclsIndex}`)
    return keyParts.join('_')
  }
// Check if understudy should be shown for a class
export const shouldShowUnderstudy = (subdept: Subdepartment, clsIndex: number | null): boolean => {
  if (!subdept.hasClasses || clsIndex === null) return false
  const cls = subdept.classes?.[clsIndex]
  return cls?.id === CLASS_D_ID
}

// Calculate column width based on expansion state and understudy visibility
export const getColumnWidth = (
  subdept: Subdepartment, 
  clsIndex: number | null, 
  subclsIndex: number | null, 
  expandedColumns: Set<string>, 
  getColumnKeyFn: (subdeptId: number, clsIndex: number | null, subclsIndex: number | null) => string,
  shouldShowUnderstudyFn: (subdept: Subdepartment, clsIndex: number | null) => boolean
): number => {
  const columnKey = getColumnKeyFn(subdept.id, clsIndex, subclsIndex)
  const isExpanded = expandedColumns.has(columnKey)
  const hasUnderstudy = shouldShowUnderstudyFn(subdept, clsIndex)

  if (isExpanded) {
    return hasUnderstudy ? 360 : 240 // 3 columns (AP, DP, US) for Class D, 2 columns (AP, DP) for others
  }
  return 120 // Just AP column when collapsed
}

// Toggle item in a Set state
export const toggleSetItem = <T,>(set: Set<T>, item: T): Set<T> => {
  const newSet = new Set(set)
  if (newSet.has(item)) {
    newSet.delete(item)
  } else {
    newSet.add(item)
  }
  return newSet
}

// Process document fields with caching
export const processDocumentFieldsWithCache = (docs: DocumentType[]) => {
  const cacheKey = `processed-fields-${docs.length}-${docs.map(d => d.id).join('-')}`
  const cached = getCachedData(cacheKey)
  if (cached) return cached

  const processed = processDocumentFields(docs)
  setCachedData(cacheKey, processed)
  return processed
}

// Group documents by category with caching
export const groupDocumentsByCategoryWithCache = (docs: DocumentType[]): GroupedDocuments => {
  const cacheKey = `grouped-docs-${docs.length}-${docs.map(d => d.main_category_number).join('-')}`
  const cached = getCachedData(cacheKey)
  if (cached) return cached

  const grouped = groupDocumentsByCategory(docs)
  setCachedData(cacheKey, grouped)
  return grouped
}

// Get client field allocation status
export const getClientFieldAllocationStatus = (
  fieldId: string,
  subdeptId: number,
  classIndex: number | null,
  subclassIndex: number | null,
  columnType: 'ap' | 'dp' | 'understudy',
  clientFieldAllocations: Record<string, any>,
  currentDepartment: any
): boolean => {
  const subdept = currentDepartment?.subdepartments?.find((sd: any) => sd.id === subdeptId)

  // Handle subdepartments without classes
  if (!subdept?.hasClasses && classIndex === null) {
    const directKey = [fieldId, subdeptId, 'direct'].join('_')
    return clientFieldAllocations[directKey]?.[columnType] || false
  }

  const keyParts = [fieldId, subdeptId]
  if (classIndex !== null) keyParts.push(String(classIndex))
  if (subclassIndex !== null) keyParts.push(String(subclassIndex))
  const allocationKey = keyParts.join('_')
  return clientFieldAllocations[allocationKey]?.[columnType] || false
}

// Get total colspan for a subdepartment
export const getTotalColSpan = (
  subdept: Subdepartment, 
  getColumnKeyFn: (subdeptId: number, clsIndex: number | null) => string,
  expandedColumns: Set<string>
): number => {
  if (!subdept.hasClasses) {
    const columnKey = getColumnKeyFn(subdept.id, null)
    const isExpanded = expandedColumns.has(columnKey)
    return isExpanded ? 3 : 1
  }

  return subdept.classes?.reduce((total, cls: SubdepartmentClass, clsIndex: number) => {
    const hasSubclasses = cls?.subclasses?.length || 0
    const columnKey = getColumnKeyFn(subdept.id, clsIndex)
    const isExpanded = expandedColumns.has(columnKey)
    return total + (isExpanded ? (hasSubclasses ? 3 : 2) : 1)
  }, 0) || 0
}

export const initializeColumnVisibility = (columns: ColumnVisibilityOption[]) => {
    const visibility: Record<string, boolean> = {}
    columns.forEach(col => {
      visibility[col.id] = col.visible // Use the visible property directly
    })
    return visibility
  }