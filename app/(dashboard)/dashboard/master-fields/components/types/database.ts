export interface Database {
    public: {
      Tables: {
        tm_job_fields: {
          Row: {
            id: string
            field_key: string
            label: string
            type: "text" | "date" | "number" | "select" | "image"
            is_required: boolean
            sources: JobFieldSource[]
            options: any
            category?: string | null
            created_at: string
            updated_at: string
          }
          Insert: {
            id?: string
            field_key: string
            label: string
            type: "text" | "date" | "number" | "select" | "image"
            is_required?: boolean
            sources?: JobFieldSource[]
            options?: any
            category?: string | null
            created_at?: string
            updated_at?: string
          }
          Update: {
            id?: string
            field_key?: string
            label?: string
            type?: "text" | "date" | "number" | "select" | "image"
            is_required?: boolean
            sources?: JobFieldSource[]
            options?: any
            category?: string | null
            updated_at?: string
          }
        }
      }
    }
  }
  
  export interface JobFieldSource {
    source_type: "individual" | "document" | "company"
    table: string
    path: string
    priority: number
    document_id?: string[] | null
    linking_variable?: "id" | "director_id" | null
  }
  
  export type JobField = Database["public"]["Tables"]["tm_job_fields"]["Row"]
  export type JobFieldInsert = Database["public"]["Tables"]["tm_job_fields"]["Insert"]
  export type JobFieldUpdate = Database["public"]["Tables"]["tm_job_fields"]["Update"]