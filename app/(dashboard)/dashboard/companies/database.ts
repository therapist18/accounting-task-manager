import { supabase } from "@/lib/supabase/client"

export type Company = {
  id: string | number;
  company_name: string;
  registration_number?: string;
  kra_pin?: string;
  kra_email_address?: string;
  contact_details?: {
    email?: string;
    [key: string]: any;
  };
  default_display?: boolean;
  order?: number;
  acc_client_effective_from?: string | null;
  acc_client_effective_to?: string | null;
  imm_client_effective_from?: string | null;
  imm_client_effective_to?: string | null;
  audit_client_effective_from?: string | null;
  audit_client_effective_to?: string | null;
  sheria_client_effective_from?: string | null;
  sheria_client_effective_to?: string | null;
  cease_details?: any;
  is_own_company?: boolean;
}

export async function fetchCompanies(): Promise<Company[]> {
  try {
    const { data, error } = await supabase
      .from('acc_portal_company_duplicate')
      .select(`
        id,
        company_name,
        registration_number,
        kra_pin,
        kra_email_address,
        contact_details,
        acc_client_effective_from,
        acc_client_effective_to,
        imm_client_effective_from,
        imm_client_effective_to,
        audit_client_effective_from,
        audit_client_effective_to,
        sheria_client_effective_from,
        sheria_client_effective_to,
        cease_details
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
      kra_pin: company.kra_pin,
      kra_email_address: company.kra_email_address,
      contact_details: company.contact_details,
      default_display: false, // Default value
      order: 0, // Default value
      // Category fields
      acc_client_effective_from: company.acc_client_effective_from,
      acc_client_effective_to: company.acc_client_effective_to,
      imm_client_effective_from: company.imm_client_effective_from,
      imm_client_effective_to: company.imm_client_effective_to,
      audit_client_effective_from: company.audit_client_effective_from,
      audit_client_effective_to: company.audit_client_effective_to,
      sheria_client_effective_from: company.sheria_client_effective_from,
      sheria_client_effective_to: company.sheria_client_effective_to,
      cease_details: company.cease_details
    }))

    return companies
  } catch (error) {
    console.error('Failed to fetch companies:', error)
    return []
  }
}

// The single companies row flagged is_own_company - Booksmart Consultancy
// Limited itself, i.e. "Party A" in a Consultancy Contract (as opposed to
// the client selected from the dropdown, "Party B"). A partial unique index
// on is_own_company guarantees at most one row can ever be flagged, so
// .single() here is safe - see 20260818000000_cc_party_a_own_company.sql.
export async function fetchOwnCompany(): Promise<Company | null> {
  try {
    const { data, error } = await supabase
      .from('acc_portal_company_duplicate')
      .select(`
        id,
        company_name,
        registration_number,
        kra_pin,
        kra_email_address,
        contact_details,
        is_own_company
      `)
      .eq('is_own_company', true)
      .maybeSingle()

    if (error) {
      console.error('Error fetching own company:', error)
      throw error
    }

    if (!data) return null

    const company: Company = {
      id: data.id,
      company_name: data.company_name || 'Unnamed Company',
      registration_number: data.registration_number,
      kra_pin: data.kra_pin,
      kra_email_address: data.kra_email_address,
      contact_details: data.contact_details,
      is_own_company: data.is_own_company,
    }

    return company
  } catch (error) {
    console.error('Failed to fetch own company:', error)
    return null
  }
}

export async function fetchCompanyById(id: string | number): Promise<Company | null> {
  try {
    const { data, error } = await supabase
      .from('acc_portal_company_duplicate')
      .select(`
        id,
        company_name,
        registration_number,
        kra_email_address,
        contact_details
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
      kra_email_address: data.kra_email_address,
      contact_details: data.contact_details,
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
        registration_number,
        kra_email_address,
        contact_details
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
      kra_email_address: company.kra_email_address,
      contact_details: company.contact_details,
      default_display: false, // Default value
      order: 0 // Default value
    }))

    return companies
  } catch (error) {
    console.error('Failed to search companies:', error)
    return []
  }
}
