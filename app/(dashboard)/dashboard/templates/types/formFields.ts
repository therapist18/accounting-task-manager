// types/formFields.ts
export type FormFieldType = 
  | 'text' 
  | 'email' 
  | 'password' 
  | 'select' 
  | 'date' 
  | 'dropdown'; // New type for our custom dropdown

export interface FormFieldBase {
  name: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  required?: boolean;
  showInTable?: boolean;
  tableHeader?: string;
}

export interface SelectFormField extends FormFieldBase {
  type: 'select';
  options: string[];
}

export interface DropdownFormField extends FormFieldBase {
  type: 'dropdown';
  categoryName: string; // Reference to the dropdown category name
}

export type FormField = FormFieldBase | SelectFormField | DropdownFormField;