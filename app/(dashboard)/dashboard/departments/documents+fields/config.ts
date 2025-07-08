export const CATEGORY_MAPPING = {
  company: "company-docs",
  individual: "directors-docs"
} as const

// Class D ID for understudy column
export const CLASS_D_ID = 1750687058159

// Helper function to get table fields
export const getTableFields = (): any[] => {
  // Return default table fields structure
  return [
    {
      accessorKey: "name",
      header: "Name",
      cell: (info: any) => info.getValue(),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: (info: any) => info.getValue(),
    },
    // Add more fields as needed
  ]
}

// Helper function to group fields
export const getGroupedFields = (fields: any[] = []) => {
  const grouped: Record<string, any[]> = {}
  
  // Ensure fields is an array before calling forEach
  if (!Array.isArray(fields)) {
    console.warn('getGroupedFields expected an array but received:', fields)
    return { 
      formSections: {},
      other: [] 
    }
  }
  
  fields.forEach((field) => {
    if (field && typeof field === 'object') {
      const group = field.group || 'other'
      if (!grouped[group]) {
        grouped[group] = []
      }
      grouped[group].push(field)
    }
  })
  
  return {
    formSections: grouped,
    ...grouped
  }
}

// Export configuration
export default {
  CATEGORY_MAPPING,
  CLASS_D_ID,
  getTableFields,
  getGroupedFields,
}
