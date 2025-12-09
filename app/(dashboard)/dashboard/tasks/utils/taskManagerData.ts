  // utils/taskManagerData.ts
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"

// Types
export interface Task {
  id: number;
  applicant_name: string;
  company_id: number;
  department_id: number;
  subdepartment_id: number;
  class_id?: string;
  subclass_id?: string;
  status: string;
  renewal_status?: string;
  nationality?: string;
  age?: number;
  individual_id: number;
  created_at: string;
  current_stage_id?: number;
  job_description?: string;
  job_level?: {
    level: number;
    class_id: string;
    subclass_id: string | null;
    department_id: number;
    subdepartment_id: number;
  };
  officer?: any;
  officer_name?: string;
  task_manager?: any;
  task_manager_name?: string;
  assigned_to_name?: string;
  dependant_member?: any[];
  dependnats_members?: any[];
  stages?: Record<string, any>;
  department?: any;
  subdepartment?: any;
  current_stage?: any;
}

export interface Department {
  id: number;
  name: string;
  stages: any[];
  tm_subdepartments?: any[];
}

export interface KycDocument {
  id: string;
  name: string;
  display_name?: string;
  fields: any[];
}

export interface Document {
  id: number;
  director_id: number;
  document_id: string;
  file_path: string;
  extracted_details?: any;
  indicator?: boolean;
  created_at: string;
}

// Recursive helper to transform KYC fields, handling nested arrays
const transformKycFields = (fields: any[]): any[] => {
  if (!Array.isArray(fields)) return []

  return fields.map((field: any) => {
    const isArray = field.type === 'array' || field.isArray === true

    const transformedField: any = {
      id: field.id || field.fieldName || '',
      fieldName: field.name || field.fieldName || '',
      description: field.description || '',
      isRequired: field.isRequired !== false,
      fieldType: isArray ? 'array' : (field.type || field.fieldType || 'text'),
      parentField: field.parentField,
      isArray: isArray,
    }

    if (isArray && field.arrayConfig && Array.isArray(field.arrayConfig.fields)) {
      transformedField.arrayConfig = {
        maxItems: field.arrayConfig.maxItems,
        fields: transformKycFields(field.arrayConfig.fields)
        }
      }

      return transformedField
    })
  }

  /**
   * Fetch all companies from the database
   */
  export const fetchCompanies = async (): Promise<Map<number, string>> => {
    try {
      const { data, error } = await supabase
        .from('acc_portal_company_duplicate')
        .select('id, company_name')

      if (error) throw error

      const companyMap = new Map(data?.map(c => [c.id, c.company_name]) || [])
      return companyMap
    } catch (error) {
      console.error('Error fetching companies:', error)
      toast({
        title: "Error",
        description: "Failed to load company data.",
        variant: "destructive"
      })
      return new Map()
    }
  }

  /**
   * Fetch tasks with related data
   */
export const fetchTasks = async (departmentId?: string, subdepartmentId?: string): Promise<Task[]> => {
  try {
    let query = supabase
      .from('tm_tasks')
      .select(`
        *,
        department:department_id (id, name),
        subdepartment:subdepartment_id (id, name),
        job_level,
        officer:officer_id (id, name, email),
        task_manager:task_manager_id (id, name, email)
      `)
      .order('created_at', { ascending: false });

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    if (subdepartmentId) {
      query = query.eq('subdepartment_id', subdepartmentId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Process the data to ensure consistent structure
    const processedTasks = (data || []).map(task => {
      const processedTask: Task = {
        ...task,
        // Ensure job_level has the correct structure
        job_level: task.job_level ? {
          level: task.job_level.level || 0,
          class_id: task.job_level.class_id || '',
          subclass_id: task.job_level.subclass_id || null,
          department_id: task.job_level.department_id || task.department_id,
          subdepartment_id: task.job_level.subdepartment_id || task.subdepartment_id
        } : undefined,
        // Ensure officer data is properly structured
        officer: task.officer || (task.officer_id ? {
          id: task.officer_id,
          name: task.officer_name || '',
          email: '',
          phone: ''
        } : undefined),
        // Ensure task_manager data is properly structured
        task_manager: task.task_manager || (task.task_manager_id ? {
          id: task.task_manager_id,
          name: task.task_manager_name || '',
          email: '',
          phone: ''
        } : undefined)
      };

      // Handle mock dependants for demonstration
      if (task.id === 2 && task.dependant_member?.length > 0) {
        processedTask.dependnats_members = [
          { id: 766, name: 'Pooja J Suthar', relationship: 'wife', nationality: 'Indian', age: 40 },
          { id: 765, name: 'Tisha J Suthar', relationship: 'daughter', nationality: 'Indian', age: 15 }
        ];
      }

      return processedTask;
    });

    return processedTasks;
  } catch (error) {
    console.error('Error fetching tasks:', error);
    toast({ 
      title: "Error", 
      description: "Failed to load tasks.", 
      variant: "destructive" 
    });
    return [];
  }
};
  /**
   * Fetch and process stages for a department
   */
  export const fetchStages = async (departmentId: string, departments: Department[]): Promise<any[]> => {
    try {
      const department = departments.find(d => d.id.toString() === departmentId.toString())
      if (!department) {
        console.warn(`Department with id ${departmentId} not found`)
        return []
      }

      const stages = department.stages || [];
      const uniqueStages = new Map();
      
      stages.forEach(stage => {
        if (!uniqueStages.has(stage.id)) {
          uniqueStages.set(stage.id, { 
            ...stage, 
            departmentId: department.id, 
            departmentName: department.name 
          })
        }
      })
      
      const allStages = Array.from(uniqueStages.values())
        .sort((a, b) => (a.order_num || 0) - (b.order_num || 0))
      
      return allStages
    } catch (error) {
      console.error('Error fetching stages:', error)
      toast({ 
        title: "Error", 
        description: "Failed to load stages.", 
        variant: "destructive" 
      })
      return []
    }
  }

  /**
   * Fetch all documents from the database
   */
  export const fetchAllDocuments = async (): Promise<Document[]> => {
    try {
      const { data, error } = await supabase
        .from('acc_portal_directors_documents')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      
      return data || []
    } catch (error) {
      console.error('Error fetching documents:', error)
      toast({
        title: "Error",
        description: "Failed to load documents data.",
        variant: "destructive"
      })
      return []
    }
  }

  /**
   * Fetch all KYC fields for all document types
   */
  export const fetchAllKycFields = async (): Promise<{
    fieldsMap: Record<string, any[]>;
    kycDocsMap: Map<string, KycDocument>;
  }> => {
    try {
      console.log('Fetching all KYC fields...')
      const { data, error } = await supabase
        .from('acc_portal_kyc')
        .select('id, fields, name, display_name')

      if (error) throw error

      const fieldsMap: Record<string, any[]> = {}
      const kycDocsMap = new Map<string, KycDocument>()

      // Transform and store fields by kycId and cache KYC documents
      data?.forEach(doc => {
        if (doc.id && doc.fields) {
          fieldsMap[doc.id] = transformKycFields(doc.fields)
          kycDocsMap.set(doc.id, {
            id: doc.id,
            name: doc.name,
            display_name: doc.display_name,
            fields: transformKycFields(doc.fields)
          })
        }
      })

      console.log(`Fetched KYC fields for ${Object.keys(fieldsMap).length} document types`)
      
      return { fieldsMap, kycDocsMap }
    } catch (error) {
      console.error('Error fetching KYC fields:', error)
      toast({
        title: 'Error',
        description: 'Failed to load KYC fields',
        variant: 'destructive',
      })
      return { fieldsMap: {}, kycDocsMap: new Map() }
    }
  }

  /**
   * Fetch single KYC document by kycId
   */
  export const fetchKycDocument = async (kycId: string): Promise<KycDocument | null> => {
    try {
      const { data, error } = await supabase
        .from('acc_portal_kyc')
        .select('id, fields, name, display_name')
        .eq('id', kycId)
        .single()

      if (error) throw error

      return {
        id: data.id,
        name: data.name,
        display_name: data.display_name,
        fields: transformKycFields(data.fields || [])
      }
    } catch (error) {
      console.error('Error fetching KYC document:', error)
      return null
    }
  }

  /**
   * Helper function to check if document is older than task creation
   */
  export const isDocumentOlderThanTask = (documentDate: string, taskDate: string): boolean => {
    try {
      const docDate = new Date(documentDate)
      const tskDate = new Date(taskDate)
      return docDate < tskDate
    } catch (error) {
      console.error('Error comparing dates:', error)
      return false
    }
  }

  /**
   * Format date to dd/MM/yyyy format
   */
  export const formatDateValue = (dateString: string | Date | null | undefined): string => {
    if (!dateString) return 'N/A'
    
    try {
      let date: Date

      if (typeof dateString === 'string') {
        if (dateString.includes('/')) {
          return dateString
        }
        date = new Date(dateString)
      } else {
        date = dateString
      }

      const day = String(date.getDate()).padStart(2, '0')
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const year = date.getFullYear()

      return `${day}/${month}/${year}`
    } catch (e) {
      console.error('Error formatting date:', dateString, e)
      return 'Invalid Date'
    }
  }

  /**
   * Get document for task and stage
   */
  export const getDocumentForTaskStage = (
    task: Task, 
    stage: any, 
    documents: Document[] = []
  ): Document | null => {
    if (!task.individual_id || !stage.documents?.[0]?.kycId) return null

    const relevantDocs = documents.filter(doc =>
      doc.director_id === task.individual_id &&
      doc.document_id === stage.documents[0].kycId
    )

    if (relevantDocs.length === 0) return null

    return relevantDocs[0] // Already sorted by created_at desc
  }