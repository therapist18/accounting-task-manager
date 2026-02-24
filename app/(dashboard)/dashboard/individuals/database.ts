import { supabase } from "@/lib/supabase/client"

export type Individual = {
  id: string | number;
  full_name: string;
  employment_data?: {
    associations?: Array<{
      company_id?: string | number;
      individual_type?: string;
      is_current?: boolean;
    }>;
  };
  default_display?: boolean;
  order?: number;
}

export async function fetchIndividuals(): Promise<Individual[]> {
  try {
    const { data, error } = await supabase
      .from('registry_individuals')
      .select(`
        id,
        full_name,
        employment_data
            `)
      .order('full_name', { ascending: true })

    if (error) {
      console.error('Error fetching individuals:', error)
      throw error
    }

    // Transform data to match Individual type
    const individuals: Individual[] = (data || []).map((individual: any) => ({
      id: individual.id,
      full_name: individual.full_name || 'Unnamed Individual',
      employment_data: individual.employment_data || {},
      default_display: false, // Default value
      order: 0 // Default value
    }))

    return individuals
  } catch (error) {
    console.error('Failed to fetch individuals:', error)
    return []
  }
}

export async function fetchIndividualById(id: string | number): Promise<Individual | null> {
  try {
    const { data, error } = await supabase
      .from('registry_individuals')
      .select(`
        id,
        full_name,
        employment_data
            `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching individual:', error)
      throw error
    }

    if (!data) return null

    // Transform data to match Individual type
    const individual: Individual = {
      id: data.id,
      full_name: data.full_name || 'Unnamed Individual',
      employment_data: data.employment_data || {},
      default_display: false, // Default value
      order: 0 // Default value
    }

    return individual
  } catch (error) {
    console.error('Failed to fetch individual:', error)
    return null
  }
}

export async function searchIndividuals(query: string): Promise<Individual[]> {
  try {
    const { data, error } = await supabase
      .from('registry_individuals')
      .select(`
        id,
        full_name,
        employment_data
            `)
      .or(`full_name.ilike.%${query}%`)
      .order('full_name', { ascending: true })

    if (error) {
      console.error('Error searching individuals:', error)
      throw error
    }

    // Transform data to match Individual type
    const individuals: Individual[] = (data || []).map((individual: any) => ({
      id: individual.id,
      full_name: individual.full_name || 'Unnamed Individual',
      employment_data: individual.employment_data || {},
      default_display: false, // Default value
      order: 0 // Default value
    }))

    return individuals
  } catch (error) {
    console.error('Failed to search individuals:', error)
    return []
  }
}
