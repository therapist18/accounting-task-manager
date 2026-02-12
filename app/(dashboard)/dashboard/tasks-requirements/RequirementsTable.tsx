// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Briefcase, FileText, Loader2, Search, UploadCloud, Eye, Zap, FileType, Wand2, Download, FileUp, Trash2, AlertCircle, Edit3 } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import RequirementsTableCombined from "./RequirementsTableCombined"
import { UploadModal } from "@/app/generic-components/UploadModal"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { AutomationMappingDialog } from "../tasks/components/AutomationMappingDialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import * as XLSX from 'xlsx'
import { ENTITY_TYPES, type EntityType } from "@/lib/constants/entity-types"

const LetterTemplateDialog = ({ open, onOpenChange, letterData, individualNames }) => {
  if (!letterData) return null;

  const { task, document, columnType, applicantId } = letterData;

  let applicantName = "the applicant";
  if (columnType === 'principal') applicantName = individualNames[task.principal_member || task.individual_id] || 'Principal';
  else if (columnType === 'dependant') applicantName = individualNames[applicantId] || `Dependant ${applicantId}`;
  else if (columnType === 'understudy') applicantName = individualNames[task.understudy_member] || 'Understudy';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full">
        <DialogHeader>
          <DialogTitle>Generate: {document?.display_name}</DialogTitle>
          <DialogDescription>
            Generating letter for {applicantName}. Please fill in the required details below.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <h3 className="font-semibold">Template Details</h3>
          <div className="p-4 border rounded-md bg-gray-50 text-sm">
            <p className="text-gray-600">Your dynamic letter template for '{document?.name}' would be rendered here.</p>
            <p className="mt-2 text-gray-600">It would include input fields for any variables needed to generate the final document.</p>
          </div>
          <div className="flex justify-end">
            <Button>Generate & Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface DocumentStatus {
  type: 'upload' | 'view' | 'na' | 'missing'
  documents: any[]
  count: number
}

interface RequirementsTableProps {
  tasks: any[]
  loading: boolean
  error: string | null
  activeTab?: string
  handleDeleteDocument?: (document: any) => Promise<void>
  onTaskAction?: (action: 'edit' | 'delete', task: any) => void; // Add this
}

const REFERENCE_SUBDEPARTMENT_IDS = [10, 5];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PERMIT_CLASS_OPTIONS = [
  { value: 'class_a', label: 'Class A' },
  { value: 'class_b', label: 'Class B' },
  { value: 'class_c', label: 'Class C' },
  { value: 'class_d', label: 'Class D' },
  { value: 'class_e', label: 'Class E' },
];

export function RequirementsTable({
  tasks,
  loading,
  error,
  activeTab = "enquiry",
  handleDeleteDocument,
  onTaskAction,
}: RequirementsTableProps) {
  const [documents, setDocuments] = useState<any[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [taskClassRequirements, setTaskClassRequirements] = useState<Record<string, any>>({})
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(new Set())
  const [selectedApplicant, setSelectedApplicant] = useState<string | null>(null);
  const [individualNames, setIndividualNames] = useState<Record<number, string>>({})
  const [allIndividualDocuments, setAllIndividualDocuments] = useState<Record<string, any[]>>({});
  const [allCompanyDocuments, setAllCompanyDocuments] = useState<Record<string, any[]>>({});
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedDocForUpload, setSelectedDocForUpload] = useState<any>(null)
  const [documentPreviewOpen, setDocumentPreviewOpen] = useState(false);
  const [selectedDocumentForPreview, setSelectedDocumentForPreview] = useState<any>(null);
  const [companyData, setCompanyData] = useState<Record<number, any>>({});
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");
  const [previewDocument, setPreviewDocument] = useState<{
    documents: Array<{
      fileUrl: string;
      extractedData: any;
      fields: any[];
      name?: string;
      uploadedAt?: string;
    }>;
    currentIndex: number;
  } | null>(null);

  const [isLetterDialogOpen, setIsLetterDialogOpen] = useState(false);
  const [selectedLetterData, setSelectedLetterData] = useState(null);
  const [isAutomationDialogOpen, setIsAutomationDialogOpen] = useState(false);
  const [selectedAutomationData, setSelectedAutomationData] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<any>(null);

  const parseSelectionId = useCallback((selectionId: string) => {
    const cleanId = selectionId.replace(/_\d+_\d+$/, '');
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
    if (isUUID) return { type: 'document', documentId: cleanId, fieldId: null };
    if (cleanId.includes('-')) {
      const parts = cleanId.split('-');
      return { type: 'field', documentId: parts[0], fieldId: parts.slice(1).join('-') };
    }
    return { type: 'unknown', documentId: cleanId, fieldId: null };
  }, []);

  const filteredTasks = useMemo(() => tasks.filter(task => activeTab === "completed" ? (task.status === "completed" || task.status === "approved") : (task.status !== "completed" && task.status !== "approved")), [tasks, activeTab]);

  const companyIds = useMemo(() =>
    [...new Set(filteredTasks.map(t => t.company_id).filter(Boolean))],
    [filteredTasks]
  );

  const individualIds = useMemo(() => {
    const ids = new Set<number>();
    filteredTasks.forEach(task => {
      if (Array.isArray(task.participants_details)) {
        task.participants_details.forEach(participant => {
          if (participant.id && participant.type === 'individual') {
            ids.add(participant.id);
          }
        });
      }
      if (Array.isArray(task.references)) {
        task.references.forEach(ref => ref.id && ids.add(ref.id));
      }
    });
    return Array.from(ids);
  }, [filteredTasks]);

  const getRequiredKycIds = useCallback(() => {
    const ids = new Set<string>();
    Object.values(taskClassRequirements).forEach(classReq => {
      if (classReq?.requirements) {
        classReq.requirements.forEach(req => {
          if (req.document_id) ids.add(req.document_id);
          if (req.document_ids) req.document_ids.forEach(id => ids.add(id));
        });
      }
    });
    return Array.from(ids);
  }, [taskClassRequirements]);

  // OPTIMIZED: Batch fetch individual documents
  const fetchAllIndividualData = useCallback(async (tasksToFetch: any[], requiredKycIds: string[]) => {
    const startTime = performance.now();

    const uniqueIds = new Set<number>();
    const individualTypeMap = new Map<number, string>();

    tasksToFetch.forEach(task => {
      // Use individual_id for Principal/Applicant to match director_id in DB
      const pId = task.individual_id || task.applicant_details?.id;
      if (pId) {
        uniqueIds.add(pId);
        individualTypeMap.set(pId, 'principal');
      }

      if (Array.isArray(task.participants_details)) {
        task.participants_details.forEach(p => {
          if (p.id) {
            uniqueIds.add(p.id);
            individualTypeMap.set(p.id, p.role || 'individual');
          }
        });
      }

      if (task.understudy) {
        uniqueIds.add(task.understudy);
        if (!individualTypeMap.has(task.understudy)) individualTypeMap.set(task.understudy, 'understudy');
      }
    });

    const validIds = Array.from(uniqueIds).filter(Boolean);
    if (validIds.length === 0 || requiredKycIds.length === 0) {
      return;
    }

    try {
      // SINGLE QUERY for all individuals and all document types
      const { data: documentsRes, error } = await supabase
        .from('acc_portal_directors_documents')
        .select('*, acc_portal_kyc (id, name, display_name)')
        .in('director_id', validIds)
        .in('document_id', requiredKycIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const endTime = performance.now();

      const documentsByDirector = documentsRes?.reduce((acc, doc) => {
        if (!acc[doc.director_id]) acc[doc.director_id] = [];
        acc[doc.director_id].push(doc);
        return acc;
      }, {});

      setAllIndividualDocuments(prev => ({ ...prev, ...documentsByDirector }));
    } catch (err) {
      console.error('❌ Error Individual Fetch:', err);
    }
  }, []);

  // OPTIMIZED: Batch fetch company documents
  const fetchAllCompanyDocuments = useCallback(async (tasksToFetch: any[], requiredKycIds: string[]) => {
    const startTime = performance.now();

    const companyIds = [...new Set(tasksToFetch.flatMap(t => {
      const companyPart = t.participants_details?.find(p => p.type === 'company');
      return [t.company_id, companyPart?.id].filter(Boolean);
    }))];

    if (companyIds.length === 0 || requiredKycIds.length === 0) {
      return;
    }

    try {
      // SINGLE QUERY for all companies and all document types
      const { data, error } = await supabase
        .from('acc_portal_kyc_uploads')
        .select('*, acc_portal_kyc (id, name, display_name)')
        .in('company_id', companyIds)
        .in('document_id', requiredKycIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const endTime = performance.now();

      const docsByCompany = data?.reduce((acc, doc) => {
        if (!acc[doc.company_id]) acc[doc.company_id] = [];
        acc[doc.company_id].push(doc);
        return acc;
      }, {});

      setAllCompanyDocuments(prev => ({ ...prev, ...docsByCompany }));
    } catch (err) {
      console.error('❌ Error Company Fetch:', err);
    }
  }, []);

  // OPTIMIZED: Batch fetch company metadata
  const fetchCompanyData = useCallback(async (tasksToFetch: any[]) => {
    const startTime = performance.now();

    const companyIds = [...new Set(tasksToFetch.flatMap(t => {
      const ids = [];
      if (t.company_id) ids.push(t.company_id);

      if (t.applicant_details?.type === 'company' && t.applicant_details?.id) {
        ids.push(t.applicant_details.id);
      }

      if (Array.isArray(t.participants_details)) {
        const companyParticipant = t.participants_details.find(p => p.type === 'company');
        if (companyParticipant?.id) ids.push(companyParticipant.id);
      }

      return ids;
    }).filter(Boolean))];

    if (companyIds.length === 0) {
      return;
    }

    // SINGLE QUERY for all companies
    try {
      const { data, error } = await supabase
        .from('acc_portal_company_duplicate')
        .select('id, company_name')
        .in('id', companyIds);

      if (error) throw error;

      const endTime = performance.now();

      const companiesMap = data?.reduce((acc, co) => {
        acc[co.id] = co;
        return acc;
      }, {} as Record<number, any>);

      setCompanyData(companiesMap || {});

    } catch (err) {
      console.error('❌ Error fetching company data:', err);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      if (!filteredTasks.length) return;
      setDocumentsLoading(true);

      try {
        // 1. Get unique IDs strictly excluding null/undefined/empty
        const uniqueClassIds = [...new Set(filteredTasks.map(t => t.class_id).filter(id => id != null && id !== ''))];
        const uniqueSubdepartmentIds = [...new Set(filteredTasks.map(t => t.subdepartment_id).filter(id => id != null && id !== ''))];
        const uniqueDepartmentIds = [...new Set(filteredTasks.map(t => t.department_id).filter(id => id != null && id !== ''))];

        let reqQuery = supabase.from('tm_class_requirements').select('*');

        // Build AND conditions for exact matching
        let filterConditions = {};
        if (uniqueClassIds.length > 0) {
          reqQuery = reqQuery.filter('job_level->>class_id', 'in', `(${uniqueClassIds.join(',')})`);
        }
        if (uniqueSubdepartmentIds.length > 0) {
          reqQuery = reqQuery.filter('job_level->>subdepartment_id', 'in', `(${uniqueSubdepartmentIds.join(',')})`);
        }
        if (uniqueDepartmentIds.length > 0) {
          reqQuery = reqQuery.filter('job_level->>department_id', 'in', `(${uniqueDepartmentIds.join(',')})`);
        }

        // Use the built query
        const reqPromise = (uniqueClassIds.length > 0 || uniqueSubdepartmentIds.length > 0 || uniqueDepartmentIds.length > 0)
          ? reqQuery
          : Promise.resolve({ data: [], error: null });

        const [metadataRes, classRequirementsRes] = await Promise.all([
          supabase.from('acc_portal_kyc').select('*').order('display_name', { ascending: true, nullsLast: true }),
          reqPromise
        ]);

        if (!isMounted) return;
        if (metadataRes.error) throw metadataRes.error;
        if (classRequirementsRes.error) throw classRequirementsRes.error;

        // Client-side filtering to ensure exact matches (ALL criteria must match)
        const filteredRequirements = (classRequirementsRes.data || []).filter(req => {
          const jobLevel = req.job_level;
          if (!jobLevel) return false;

          // Check if this record matches ALL of our criteria
          const matchesClass = uniqueClassIds.length === 0 || uniqueClassIds.includes(jobLevel.class_id);
          const matchesSubdept = uniqueSubdepartmentIds.length === 0 || uniqueSubdepartmentIds.includes(jobLevel.subdepartment_id);
          const matchesDept = uniqueDepartmentIds.length === 0 || uniqueDepartmentIds.includes(jobLevel.department_id);

          // ALL criteria must match (AND logic)
          const hasMatch = matchesClass && matchesSubdept && matchesDept;

          return hasMatch;
        });
        setDocuments((metadataRes.data || []).map(doc => ({ ...doc, display_name: doc.display_name || doc.name })));

        // 3. Map Requirements Logic (Hierarchy: Class > Subdept > Dept)
        const classReqMap: Record<string, any> = {};
        const reqs = filteredRequirements;

        filteredTasks.forEach(task => {
          let match = null;
          // Priority 1: Exact Class Match
          if (task.class_id) match = reqs.find(r => r.job_level?.class_id == task.class_id);
          // Priority 2: Subdepartment Match (if no class ID in task)
          if (!match && task.subdepartment_id) match = reqs.find(r => r.job_level?.subdepartment_id == task.subdepartment_id && !r.job_level?.class_id);
          // Priority 3: Department Match
          if (!match && task.department_id) match = reqs.find(r => r.job_level?.department_id == task.department_id && !r.job_level?.subdepartment_id && !r.job_level?.class_id);

          if (match) classReqMap[task.id] = match;
        });
        setTaskClassRequirements(classReqMap);

        // 4. Fetch Documents (Parallel)
        const allIndividualIds = new Set<number>();
        const allCompanyIds = new Set<number>();
        const requiredKycIds = new Set<string>();

        Object.values(classReqMap).forEach((cr: any) => {
          const list = cr.requirements || cr.documents_and_fields || [];
          list.forEach((r: any) => {
            if (r.document_id && UUID_REGEX.test(r.document_id)) requiredKycIds.add(r.document_id);
            if (r.document_ids) {
              r.document_ids.forEach((id: string) => {
                if (UUID_REGEX.test(id)) requiredKycIds.add(id);
              });
            }
            // Handle legacy documents_and_fields ID if necessary - BUT ensure it is UUID
            if (cr.documents_and_fields && r.id && UUID_REGEX.test(r.id)) requiredKycIds.add(r.id);
          });
        });

        filteredTasks.forEach(task => {
          // Use individual_id for Principal/Applicant to match director_id in DB
          const pId = task.individual_id || task.applicant_details?.id;
          if (pId) allIndividualIds.add(pId);

          task.participants_details?.forEach(p => {
            if (p.type === 'individual' && p.id) allIndividualIds.add(p.id);
            if (p.type === 'company' && p.id) allCompanyIds.add(p.id);
          });
          if (task.company_id) allCompanyIds.add(task.company_id);
          if (task.applicant_details?.type === 'company' && task.applicant_details?.id) allCompanyIds.add(task.applicant_details.id);
        });

        const indIds = Array.from(allIndividualIds);
        const coIds = Array.from(allCompanyIds);
        const kycIds = Array.from(requiredKycIds);

        const promises = [];
        if (indIds.length && kycIds.length) promises.push(supabase.from('acc_portal_directors_documents').select('*, acc_portal_kyc (id, name, display_name)').in('director_id', indIds).in('document_id', kycIds));
        else promises.push(Promise.resolve({ data: [] }));

        if (coIds.length && kycIds.length) promises.push(supabase.from('acc_portal_kyc_uploads').select('*, acc_portal_kyc (id, name, display_name)').in('company_id', coIds).in('document_id', kycIds));
        else promises.push(Promise.resolve({ data: [] }));

        if (coIds.length) promises.push(supabase.from('acc_portal_company_duplicate').select('id, company_name').in('id', coIds));
        else promises.push(Promise.resolve({ data: [] }));

        const [indDocs, coDocs, coMeta] = await Promise.all(promises);

        if (indDocs.data) {
          const map = {}; indDocs.data.forEach(d => { if (!map[d.director_id]) map[d.director_id] = []; map[d.director_id].push(d); });
          setAllIndividualDocuments(map);
        }
        if (coDocs.data) {
          const map = {}; coDocs.data.forEach(d => { if (!map[d.company_id]) map[d.company_id] = []; map[d.company_id].push(d); });
          setAllCompanyDocuments(map);
        }
        if (coMeta.data) {
          const map = {}; coMeta.data.forEach(c => map[c.id] = c);
          setCompanyData(map);
        }

      } catch (err) { console.error(err); }
      finally { if (isMounted) setDocumentsLoading(false); }
    };
    loadData();
    return () => { isMounted = false; };
  }, [filteredTasks]);

  const hasReferencesColumn = useMemo(() => filteredTasks.some(task => REFERENCE_SUBDEPARTMENT_IDS.includes(task.subdepartment?.id) || REFERENCE_SUBDEPARTMENT_IDS.includes(task.subdepartment?.parent_id)), [filteredTasks]);

  const groupedTasks = useMemo(() => {
    const groups = new Map<string, any[]>();
    filteredTasks.forEach(task => {
      let applicantName = 'Unknown Applicant';

      if (task.applicant_details?.name) {
        applicantName = task.applicant_details.name;
      } else if (task.participants_details?.length) {
        const principal = task.participants_details.find(p =>
          p.type === 'individual' &&
          (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')
        );

        if (principal) {
          applicantName = principal.name;
        } else {
          const namedParticipant = task.participants_details.find(p => p.name);
          if (namedParticipant) {
            applicantName = namedParticipant.name;
          }
        }
      }

      if (!groups.has(applicantName)) groups.set(applicantName, []);
      groups.get(applicantName)!.push(task);
    });
    return Array.from(groups.entries()).map(([name, tasksInGroup]) => ({
      applicantName: name,
      tasks: tasksInGroup,
      dependantIds: [...new Set(tasksInGroup.flatMap(t => Array.isArray(t.dependant_member) ? t.dependant_member.map(d => d.id) : []).filter(Boolean))]
    }));
  }, [filteredTasks]);

  const searchedGroupedTasks = useMemo(() => !sidebarSearchQuery ? groupedTasks : groupedTasks.filter(group => group.applicantName.toLowerCase().includes(sidebarSearchQuery.toLowerCase())), [groupedTasks, sidebarSearchQuery]);
  const filteredGroupedTasks = useMemo(() => !selectedApplicant ? (searchedGroupedTasks.length > 0 ? [searchedGroupedTasks[0]] : []) : searchedGroupedTasks.filter(group => group.applicantName === selectedApplicant), [searchedGroupedTasks, selectedApplicant]);

  useEffect(() => {
    if (searchedGroupedTasks.length > 0 && !selectedApplicant) {
      setSelectedApplicant(searchedGroupedTasks[0]?.applicantName || null);
    } else if (searchedGroupedTasks.length > 0 && !searchedGroupedTasks.some(g => g.applicantName === selectedApplicant)) {
      setSelectedApplicant(searchedGroupedTasks[0]?.applicantName || null);
    } else if (searchedGroupedTasks.length === 0) {
      setSelectedApplicant(null);
    }
  }, [searchedGroupedTasks, selectedApplicant]);

  const organizedRequirements = useMemo(() => {
    const allTasks = filteredGroupedTasks.flatMap(g => g.tasks);
    const requirementRows: any[] = [];

    allTasks.forEach(task => {
      const classReqs = taskClassRequirements[task.id];

      // Handle both data structures: requirements array OR documents_and_fields
      if (!classReqs) return;

      let requirementsToProcess = [];

      // Structure 1: requirements array with hasTemplate and web_automation
      if (classReqs?.requirements && Array.isArray(classReqs.requirements)) {
        requirementsToProcess = classReqs.requirements;
      }
      // Structure 2: documents_and_fields array (legacy structure)
      else if (classReqs?.documents_and_fields && Array.isArray(classReqs.documents_and_fields)) {
        requirementsToProcess = classReqs.documents_and_fields.map(doc => ({
          id: doc.id,
          name: doc.id, // Use document ID as name for legacy structure
          document_ids: [doc.id],
          hasTemplate: false,
          web_automation: null,
          entityTypes: doc.Principal ? ['principal'] : doc.Company ? ['company'] : doc.Dependent ? ['dependent'] : []
        }));
      }

      if (requirementsToProcess.length === 0) return;

      requirementsToProcess.forEach((req: any) => {
        const docIds = req.document_ids || (req.document_id ? [req.document_id] : []);

        if (docIds.length === 0) return;

        // Check if we already have this requirement (by ID, not name)
        const existingReq = requirementRows.find(r => r.id === req.id);
        if (existingReq) return; // Skip duplicates from multiple tasks

        // Get the first document for display purposes
        const firstDocId = docIds[0];
        const firstDocDef = documents.find(d => d.id === firstDocId);

        // Determine if this is a composite requirement (multiple different document types)
        const uniqueDocTypes = new Set(
          docIds.map(docId => {
            const doc = documents.find(d => d.id === docId);
            return doc?.display_name || doc?.name || 'Unknown';
          })
        );

        const isComposite = uniqueDocTypes.size > 1;

        // Use requirement name, not document name
        const requirementName = req.name || firstDocDef?.display_name || firstDocDef?.name || 'Unnamed Requirement';

        requirementRows.push({
          ...req,
          documentDefinition: firstDocDef, // For fields and metadata
          document_ids: docIds, // All document IDs
          document_id: firstDocId, // First ID for backward compatibility
          uniqueId: req.id, // Use requirement ID as unique identifier
          name: requirementName, // Use requirement name
          documentCount: docIds.length, // Total number of document types
          isMultiDocument: isComposite, // True if multiple different types
          // Separate section_type from actual category
          section_type: (() => {
            // Priority 1: Check for automation first
            if (req.web_automation?.automationId) {
              return 'automation';
            }

            // Priority 2: Check for template
            if (req.hasTemplate) {
              return 'template';
            }

            const entityTypes = req.entityTypes || (req.applicantType ? [req.applicantType] : []);
            if (entityTypes.includes('company')) {
              return 'company';
            }

            if (firstDocDef?.category === 'company-docs') {
              return 'company';
            }

            if (firstDocDef?.has_template) {
              return 'template';
            }

            return 'individual';
          })(),
          // Explicitly preserve the original category for sub-sectioning
          category: req.category || 'general'
        });
      });
    });

    return {
      documents: {
        company: requirementRows.filter(r => r.section_type === 'company'),
        individual: requirementRows.filter(r => r.section_type === 'individual'),
        templates: requirementRows.filter(r => r.section_type === 'template'),
        automations: requirementRows.filter(r => r.section_type === 'automation'),
      }
    };
  }, [filteredGroupedTasks, taskClassRequirements, documents]);

  const handleSelectApplicant = (applicantName: string) => setSelectedApplicant(applicantName);

  const handleDeleteApplicantTasks = useCallback((group: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setGroupToDelete(group);
    setDeleteConfirmOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!groupToDelete) return;

    const taskIds = groupToDelete.tasks.map(t => t.id);
    if (taskIds.length === 0) return;

    const toastId = toast.loading(`Deleting ${taskIds.length} task(s)...`);

    try {
      const { error } = await supabase
        .from('tm_tasks')
        .delete()
        .in('id', taskIds);

      if (error) throw error;

      toast.success(`Successfully deleted ${taskIds.length} task(s)`, { id: toastId });

      // Reset selection if deleted applicant was selected
      if (selectedApplicant === groupToDelete.applicantName) {
        setSelectedApplicant(null);
      }

      setDeleteConfirmOpen(false);
      setGroupToDelete(null);

      // The parent component will automatically re-render with updated tasks
      // since the tasks prop is derived from the database query
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(`Failed to delete tasks: ${error.message}`, { id: toastId });
    }
  }, [groupToDelete, selectedApplicant]);
  const toggleDocumentExpansion = useCallback((docId: string) => setExpandedDocuments(prev => { const newSet = new Set(prev); newSet.has(docId) ? newSet.delete(docId) : newSet.add(docId); return newSet; }), []);
  const handleUploadAction = useCallback((task: any, item: any, columnType: ApplicantType, applicantId?: number) => {
    let personName = individualNames[applicantId || task.individual_id] || 'Unknown Person';
    if (applicantId && task.participants_details) {
      const participant = task.participants_details.find(p => p.id === applicantId);
      if (participant && participant.name) {
        personName = participant.name;
      }
    }
    if (!personName || personName === 'Unknown Person') {
      personName = individualNames[task.applicant_details?.id] ||
        task.applicant_details?.name ||
        'Individual';
    }

    setSelectedDocForUpload({
      doc: item,
      fields: item.fields,
      person: {
        full_name: personName,
        type: columnType === 'company' ? 'company' : 'individual',
        id: applicantId || task.individual_id
      },
      task: task,
      columnType: columnType,
      applicantId: applicantId
    });
    setShowUploadModal(true);
  }, [individualNames]);

  const handleSaveDocument = useCallback(async (doc: any, editedData?: any) => {
    if (!doc) return;
    const toastId = toast.loading('Saving changes...');

    try {
      // 1. Determine target table and ID field
      const isIndividual = !!doc.director_id;
      const targetTable = isIndividual ? 'acc_portal_directors_documents' : 'acc_portal_kyc_uploads';

      // 2. Prepare data to save - CLEAN IT to remove circular references
      let rawData = editedData || doc.edited_details || doc.extracted_details || {};

      // Remove any nested file/document objects that cause circular references
      const dataToSave = Object.keys(rawData).reduce((clean, key) => {
        const value = rawData[key];
        // Skip keys that contain nested objects with circular references
        if (key === 'file' || key === 'document' || key === 'fileUrl' || key === 'fileName' || key === 'documentName' || key === 'type') {
          return clean;
        }
        // Only include primitive values, arrays, and simple objects
        if (value !== null && value !== undefined) {
          if (typeof value === 'object' && !Array.isArray(value)) {
            // For objects, only include if they don't have nested file references
            if (!value.file && !value.document && !value.extracted_details) {
              clean[key] = value;
            }
          } else {
            clean[key] = value;
          }
        }
        return clean;
      }, {});

      // 3. Find doc definition for expiry calculation
      const docId = doc.document_id;
      const docDef = documents.find(d => d.id === docId);

      // 4. Calculate new expiry if applicable (imported from utils)
      let updatePayload = {
        extracted_details: dataToSave,
      };

      // If your project has a getExpiryDate utility:
      if (typeof getExpiryDate === 'function' && docDef) {
        const newExpiry = getExpiryDate({ extracted_details: dataToSave }, docDef);
        updatePayload.expiry_date = newExpiry ? newExpiry.toISOString() : null;
      }

      // 5. Execute Database Update
      const { error } = await supabase
        .from(targetTable)
        .update(updatePayload)
        .eq('id', doc.id);

      if (error) throw error;

      // 6. Fetch fresh data from database to ensure UI is in sync
      const { data: freshDoc, error: fetchError } = await supabase
        .from(targetTable)
        .select('*')
        .eq('id', doc.id)
        .single();

      if (fetchError) {
        console.warn('Could not fetch fresh data:', fetchError);
      }

      // 7. Update State with fresh data
      const docToUpdate = freshDoc || { ...doc, ...updatePayload };

      if (isIndividual) {
        setAllIndividualDocuments(prev => {
          const directorId = doc.director_id;
          if (!prev[directorId]) return prev;
          return {
            ...prev,
            [directorId]: prev[directorId].map(d => d.id === doc.id ? docToUpdate : d)
          };
        });
      } else {
        setAllCompanyDocuments(prev => {
          const companyId = doc.company_id;
          if (!prev[companyId]) return prev;
          return {
            ...prev,
            [companyId]: prev[companyId].map(d => d.id === doc.id ? docToUpdate : d)
          };
        });
      }

      toast.success('Document updated successfully', { id: toastId });
    } catch (error) {
      console.error('Save error:', error);
      toast.error(`Save failed: ${error.message}`, { id: toastId });
    }
  }, [documents, allIndividualDocuments, allCompanyDocuments]);

  const handleUploadComplete = useCallback(() => {
    setShowUploadModal(false);
    if (filteredTasks.length > 0) {
      const requiredKycIds = getRequiredKycIds();
      try {
        Promise.all([
          fetchAllIndividualData(filteredTasks, requiredKycIds),
          fetchAllCompanyDocuments(filteredTasks, requiredKycIds)
        ]);
      } catch (error) {
        console.error('Error refreshing documents:', error);
      }
    }
  }, [filteredTasks, getRequiredKycIds, fetchAllIndividualData, fetchAllCompanyDocuments]);

  const handleDocumentUploadSuccess = (uploadedDocument: any) => {
    toast.success('Document uploaded successfully!');
    setShowUploadModal(false);
    refreshDocuments(); // Call the refreshDocuments function here
  };

  const handleGenerateLetterAction = useCallback((task: any, item: any, columnType: ApplicantType, applicantId?: number) => {
    setSelectedLetterData({ task, document: item, columnType, applicantId });
    setIsLetterDialogOpen(true);
  }, []);

  const refreshDocuments = useCallback(async () => {
    if (filteredTasks.length > 0) {
      const requiredKycIds = getRequiredKycIds();
      try {
        await Promise.all([
          fetchAllIndividualData(filteredTasks, requiredKycIds),
          fetchAllCompanyDocuments(filteredTasks, requiredKycIds)
        ]);
      } catch (error) {
        console.error('Error refreshing documents:', error);
      }
    }
  }, [filteredTasks, getRequiredKycIds, fetchAllIndividualData, fetchAllCompanyDocuments]);

  const handleAutomationAction = useCallback((task: any, item: any, columnType: ApplicantType, applicantId?: number, relationshipData?: any) => {
    setSelectedAutomationData({ task, document: item, columnType, applicantId, relationshipData });
    setIsAutomationDialogOpen(true);
  }, []);

  const getDocumentStatusForColumn = useCallback((task: any, reqItem: any, columnType: ApplicantType, applicantId?: number):
    DocumentStatus => {
    const baseStatus = { documents: [], count: 0 };
    const docIds = reqItem.document_ids || (reqItem.document_id ? [reqItem.document_id] : []);

    if (docIds.length === 0) return baseStatus;

    const allowedTypes = reqItem.entityTypes || (reqItem.applicantType ? [reqItem.applicantType] : []);

    // If no allowed types specified, allow all
    if (!allowedTypes || allowedTypes.length === 0) {
      console.log('✅ No restrictions - allowing all types');
    } else if (!allowedTypes.includes(columnType)) {
      return { ...baseStatus, type: 'na' };
    }

    let foundDocuments: any[] = [];

    if (columnType === 'company') {
      let companyId = null;

      if (task.applicant_details?.type === 'company' && task.applicant_details?.id) {
        companyId = task.applicant_details.id;
      } else if (task.participants_details) {
        const companyPart = task.participants_details.find(p => p.type === 'company');
        companyId = companyPart?.id;
      }

      if (!companyId) {
        companyId = task.company_id;
      }

      if (companyId && allCompanyDocuments[companyId]) {
        foundDocuments = allCompanyDocuments[companyId].filter(doc =>
          docIds.includes(doc.document_id)
        );
      }
    } else {
      let individualId = applicantId;

      if (columnType === 'principal') {
        if (task.applicant_details?.type === 'individual' && task.applicant_details?.id) {
          individualId = task.applicant_details.id;
        } else if (task.participants_details) {
          const principalIndividual = task.participants_details.find(p =>
            p.type === 'individual' &&
            (p.role === 'principal' || p.role === 'applicant' || (!p.role && !p.relationship))
          );
          individualId = principalIndividual?.id || task.individual_id;
        } else {
          individualId = task.individual_id;
        }
      } else if (columnType === 'director') {
        // Handle director type specifically - use the passed applicantId directly
        individualId = applicantId;
        // If applicantId is not provided, try to find the director
        if (!individualId && task.participants_details) {
          const directorIndividual = task.participants_details.find(p =>
            p.type === 'individual' && (p.role === 'director' || p.role === 'shareholder')
          );
          individualId = directorIndividual?.id;
        }
      } else if (columnType === 'understudy') {
        individualId = task.understudy;
      }

      if (individualId && allIndividualDocuments[individualId]) {
        foundDocuments = allIndividualDocuments[individualId].filter(doc =>
          docIds.includes(doc.document_id)
        );
      }
    }

    const type = foundDocuments.length > 0 ? 'view' : 'upload';
    return { ...baseStatus, documents: foundDocuments, count: foundDocuments.length, type };
  }, [allCompanyDocuments, allIndividualDocuments]);

  const renderDocumentStatus = useCallback((task: any, item: any, columnType: ApplicantType, applicantId?: number, relationshipData?: any) => {
    const status = getDocumentStatusForColumn(task, item, columnType, applicantId);
    const isLetter = item.main_category === 'Letters';

    const handleViewClick = async () => {
      if (status.documents.length === 0) return;

      try {
        const documentPreviews = (await Promise.all(status.documents.map(async (doc) => {
          if (!doc.file_path) {
            console.warn('Document missing file_path:', doc.id);
            return null;
          }

          const { data, error } = await supabase.storage
            .from('kyc-documents')
            .createSignedUrl(doc.file_path, 3600);

          if (error) throw error;

          let fields = [];
          if (doc.document_id) {
            try {
              const { data: kycData, error: kycError } = await supabase
                .from('acc_portal_kyc')
                .select('fields')
                .eq('id', doc.document_id)
                .single();

              if (!kycError && kycData) {
                fields = kycData.fields || [];
              } else if (kycError) {
                console.warn('Failed to fetch KYC fields for document:', doc.id, kycError);
              }
            } catch (err) {
              console.warn('Error fetching KYC fields:', err);
            }
          }

          return {
            id: doc.id,
            fileUrl: data.signedUrl,
            extractedData: doc.extracted_details || {},
            fields: fields,
            name: doc.acc_portal_kyc?.display_name || item.display_name,
            uploadedAt: doc.created_at
          };
        }))).filter(Boolean);

        setPreviewDocument({
          documents: documentPreviews,
          currentIndex: 0
        });

        setDocumentPreviewOpen(true);
      } catch (err) {
        console.error('Error loading individual document previews:', err);
        toast({ title: 'Error', description: 'Failed to load document.', variant: 'destructive' });
      }
    };

    if (status.type === 'na') return <div className="text-gray-400 text-[10px]">N/A</div>;

    return (
      <div className="flex items-center justify-center gap-1 h-full">
        {item.web_automation?.automationId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50"
            onClick={() => handleAutomationAction(task, item, columnType, applicantId, relationshipData)}
            title={`Run Automation: ${item.web_automation.automationName}`}
          >
            <Zap className="h-4 w-4" />
          </Button>
        )}

        {isLetter && item.hasTemplate && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
            onClick={() => handleGenerateLetterAction(task, item, columnType, applicantId)}
            title={`Generate ${item.display_name}`}
          >
            <Wand2 className="h-3 w-3 mr-1" />
            <span className="text-[10px] font-bold uppercase">Generate</span>
          </Button>
        )}

        {isLetter && !item.hasTemplate && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
            onClick={() => handleGenerateLetterAction(task, item, columnType, applicantId)}
            title={`Generate ${item.display_name}`}
          >
            <Wand2 className="h-3 w-3 mr-1" />
            <span className="text-[10px] font-bold uppercase">Generate</span>
          </Button>
        )}

        {!item.web_automation?.automationId && (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-50" onClick={() => handleUploadAction(task, item, columnType, applicantId)} title={`Upload ${item.display_name}`}><UploadCloud className="h-4 w-4" /></Button>
        )}

        {status.type === 'view' && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-600 hover:bg-green-100" onClick={handleViewClick} title={`View ${status.count} document(s)`}><Eye className="h-4 w-4" /></Button>
            {status.count > 1 && (<Badge variant="outline" className="h-5 w-5 p-0 flex items-center justify-center text-xs bg-green-50 text-green-700 border-green-200">{status.count}</Badge>)}
          </div>
        )}
      </div>
    );
  }, [getDocumentStatusForColumn, handleUploadAction, handleGenerateLetterAction, handleAutomationAction, documents]);

  const renderClientFieldData = useCallback(() => <div className="text-center"><span className="text-gray-400 text-xs">-</span></div>, []);
  const renderReferencesData = useCallback(() => <div className="text-center p-2"><span className="text-gray-400 text-xs">N/A</span></div>, []);
  const getCurrentRequirements = () => [];
  const fuzzyMatch = (str1, str2) => str1.toLowerCase() === str2.toLowerCase();

  const currentClassRequirements = useMemo(() => {
    const firstTask = filteredGroupedTasks[0]?.tasks?.[0];
    if (!firstTask) return [];
    const requirements = taskClassRequirements[firstTask.id];
    const result = requirements ? [requirements] : [];
    return result;
  }, [filteredGroupedTasks, taskClassRequirements]);

  const getCompanyName = (group) => {
    const task = group.tasks[0];
    if (!task) return null;

    if (task.applicant_details?.type === 'company') {
      return task.applicant_details.name;
    }

    if (Array.isArray(task.participants_details)) {
      const company = task.participants_details.find(p => p.type === 'company');
      if (company) return company.name;
    }

    if (task.company_id && companyData[task.company_id]) {
      return companyData[task.company_id].company_name;
    }

    return null;
  };

  const handleExportChecklist = () => {
    const worksheetData: any[] = [];
    const headers = ["#", "Requirement"];

    filteredGroupedTasks.forEach(group => {
      const companyId = group.tasks[0]?.company_id;
      const company = companyId ? companyData[companyId] : null;
      headers.push(company ? company.company_name : "Company");
      const principal = group.tasks[0]?.participants_details?.find(p =>
        (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')
      );
      const principalId = principal?.id || group.tasks[0]?.individual_id;
      headers.push(principal?.name || individualNames[principalId] || "Principal");
      (group.dependantIds || []).forEach((id, index) => headers.push(individualNames[id] || `Dependant ${index + 1}`));
      if (group.tasks.some(task => task.class_id === CLASS_D_ID)) headers.push("Understudy");
    });
    if (hasReferencesColumn) allReferences.forEach(ref => headers.push(ref.name));

    worksheetData.push(headers);
    worksheetData.push(["Company Documents", ...Array(headers.length - 1).fill("")]);
    organizedRequirements.documents.company
      .sort((a, b) => (a.document.custom_order || 999) - (b.document.custom_order || 999))
      .forEach((docItem, index) => worksheetData.push([`${index + 1}.`, docItem.document.display_name, ...Array(headers.length - 2).fill(" ")]));

    worksheetData.push(["Individual Documents", ...Array(headers.length - 1).fill("")]);
    organizedRequirements.documents.individual
      .sort((a, b) => (a.document.custom_order || 999) - (b.document.custom_order || 999))
      .forEach((docItem, index) => worksheetData.push([`${index + 1}.`, docItem.document.display_name, ...Array(headers.length - 2).fill(" ")]));

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Requirements Checklist");
    XLSX.writeFile(workbook, "Requirements_Checklist.xlsx");
  };

  const handleExportData = () => {
    const worksheetData: any[] = [];
    const headers = ["#", "Requirement"];
    const entityColumns: { type: string, id?: number, name: string, groupIndex: number }[] = [];

    filteredGroupedTasks.forEach((group, groupIndex) => {
      const companyId = group.tasks[0]?.company_id;
      const company = companyId ? companyData[companyId] : null;
      headers.push(company ? company.company_name : `Company (Group ${groupIndex + 1})`);
      entityColumns.push({ type: 'company', name: 'company', groupIndex });

      const participants = group.tasks[0]?.participants_details || [];
      const principal = participants.find(p =>
        (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')
      );
      const understudy = participants.find(p =>
        (Array.isArray(p.role) ? p.role.includes('understudy') : p.role === 'understudy')
      );
      const principalId = principal?.id || null;
      const understudyId = understudy?.id || null;

      headers.push(individualNames[principalId] || `Principal (Group ${groupIndex + 1})`);
      entityColumns.push({ type: 'principal', name: 'principal', groupIndex });
      (group.dependantIds || []).forEach((id, depIndex) => {
        headers.push(individualNames[id] || `Dependant ${depIndex + 1} (Group ${groupIndex + 1})`);
        entityColumns.push({ type: 'dependant', id, name: 'dependant', groupIndex });
      });
      if (group.tasks.some(task => task.class_id === CLASS_D_ID)) {
        headers.push(individualNames[understudyId] || `Understudy (Group ${groupIndex + 1})`);
        entityColumns.push({ type: 'understudy', name: 'understudy', groupIndex });
      }
    });
    if (hasReferencesColumn) {
      allReferences.forEach(ref => {
        headers.push(ref.name);
        entityColumns.push({ type: 'reference', id: ref.member, name: 'reference', groupIndex: 0 });
      });
    }
    worksheetData.push(headers);

    const processDocuments = (docType: string, documents: any[]) => {
      worksheetData.push([`${docType} Documents`, ...Array(headers.length - 1).fill("")]);
      documents
        .sort((a, b) => (a.order || 999) - (b.order || 999))
        .forEach((reqItem, index) => {
          const docDef = reqItem.documentDefinition;
          const row = [`${index + 1}.`, docDef?.display_name || docDef?.name || reqItem.name];
          entityColumns.forEach(col => {
            const task = filteredGroupedTasks[col.groupIndex]?.tasks[0];
            row.push(task ? getDocumentStatusText(task, docDef, col.type, col.id) : "N/A");
          });
          worksheetData.push(row);
        });
    };

    processDocuments("Company", organizedRequirements.documents.company);
    processDocuments("Individual", organizedRequirements.documents.individual);

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Requirements Data");
    XLSX.writeFile(workbook, "Requirements_Data_Export.xlsx");
  };

  return (
    <div className="flex h-[85vh] w-full bg-white">
      <div className="w-74 border-r bg-white flex flex-col">
        <div className="p-4 border-b"><h2 className="text-lg font-semibold">Applicants</h2></div>
        <div className="p-2 border-b"><div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." className="pl-8" value={sidebarSearchQuery} onChange={(e) => setSidebarSearchQuery(e.target.value)} /></div></div>
        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {searchedGroupedTasks.map((group) => {
              const companyName = getCompanyName(group);
              return (
                <div key={group.applicantName} className="relative group">
                  <Button
                    variant={selectedApplicant === group.applicantName ? "secondary" : "ghost"}
                    className="w-full justify-start h-auto py-2 pr-10"
                    onClick={() => handleSelectApplicant(group.applicantName)}
                  >
                    <div className="flex flex-col items-start w-full">
                      <span className="truncate text-left text-sm font-medium">
                        {group.applicantName}
                      </span>
                      {companyName && (
                        <span className="text-xs text-muted-foreground truncate w-full text-left mt-1 flex items-center">
                          <Briefcase className="h-3 w-3 inline-block mr-1.5" />
                          {companyName}
                        </span>
                      )}
                    </div>
                  </Button>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">

                    {/* EDIT BUTTON */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Edit the first task in the group
                        if (onTaskAction && group.tasks.length > 0) {
                          onTaskAction('edit', group.tasks[0]);
                        }
                      }}
                      title={`Edit enquiry for ${group.applicantName}`}
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>

                    {/* DELETE BUTTON */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={(e) => handleDeleteApplicantTasks(group, e)}
                      title={`Delete ${group.tasks.length} task(s) for ${group.applicantName}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {loading && <div className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>}
            {!loading && searchedGroupedTasks.length === 0 && <p className="p-4 text-sm text-center text-muted-foreground">No applicants found.</p>}
          </div>
        </ScrollArea>
      </div>
      {filteredGroupedTasks.length > 0 ? (
        <div className="flex-1 flex flex-col border rounded-md bg-background shadow-sm">
          <div className="p-4 border-b flex justify-between">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search requirements..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Download className="mr-2 h-4 w-4" /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportChecklist}>
                    <FileText className="mr-2 h-4 w-4" /> Export Requirements Checklist
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportData}>
                    <FileUp className="mr-2 h-4 w-4" /> Export Data
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="overflow-auto flex-1">
            <RequirementsTableCombined
              loading={documentsLoading || loading}
              error={error}
              filteredGroupedTasks={filteredGroupedTasks}
              organizedRequirements={organizedRequirements}
              classRequirements={currentClassRequirements}
              expandedDocuments={expandedDocuments}
              toggleDocumentExpansion={toggleDocumentExpansion}
              renderDocumentStatus={renderDocumentStatus}
              renderClientFieldData={renderClientFieldData}
              renderReferencesData={renderReferencesData}
              hasReferencesColumn={hasReferencesColumn}
              allIndividualDocuments={allIndividualDocuments}
              allCompanyDocuments={allCompanyDocuments}
              individualNames={individualNames}
              companyData={companyData}
              getCurrentRequirements={getCurrentRequirements}
              fuzzyMatch={fuzzyMatch}
              kycDocuments={new Map()}
              documentTypes={documents}
              searchQuery={searchQuery}
              onSaveDocument={handleSaveDocument}
              refreshDocuments={refreshDocuments}
              handleDeleteDocument={handleDeleteDocument}
              jobLevel={currentClassRequirements[0]?.job_level}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center border rounded-md bg-background">
          <p className="text-muted-foreground">No applicants found</p>
        </div>
      )}
      {previewDocument && previewDocument.documents.length > 0 && (
        <ExtractionPreview
          open={documentPreviewOpen}
          onOpenChange={setDocumentPreviewOpen}
          documents={previewDocument.documents}
          initialIndex={previewDocument.currentIndex}
          onDocumentChange={(index) => {
            setPreviewDocument(prev => prev ? {
              ...prev,
              currentIndex: index
            } : null);
          }}
        />
      )}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleUploadComplete}
        onSuccess={handleDocumentUploadSuccess}
        documentName={selectedDocForUpload?.doc?.display_name || selectedDocForUpload?.doc?.name || selectedDocForUpload?.doc?.document_name || 'Document'}
        documentFields={selectedDocForUpload?.fields}
        entityName={selectedDocForUpload?.person?.full_name}
        selectedDoc={selectedDocForUpload?.doc}
        selectedMember={selectedDocForUpload?.person}
        isAllKepUpload={false}
        permitClassOptions={PERMIT_CLASS_OPTIONS}
        allDocumentTypes={documents}
        mainTab={activeTab}
        isPassportUpload={false}
        selectedDocumentId={selectedDocForUpload?.doc?.id}
        dropdowns={[]}
        targetTable={selectedDocForUpload?.person?.type === 'company' ? 'acc_portal_kyc_uploads' : 'acc_portal_directors_documents'}
        idFieldName={selectedDocForUpload?.person?.type === 'company' ? 'company_id' : 'director_id'}
        documentIdFieldName='document_id'
        isCompanyUpload={selectedDocForUpload?.person?.type === 'company'}
        additionalFields={{
          issue_date: new Date().toISOString().split('T')[0],
          expiry_date: null
        }}
        onBeforeUpload={async (recordData) => {
          return null;
        }}
      />

      <LetterTemplateDialog
        open={isLetterDialogOpen}
        onOpenChange={setIsLetterDialogOpen}
        letterData={selectedLetterData}
        individualNames={individualNames}
      />

      {selectedAutomationData && (
        <AutomationMappingDialog
          isOpen={isAutomationDialogOpen}
          onClose={() => setIsAutomationDialogOpen(false)}
          classId={selectedAutomationData.task?.class_id || ''}
          requirementId={selectedAutomationData.document?.id || ''}
          taskId={selectedAutomationData.task?.id}
          individualId={selectedAutomationData.applicantId?.toString()}
          task={selectedAutomationData.task}
          relationshipData={selectedAutomationData.relationshipData}
        />
      )}

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">Delete Tasks</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  This action cannot be undone
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-700">
              Are you sure you want to delete <span className="font-bold">{groupToDelete?.tasks?.length || 0} task(s)</span> for{' '}
              <span className="font-bold">{groupToDelete?.applicantName}</span>?
            </p>
            <p className="mt-2 text-xs text-gray-500">
              All associated data will be permanently removed from the database.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setGroupToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete {groupToDelete?.tasks?.length || 0} Task(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}