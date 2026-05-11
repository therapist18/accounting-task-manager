import { EntityType, type DirectorType } from "@/lib/constants/entity-types";

export interface DocumentTemplate {
  id: string;
  document_id: string;
  name: string;
  file_name?: string;
  file_type?: string;
  file_size?: number;
  file_path?: string;
  content?: string;
  placeholders?: Placeholder[];
  created_at?: string;
  updated_at?: string;
  isDirty?: boolean;
  entity_types?: EntityType[];
  banks_associated?: Array<{ bank_id: string; bank_name: string }>;
  job_level?: Array<{
    level: number;
    department_id?: number | null;
    subdepartment_id?: number | null;
    class_id?: number | null;
    subclass_id?: number | null;
  }>;
}

export interface JobField {
  id: number;
  field_key: string;
  label: string;
  sources?: Array<{
    path: string;
    table: string;
    priority: number;
    source_type?: string;
  }>;
}

export interface JobQuestion {
  id: string;
  label: string;
  type: string;
  sub_questions?: Array<{
    id: string;
    type: string;
    label: string;
    required?: boolean;
  }>;
}

export interface Requirement {
  id: string;
  label: string;
  document_ids?: string[];
}

export type ConditionalCondition = {
  tag: string;
  label: string;
  master_field_id?: number;
  comparison?: {
    field?: string;
    operator: 'equals' | 'not_equals' | 'contains';
    value: string;
  };
};

export type BooleanCondition = {
  tag: string;
  label: string;
  master_field_id?: number;
  linked_job_question_id?: string;
  comparison?: {
    field?: string;
    operator: 'equals' | 'not_equals' | 'contains';
    value: string;
  };
};

export type IfStatement = {
  condition: {
    field: string;
    operator: 'equals' | 'not_equals' | 'contains';
    value: string;
  };
  then_value: string;
  else_value?: string;
};

export interface BaseMediaConfig {
  source_table?: string;
  linking_variable?: "id" | "individual_id" | "director_id" | "document_id" | "company_id" | null;
  entity_types?: EntityType[];
  computed_function?: string;
  execution_mode?: 'all' | 'latest';
  document_type_ids?: string[];
}

export interface DocumentChecklistConfig extends BaseMediaConfig {
  checklist_data_sources?: Array<{
    table: 'acc_portal_kyc_uploads' | 'acc_portal_directors_documents';
    linking_variable: string;
    id: string;
    entity_types: EntityType[];
    computed_function?: string;
    linked_document_ids?: string[];
  }>;
  checklist_display_format?: 'bullets' | 'checkboxes' | 'table';
  checklist_success_label?: string;
  checklist_not_found_label?: string;
}

export interface ImageConfig extends BaseMediaConfig {
  image_width?: string;
  image_height?: string;
  is_ai_generated?: boolean;
  ai_prompt?: string;
  linked_master_field_id?: string;
}

export type Placeholder = {
  id: string;
  name: string;
  description?: string;
  display_value?: string;
  type: 'text' | 'number' | 'date' | 'select' | 'array' | 'conditional' | 'if' | 'image' | 'boolean' | 'ordinal' | 'document_checklist' | 'group';
  array_direction?: 'horizontal' | 'vertical';
  boolean_conditions?: BooleanCondition[];
  boolean_type?: 'single' | 'multiple';
  if_statement?: IfStatement;
  required: boolean;
  options?: string[];
  entity_type: EntityType[];
  parent_name?: string;
  is_block_start?: boolean;
  director_type?: DirectorType;
  dependant_relationship?: string[];
  conditions?: ConditionalCondition[];
  ordinal_format?: 'number' | 'word' | 'custom';
  custom_ordinal_format?: string;
  source_logic?: 'all' | 'priority';
  linked_document_ids?: string[];
  format?: string;
  document_checklist_config?: DocumentChecklistConfig;
  image_config?: ImageConfig;
  media_config?: BaseMediaConfig;
  master_field_ids?: number[];
  linked_job_question_ids?: string[];
  linked_requirement_ids?: string[];
  default_value?: string;
  linked_job_question_id?: string;
  linked_requirement_id?: string;
  linked_job_question_option?: string;
  group_parent_id?: string;
  computed_function?: string;
  execution_mode?: 'all' | 'latest';
  source_table?: string;
  linking_variable?: string | null;
  linked_master_field_id?: string;
  is_ai_generated?: boolean;
  ai_prompt?: string;
  checklist_data_sources?: Array<{
    table: 'acc_portal_kyc_uploads' | 'acc_portal_directors_documents';
    linking_variable: string;
    id: string;
    entity_types: EntityType[];
    computed_function?: string;
    linked_document_ids?: string[];
  }>;
  checklist_display_format?: 'bullets' | 'checkboxes' | 'table';
  checklist_success_label?: string;
  checklist_not_found_label?: string;
  image_width?: string;
  image_height?: string;
  is_digit_split?: boolean;
  digit_count?: number;
  // When a boolean/text placeholder represents one option of a linked job question
  // (e.g. {usd} → question "Which currencies?" option "USD")
  linked_job_question_option?: string;
  // Hide this placeholder from the UI (used for backend-resolved placeholders like currency options)
  ui_hidden?: boolean;
  // ID of the parent group placeholder (for grouped/hidden placeholders)
  group_parent_id?: string;
  // For group placeholders: the child placeholder IDs that this group represents
  group_children?: string[];
};

export interface DocumentTemplateManagerProps {
  document: { id: string; name: string; display_name?: string; };
  initialTemplates?: DocumentTemplate[];
  isOpen: boolean;
  onClose: () => void;
  onTemplateUpdate: () => void;
  jobLevel?: {
    level: number;
    department_id?: number | null;
    subdepartment_id?: number | null;
    class_id?: number | null;
    subclass_id?: number | null;
  } | null;
  className?: string;
  selectedBank?: { bank_id: string; bank_name: string } | null;
}

export const PLACEHOLDER_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
  { value: 'ordinal', label: 'Ordinal (1st, 2nd, 3rd...)' },
  { value: 'select', label: 'Dropdown' },
  { value: 'array', label: 'Array/List' },
  { value: 'conditional', label: 'Conditional' },
  { value: 'if', label: 'If Statement' },
  { value: 'boolean', label: 'Boolean/Checkbox' },
  { value: 'image', label: 'Image' },
  { value: 'document_checklist', label: 'Document Checklist' },
  { value: 'group', label: 'Group (UI Only)' },
];
