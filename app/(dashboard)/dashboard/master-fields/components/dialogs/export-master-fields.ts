// @ts-nocheck
import { supabase } from "@/lib/supabase/client"
import type { MasterField, FieldSection } from "../types/database"

export async function exportMasterFieldsToFormStructure(entityType: 'company' | 'individual') {
  try {
    // Fetch sections and fields
    const { data: sectionsData, error: sectionsError } = await supabase
      .from('tm_field_sections')
      .select(`
        *,
        tm_job_fields (
          *
        )
      `)
      .eq('is_active', true)
      .order('order_index')

    if (sectionsError) throw sectionsError

    // Transform to your formFields structure
    const formSections: Record<string, any> = {}
    const platformCredentials: Record<string, any> = {}

    sectionsData?.forEach(section => {
      const sectionFields = section.tm_job_fields
        ?.sort((a: any, b: any) => a.order_index - b.order_index)
        ?.map((field: any) => ({
          name: field.field_key,
          label: field.label,
          type: field.type,
          placeholder: field.placeholder,
          showInTable: field.show_in_table,
          showInDialog: field.show_in_dialog,
          tableHeader: field.table_header,
          disabled: false, // or based on some condition
          className: field.class_name,
          colSpan: field.col_span,
          callback: field.callback,
          dataSource: field.data_source,
          dependsOn: field.depends_on,
          hasDependent: field.has_dependent,
          staticOptions: field.static_options,
          options: field.options
        })) || []

      if (section.section_key.includes('credential')) {
        // Handle platform credentials
        platformCredentials[section.section_key] = {
          title: section.title,
          fields: sectionFields
        }
      } else {
        // Handle regular form sections
        formSections[section.section_key] = {
          title: section.title,
          fields: sectionFields
        }
      }
    })

    return {
      platformCredentials,
      formSections
    }
  } catch (error) {
    console.error('Error exporting master fields:', error)
    throw error
  }
}