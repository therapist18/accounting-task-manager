import { supabase } from "@/lib/supabase/client"

export type Company = {
  id: string | number;
  company_name: string;
  registration_number?: string;
  default_display?: boolean;
  order?: number;
}

export async function fetchCompanies(): Promise<Company[]> {
  try {
    const { data, error } = await supabase
      .from('acc_portal_company_duplicate')
      .select(`
        id,
        company_name,
        registration_number
      `)
      .order('company_name', { ascending: true })

    if (error) {
      console.error('Error fetching companies:', error)
      throw error
    }

    // Transform data to match Company type
    const companies: Company[] = (data || []).map((company: any) => ({
      id: company.id,
      company_name: company.company_name || 'Unnamed Company',
      registration_number: company.registration_number,
      default_display: false, // Default value
      order: 0 // Default value
    }))

    return companies
  } catch (error) {
    console.error('Failed to fetch companies:', error)
    return []
  }
}

export async function fetchCompanyById(id: string | number): Promise<Company | null> {
  try {
    const { data, error } = await supabase
      .from('acc_portal_company_duplicate')
      .select(`
        id,
        company_name,
        registration_number
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching company:', error)
      throw error
    }

    if (!data) return null

    // Transform data to match Company type
    const company: Company = {
      id: data.id,
      company_name: data.company_name || 'Unnamed Company',
      registration_number: data.registration_number,
          default_display: false, // Default value
      order: 0 // Default value
    }

    return company
  } catch (error) {
    console.error('Failed to fetch company:', error)
    return null
  }
}

export async function searchCompanies(query: string): Promise<Company[]> {
  try {
    const { data, error } = await supabase
      .from('acc_portal_company_duplicate')
      .select(`
        id,
        company_name,
        registration_number
      `)
      .or(`company_name.ilike.%${query}%,registration_number.ilike.%${query}%`)
      .order('company_name', { ascending: true })

    if (error) {
      console.error('Error searching companies:', error)
      throw error
    }

    // Transform data to match Company type
    const companies: Company[] = (data || []).map((company: any) => ({
      id: company.id,
      company_name: company.company_name || 'Unnamed Company',
      registration_number: company.registration_number,
      default_display: false, // Default value
      order: 0 // Default value
    }))

    return companies
  } catch (error) {
    console.error('Failed to search companies:', error)
    return []
  }
}
