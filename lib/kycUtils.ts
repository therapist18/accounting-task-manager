import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase/client';

export interface KYCField {
  id: string;
  name: string;
  type: string;
  isRequired?: boolean;
  description?: string;
  arrayConfig?: {
    fields: Array<{
      id: string;
      name: string;
      type: string;
      isRequired?: boolean;
    }>;
    maxItems?: number;
  };
}

export interface KYCDocument {
  id: string;
  name: string;
  display_name: string;
  fields: KYCField[];
  document_type: string;
  created_at: string;
  updated_at: string;
}

export const getKYCDocumentFields = async (kycId: string): Promise<KYCField[]> => {
  try {
    const { data, error } = await supabase
      .from('acc_portal_kyc')
      .select('fields')
      .eq('id', kycId)
      .single();

    if (error) throw error;
    
    // Transform the fields to match the expected format
    return transformKycFields(data?.fields || []);
  } catch (error) {
    console.error('Error fetching KYC document fields:', error);
    throw error;
  }
};

// Transform KYC fields to match the expected format for extraction
const transformKycFields = (fields: any[]): KYCField[] => {
  if (!Array.isArray(fields)) return [];

  return fields.map(field => ({
    id: field.id || `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: field.name || field.fieldName || '',
    type: field.type || 'text',
    isRequired: field.isRequired || field.required || false,
    description: field.description || '',
    ...(field.arrayConfig && {
      arrayConfig: {
        ...field.arrayConfig,
        fields: field.arrayConfig.fields?.map((subField: any) => ({
          id: subField.id || `subfield-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: subField.name || subField.fieldName || '',
          type: subField.type || 'text',
          isRequired: subField.isRequired || subField.required || false,
        })) || []
      }
    })
  }));
};
