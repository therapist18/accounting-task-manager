// services/kycDocuments.ts
import { supabase } from '@/lib/supabase/client'
import type { StageDocument, DocumentExtraction } from './stagesdb'

export interface KYCDocumentData {
  name: string
  department: string
  category: string
  document_type: string
  fields: DocumentExtraction[]
  display_name?: string
  doc_type?: 'form' | 'normal_doc'
  metadata?: Record<string, any>
}

export async function createKYCDocument(documentData: KYCDocumentData): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('acc_portal_kyc')
      .insert({
        name: documentData.name,
        department: documentData.department,
        category: 'application-docs',
        document_type: 'one_off',
        fields: documentData.fields,
        display_name: documentData.display_name || documentData.name,
        doc_type: documentData.doc_type || 'normal_doc',
        listed: true,
        validity_days: '0',
        reminder_days: 'NULL',
        created_at: new Date().toISOString(),
        metadata: {
          ...(documentData.metadata || {}),
          doc_type: documentData.doc_type || 'normal_doc'
        }
      })
      .select('id')
      .single()

    if (error) throw error
    return data.id
  } catch (error) {
    console.error('Error creating KYC document:', error)
    throw new Error('Failed to create KYC document')
  }
}

export async function updateKYCDocument(kycId: string, documentData: Partial<KYCDocumentData>): Promise<void> {
  try {
    const { error } = await supabase
      .from('acc_portal_kyc')
      .update({
        ...documentData,
        updated_at: new Date().toISOString()
      })
      .eq('id', kycId)

    if (error) throw error
  } catch (error) {
    console.error('Error updating KYC document:', error)
    throw new Error('Failed to update KYC document')
  }
}

export async function deleteKYCDocument(kycId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('acc_portal_kyc')
      .delete()
      .eq('id', kycId)

    if (error) throw error
  } catch (error) {
    console.error('Error deleting KYC document:', error)
    throw new Error('Failed to delete KYC document')
  }
}

export async function getKYCDocument(kycId: string) {
  try {
    const { data, error } = await supabase
      .from('acc_portal_kyc')
      .select('*')
      .eq('id', kycId)
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error fetching KYC document:', error)
    throw new Error('Failed to fetch KYC document')
  }
}