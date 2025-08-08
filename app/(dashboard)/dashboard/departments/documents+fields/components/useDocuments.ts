// @ts-nocheck
import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { 
  DocumentType, 
  GroupedDocuments, 
  Department, 
  Subdepartment, 
  CATEGORY_MAPPING 
} from './components/types';

export const useDocuments = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [documentAllocations, setDocumentAllocations] = useState<Record<string, boolean>>({});
  const [clientFieldAllocations, setClientFieldAllocations] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedClientItems, setExpandedClientItems] = useState<Set<string>>(new Set());
  const [submittingIds, setSubmittingIds] = useState<Set<string>>(new Set());

  const processDocumentFields = useCallback((docs: DocumentType[]): DocumentType[] => {
    return docs.map((doc, docIndex) => {
      const processField = (
        field: any,
        level = 0,
        parentId: string | null = null,
        parentPath: string | null = null,
        index = 0,
        baseIndex = ""
      ) => {
        const currentIndex = baseIndex ? `${baseIndex}.${index + 1}` : `${docIndex + 1}.${index + 1}`;
        const subFields = field.arrayConfig?.fields || field.fields || [];
        const hasChildren = (field.type === 'array' || field.isArray) && subFields.length > 0;

        const currentField = {
          ...field,
          id: field.id || `${doc.id}-${field.name}-${currentIndex}`,
          level,
          parentId,
          hasChildren,
          isArrayItem: false,
          path: currentIndex,
          index: index + 1,
          parentPath,
          required: field.required || false,
          order: field.order || index
        };

        const result = [currentField];

        if (hasChildren) {
          subFields.forEach((subField: any, subIndex: number) => {
            const subFieldResults = processField(
              subField,
              level + 1,
              currentField.id,
              currentIndex,
              subIndex,
              `${currentIndex}`
            );
            result.push(...subFieldResults);
          });
        }

        return result;
      };

      const processedFields: Array<{
        id: string;
        name: string;
        type: string;
        level: number;
        parentId: string | null;
        hasChildren: boolean;
        isArrayItem: boolean;
        path: string;
        index: number;
        parentPath: string | null;
        required: boolean;
        order: number;
        [key: string]: any;
      }> = [];
      
      (doc.fields || []).forEach((field, index) => {
        const fieldResults = processField(field, 0, doc.id, null, index);
        processedFields.push(...fieldResults);
      });

      return {
        ...doc,
        hasFields: processedFields.length > 0,
        fields: processedFields
      };
    });
  }, []);

  const groupDocumentsByCategory = useCallback((docs: DocumentType[]): GroupedDocuments => {
    return docs.reduce<GroupedDocuments>((acc, doc) => {
      const key = doc.main_category_number || 'other';
      if (!acc[key]) {
        acc[key] = {
          mainCategory: doc.main_category || 'Other',
          mainCategoryNumber: doc.main_category_number || '',
          documents: []
        };
      }
      acc[key].documents.push(doc);
      return acc;
    }, {});
  }, []);

  // Memoize the fetchData function with an empty dependency array
  // to prevent it from being recreated on every render
  const fetchData = useCallback(async () => {
    console.log('Starting data fetch...');
    setLoading(true);
    setError(null);
    
    // Add an AbortController to handle cleanup
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    try {
      console.log('Starting data fetch...');
      setLoading(true);
      setError(null);
      
      // Check if the request was aborted
      if (controller.signal.aborted) {
        console.log('Request was aborted');
        return;
      }

      // Fetch all data in parallel with abort signal
      const [
        { data: departmentsData, error: deptsError },
        { data: documentsData, error: docsError },
        { data: requirementsData, error: reqsError }
      ] = await Promise.all([
        supabase
          .from('tm_departments')
          .select(`*, tm_subdepartments (*, classes)`)
          .order('order', { ascending: true }),
        supabase
          .from('acc_portal_kyc')
          .select('*')
          .order('main_category_number', { ascending: true, nullsLast: true })
          .order('custom_order', { ascending: true, nullsLast: true }),
        supabase
          .from('tm_class_requirements')
          .select('documents_and_fields, client_fields, class_id')
      ]);

      // Handle errors
      if (deptsError) throw new Error(`Departments: ${deptsError.message}`);
      if (docsError) throw new Error(`Documents: ${docsError.message}`);
      if (reqsError) throw new Error(`Requirements: ${reqsError.message}`);

      // Process departments
      const transformedDepartments = (departmentsData || []).map(dept => ({
        ...dept,
        subdepartments: (dept.tm_subdepartments || [])
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((subdept: any) => ({
            ...subdept,
            classes: Array.isArray(subdept.classes) ? subdept.classes : [],
            hasClasses: subdept.classes?.length > 0
          }))
      }));

      // Process documents
      const processedDocuments = (documentsData || []).map(doc => ({
        ...doc,
        fields: Array.isArray(doc.fields) ? doc.fields : [],
        display_name: doc.display_name || doc.name
      }));

      // Process requirements
      const documentSettings: Record<string, boolean> = {};
      const clientFieldSettings: Record<string, boolean> = {};

      (requirementsData || []).forEach(req => {
        // Process document fields
        if (Array.isArray(req.documents_and_fields)) {
          req.documents_and_fields.forEach((item: any) => {
            if (item?.id !== undefined && typeof item.id === 'string') {
              documentSettings[item.id] = item.display === true;
            }
          });
        }

        // Process client fields
        if (Array.isArray(req.client_fields)) {
          req.client_fields.forEach((item: any) => {
            if (item?.id !== undefined && typeof item.id === 'string') {
              clientFieldSettings[item.id] = item.display === true;
            }
          });
        }
      });

      console.log('Data fetched successfully:', {
        departments: transformedDepartments.length,
        documents: processedDocuments.length,
        documentSettings: Object.keys(documentSettings).length,
        clientFieldSettings: Object.keys(clientFieldSettings).length
      });

      // Update state in a single batch
      setDepartments(transformedDepartments);
      setDocuments(processedDocuments);
      setDocumentAllocations(documentSettings);
      setClientFieldAllocations(clientFieldSettings);

      // Auto-expand categories for better UX
      if (processedDocuments.length > 0) {
        const companyDocs = processedDocuments.filter(
          doc => doc.category === CATEGORY_MAPPING.company
        );
        const grouped = groupDocumentsByCategory(companyDocs);
        setExpandedCategories(new Set(Object.keys(grouped)));
      }

    } catch (error) {
      console.error('Error in fetchData:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load data. Please try again.';
      console.error('Error details:', { error, errorMessage });
      setError(errorMessage);
      throw error; // Re-throw to allow error handling in components
    } finally {
      console.log('Finished data fetch, setting loading to false');
      clearTimeout(timeoutId);
      setLoading(false);
    }
    
    // Cleanup function
    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [groupDocumentsByCategory, CATEGORY_MAPPING]);

  // Memoized values
  const { filteredDocuments, groupedDocuments } = useMemo(() => {
    if (!documents.length) return { filteredDocuments: [], groupedDocuments: {} };

    const sortedDocs = documents
      .filter(doc => doc.category === CATEGORY_MAPPING.company) // Default to company
      .sort((a, b) => {
        const aCatNum = parseInt(a.main_category_number || '999', 10);
        const bCatNum = parseInt(b.main_category_number || '999', 10);
        if (aCatNum !== bCatNum) return aCatNum - bCatNum;
        if (a.custom_order !== null && b.custom_order !== null) {
          return a.custom_order - b.custom_order;
        }
        if (a.custom_order !== null) return -1;
        if (b.custom_order !== null) return 1;
        return a.document_number - b.document_number;
      });

    const processedDocs = processDocumentFields(sortedDocs);
    const grouped = groupDocumentsByCategory(processedDocs);

    return { filteredDocuments: processedDocs, groupedDocuments: grouped };
  }, [documents, processDocumentFields, groupDocumentsByCategory]);

  // Toggle functions
  const toggleItemExpansion = useCallback((itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      newSet.has(itemId) ? newSet.delete(itemId) : newSet.add(itemId);
      return newSet;
    });
  }, []);

  const toggleCategoryExpansion = useCallback((categoryKey: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      newSet.has(categoryKey) ? newSet.delete(categoryKey) : newSet.add(categoryKey);
      return newSet;
    });
  }, []);

  const toggleClientItemExpansion = useCallback((clientId: string) => {
    setExpandedClientItems(prev => {
      const newSet = new Set(prev);
      newSet.has(clientId) ? newSet.delete(clientId) : newSet.add(clientId);
      return newSet;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allExpandableIds = new Set<string>();
    const allCategoryKeys = new Set<string>();
    const allClientIds = new Set<string>();

    Object.keys(groupedDocuments).forEach(key => {
      allCategoryKeys.add(key);
    });

    filteredDocuments.forEach(doc => {
      if (doc.hasFields) {
        allExpandableIds.add(doc.id);
        doc.fields.forEach(field => {
          if (field.hasChildren) {
            allExpandableIds.add(field.id);
          }
        });
      }
    });

    setExpandedCategories(allCategoryKeys);
    setExpandedItems(allExpandableIds);
    setExpandedClientItems(new Set());
  }, [filteredDocuments, groupedDocuments]);

  const collapseAll = useCallback(() => {
    setExpandedItems(new Set());
    setExpandedCategories(new Set());
    setExpandedClientItems(new Set());
  }, []);

  return {
    // State
    departments,
    documents: filteredDocuments,
    groupedDocuments,

    documentAllocations,
    clientFieldAllocations,
    loading,
    error,
    expandedItems,
    expandedCategories,
    expandedClientItems,
    submittingIds,
    
    // Actions
    fetchData,
    toggleItemExpansion,
    toggleCategoryExpansion,
    toggleClientItemExpansion,
    expandAll,
    collapseAll,
    setDocumentAllocations,
    setClientFieldAllocations,
    setSubmittingIds
  };
};
