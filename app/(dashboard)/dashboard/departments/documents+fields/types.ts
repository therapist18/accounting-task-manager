// @ts-nocheck
export interface DocumentField {
  id: string;
  name: string;
  type: string;
  required?: boolean;
  order?: number;
  level: number;
  parentId: string | null;
  isArrayItem: boolean;
  hasChildren: boolean;
  fields?: DocumentField[];
  path?: string;
  index?: number;
  parentPath?: string | null;
  arrayConfig?: {
    maxItems?: number;
    fields?: any[];
  };
  mapping?: any;
}

export interface DocumentType {
  id: string;
  name: string;
  display_name: string;
  department: string;
  category: string;
  main_category: string;
  main_category_number: string;
  document_number: number;
  custom_order: number | null;
  fields: DocumentField[];
  last_extracted_details: any;
  requirements: any;
  validity_days: string;
  reminder_days: string;
  listed: boolean;
  subcategory: string;
  document_type: string;
  hasFields?: boolean;
}

export interface GroupedDocuments {
  [key: string]: {
    mainCategory: string;
    mainCategoryNumber: string;
    documents: DocumentType[];
  };
}

export interface SubdepartmentClass {
  name: string;
  description: string | null;
  requirements: any[];
  subclasses?: SubdepartmentClass[];
}

export interface Subdepartment {
  id: number;
  name: string;
  department_id: string;
  classes?: SubdepartmentClass[];
  hasClasses: boolean;
}

export interface Department {
  id: string;
  name: string;
  subdepartments?: Subdepartment[];
}

export interface ClientData {
  id: string;
  name: string;
  email: string;
  company?: string;
  status: string;
  created_at: string;
  company_name?: string;
  company_prefix?: string;
  company_type?: string;
  registration_number?: string;
  office_phone_number?: string;
  current_communication_email?: string;
  country?: string;
  city?: string;
  road_name?: string;
  website?: string;
  industry?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  national_id?: string;
  phone_number?: string;
  occupation?: string;
  kra_pin?: string;
  nssf_id?: string;
  nhif_id?: string;
  [key: string]: any;
}

export interface TableHeaderProps {
  subdepartments: Subdepartment[];
  getTotalColSpan: (subdept: Subdepartment) => number;
}

export interface DocumentRowProps {
  document: DocumentType;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  // Add other required props
}

export const CATEGORY_MAPPING = {
  company: "company-docs",
  individual: "directors-docs"
} as const;
