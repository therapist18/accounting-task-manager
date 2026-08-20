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
  use_letterhead?: boolean;
  classification?: TemplateClassification;
}

export interface TemplateClassification {
  is_general?: boolean;
  contract_duration?: string | null;
  position_id?: string | null;
  department_id?: string | null;
  company_id?: string | null;
  work_arrangement?: string | null;
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

export type ComparisonClause = {
  field?: string;
  operator: 'equals' | 'not_equals' | 'contains';
  value: string;
  master_field_id?: number;
};

export type ConditionalCondition = {
  tag: string;
  label: string;
  master_field_id?: number;
  comparison?: ComparisonClause;
  // Extra clauses AND-ed with `comparison` (e.g. Gender=Female AND MaritalStatus=Married -> "Mrs")
  additional_comparisons?: ComparisonClause[];
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

export type PlaceholderCalculation = {
  op: 'add' | 'subtract' | 'multiply' | 'divide' | 'sum';
  // add/subtract/multiply/divide: ordered sibling field names to combine -
  // other children of the same parent_name block, or other top-level
  // placeholders when this placeholder has no parent_name.
  operands?: string[];
  // sum only: the array block whose child field gets totalled across all its rows
  source_block?: string;
  source_field?: string;
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
  ordinal_format?: 'number' | 'word' | 'plain' | 'custom';
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
  // When set, this placeholder's value is auto-computed (same-row formula or
  // cross-row sum of a block's child field) and renders read-only instead of
  // an editable input - see PlaceholderInput.tsx and TemplateGenerationDialog's
  // applyCalculations.
  calculation?: PlaceholderCalculation;
  // Plain free-text description of where this value comes from - only
  // rendered by PlaceholderFormDialog when showSourceField is passed
  // (Employment Contracts' Clause Library opts in; other Placeholder
  // consumers don't get this field, since it has no meaning for a DTM
  // template placeholder outside EC's settings_key/offer_field concepts).
  source?: string;
  // Whether a user can override the value resolved for this placeholder
  // (e.g. Employment Contracts' Data & Values table shows an editable
  // Input when true, a read-only display when false, and only shows the
  // "Reset to default" override control when true - see ContractEditor.tsx)
  // vs always rendering exactly what its source resolved to. Only rendered
  // by PlaceholderFormDialog when showSourceField is passed, same gating as
  // `source` above - this has no meaning for a DTM template placeholder
  // outside EC's per-contract override concept (offer.placeholder_overrides).
  editable?: boolean;
  // Which of Consultancy Contracts' two companies-in-one-document this
  // placeholder belongs to - null/undefined means "auto-detect from the key
  // prefix" (consultant_* vs everything else, see
  // consultancy-contracts/utils/ccPlaceholderAdapter.ts's resolveCompanyRole).
  // Explicit here overrides that heuristic, for keys like {{director_name}}
  // that don't carry a consultant_/client_ prefix. Only rendered by
  // PlaceholderFormDialog when showCompanyRoleField is passed - meaningless
  // for any other Placeholder consumer (EC has one company, not two).
  company_role?: 'client' | 'consultant' | null;
  linked_job_question_id?: string;
  linked_requirement_id?: string;
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
  // Which Matrimonial Biodata section this placeholder belongs to (see
  // matrimonial-biodata/utils/biodataStructure.ts's BIODATA_SECTIONS) - only
  // meaningful for that module, same as company_role is EC/CC-only.
  section_key?: string;
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
