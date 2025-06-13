import { supabase } from "./client"

export interface Stage {
  id: number
  name: string
  description: string | null
  order_num: number
  estimated_time: number | null
  created_at: string
  updated_at: string
}

export async function getStages() {
  const { data, error } = await supabase
    .from('tm_stages')
    .select('*')
    .order('order_num', { ascending: true })

  if (error) throw error
  return (data || []) as Stage[]
}
