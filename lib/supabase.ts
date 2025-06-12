import { createClient } from "@supabase/supabase-js"

// Create a single supabase client for the entire app
const createSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables")
  }

  return createClient(supabaseUrl, supabaseKey)
}

// Server-side client
export const createServerSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase environment variables for server client")
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

// Client-side singleton
let clientSupabase: ReturnType<typeof createClient> | null = null

export const getClientSupabaseInstance = () => {
  if (!clientSupabase) {
    clientSupabase = createSupabaseClient()
  }
  return clientSupabase
}
