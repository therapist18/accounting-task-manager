// types/documents.ts
export interface Company {
  id: number;
  company_name: string;
  description?: string;
  registration_number?: string;
  date_established?: string;
}

export interface DocumentTemplate {
  id: string;
  document_type_id: string;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  placeholders: Array<{
    id: string;
    name: string;
    description?: string;
    sampleData?: string;
    required: boolean;
    type: 'text' | 'date' | 'number' | 'signature' | 'checkbox' | 'select';
    options?: string[];
  }>;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface Document {
  id: string;
  name: string;
  department: string;
  subcategory: string;
  document_type: "one-off" | "renewal";
  issue_date?: string;
  expiry_date?: string;
  validity_days?: string;
  has_template?: boolean;
  template?: DocumentTemplate;
}

export interface Upload {
  id: number;
  userid: string;
  kyc_document_id: string;
  file_path: string;
  issue_date: Date;
  expiry_date?: Date;
  extracted_details?: Record<string, any>;
  created_at: string;
}

export interface UploadFile {
  file: File;
  issueDate?: string;
  expiryDate?: string;
  documentType?: string;
  extracted_details?: Record<string, any>;
}

export type SortField =
  | "company"
  | "issueDate"
  | "expiryDate"
  | "daysLeft"
  | "status"
  | "#";

export type SortDirection = "asc" | "desc";

export interface DocumentPreview {
  id: string;
  url: string;
  uploadDate: Date;
  issueDate?: string;
  expiryDate?: string;
  documentType?: string;
  file_path?: string;
}
