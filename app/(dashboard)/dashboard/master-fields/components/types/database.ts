export interface Database {
    public: {
      Tables: {
        tm_job_fields: {
          Row: {
            id: string
            field_key: string
            label: string
            type: "text" | "date" | "number" | "select"
            is_required: boolean
            sources: JobFieldSource[]
            options: any
            created_at: string
            updated_at: string
          }
          Insert: {
            id?: string
            field_key: string
            label: string
            type: "text" | "date" | "number" | "select"
            is_required?: boolean
            sources?: JobFieldSource[]
            options?: any
            created_at?: string
            updated_at?: string
          }
          Update: {
            id?: string
            field_key?: string
            label?: string
            type?: "text" | "date" | "number" | "select"
            is_required?: boolean
            sources?: JobFieldSource[]
            options?: any
            updated_at?: string
          }
        }
      }
    }
  }
  
  export interface JobFieldSource {
    source_type: "profile" | "document" | "company"
    table: string
    path: string
    priority: number
  }
  
  export type JobField = Database["public"]["Tables"]["tm_job_fields"]["Row"]
  export type JobFieldInsert = Database["public"]["Tables"]["tm_job_fields"]["Insert"]
  export type JobFieldUpdate = Database["public"]["Tables"]["tm_job_fields"]["Update"]
  