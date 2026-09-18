// @ts-nocheck
"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown, ChevronRight, Loader2, User, Users, Building2, FileText, UserPlus, UserCheck, Shield, HelpCircle, Calendar, MessageSquare, ListTodo, Phone, Database, Folder, Search, HeartHandshake, Split, X, AlertCircle, Link2, PlusCircle, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardTitle, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import supabase from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import { format, isValid } from "date-fns"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { detectExistingWorkflowForIndividual, detectTaskConflictsForJobLevel, evaluateWorkflowRestrictionsForBundle, formatWorkflowRestrictionReason, taskBundleService, fetchIndividualDocumentsForLinking, linkTaskToDocumentWorkflow, type LinkableDocument } from "../utils/workflowBundleHelpers"
import { getInheritedOfficer, getDepartmentOfficerIds, getSubdepartmentOfficerIds } from "../../departments/departments/database"
import { fetchOfficers, fetchTaskManagers, fetchTaskAssistants, fetchAllUsers, hasJobLevelAccess, buildSelectOptions, FilteredUserData, userService, DisplayUser } from "@/lib/shared-user-assignment-service"
import { parseDateWithMonthName } from "@/app/generic-functions/dateUtils"
import { fetchAllKycFields } from "../utils/taskManagerData"
import { UploadModal } from "@/app/generic-components/UploadModal"
import { useCurrentUser } from "@/lib/hooks/use-current-user"
import { auditActor } from "../utils/audit"

const CLASS_D_ID = '1750687058159';
const SPONSOR_SUBDEPT_ID = '26';
const CLIENT_CATEGORIES = ['ACC', 'IMM', 'Sheria', 'Audit'];
const ENQUIRY_STAGE_ID = '1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa';

// Photo document IDs
const PASSPORT_PHOTO_ID = '48f48255-e5db-4944-8864-6f35b3af4696';
const CLEAR_PHOTO_ID = 'fa74ff82-09ce-418d-8985-174158d73316';
const PASSPORT_DOCUMENT_ID = 'f52872ce-20b4-404a-8491-9096cd54947f';

interface JobQuestion {
    id: string
    label: string
    category?: string
    type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean'
    required: boolean
    options?: string[]
    linked_field_id?: string
    applicant_types?: string[]
    default_value?: string
    third_party_role?: string | null
    depends_on?: {
        id: string
        operator: 'equals' | 'not_equals' | 'is_not_empty' | 'is_empty'
        value: any
        auto_assign_value?: string
    }
}

interface Individual {
    id: number
    full_name: string
    contact_details?: {
        phone?: { kenyan?: { primary?: string } }
    }
    individual_type: 'principal' | 'dependant'
    relationships?: any[]
    employment_data?: any
}

const createInitialCompanyCategories = () =>
    CLIENT_CATEGORIES.reduce((acc, category) => {
        acc[category] = {
            isActive: category === 'IMM',
            wef: '2000-01-01',
            to: category === 'IMM' ? '2050-12-31' : '2000-01-01'
        };
        return acc;
    }, {} as Record<string, { isActive: boolean; wef: string; to: string }>);

const buildSelectOptions = (items: any[] = [], labelKey = "name") =>
    items.map((item: any) => ({
        value: String(item.id),
        label: item.full_name || item[labelKey] || item.name ||
            (item.firstName && item.lastName ? `${item.firstName} ${item.lastName}`.trim() :
                item.firstName || item.lastName || item.displayName || 'Unknown')
    }));

const normalizeEnquiryDateForStorage = (dateValue?: string) => {
    if (!dateValue) {
        const today = new Date();
        return {
            isoDateTime: `${today.toISOString().split('T')[0]}T00:00:00.000Z`,
            displayDate: format(today, 'dd/MM/yyyy')
        };
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        const [year, month, day] = dateValue.split('-');
        return {
            isoDateTime: `${year}-${month}-${day}T00:00:00.000Z`,
            displayDate: `${day}/${month}/${year}`
        };
    }

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateValue)) {
        const [day, month, year] = dateValue.split('/');
        return {
            isoDateTime: `${year}-${month}-${day}T00:00:00.000Z`,
            displayDate: `${day}/${month}/${year}`
        };
    }

    const parsedDate = new Date(dateValue);
    if (!isNaN(parsedDate.getTime())) {
        return {
            isoDateTime: `${parsedDate.toISOString().split('T')[0]}T00:00:00.000Z`,
            displayDate: format(parsedDate, 'dd/MM/yyyy')
        };
    }

    const today = new Date();
    return {
        isoDateTime: `${today.toISOString().split('T')[0]}T00:00:00.000Z`,
        displayDate: format(today, 'dd/MM/yyyy')
    };
};

const resolveEnquiryDateForEdit = (task: any): string => {
    const stageData = task?.stages?.[ENQUIRY_STAGE_ID];
    const raw = stageData?.date || stageData?.completedAt || task?.date_initiated;
    if (!raw) return format(new Date(), 'dd/MM/yyyy');
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? format(new Date(), 'dd/MM/yyyy') : format(parsed, 'dd/MM/yyyy');
};

const TableRow = ({ label, children, required = false, hasValue, error }: { label: string; children: React.ReactNode; required?: boolean; hasValue?: boolean; error?: string }) => (
    <div className={cn(
        "grid grid-cols-12 gap-4 py-3 border-b transition-colors",
        error ? "border-red-200 bg-red-50/40 hover:bg-red-50/60"
            : hasValue === false ? "border-amber-100 bg-amber-50/40 hover:bg-amber-50/60" : "border-slate-100 hover:bg-slate-50/50"
    )}>
        <div className="col-span-4 flex items-center gap-2">
            {hasValue !== undefined && (
                <span
                    className={cn("h-1.5 w-1.5 rounded-full shrink-0", error ? "bg-red-500" : hasValue ? "bg-emerald-500" : "bg-amber-400")}
                    title={error ? error : hasValue ? "Filled" : "Not set yet"}
                />
            )}
            <Label className={cn("text-sm font-semibold", error ? "text-red-700" : hasValue === false ? "text-amber-700" : "text-slate-700")}>
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </Label>
        </div>
        <div className="col-span-8">
            {children}
            {error && (
                <p className="mt-1.5 flex items-center gap-1 text-sm font-medium text-red-600">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {error}
                </p>
            )}
        </div>
    </div>
);

export function EnquiryDialog({
    open,
    onOpenChange,
    onEnquiryCreated,
    departments = [],
    userData,
    kycDocuments,
    taskToEdit = null
}: any) {
    const { user: currentUser } = useCurrentUser();
    const actor = auditActor(currentUser);
    const [loading, setLoading] = useState(false)
    const [searchLoading, setSearchLoading] = useState(false)
    const [loadingRelations, setLoadingRelations] = useState(false)
    const [loadingQuestions, setLoadingQuestions] = useState(false)
    const [loadingStaff, setLoadingStaff] = useState(false)
    const [applicantPhoto, setApplicantPhoto] = useState<string | null>(null)
    const [loadingPhoto, setLoadingPhoto] = useState(false)
    const [checkingWorkflow, setCheckingWorkflow] = useState(false)
    const [editableRNumber, setEditableRNumber] = useState('')
    const [rNumberUnallocated, setRNumberUnallocated] = useState(false)
    const [submitAttempted, setSubmitAttempted] = useState(false)
    const [isDependantsPopoverOpen, setIsDependantsPopoverOpen] = useState(false)
    const [showPassportUpload, setShowPassportUpload] = useState(false)
    const [passportKycDoc, setPassportKycDoc] = useState<any>(null)
    const [individuals, setIndividuals] = useState<Individual[]>([])
    const [sponsors, setSponsors] = useState<any[]>([])
    const [jobQuestions, setJobQuestions] = useState<JobQuestion[]>([])
    const [jobAnswers, setJobAnswers] = useState<Record<string, any>>({})
    const [masterFieldsData, setMasterFieldsData] = useState<Record<string, any[]>>({})
    const [existingWorkflowSummary, setExistingWorkflowSummary] = useState<any | null>(null)
    const [duplicateTaskConflicts, setDuplicateTaskConflicts] = useState<any[]>([])
    const [selectedJobLevelBundle, setSelectedJobLevelBundle] = useState<any | null>(null)
    const [workflowRestrictionSummary, setWorkflowRestrictionSummary] = useState<any | null>(null)
    const editDataLoadedRef = useRef(false)
    const [thirdPartySelections, setThirdPartySelections] = useState<Record<string, string>>({})
    const [companyIndividuals, setCompanyIndividuals] = useState<any[]>([])
    const [applicantType, setApplicantType] = useState<'principal' | 'dependant'>('principal')
    const [selectedIndividual, setSelectedIndividual] = useState<Individual | null>(null)
    const [selectedSponsor, setSelectedSponsor] = useState<any | null>(null)
    const [principalForDependant, setPrincipalForDependant] = useState<Individual | null>(null)
    const [companies, setCompanies] = useState<any[]>([])
    const [allCompanies, setAllCompanies] = useState<any[]>([])
    const [selectedCompany, setSelectedCompany] = useState<string>('')
    const [understudies, setUnderstudies] = useState<any[]>([])
    const [selectedUnderstudy, setSelectedUnderstudy] = useState<string>('')
    const [availableRelatedDocuments, setAvailableRelatedDocuments] = useState<LinkableDocument[]>([])
    const [selectedRelatedDocumentId, setSelectedRelatedDocumentId] = useState<string>('')
    const [loadingRelatedDocuments, setLoadingRelatedDocuments] = useState(false)
    const [includeDependants, setIncludeDependants] = useState(false)
    const [availableDependants, setAvailableDependants] = useState<any[]>([])
    const [selectedDependants, setSelectedDependants] = useState<string[]>([])
    const [includeReferences, setIncludeReferences] = useState(false)
    const [availableReferences, setAvailableReferences] = useState<any[]>([])
    const [selectedReferences, setSelectedReferences] = useState<string[]>([])
    const [formData, setFormData] = useState({
        job_description: '',
        department_id: '',
        subdepartment_id: '',
        class_id: '',
        officer_id: '',
        task_manager_id: '',
        task_assistant_id: '',
        enquiry_date: format(new Date(), 'dd/MM/yyyy'),
        passport_number: '',
        duration: '',
        renewal_status: 'New',
        passport_handling_mode: null as 'bcl' | 'client' | null,
        eta_purpose: null as 'tourism' | 'fresh_settlement' | 'resettlement' | null,
        eta_traveler_intent: null as 'visitor' | 'extend_or_change_status' | null,
        eta_ticket_confirmed: null as boolean | null,
        eta_tentative_arrival_date: '',
        eta_tentative_departure_date: '',
        eta_confirmed_ticket_expected_date: '',
        eta_return_ticket_is_real: null as boolean | null,
        job_level: {
            level: 1,
            department_id: null,
            subdepartment_id: null,
            class_id: null,
            subclass_id: null
        }
    });
    const [allOfficers, setAllOfficers] = useState<any[]>([]);
    const [availableOfficers, setAvailableOfficers] = useState<any[]>([]);
    const [managersData, setManagersData] = useState<any[]>([]);
    const [assistantsData, setAssistantsData] = useState<any[]>([]);
    const [isIndividualPopoverOpen, setIsIndividualPopoverOpen] = useState(false);
    const [isSponsorPopoverOpen, setIsSponsorPopoverOpen] = useState(false);
    const [isEnquiryDatePickerOpen, setIsEnquiryDatePickerOpen] = useState(false);
    const [showCompanyAssociationDialog, setShowCompanyAssociationDialog] = useState(false);
    const [associationLoading, setAssociationLoading] = useState(false);
    const [showCompanyCreateDialog, setShowCompanyCreateDialog] = useState(false);
    const [companySearchTerm, setCompanySearchTerm] = useState('');
    const [newCompanyName, setNewCompanyName] = useState('');
    const [companyCategories, setCompanyCategories] = useState(createInitialCompanyCategories);
    const [newAssociationData, setNewAssociationData] = useState({
        individual_type: '',
        company_id: '',
        effective_start_date: '',
        effective_end_date: '',
        shares_held: ''
    });
    const availableSubdepartments = useMemo(() => {
        const dept = departments.find(d => d.id.toString() === formData.department_id)
        return dept?.tm_subdepartments || []
    }, [formData.department_id, departments])

    const availableClasses = useMemo(() => {
        const sub = availableSubdepartments.find(s => s.id.toString() === formData.subdepartment_id)
        return sub?.classes || []
    }, [availableSubdepartments, formData.subdepartment_id])

    // Create options arrays for SearchableSelect
    const companyOptions = useMemo(() => {
        return (companies || []).map(c => ({ value: c.id.toString(), label: c.company_name }));
    }, [companies]);

    const filteredAssociationCompanies = useMemo(() => {
        const term = companySearchTerm.trim().toLowerCase();
        if (!term) return allCompanies.slice(0, 6);
        return allCompanies
            .filter(company => company.company_name?.toLowerCase().includes(term))
            .slice(0, 6);
    }, [allCompanies, companySearchTerm]);

    const understudyOptions = useMemo(() => {
        return (understudies || []).map(u => ({ value: u.id.toString(), label: u.full_name }));
    }, [understudies]);

    const departmentOptions = useMemo(() => {
        return (departments || []).map(d => ({ value: d.id.toString(), label: d.name }));
    }, [departments]);

    const subdepartmentOptions = useMemo(() => {
        return (availableSubdepartments || []).map(s => ({ value: s.id.toString(), label: s.name }));
    }, [availableSubdepartments]);

    const classOptions = useMemo(() => {
        return (availableClasses || []).map(c => ({ value: c.id.toString(), label: c.name }));
    }, [availableClasses]);

    const officerOptions = useMemo(() => {
        if (availableOfficers.length === 0) {
            return [{ value: 'none', label: 'Unallocated' }];
        }
        // Filter officers by job level access
        const filteredOfficers = availableOfficers.filter(officer =>
            hasJobLevelAccess(officer, formData.department_id, formData.subdepartment_id, formData.class_id)
        );
        return [
            { value: 'none', label: 'Unallocated' },
            ...filteredOfficers.map(o => ({ value: o.id.toString(), label: o.displayName || o.full_name || o.name || 'Unknown' }))
        ];
    }, [availableOfficers, formData.department_id, formData.subdepartment_id, formData.class_id]);

    // Computed values for disabled states based on job level selection
    const isOfficerDisabled = useMemo(() => {
        if (!formData.department_id) return true;
        if (availableOfficers.length === 0) return true;

        const filteredOfficers = availableOfficers.filter(officer =>
            hasJobLevelAccess(officer, formData.department_id, formData.subdepartment_id, formData.class_id)
        );
        return filteredOfficers.length === 0;
    }, [formData.department_id, formData.subdepartment_id, formData.class_id, availableOfficers]);

    const isManagerDisabled = useMemo(() => {
        if (!formData.department_id) return true;
        // Never disable when we have the "No Manager" option available
        return false;
    }, [formData.department_id]);

    const isAssistantDisabled = useMemo(() => {
        if (!formData.department_id) return true;
        // Never disable when we have the "No Assistant" option available
        return false;
    }, [formData.department_id]);

    const officerPlaceholder = useMemo(() => {
        if (!formData.department_id) {
            return "Select job level first";
        }
        if (availableOfficers.length === 0) {
            return "No officers available";
        }
        const filteredOfficers = availableOfficers.filter(officer =>
            hasJobLevelAccess(officer, formData.department_id, formData.subdepartment_id, formData.class_id)
        );
        if (filteredOfficers.length === 0) {
            return "No officers with access to this job level";
        }
        return "Select Officer";
    }, [formData.department_id, formData.subdepartment_id, formData.class_id, availableOfficers]);

    const getInheritedOfficerForSubdepartment = useCallback(async (subdepartmentId: string) => {
        if (!subdepartmentId || !formData.department_id) return null;
        try {
            const { data: department, error: deptError } = await supabase
                .from('tm_departments')
                .select('id, name')
                .eq('id', formData.department_id)
                .single();

            if (deptError) throw deptError;
            const { data: subdepartment, error: subError } = await supabase
                .from('tm_subdepartments')
                .select('id, name, officer_history')
                .eq('id', subdepartmentId)
                .single();

            if (subError) throw subError;
            const realOfficers = await fetchOfficers();
            const departmentForInheritance = {
                ...department,
                officers_history: []
            };
            const inheritedOfficer = getInheritedOfficer(
                subdepartment.officer_history || [],
                departmentForInheritance
            );
            if (inheritedOfficer && realOfficers.length > 0) {
                const realOfficer = realOfficers.find(officer =>
                    officer.id === inheritedOfficer.id.toString() ||
                    officer.id === inheritedOfficer.id
                );

                if (realOfficer) return realOfficer;
            }

            return null;
        } catch (error) {
            console.error('Error getting inherited officer:', error);
            return null;
        }
    }, [formData.department_id]);

    const managerOpts = useMemo(() => {
        if (!managersData || !Array.isArray(managersData)) {
            return [{ value: 'none', label: 'Unallocated' }];
        }
        const filteredManagers = managersData.filter(manager =>
            hasJobLevelAccess(manager, formData.department_id, formData.subdepartment_id, formData.class_id)
        );
        return [
            { value: 'none', label: 'Unallocated' },
            ...buildSelectOptions(filteredManagers, "displayName")
        ];
    }, [managersData, formData.department_id, formData.subdepartment_id, formData.class_id]);

    const assistantOpts = useMemo(() => {
        // Add null check to prevent runtime errors
        if (!assistantsData || !Array.isArray(assistantsData)) {
            return [{ value: 'none', label: 'Unallocated' }];
        }
        const filteredAssistants = assistantsData.filter(assistant =>
            hasJobLevelAccess(assistant, formData.department_id, formData.subdepartment_id, formData.class_id)
        );
        return [
            { value: 'none', label: 'Unallocated' },
            ...buildSelectOptions(filteredAssistants, 'displayName')
        ];
    }, [assistantsData, formData.department_id, formData.subdepartment_id, formData.class_id]);

    const getSupabaseImageUrl = useCallback((filePath: string | null): string | null => {
        if (!filePath) return null;
        if (filePath.startsWith('http')) return filePath;
        const bucketName = 'kyc-documents';
        const fullPath = filePath.startsWith(bucketName) ? filePath : `${bucketName}/${filePath}`;
        return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${fullPath}`;
    }, []);

    const fetchAllCompanies = useCallback(async () => {
        const { data, error } = await supabase
            .from('acc_portal_company_duplicate')
            .select('id, company_name, understudy')
            .order('company_name');

        if (error) throw error;
        setAllCompanies(data || []);
        return data || [];
    }, []);

    const isPrincipalIndividual = (ind: any): boolean =>
        ind.employment_data?.associations?.some((a: any) => a.individual_type === 'Principal') ?? false;

    const fetchIndividualsByType = useCallback(async (type: 'principal' | 'dependant') => {
        const { data, error } = await supabase
            .from('registry_individuals')
            .select('id, full_name, contact_details, relationships, employment_data, r_number')
            .order('full_name', { ascending: true });

        if (error) throw error;
        const all = data || [];
        const filtered = type === 'principal'
            ? all.filter(ind => isPrincipalIndividual(ind))
            : all.filter(ind => !isPrincipalIndividual(ind));
        setIndividuals(filtered);
        return filtered;
    }, []);

    const understudiesFetchRef = useRef<{ companyId: string; promise: Promise<void> } | null>(null);
    const fetchUnderstudies = useCallback(async (companyId: string) => {
        if (!companyId || companyId === 'unallocated') { setUnderstudies([]); return }
        if (understudiesFetchRef.current?.companyId === companyId) {
            return understudiesFetchRef.current.promise;
        }
        const fetchPromise = (async () => {
            const { data: companyData } = await supabase.from('acc_portal_company_duplicate').select('understudy').eq('id', companyId).single()
            const understudyList = companyData?.understudy || []
            const understudyIds = understudyList.map((u: any) => u.individual_id).filter((id: any) => id != null && /^\d+$/.test(String(id)))
            if (understudyIds.length) {
                const { data: inds } = await supabase.from('registry_individuals').select('id, full_name').in('id', understudyIds)
                setUnderstudies(inds || [])
            } else {
                setUnderstudies([])
            }
        })();
        understudiesFetchRef.current = { companyId, promise: fetchPromise };
        try {
            await fetchPromise;
        } finally {
            if (understudiesFetchRef.current?.promise === fetchPromise) {
                understudiesFetchRef.current = null;
            }
        }
    }, [])

    const fetchApplicantPhotoAndPassport = useCallback(async (individualId: number) => {
        setLoadingPhoto(true);
        setApplicantPhoto(null);
        try {
            const { data: docs, error } = await supabase
                .from('acc_portal_directors_documents')
                .select('document_id, file_path, extracted_details')
                .eq('director_id', individualId)
                .in('document_id', [PASSPORT_PHOTO_ID, CLEAR_PHOTO_ID, PASSPORT_DOCUMENT_ID]);

            if (error) throw error;

            const passportPhotoDoc = docs?.find(d => d.document_id === PASSPORT_PHOTO_ID);
            const clearPhotoDoc = docs?.find(d => d.document_id === CLEAR_PHOTO_ID);
            const photoDoc = passportPhotoDoc || clearPhotoDoc;
            if (photoDoc?.file_path) {
                const imageUrl = getSupabaseImageUrl(photoDoc.file_path);
                if (imageUrl) setApplicantPhoto(imageUrl);
            }

            const passportDocs = (docs || []).filter(d => d.document_id === PASSPORT_DOCUMENT_ID);
            if (passportDocs.length > 0) {
                // Helper function to get date_of_expiry in various formats
                const getExpiryDate = (details: any) => {
                    if (!details) return null;
                    // Check various key formats
                    return details.date_of_expiry ||
                        details.Date_of_expiry ||
                        details.Date_of_Expiry ||
                        details.dateOfExpiry ||
                        details.dateofexpiry ||
                        details['Date of Expiry'] ||
                        details['date of expiry'];
                };

                // Sort by date_of_expiry to get the latest passport
                const sortedDocs = [...passportDocs].sort((a, b) => {
                    const dateA = parseDateWithMonthName(getExpiryDate(a.extracted_details));
                    const dateB = parseDateWithMonthName(getExpiryDate(b.extracted_details));
                    if (!dateA || !dateB) return 0;
                    return dateB.getTime() - dateA.getTime(); // Descending order
                });

                if (sortedDocs[0]?.extracted_details?.passport_number) {
                    setFormData(prev => ({ ...prev, passport_number: sortedDocs[0].extracted_details.passport_number }));
                }
            }
        } catch (error) {
            console.error('Error fetching applicant photo/passport number:', error);
        } finally {
            setLoadingPhoto(false);
        }
    }, [getSupabaseImageUrl]);

    const resetForm = useCallback(() => {
        setFormData({
            job_description: '',
            department_id: '',
            subdepartment_id: '',
            class_id: '',
            officer_id: '',
            task_manager_id: '',
            task_assistant_id: '',
            enquiry_date: format(new Date(), 'dd/MM/yyyy'),
            passport_number: '',
            duration: '',
            renewal_status: 'New',
            passport_handling_mode: null as 'bcl' | 'client' | null,
            eta_purpose: null as 'tourism' | 'fresh_settlement' | 'resettlement' | null,
            eta_traveler_intent: null as 'visitor' | 'extend_or_change_status' | null,
            eta_ticket_confirmed: null as boolean | null,
            eta_tentative_arrival_date: '',
            eta_tentative_departure_date: '',
            eta_confirmed_ticket_expected_date: '',
            eta_return_ticket_is_real: null as boolean | null,
            job_level: {
                level: 1,
                department_id: null,
                subdepartment_id: null,
                class_id: null,
                subclass_id: null
            }
        })
        setSelectedIndividual(null)
        setEditableRNumber('')
        setRNumberUnallocated(false)
        setSelectedCompany('')
        setSelectedUnderstudy('')
        setUnderstudies([])
        setCompanies([])
        setJobAnswers({})
        setJobQuestions([])
        setSelectedDependants([])
        setIncludeDependants(false)
        setSelectedReferences([])
        setIncludeReferences(false)
        setApplicantPhoto(null)
        setExistingWorkflowSummary(null)
        setDuplicateTaskConflicts([])
        setSelectedJobLevelBundle(null)
        setWorkflowRestrictionSummary(null)
        setThirdPartySelections({})
        setCompanyIndividuals([])
    }, [])

    const normalizePassportKycDoc = (doc: any) => doc ? {
        ...doc,
        fields: (doc.fields || []).map((f: any) => ({
            ...f,
            name: f.name ?? f.fieldName,
            type: f.type ?? f.fieldType,
            required: f.required ?? f.isRequired,
        })),
    } : null;

    useEffect(() => {
        if (!open) return;
        setSubmitAttempted(false);
        if (kycDocuments instanceof Map) {
            setPassportKycDoc(normalizePassportKycDoc(kycDocuments.get(PASSPORT_DOCUMENT_ID) || null));
            return;
        }
        fetchAllKycFields().then(({ kycDocsMap }) => {
            setPassportKycDoc(normalizePassportKycDoc(kycDocsMap.get(PASSPORT_DOCUMENT_ID) || null));
        }).catch(err => console.error('Error loading passport document type:', err));
    }, [open, kycDocuments]);

    useEffect(() => {
        if (!open || !taskToEdit) {
            editDataLoadedRef.current = false;
            if (open && !taskToEdit) {
                resetForm();
            }
            return;
        }
        if (editDataLoadedRef.current || loadingStaff) {
            console.log('[EnquiryDialog] Skipping edit load — already loaded or staff still loading', { editDataLoaded: editDataLoadedRef.current, loadingStaff });
            return;
        }

        console.log('[EnquiryDialog] Loading edit data for taskToEdit:', {
            id: taskToEdit.id,
            job_description: taskToEdit.job_description,
            job_level: taskToEdit.job_level,
            individual_id: taskToEdit.individual_id,
            company_id: taskToEdit.company_id,
            applicant_details: taskToEdit.applicant_details,
            participants_details: taskToEdit.participants_details,
            job_specific_answers: taskToEdit.job_specific_answers,
            date_initiated: taskToEdit.date_initiated,
            renewal_status: taskToEdit.renewal_status,
            duration: taskToEdit.duration,
        });

        if (taskToEdit.participants_details) {
            console.log('[EnquiryDialog] Merging participants into staff arrays:', taskToEdit.participants_details);
            const existingOfficers = [...availableOfficers];
            const existingManagers = [...managersData];
            const existingAssistants = [...assistantsData];

            taskToEdit.participants_details.forEach(participant => {
                const role = participant.role?.includes('officer') ? 'officer' :
                    participant.role?.includes('task_manager') ? 'manager' :
                        participant.role?.includes('task_assistant') ? 'assistant' : null;

                const normalizedParticipant = {
                    id: participant.id,
                    full_name: participant.name,
                    name: participant.name,
                    assignments: role ? [{
                        role: role,
                        department_id: taskToEdit.job_level?.department_id || null,
                        subdepartment_id: taskToEdit.job_level?.subdepartment_id || null,
                        class_id: taskToEdit.job_level?.class_id || null,
                        subclass_id: taskToEdit.job_level?.subclass_id || null
                    }] : []
                };

                if (participant.role?.includes('officer')) {
                    if (!existingOfficers.find(o => o.id.toString() === (participant.id?.toString() || ''))) {
                        existingOfficers.push(normalizedParticipant);
                    }
                } else if (participant.role?.includes('task_manager')) {
                    if (!existingManagers.find(m => m.id.toString() === (participant.id?.toString() || ''))) {
                        existingManagers.push(normalizedParticipant);
                    }
                } else if (participant.role?.includes('task_assistant')) {
                    if (!existingAssistants.find(a => a.id.toString() === (participant.id?.toString() || ''))) {
                        existingAssistants.push(normalizedParticipant);
                    }
                }
            });

            setAvailableOfficers(existingOfficers);
            setManagersData(existingManagers);
            setAssistantsData(existingAssistants);
        }

        // 1. Basic Form Data
        const formPayload = {
            job_description: taskToEdit.job_description || '',
            department_id: String(taskToEdit.job_level?.department_id || ''),
            subdepartment_id: String(taskToEdit.job_level?.subdepartment_id || ''),
            class_id: String(taskToEdit.job_level?.class_id || ''),
            enquiry_date: resolveEnquiryDateForEdit(taskToEdit),
            passport_number: taskToEdit.passport_number || '',
            duration: taskToEdit.duration || '',
            renewal_status: taskToEdit.renewal_status || 'New',
            passport_handling_mode: taskToEdit.passport_handling_mode || null,
            eta_purpose: taskToEdit.eta_purpose || null,
            eta_traveler_intent: taskToEdit.eta_traveler_intent || null,
            eta_ticket_confirmed: taskToEdit.eta_ticket_confirmed ?? null,
            eta_tentative_arrival_date: taskToEdit.eta_tentative_arrival_date || '',
            eta_tentative_departure_date: taskToEdit.eta_tentative_departure_date || '',
            eta_confirmed_ticket_expected_date: taskToEdit.eta_confirmed_ticket_expected_date || '',
            eta_return_ticket_is_real: taskToEdit.eta_return_ticket_is_real ?? null,
            officer_id: taskToEdit.participants_details?.find(p => p.role?.includes('officer'))?.id?.toString() || '',
            task_manager_id: taskToEdit.participants_details?.find(p => p.role?.includes('task_manager'))?.id?.toString() || '',
            task_assistant_id: taskToEdit.participants_details?.find(p => p.role?.includes('task_assistant'))?.id?.toString() || '',
        };
        console.log('[EnquiryDialog] Step 1 - setFormData:', formPayload);
        setFormData(formPayload);
        console.log('[EnquiryDialog] Step 2 - setJobAnswers:', taskToEdit.job_specific_answers);
        setJobAnswers(taskToEdit.job_specific_answers || {});
        console.log('[EnquiryDialog] Step 3 - setApplicantType:', taskToEdit.applicant_details?.role || 'principal');
        setApplicantType(taskToEdit.applicant_details?.role || 'principal');
        if (taskToEdit.individual_id) {
            const companyParticipant = taskToEdit.participants_details?.find(p => p.type === 'company');
            const companyId = companyParticipant ? String(companyParticipant.id) : null;
            console.log('[EnquiryDialog] Step 4 - fetching individual id:', taskToEdit.individual_id, 'companyId:', companyId);

            supabase.from('registry_individuals').select('*').eq('id', taskToEdit.individual_id).single()
                .then(async ({ data: indData }) => {
                    console.log('[EnquiryDialog] Step 4 - individual fetched from Supabase:', indData);
                    if (!indData) return;

                    await handleIndividualSelect(indData);
                    if (companyId) {
                        setSelectedCompany(companyId);
                        await fetchUnderstudies(companyId);
                        const understudyPart = taskToEdit.participants_details?.find(p => p.role?.includes('understudy'));
                        console.log('[EnquiryDialog] Step 4 - understudy participant:', understudyPart);
                        if (understudyPart) setSelectedUnderstudy(String(understudyPart.id));
                    }
                });
        }
        const sponsorPart = taskToEdit.participants_details?.find(p => p.role?.includes('sponsor'));
        console.log('[EnquiryDialog] Step 5 - sponsor participant:', sponsorPart);
        if (sponsorPart) {
            setSelectedSponsor({ id: sponsorPart.id, full_name: sponsorPart.name });
        }
        editDataLoadedRef.current = true;
    }, [open, taskToEdit, loadingStaff]);

    const isJobAnswerFilled = useCallback((q: JobQuestion): boolean => {
        const val = jobAnswers[q.id];
        if (q.type === 'boolean') return val === true || val === false;
        if (q.type === 'multiselect') return Array.isArray(val) && val.length > 0;
        if (val === undefined || val === null) return false;
        if (typeof val === 'string') return val.trim() !== '';
        return true;
    }, [jobAnswers]);

    const checkVisibility = useCallback((q: JobQuestion) => {
        if (!q.depends_on || !q.depends_on.id) return true;

        const parentVal = jobAnswers[q.depends_on.id];
        const targetVal = q.depends_on.value;

        switch (q.depends_on.operator) {
            case 'equals':
                return String(parentVal) === String(targetVal);
            case 'not_equals':
                return String(parentVal) !== String(targetVal);
            case 'is_not_empty':
                if (Array.isArray(parentVal)) return parentVal.length > 0;
                return parentVal !== undefined && parentVal !== null && parentVal !== '';
            case 'is_empty':
                if (Array.isArray(parentVal)) return parentVal.length === 0;
                return parentVal === undefined || parentVal === null || parentVal === '';
            default:
                return true;
        }
    }, [jobAnswers]);

    // Auto-assignment logic - triggers when any question answer changes
    const handleAutoAssignment = useCallback((changedQuestionId: string, newValue: any) => {
        // Find all questions that depend on the changed question
        const dependentQuestions = jobQuestions.filter(q =>
            q.depends_on?.id === changedQuestionId &&
            q.depends_on?.auto_assign_value
        );

        if (dependentQuestions.length === 0) return;

        const newAnswers = { ...jobAnswers };
        let hasChanges = false;

        dependentQuestions.forEach(q => {
            const parentVal = newValue;
            const targetVal = q.depends_on?.value;
            const assignValue = q.depends_on?.auto_assign_value;

            if (!assignValue) return;

            let shouldAssign = false;

            switch (q.depends_on?.operator) {
                case 'equals':
                    shouldAssign = String(parentVal) === String(targetVal);
                    break;
                case 'not_equals':
                    shouldAssign = String(parentVal) !== String(targetVal);
                    break;
                case 'is_not_empty':
                    if (Array.isArray(parentVal)) {
                        shouldAssign = parentVal.length > 0;
                    } else {
                        shouldAssign = parentVal !== undefined && parentVal !== null && parentVal !== '';
                    }
                    break;
                case 'is_empty':
                    if (Array.isArray(parentVal)) {
                        shouldAssign = parentVal.length === 0;
                    } else {
                        shouldAssign = parentVal === undefined || parentVal === null || parentVal === '';
                    }
                    break;
            }

            if (shouldAssign) {
                newAnswers[q.id] = assignValue;
                hasChanges = true;
            }
        });

        if (hasChanges) {
            setJobAnswers(newAnswers);
        }
    }, [jobQuestions, jobAnswers]);

    const groupedQuestions = useMemo(() => {
        const visible = jobQuestions.filter(q => checkVisibility(q));
        return visible.reduce((acc, q) => {
            const cat = q.category || "General Requirements";
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(q);
            return acc;
        }, {} as Record<string, JobQuestion[]>);
    }, [jobQuestions, checkVisibility]);


    const fetchJobQuestions = useCallback(async (levelObj: any) => {
        setLoadingQuestions(true)
        try {
            const { data } = await supabase
                .from('tm_class_requirements')
                .select('job_specific_questions')
                .contains('job_level', levelObj)
                .maybeSingle()

            if (data?.job_specific_questions) {
                setJobQuestions(data.job_specific_questions as JobQuestion[])
                // Set defaults only if not in edit mode (preserve existing answers)
                setJobAnswers(prevAnswers => {
                    if (taskToEdit && Object.keys(prevAnswers).length > 0) {
                        // In edit mode with existing answers, preserve them
                        return prevAnswers;
                    }
                    // Set defaults for new enquiry
                    const initial: any = {}
                    data.job_specific_questions.forEach((q: any) => {
                        if (q.default_value) initial[q.id] = q.default_value
                    })
                    return initial;
                })
            } else {
                setJobQuestions([])
            }
        } finally {
            setLoadingQuestions(false)
        }
    }, [taskToEdit])

    useEffect(() => {
        if (!formData.department_id) return
        const levelObj = {
            department_id: Number(formData.department_id),
            subdepartment_id: formData.subdepartment_id ? Number(formData.subdepartment_id) : null,
            class_id: formData.class_id ? Number(formData.class_id) : null,
            level: formData.class_id ? 3 : formData.subdepartment_id ? 2 : 1
        }
        fetchJobQuestions(levelObj)
    }, [formData.department_id, formData.subdepartment_id, formData.class_id, fetchJobQuestions])

    // Load Sponsors if Subdepartment is 26
    useEffect(() => {
        if (formData.subdepartment_id === SPONSOR_SUBDEPT_ID) {
            supabase.from('registry_individuals')
                .select('id, full_name')
                .order('full_name')
                .then(({ data }) => setSponsors(data || []))
        }
    }, [formData.subdepartment_id])

    // Load company individuals for third-party selection
    useEffect(() => {
        if (!selectedCompany) { setCompanyIndividuals([]); return; }
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from('registry_individuals')
                .select('id, full_name, employment_data')
                .order('full_name', { ascending: true });
            if (error || cancelled) return;
            const scoped = (data || [])
                .map((ind: any) => {
                    const associations = (ind.employment_data?.associations || []).filter(
                        (a: any) => String(a.company_id) === String(selectedCompany)
                    );
                    return associations.length > 0 ? { ...ind, associations } : null;
                })
                .filter(Boolean);
            if (!cancelled) setCompanyIndividuals(scoped);
        })();
        return () => { cancelled = true; };
    }, [selectedCompany])

    // Restore third-party selections from edit data
    useEffect(() => {
        if (!taskToEdit || !jobQuestions.length || !editDataLoadedRef.current) return;
        const tpQuestions = jobQuestions.filter(q => q.third_party_role);
        if (tpQuestions.length === 0) return;
        const restored: Record<string, string> = {};
        tpQuestions.forEach(q => {
            if (jobAnswers[q.id] === true || jobAnswers[q.id] === 'true') {
                const participant = taskToEdit.participants_details?.find(
                    (p: any) => p.role?.includes(q.third_party_role) && p.type === 'individual'
                );
                if (participant) {
                    restored[q.id] = String(participant.id);
                }
            }
        });
        if (Object.keys(restored).length > 0) {
            setThirdPartySelections(prev => ({ ...prev, ...restored }));
        }
    }, [taskToEdit, jobQuestions, jobAnswers, companyIndividuals])

    const loadStaffData = useCallback(async () => {
        setLoadingStaff(true);
        try {
            const unifiedUserData = await userService.getAllUserData({ payrollAccess: true }, departments);
            setManagersData(unifiedUserData.managers || []);
            setAssistantsData(unifiedUserData.assistants || []);

            if (unifiedUserData.officers && unifiedUserData.officers.length > 0) {
                setAvailableOfficers(unifiedUserData.officers);
                setAllOfficers(unifiedUserData.officers);
            }
        } catch (error) {
            console.error('EnquiryDialog: Failed to load staff data:', error);
            toast({
                title: "Error",
                description: "Failed to load staff data",
                variant: "destructive"
            });
        } finally {
            setLoadingStaff(false);
        }
    }, [departments]);

    useEffect(() => {
        if (userData && userData.allUsers && userData.allUsers.length > 0) {
            setAllOfficers(userData.officers || []);
            setAvailableOfficers(userData.officers || []);
            setManagersData(userData.managers || []);
            setAssistantsData(userData.assistants || []);
        }
        else if (open) {
            loadStaffData();
        }
    }, [open, userData, loadStaffData]);

    useEffect(() => {
        if (open) {
            setSearchLoading(true)
            fetchIndividualsByType(applicantType)
                .finally(() => setSearchLoading(false))
        }
    }, [open, applicantType, fetchIndividualsByType])

    useEffect(() => {
        const updateInheritedOfficer = async () => {
            if (formData.subdepartment_id && formData.department_id) {
                const inheritedOfficer = await getInheritedOfficerForSubdepartment(formData.subdepartment_id);
                if (inheritedOfficer && !formData.officer_id) {
                    setFormData(prev => ({
                        ...prev,
                        officer_id: inheritedOfficer.id.toString()
                    }));
                }
            }
        };

        updateInheritedOfficer();
    }, [formData.subdepartment_id, formData.department_id, formData.officer_id]);

    useEffect(() => {
        if (!allOfficers || !Array.isArray(allOfficers) || allOfficers.length === 0) {
            setAvailableOfficers([]);
            return;
        }
        let filteredOfficers = [];
        let inheritanceUsed = false;

        if (formData.subdepartment_id) {
            const subdeptOfficers = allOfficers.filter(officer => {
                if (!officer.assignments || !Array.isArray(officer.assignments)) return false;
                return officer.assignments.some(assignment =>
                    assignment.role === 'officer' &&
                    assignment.department_id === parseInt(formData.department_id) &&
                    assignment.subdepartment_id === parseInt(formData.subdepartment_id) &&
                    !assignment.end_date
                );
            });
            if (subdeptOfficers.length > 0) {
                filteredOfficers = subdeptOfficers;
            } else {
                filteredOfficers = allOfficers.filter(officer => {
                    if (!officer.assignments || !Array.isArray(officer.assignments)) return false;
                    return officer.assignments.some(assignment =>
                        assignment.role === 'officer' &&
                        assignment.department_id === parseInt(formData.department_id) &&
                        !assignment.subdepartment_id &&
                        !assignment.end_date
                    );
                });
                inheritanceUsed = true;
            }
        } else if (formData.department_id) {
            filteredOfficers = allOfficers.filter(officer => {
                if (!officer.assignments || !Array.isArray(officer.assignments)) return false;
                return officer.assignments.some(assignment =>
                    assignment.role === 'officer' &&
                    assignment.department_id === parseInt(formData.department_id) &&
                    !assignment.end_date
                );
            });
        } else {
            filteredOfficers = [];
        }
        setAvailableOfficers(filteredOfficers);
        if (formData.officer_id && !filteredOfficers.find(o => o.id.toString() === formData.officer_id)) {
            setFormData(prev => ({ ...prev, officer_id: '' }));
        }
    }, [formData.department_id, formData.subdepartment_id, allOfficers, formData.officer_id]);

    useEffect(() => {
        if (!open) return;
        fetchAllCompanies().catch((error) => {
            console.error('Error fetching companies:', error);
            toast({ title: "Load Failed", description: "Failed to load companies.", variant: "destructive" });
        });
    }, [open, fetchAllCompanies])

    // New-enquiry reset only — deliberately skipped while editing an existing task. Without
    // the `!taskToEdit` guard this fired on the SAME open as the edit-load effect above (both
    // are keyed on `open`, and this one is declared later, so it always ran after) — and since
    // the edit-load effect's own Step 3 (`setApplicantType`) changes `applicantType` on every
    // edit whose applicant isn't already 'principal', this effect's dependency array picked
    // that up too, re-firing it and wiping the Designated Sponsor / Related Understudy (and
    // selectedIndividual/selectedCompany) the edit-load effect had just restored.
    useEffect(() => {
        if (open && !taskToEdit) {
            setSelectedIndividual(null)
            setSelectedCompany('')
            setSelectedUnderstudy('')
            setUnderstudies([])
            setCompanies([])
            setAvailableDependants([])
            setSelectedDependants([])
            setIncludeDependants(false)
            setAvailableReferences([])
            setSelectedReferences([])
            setIncludeReferences(false)
            setPrincipalForDependant(null)
            setApplicantPhoto(null)
            setSelectedSponsor(null)
            setSelectedRelatedDocumentId('')
            setAvailableRelatedDocuments([])
        }
    }, [applicantType, open, taskToEdit])

    const handleIndividualSelect = useCallback(async (ind: Individual) => {
        setLoadingRelations(true)
        setSelectedIndividual(ind)
        setRNumberUnallocated(ind?.r_number === 'Unallocated')
        setEditableRNumber(ind?.r_number === 'Unallocated' ? '' : (ind?.r_number || ''))
        setCompanies([]); setSelectedCompany('')
        setUnderstudies([]); setSelectedUnderstudy('')
        setAvailableDependants([]); setSelectedDependants([]); setIncludeDependants(false)
        setAvailableReferences([]); setSelectedReferences([]); setIncludeReferences(false)
        setPrincipalForDependant(null)
        setSelectedRelatedDocumentId(''); setAvailableRelatedDocuments([])
        fetchApplicantPhotoAndPassport(ind.id);

        setLoadingRelatedDocuments(true)
        fetchIndividualDocumentsForLinking(ind.id)
            .then((docs) => {
                setAvailableRelatedDocuments(docs)
                // Resettlement is the one ETA purpose with prior immigration-status history to
                // detect — Tourism/Fresh Settlement never have any, so those stay a manual pick.
                // Skipped in edit mode so it doesn't clobber a previously saved purpose.
                if (!taskToEdit) {
                    setFormData(prev => ({ ...prev, eta_purpose: docs.length > 0 ? 'resettlement' : null }))
                }
            })
            .finally(() => setLoadingRelatedDocuments(false))

        const promises = []
        promises.push(
            supabase.from('registry_individuals').select('references').eq('id', ind.id).single()
                .then(({ data }) => {
                    const refIds = (data?.references || [])
                        .map((r: any) => String(r.id || '').replace(/^ref_/, ''))
                        .filter((id: string) => id !== '' && /^\d+$/.test(id))
                    return refIds.length ? supabase.from('registry_individuals').select('id, full_name').in('id', refIds) : { data: [] }
                })
        )

        const getCompaniesForInd = async (target: Individual) => {
            const associations = target.employment_data?.associations || []
            const validIds = associations.filter(a => a.individual_type === 'Principal' && a.company_id).map(a => a.company_id)
            const hasUnallocated = validIds.some(id => String(id) === 'unallocated')
            const realIds = validIds.filter(id => String(id) !== 'unallocated')
            
            const { data: realCompanies } = realIds.length 
                ? await supabase.from('acc_portal_company_duplicate').select('id, company_name, understudy').in('id', realIds)
                : { data: [] }
            
            const unallocatedEntry = hasUnallocated ? [{ id: 'unallocated', company_name: 'Unallocated', understudy: [] }] : []
            return { data: [...unallocatedEntry, ...(realCompanies || [])] }
        }

        if (isPrincipalIndividual(ind)) {
            promises.push(getCompaniesForInd(ind).then(res => ({ type: 'companies', data: res.data })))
            if (ind.relationships?.length) {
                const familyIds = ind.relationships.map(r => r.individual_id).filter((id: any) => id != null && /^\d+$/.test(String(id)))
                if (familyIds.length) {
                    promises.push(supabase.from('registry_individuals').select('id, full_name').in('id', familyIds).then(res => ({ type: 'family', data: res.data })))
                }
            }
        } else {
            const principalRel = ind.relationships?.find(r => r.is_principal === true || r.isPrincipal === 'Yes' || ['principal', 'husband', 'wife', 'father', 'mother'].includes(r.relationship?.toLowerCase()))
            if (principalRel) {
                promises.push(
                    supabase.from('registry_individuals').select('id, full_name, employment_data').eq('id', principalRel.individual_id).single()
                        .then(async ({ data: principal }) => {
                            if (principal) {
                                const comps = await getCompaniesForInd(principal)
                                return { type: 'principal_member', data: principal, companies: comps.data }
                            }
                            return null
                        })
                )
            }
        }

        try {
            const results = await Promise.all(promises)
            if (results[0]?.data) setAvailableReferences(results[0].data)

            let fetchedCompanies: any[] = []
            results.forEach(res => {
                if (res?.type === 'companies') {
                    fetchedCompanies = res.data || []
                    setCompanies(fetchedCompanies)
                }
                if (res?.type === 'family') {
                    setAvailableDependants(res.data.map(f => {
                        const rel = ind.relationships?.find(r => r.individual_id === f.id)
                        return { ...f, relationship_type: rel?.relationship || 'Family' }
                    }))
                }
                if (res?.type === 'principal_member') {
                    setPrincipalForDependant(res.data)
                    fetchedCompanies = res.companies || []
                    setCompanies(fetchedCompanies)
                    setAvailableDependants([{ ...res.data, relationship_type: 'Principal Member' }])
                    setIncludeDependants(true)
                    setSelectedDependants([res.data.id.toString()])
                }
            })

            // Auto-select company if only one option or if unallocated
            if (fetchedCompanies.length === 1) {
                setSelectedCompany(fetchedCompanies[0].id.toString())
                fetchUnderstudies(fetchedCompanies[0].id.toString())
            }
        } finally {
            setLoadingRelations(false)
            setIsIndividualPopoverOpen(false)
        }
    }, [fetchApplicantPhotoAndPassport, taskToEdit])

    const handleCompanyChange = (value: string) => {
        setSelectedCompany(value)
        fetchUnderstudies(value)
    }

    useEffect(() => {
        let cancelled = false;

        if (!open || !selectedIndividual?.id) {
            setExistingWorkflowSummary(null);
            return;
        }

        detectExistingWorkflowForIndividual(selectedIndividual.id)
            .then((workflowSummary) => {
                if (!cancelled) setExistingWorkflowSummary(workflowSummary);
            })
            .catch((error) => {
                console.error("[EnquiryDialog] workflow summary check failed", error);
                if (!cancelled) setExistingWorkflowSummary(null);
            });

        return () => {
            cancelled = true;
        };
    }, [open, selectedIndividual?.id]);

    useEffect(() => {
        let cancelled = false;

        const checkJobLevelState = async () => {
            if (!open || !selectedIndividual?.id || !formData.department_id) {
                setDuplicateTaskConflicts([]);
                setSelectedJobLevelBundle(null);
                setWorkflowRestrictionSummary(null);
                return;
            }

            setCheckingWorkflow(true);
            try {
                const selectedJobLevel = {
                    level: formData.class_id ? 3 : formData.subdepartment_id ? 2 : 1,
                    department_id: formData.department_id ? Number(formData.department_id) : null,
                    subdepartment_id: formData.subdepartment_id ? Number(formData.subdepartment_id) : null,
                    class_id: formData.class_id ? Number(formData.class_id) : null,
                    subclass_id: null,
                };

                const bundle = await taskBundleService.fetchForJobLevel(selectedJobLevel);
                const restrictionSummary = evaluateWorkflowRestrictionsForBundle(existingWorkflowSummary?.workflowLogs || [], bundle);

                const conflicts = await detectTaskConflictsForJobLevel(selectedIndividual.id, {
                    ...selectedJobLevel,
                });

                if (!cancelled) {
                    const filteredConflicts = taskToEdit
                        ? conflicts.filter((task: any) => String(task.id) !== String(taskToEdit.id))
                        : conflicts;
                    setSelectedJobLevelBundle(bundle);
                    setWorkflowRestrictionSummary(restrictionSummary);
                    setDuplicateTaskConflicts(filteredConflicts);
                }
            } catch (error) {
                console.error("[EnquiryDialog] workflow/task conflict check failed", error);
                if (!cancelled) {
                    setDuplicateTaskConflicts([]);
                    setSelectedJobLevelBundle(null);
                    setWorkflowRestrictionSummary(null);
                }
            } finally {
                if (!cancelled) setCheckingWorkflow(false);
            }
        };

        checkJobLevelState();
        return () => {
            cancelled = true;
        };
    }, [open, selectedIndividual?.id, formData.department_id, formData.subdepartment_id, formData.class_id, taskToEdit?.id, existingWorkflowSummary]);

    useEffect(() => {
        if (!open) return;

        const reloadSelectedIndividual = async (individualId?: number | string | null) => {
            if (!individualId) return;

            const { data, error } = await supabase
                .from('registry_individuals')
                .select('id, full_name, contact_details, relationships, employment_data, r_number')
                .eq('id', individualId)
                .single();

            if (!error && data) {
                await handleIndividualSelect(data);
            }
        };

        const individualChannel = supabase
            .channel(`enquiry-registry-individuals:${applicantType}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'registry_individuals'
            }, async (payload) => {
                await fetchIndividualsByType(applicantType);

                const changedId = payload.new?.id || payload.old?.id;
                if (selectedIndividual?.id && String(changedId) === String(selectedIndividual.id)) {
                    await reloadSelectedIndividual(selectedIndividual.id);
                }
            })
            .subscribe();

        const companyChannel = supabase
            .channel('enquiry-company-duplicate')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'acc_portal_company_duplicate'
            }, async (payload) => {
                await fetchAllCompanies();

                const changedCompanyId = payload.new?.id || payload.old?.id;
                const isRelevantCompany = selectedIndividual && (
                    String(changedCompanyId) === String(selectedCompany) ||
                    companies.some(c => String(c.id) === String(changedCompanyId))
                );
                if (isRelevantCompany) {
                    await reloadSelectedIndividual(selectedIndividual.id);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(individualChannel);
            supabase.removeChannel(companyChannel);
        };
    }, [open, applicantType, selectedIndividual, selectedCompany, companies, fetchIndividualsByType, fetchAllCompanies, handleIndividualSelect]);

    // --- New Handler: Clear Company Selection ---
    const handleClearCompany = () => {
        setSelectedCompany('');
        setUnderstudies([]);
        setSelectedUnderstudy('');
    }

    const resetCompanyCreationState = useCallback(() => {
        setNewCompanyName('');
        setCompanyCategories(createInitialCompanyCategories());
    }, []);

    const handleOpenCompanyCreateDialog = useCallback((companyName: string) => {
        setNewCompanyName(companyName);
        setShowCompanyCreateDialog(true);
    }, []);

    const handleCompanyCategoryChange = useCallback((category: string, field: 'isActive' | 'wef' | 'to', value: any) => {
        setCompanyCategories(prev => ({
            ...prev,
            [category]: {
                ...prev[category],
                [field]: value
            }
        }));
    }, []);

    const handleCreateCompany = useCallback(async () => {
        const trimmedName = newCompanyName.trim();
        if (!trimmedName) {
            toast({ title: "Missing Company Name", description: "Please provide a company name.", variant: "destructive" });
            return;
        }

        setAssociationLoading(true);
        try {
            const payload = {
                company_name: trimmedName,
                ...Object.keys(companyCategories).reduce((acc, category) => {
                    const categoryData = companyCategories[category];
                    if (categoryData?.isActive) {
                        acc[`${category.toLowerCase()}_client_effective_from`] = categoryData.wef || '01/01/2000';
                        acc[`${category.toLowerCase()}_client_effective_to`] = categoryData.to || '01/01/2000';
                    }
                    return acc;
                }, {} as Record<string, string>)
            };

            const { data, error } = await supabase
                .from('acc_portal_company_duplicate')
                .insert(payload)
                .select('id, company_name, understudy')
                .single();

            if (error) throw error;

            const nextCompanies = [...allCompanies, data].sort((a, b) =>
                (a.company_name || '').localeCompare(b.company_name || '')
            );
            setAllCompanies(nextCompanies);
            setNewAssociationData(prev => ({ ...prev, company_id: String(data.id) }));
            setCompanySearchTerm(data.company_name || '');

            toast({
                title: "Company Created",
                description: `Successfully created "${trimmedName}".`,
                variant: "success"
            });

            setShowCompanyCreateDialog(false);
            resetCompanyCreationState();
        } catch (error) {
            console.error('Error creating company:', error);
            toast({
                title: "Creation Failed",
                description: error.message || "Failed to create company.",
                variant: "destructive"
            });
        } finally {
            setAssociationLoading(false);
        }
    }, [newCompanyName, companyCategories, allCompanies, resetCompanyCreationState]);

    useEffect(() => {
        if (!showCompanyAssociationDialog) {
            setCompanySearchTerm('');
            setNewAssociationData({
                individual_type: '',
                company_id: '',
                effective_start_date: '',
                effective_end_date: '',
                shares_held: ''
            });
        }
    }, [showCompanyAssociationDialog]);

    useEffect(() => {
        if (!newAssociationData.company_id || newAssociationData.company_id === 'unallocated') return;
        const selected = allCompanies.find(company => String(company.id) === String(newAssociationData.company_id));
        if (selected?.company_name) {
            setCompanySearchTerm(selected.company_name);
        }
    }, [newAssociationData.company_id, allCompanies]);

    // --- New Handler: Create Company Association ---
    const handleCreateCompanyAssociation = async () => {
        if (!selectedIndividual || !newAssociationData.individual_type || !newAssociationData.company_id) {
            toast({ title: "Missing Information", description: "Please fill in all required fields.", variant: "destructive" });
            return;
        }

        setAssociationLoading(true);
        try {
            const associationPayload = {
                individual_type: newAssociationData.individual_type,
                company_id: newAssociationData.company_id === 'unallocated' ? null : String(newAssociationData.company_id),
                is_current: true,
                role: ['Director', 'Employee', 'Shareholder'].includes(newAssociationData.individual_type)
                    ? newAssociationData.individual_type
                    : undefined,
            };

            // Add effective dates for applicable roles
            if (['Principal', 'Director', 'Employee', 'Shareholder'].includes(newAssociationData.individual_type)) {
                if (newAssociationData.effective_start_date) {
                    associationPayload.effective_start_date = newAssociationData.effective_start_date;
                }
                if (newAssociationData.effective_end_date) {
                    associationPayload.effective_end_date = newAssociationData.effective_end_date;
                }
            }

            // Add shares held for shareholders
            if (newAssociationData.individual_type === 'Shareholder' && newAssociationData.shares_held) {
                associationPayload.shares_held = parseInt(newAssociationData.shares_held, 10);
            }

            // Call the RPC function to add association
            const { error: rpcError } = await supabase.rpc('add_individual_association', {
                p_individual_id: selectedIndividual.id,
                p_new_association: associationPayload
            });

            if (rpcError) throw rpcError;

            // Refresh the individual's data to get updated companies
            await handleIndividualSelect(selectedIndividual);

            // If the newly associated company is not 'unallocated', update the selected company
            if (newAssociationData.company_id !== 'unallocated') {
                setSelectedCompany(newAssociationData.company_id);
                // Fetch understudies for the newly associated company
                await fetchUnderstudies(newAssociationData.company_id);
            }

            toast({
                title: "Association Created",
                description: `Successfully linked ${selectedIndividual.full_name} to the company.`,
                variant: "success"
            });

            // Close dialog and reset form
            setShowCompanyAssociationDialog(false);
            setNewAssociationData({
                individual_type: '',
                company_id: '',
                effective_start_date: '',
                effective_end_date: '',
                shares_held: ''
            });

        } catch (error) {
            console.error('Error creating association:', error);
            toast({
                title: "Association Failed",
                description: error.message || "Failed to create company association.",
                variant: "destructive"
            });
        } finally {
            setAssociationLoading(false);
        }
    }

    const clientIdentificationErrors = useMemo(() => {
        const errors: Record<string, string> = {};
        if (!selectedIndividual) errors.primary_applicant = "Select the primary applicant.";
        if (!selectedCompany) errors.company = 'Select a company, or choose "Unallocated".';
        if (applicantType === 'dependant' && !principalForDependant) errors.linked_principal = "Select the linked principal for this dependant.";
        if (formData.class_id === CLASS_D_ID && !selectedUnderstudy) errors.understudy = "Select the related understudy.";
        if (formData.subdepartment_id === SPONSOR_SUBDEPT_ID && !selectedSponsor) errors.sponsor = "Select a designated sponsor.";
        return errors;
    }, [selectedIndividual, selectedCompany, applicantType, principalForDependant, formData.class_id, selectedUnderstudy, formData.subdepartment_id, selectedSponsor]);

    const handleSubmit = async () => {
        setSubmitAttempted(true);
        if (!taskToEdit && Object.keys(clientIdentificationErrors).length > 0) {
            toast({
                title: "Missing required fields",
                description: "Complete every required field in Client Identification before saving.",
                variant: "destructive"
            });
            return;
        }

        if (!selectedIndividual || !formData.department_id) return

        if (!taskToEdit && duplicateTaskConflicts.length > 0) {
            toast({
                title: "Duplicate task detected",
                description: "An active task already exists for this applicant and selected job level.",
                variant: "destructive"
            })
            return
        }

        if (!taskToEdit && workflowRestrictionSummary?.hasBlockingWorkflow) {
            toast({
                title: "Workflow restriction detected",
                description: "The related document workflow is in a blocking state for this job level.",
                variant: "destructive"
            })
            return
        }

        if (formData.enquiry_date && !/^\d{2}\/\d{2}\/\d{4}$/.test(formData.enquiry_date)) {
            toast({
                title: "Invalid Enquiry Date",
                description: "Enter the Enquiry Date as DD/MM/YYYY, or pick one from the calendar.",
                variant: "destructive"
            })
            return
        }

        setLoading(true)
        try {
            const normalizedEnquiryDate = normalizeEnquiryDateForStorage(formData.enquiry_date);
            const participants: any[] = []

            // Sync linked question answers to direct columns
            let syncedDuration = formData.duration;
            let syncedRenewalStatus = formData.renewal_status;

            jobQuestions.forEach(q => {
                if (q.linkedToColumn && jobAnswers[q.id]) {
                    if (q.linkedToColumn === 'duration') {
                        syncedDuration = jobAnswers[q.id];
                    } else if (q.linkedToColumn === 'renewal_status') {
                        syncedRenewalStatus = jobAnswers[q.id];
                    }
                }
            });

            // Extract Participant Details
            if (selectedCompany === 'unallocated') {
                participants.push({ id: 'unallocated', name: 'Unallocated', role: ['company'], type: "company" })
            } else if (selectedCompany) {
                const c = companies.find(x => x.id.toString() === selectedCompany)
                if (c) participants.push({ id: c.id, name: c.company_name, role: ['company'], type: "company" })
            }
            // 2. Understudy (Specific to Class D)
            if (selectedUnderstudy && formData.class_id === CLASS_D_ID) {
                const u = understudies.find(x => x.id.toString() === selectedUnderstudy)
                if (u) participants.push({ id: u.id, name: u.full_name, role: ['understudy'], type: "individual" })
            }

            // 3. Selected Dependants (If Principal is applicant)
            if (applicantType === 'principal' && selectedDependants.length > 0) {
                selectedDependants.forEach(depId => {
                    const dep = availableDependants.find(d => d.id.toString() === depId);
                    if (dep) {
                        participants.push({
                            id: dep.id,
                            name: dep.full_name,
                            role: ['dependant', dep.relationship_type?.toLowerCase()],
                            type: "individual"
                        });
                    }
                });
            }

            // 4. Principal Link (If Dependant is applicant)
            if (applicantType === 'dependant' && principalForDependant) {
                participants.push({
                    id: principalForDependant.id,
                    name: principalForDependant.full_name,
                    role: ['principal'],
                    type: "individual"
                });
            }
            // Explicitly persisting 'none' as an "Unallocated" participant (same convention as
            // the company block above) — otherwise the .find() below never matches 'none',
            // nothing gets pushed, and the next edit-load can't tell "explicitly Unallocated"
            // apart from "never assigned" (both read back as officer_id === '').
            if (formData.officer_id === 'none') {
                participants.push({ id: 'none', name: 'Unallocated', role: ['officer'], type: "individual" });
            } else if (formData.officer_id) {
                const officer = availableOfficers.find(o => o.id.toString() === formData.officer_id);
                if (officer) participants.push({ id: officer.id, name: officer.full_name || officer.name, role: ['officer'], type: "individual" });
            }
            if (formData.task_manager_id === 'none') {
                participants.push({ id: 'none', name: 'Unallocated', role: ['task_manager'], type: "individual" });
            } else if (formData.task_manager_id) {
                const manager = managersData.find(m => m.id.toString() === formData.task_manager_id);
                if (manager) participants.push({ id: manager.id, name: manager.full_name || manager.name, role: ['task_manager'], type: "individual" });
            }
            if (formData.task_assistant_id === 'none') {
                participants.push({ id: 'none', name: 'Unallocated', role: ['task_assistant'], type: "individual" });
            } else if (formData.task_assistant_id) {
                const assistant = assistantsData.find(a => a.id.toString() === formData.task_assistant_id);
                if (assistant) participants.push({ id: assistant.id, name: assistant.full_name || assistant.name, role: ['task_assistant'], type: "individual" });
            }
            if (formData.subdepartment_id === SPONSOR_SUBDEPT_ID && selectedSponsor) {
                participants.push({ id: selectedSponsor.id, name: selectedSponsor.full_name, role: ['sponsor'], type: "individual" })
            }

            jobQuestions.forEach(q => {
                if (q.third_party_role && thirdPartySelections[q.id]) {
                    const selectedInd = companyIndividuals.find(ind => String(ind.id) === String(thirdPartySelections[q.id]));
                    if (selectedInd) {
                        const roles = [q.third_party_role];
                        (q.entityTypes || []).forEach(et => {
                            if (!roles.includes(et)) roles.push(et);
                        });
                        participants.push({
                            id: selectedInd.id,
                            name: selectedInd.full_name,
                            role: roles,
                            type: "individual"
                        });
                    }
                }
            });

            const payload: any = {
                job_description: formData.job_description,
                individual_id: selectedIndividual.id,
                passport_number: formData.passport_number,
                duration: syncedDuration,
                renewal_status: syncedRenewalStatus,
                passport_handling_mode: formData.passport_handling_mode || null,
                eta_purpose: formData.eta_purpose || null,
                eta_traveler_intent: formData.eta_purpose === 'tourism' ? 'visitor' : (formData.eta_traveler_intent || null),
                eta_ticket_confirmed: formData.eta_ticket_confirmed,
                eta_tentative_arrival_date: formData.eta_ticket_confirmed ? null : (formData.eta_tentative_arrival_date || null),
                eta_tentative_departure_date: formData.eta_ticket_confirmed ? null : (formData.eta_tentative_departure_date || null),
                eta_confirmed_ticket_expected_date: formData.eta_ticket_confirmed ? null : (formData.eta_confirmed_ticket_expected_date || null),
                eta_return_ticket_is_real: formData.eta_ticket_confirmed ? formData.eta_return_ticket_is_real : null,
                applicant_details: {
                    id: selectedIndividual.id,
                    name: selectedIndividual.full_name,
                    role: applicantType,
                    type: "individual"
                },
                job_level: {
                    level: formData.class_id ? 3 : formData.subdepartment_id ? 2 : 1,
                    department_id: Number(formData.department_id),
                    subdepartment_id: Number(formData.subdepartment_id),
                    class_id: formData.class_id ? Number(formData.class_id) : null
                },
                job_specific_answers: jobAnswers,
                participants_details: participants,
            }

            if (taskToEdit) {
                payload.date_initiated = normalizedEnquiryDate.isoDateTime;
                payload.stages = {
                    ...taskToEdit.stages,
                    [ENQUIRY_STAGE_ID]: {
                        ...taskToEdit.stages?.[ENQUIRY_STAGE_ID],
                        status: "completed",
                        date: normalizedEnquiryDate.displayDate,
                        updated_by_id: actor.by_id,
                    },
                };
                // Audit trail for edits — never clobber the original creator.
                payload.updated_by_id = actor.by_id;
                payload.updated_at = new Date().toISOString();
            }

            const insertPayload = !taskToEdit ? {
                ...payload,
                status: 'enquiry',
                date_initiated: normalizedEnquiryDate.isoDateTime,
                applied_by: "11",
                created_by: actor.by_id,
                created_at: new Date().toISOString(),
                updated_by_id: actor.by_id,
                updated_at: new Date().toISOString(),
                job_level: {
                    level: formData.class_id ? 3 : formData.subdepartment_id ? 2 : 1,
                    department_id: Number(formData.department_id),
                    subdepartment_id: formData.subdepartment_id ? Number(formData.subdepartment_id) : null,
                    class_id: formData.class_id ? Number(formData.class_id) : null,
                    subclass_id: null
                },
                registry_metadata: {
                    triggered_from: "enquiry_dialog",
                    triggered_at: new Date().toISOString(),
                    existing_workflow_detected: !!workflowRestrictionSummary?.matchedDocumentTypes?.length,
                    workflow_blocking_reasons: workflowRestrictionSummary?.blockingReasons || []
                },
                stages: {
                    [ENQUIRY_STAGE_ID]: {
                        status: "completed",
                        date: normalizedEnquiryDate.displayDate,
                        created_by_id: actor.by_id,
                        created_at: new Date().toISOString(),
                        updated_by_id: actor.by_id,
                        updated_at: new Date().toISOString(),
                    }
                }
            } : null;

            const taskPromise = taskToEdit
                ? supabase.from('tm_tasks').update(payload).eq('id', taskToEdit.id).select().single()
                : supabase.from('tm_tasks').insert([insertPayload]).select().single();

            const resolvedRNumber = rNumberUnallocated ? 'Unallocated' : editableRNumber;
            const rNumberChanged = resolvedRNumber !== (selectedIndividual?.r_number || '');
            const rNumberPromise = (rNumberChanged && selectedIndividual?.id)
                ? supabase.from('registry_individuals').update({ r_number: resolvedRNumber }).eq('id', selectedIndividual.id)
                : Promise.resolve({ error: null });

            const [{ data: taskData, error: taskError }] = await Promise.all([taskPromise, rNumberPromise]);
            if (taskError) throw taskError;

            // Was previously gated on `!taskToEdit` — the Related Document picker renders and
            // is editable in edit mode too, but that guard meant selecting/changing a link
            // while editing an existing task silently never wrote anything to
            // document_workflow_logs. linkTaskToDocumentWorkflow itself is safe to call on
            // every save (it's a dedupe-by-taskId find-or-update/insert, not a bare append).
            if (selectedRelatedDocumentId) {
                const linkedDoc = availableRelatedDocuments.find((doc) => doc.uploadedDocId === selectedRelatedDocumentId);
                if (linkedDoc) {
                    const linkResult = await linkTaskToDocumentWorkflow({
                        individualId: selectedIndividual.id,
                        individualName: selectedIndividual.full_name,
                        documentTypeId: linkedDoc.documentTypeId,
                        documentTypeName: linkedDoc.documentTypeName,
                        uploadedDocId: linkedDoc.uploadedDocId,
                        taskId: taskData.id,
                        createdBy: taskData.created_by ?? null,
                    });
                    if (!linkResult.success) {
                        toast({ title: taskToEdit ? "Task updated, but document link failed" : "Task created, but document link failed", description: "The task was saved — you may need to link it to the document manually.", variant: "destructive" });
                    }
                }
            }

            toast({
                title: "Success",
                description: taskToEdit ? "Enquiry updated successfully." : "Enquiry created successfully.",
                variant: "success"
            });

            // Call the callback with the updated/created task to refresh parent state
            onEnquiryCreated(taskData);

            // Close dialog after successful submission
            onOpenChange(false);
        } catch (error) {
            console.error(error)
            toast({ title: "Error", description: "Failed to save data.", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const dialogTitle = taskToEdit
        ? `Edit Enquiry: ${taskToEdit.applicant_details?.name || 'Loading...'}`
        : "New Client Enquiry";

    const jobLevelLabel = useMemo(() => {
        if (!taskToEdit || !formData.department_id) return null;
        const dept = departments.find(d => d.id.toString() === formData.department_id);
        const sub = availableSubdepartments.find(s => s.id.toString() === formData.subdepartment_id);
        const cls = availableClasses.find(c => c.id.toString() === formData.class_id);
        return [dept?.name, sub?.name, cls?.name].filter(Boolean).join(' › ') || null;
    }, [taskToEdit, formData.department_id, formData.subdepartment_id, formData.class_id, departments, availableSubdepartments, availableClasses]);

    const isEnquiryDateValid = /^\d{2}\/\d{2}\/\d{4}$/.test(formData.enquiry_date || '');
    const enquiryDateAsDate = useMemo(() => {
        if (!isEnquiryDateValid) return undefined;
        const [dd, mm, yyyy] = formData.enquiry_date.split('/');
        const d = new Date(`${yyyy}-${mm}-${dd}`);
        return isValid(d) ? d : undefined;
    }, [formData.enquiry_date, isEnquiryDateValid]);

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-[1600px] max-h-[95vh] p-0 flex flex-col border-none shadow-2xl bg-white">
                    {/* STATIC HEADER */}
                    <DialogHeader className="p-6 bg-blue-600 text-white shrink-0 z-10 shadow-md relative">
                        <button
                            onClick={() => onOpenChange(false)}
                            className="absolute right-6 top-6 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 disabled:pointer-events-none"
                        >
                            <X className="h-5 w-5" />
                            <span className="sr-only">Close</span>
                        </button>
                        <div className="flex items-center justify-between pr-8">
                            <div className="flex items-center gap-4">
                                <div className="bg-white/20 p-2.5 rounded-xl"><ListTodo className="h-6 w-6" /></div>
                                <div>
                                    <DialogTitle className="text-2xl font-bold tracking-tight">
                                        {dialogTitle}
                                    </DialogTitle>
                                    <DialogDescription className="text-blue-100 font-medium">
                                        {taskToEdit ? "Updating existing records" : "Logical requirement engine active"}
                                    </DialogDescription>
                                    {taskToEdit && jobLevelLabel && (
                                        <div className="mt-1">
                                            <Badge className="bg-white/20 text-white border-white/20 text-sm font-semibold px-2 py-0.5">
                                                {jobLevelLabel}
                                            </Badge>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </DialogHeader>

                    {/* SCROLLABLE CONTENT AREA */}
                    <div className="flex-1 w-full h-full bg-slate-50/50 overflow-auto">
                        <div className="p-6 space-y-4 grid grid-cols-2 gap-4">
                            <div className="col-span-1">
                                {/* CLIENT IDENTIFICATION SECTION */}
                                <Card className="border-blue-100 shadow-sm overflow-hidden bg-white mb-4">
                                    <CardHeader className="bg-blue-50/50 py-3 px-6 border-b border-blue-100">
                                        <CardTitle className="text-sm font-black text-blue-800 uppercase tracking-wider flex items-center gap-2">
                                            <User className="h-4 w-4" />
                                            Client Identification
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-0">
                                        <TableRow label="Applicant Type" required>
                                            <RadioGroup value={applicantType} onValueChange={(v: any) => setApplicantType(v)} className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg max-w-sm">
                                                {['principal', 'dependant'].map(t => (
                                                    <div key={t} className="relative">
                                                        <RadioGroupItem value={t} id={t} className="sr-only" />
                                                        <Label htmlFor={t} className={cn("flex items-center justify-center py-2 rounded-md cursor-pointer text-sm font-bold transition-all", applicantType === t ? "bg-white text-blue-600 shadow-sm" : "text-slate-500")}>
                                                            {t.charAt(0).toUpperCase() + t.slice(1)}
                                                        </Label>
                                                    </div>
                                                ))}
                                            </RadioGroup>
                                        </TableRow>

                                        <TableRow label="Primary Applicant" required hasValue={!!selectedIndividual} error={submitAttempted ? clientIdentificationErrors.primary_applicant : undefined}>
                                            <div className="flex items-center gap-4">
                                                {/* Photo Preview - UPDATED FOR PDF */}
                                                <div className="shrink-0">
                                                    {loadingPhoto ? (
                                                        <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center">
                                                            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                                        </div>
                                                    ) : applicantPhoto ? (
                                                        (applicantPhoto.toLowerCase().includes('.pdf') || applicantPhoto.includes('application/pdf')) ? (
                                                            <iframe
                                                                src={`${applicantPhoto}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                                                                className="w-16 h-16 rounded-lg object-cover border-2 border-blue-100 overflow-hidden bg-white"
                                                                title="Applicant Document"
                                                                scrolling="no"
                                                            />
                                                        ) : (
                                                            <img
                                                                src={applicantPhoto}
                                                                alt="Applicant"
                                                                className="w-16 h-16 rounded-lg object-cover border-2 border-blue-100"
                                                            />
                                                        )
                                                    ) : selectedIndividual ? (
                                                        <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
                                                            <User className="h-8 w-8 text-blue-600" />
                                                        </div>
                                                    ) : (
                                                        <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center">
                                                            <User className="h-8 w-8 text-slate-400" />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Search Popover */}
                                                <div className="flex-1">
                                                    <Popover open={isIndividualPopoverOpen} onOpenChange={setIsIndividualPopoverOpen}>
                                                        <PopoverTrigger asChild>
                                                            <Button variant="outline" className="w-full justify-between h-11 border-slate-200 bg-white">
                                                                {selectedIndividual ? <span className="font-bold text-slate-800">{selectedIndividual.full_name}</span> : <span className="text-slate-400">Search database...</span>}
                                                                <Search className="h-4 w-4 opacity-30" />
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-[400px] p-0 max-h-[400px]" align="start">
                                                            <Command className="h-full rounded-lg border shadow-md">
                                                                <CommandInput placeholder="Search name..." />
                                                                <CommandList
                                                                    className="max-h-[350px] overflow-y-auto overscroll-contain"
                                                                    onWheel={(e) => e.stopPropagation()}
                                                                >
                                                                    <CommandEmpty>No individuals found.</CommandEmpty>
                                                                    <CommandGroup>
                                                                        {individuals.map(ind => (
                                                                            <CommandItem key={ind.id} onSelect={() => handleIndividualSelect(ind)}>
                                                                                <Check className={cn("mr-2 h-4 w-4 text-blue-600", selectedIndividual?.id === ind.id ? "opacity-100" : "opacity-0")} />
                                                                                {ind.full_name}
                                                                            </CommandItem>
                                                                        ))}
                                                                    </CommandGroup>
                                                                </CommandList>
                                                            </Command>
                                                        </PopoverContent>
                                                    </Popover>
                                                </div>
                                            </div>
                                        </TableRow>

                                        <TableRow label="Related Document" hasValue={!!selectedRelatedDocumentId}>
                                            <div className="flex-1 space-y-2">
                                                {(() => {
                                                    const suggested = availableRelatedDocuments.find((doc) => doc.isCurrentImmigrationStatus);
                                                    const isSuggestedLinked = !!suggested && selectedRelatedDocumentId === suggested.uploadedDocId;
                                                    if (!suggested || isSuggestedLinked) return null;
                                                    // Deliberately loud — this is the one document most tasks actually need linked
                                                    // (the person's current immigration status), so it shouldn't be just another
                                                    // row in a dropdown the user can skim past.
                                                    return (
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedRelatedDocumentId(suggested.uploadedDocId)}
                                                            className={cn(
                                                                "w-full flex items-center justify-between gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-all animate-pulse hover:animate-none",
                                                                suggested.status === 'expired'
                                                                    ? "border-red-300 bg-red-50 hover:border-red-400 hover:bg-red-100"
                                                                    : "border-amber-300 bg-amber-50 hover:border-amber-400 hover:bg-amber-100"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <AlertCircle className={cn("h-4 w-4 shrink-0", suggested.status === 'expired' ? "text-red-600" : "text-amber-600")} />
                                                                <div className="min-w-0">
                                                                    <div className="text-sm font-bold text-slate-800 truncate">
                                                                        Current Immigration Status: {suggested.documentTypeName}
                                                                        {suggested.status === 'expired' && <span className="ml-1.5 text-red-600">(Expired)</span>}
                                                                    </div>
                                                                    <div className="text-sm text-slate-500">
                                                                        {suggested.expiryDate ? `Expires ${format(new Date(suggested.expiryDate), 'dd/MM/yyyy')}` : 'No expiry on file'} — tap to link this task to it
                                                                    </div>
                                                                    {suggested.existingWorkflowLabel && (
                                                                        <div className="text-sm text-orange-600 font-medium mt-0.5">
                                                                            ⚠ {suggested.existingWorkflowLabel} — check before adding another task
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <span className="shrink-0 flex items-center gap-1 text-sm font-semibold text-blue-600">
                                                                <Link2 className="h-3.5 w-3.5" /> Link
                                                            </span>
                                                        </button>
                                                    );
                                                })()}

                                                {selectedRelatedDocumentId && (() => {
                                                    const linked = availableRelatedDocuments.find((doc) => doc.uploadedDocId === selectedRelatedDocumentId);
                                                    if (!linked) return null;
                                                    return (
                                                        <div className={cn("rounded-lg border px-3 py-2", linked.existingWorkflowLabel ? "border-orange-200 bg-orange-50" : "border-emerald-200 bg-emerald-50")}>
                                                            <div className="flex items-center justify-between">
                                                                <span className={cn("text-sm font-medium flex items-center gap-1.5 truncate", linked.existingWorkflowLabel ? "text-orange-700" : "text-emerald-700")}>
                                                                    <Check className="h-3.5 w-3.5 shrink-0" />
                                                                    Linked: {linked.documentTypeName}{linked.isCurrentImmigrationStatus ? ' (current status)' : ''}
                                                                </span>
                                                                <button type="button" className="shrink-0 text-sm text-slate-400 hover:text-red-600" onClick={() => setSelectedRelatedDocumentId('')}>Unlink</button>
                                                            </div>
                                                            {linked.existingWorkflowLabel && (
                                                                <p className="text-sm text-orange-600 mt-1">
                                                                    ⚠ {linked.existingWorkflowLabel} — this task will be added alongside it, not replace it.
                                                                </p>
                                                            )}
                                                        </div>
                                                    );
                                                })()}

                                                <details className="group">
                                                    <summary className="text-sm text-slate-400 hover:text-slate-600 cursor-pointer list-none flex items-center gap-1 select-none">
                                                        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                                                        {selectedRelatedDocumentId ? 'Link a different document instead' : 'Link a different document'}
                                                    </summary>
                                                    <div className="mt-2">
                                                        <SearchableSelect
                                                            value={selectedRelatedDocumentId}
                                                            onValueChange={setSelectedRelatedDocumentId}
                                                            options={availableRelatedDocuments.map((doc) => ({
                                                                value: doc.uploadedDocId,
                                                                label: `${doc.isCurrentImmigrationStatus ? '⭐ ' : ''}${doc.documentTypeName}${doc.expiryDate ? ` — exp. ${format(new Date(doc.expiryDate), 'dd/MM/yyyy')}` : ''}${doc.status === 'expired' ? ' (Expired)' : ''}${doc.existingWorkflowLabel ? ` ⚠ ${doc.existingWorkflowLabel}` : ''}`,
                                                            }))}
                                                            placeholder={!selectedIndividual ? "Select applicant first" : loadingRelatedDocuments ? "Loading documents..." : "Not linked to a specific document"}
                                                            disabled={!selectedIndividual || loadingRelatedDocuments || availableRelatedDocuments.length === 0}
                                                            emptyMessage="No documents on file for this individual."
                                                            searchPlaceholder="Search documents..."
                                                        />
                                                    </div>
                                                </details>

                                                <p className="text-sm text-slate-400">
                                                    Optional — link this task to a specific document so its status updates automatically in the Document Manager.
                                                </p>
                                            </div>
                                        </TableRow>

                                        <TableRow label="Company Associated" required hasValue={!!selectedCompany} error={submitAttempted ? clientIdentificationErrors.company : undefined}>
                                            <div className="flex items-center gap-2 w-full">
                                                <div className="flex-1">
                                                    <SearchableSelect
                                                        value={selectedCompany}
                                                        onValueChange={handleCompanyChange}
                                                        options={[{ value: 'unallocated', label: 'Unallocated' }, ...companyOptions]}
                                                        placeholder="Select Company..."
                                                        emptyMessage="No companies found."
                                                        searchPlaceholder="Search company..."
                                                        buttonClassName="h-11 border-slate-200 bg-white w-full"
                                                        popoverClassName="w-[--radix-popover-trigger-width]"
                                                    />
                                                </div>
                                                {/* CLEAR BUTTON FOR COMPANY */}
                                                {selectedCompany && selectedCompany !== 'unallocated' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={handleClearCompany}
                                                        className="h-10 w-10 text-slate-400 hover:text-red-500 hover:bg-red-50"
                                                        type="button"
                                                    >
                                                        <X className="h-4 w-4" />
                                                        <span className="sr-only">Clear Company</span>
                                                    </Button>
                                                )}
                                                {/* ASSOCIATE TO COMPANY BUTTON */}
                                                {selectedIndividual && (selectedCompany === 'unallocated' || !selectedCompany) && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setShowCompanyAssociationDialog(true)}
                                                        className="h-10 px-3 border-blue-200 text-blue-600 hover:bg-blue-50"
                                                        type="button"
                                                    >
                                                        <Link2 className="h-4 w-4 mr-1" />
                                                        Associate
                                                    </Button>
                                                )}
                                            </div>
                                            {/* Show no company message */}
                                            {selectedCompany === 'unallocated' && (
                                                <div className="mt-2 text-sm text-amber-600 bg-amber-50 px-2 py-1 rounded">
                                                    This individual is unallocated. Click "Associate" to link them to a company.
                                                </div>
                                            )}
                                        </TableRow>

                                        {/* RELATIONSHIP LOGIC: Rendering Principal or Dependants */}
                                        {selectedIndividual && applicantType === 'principal' && (
                                            <TableRow label="Include Dependants">
                                                {loadingRelations ? (
                                                    <div className="flex items-center gap-2 text-slate-400 text-sm italic"><Loader2 className="h-3 w-3 animate-spin" /> Loading dependants...</div>
                                                ) : availableDependants.length > 0 ? (
                                                    <div className="space-y-2">
                                                        <Popover open={isDependantsPopoverOpen} onOpenChange={setIsDependantsPopoverOpen}>
                                                            <PopoverTrigger asChild>
                                                                <Button variant="outline" className="w-full justify-between h-11 border-slate-200 bg-white" type="button">
                                                                    <span className="truncate">
                                                                        {selectedDependants.length > 0
                                                                            ? `${selectedDependants.length} dependant${selectedDependants.length === 1 ? '' : 's'} selected`
                                                                            : "Choose dependants to include..."}
                                                                    </span>
                                                                    <ChevronsUpDown className="h-4 w-4 opacity-30" />
                                                                </Button>
                                                            </PopoverTrigger>
                                                            <PopoverContent className="w-[400px] p-0" align="start">
                                                                <Command>
                                                                    <CommandInput placeholder="Search dependants..." />
                                                                    <CommandList className="max-h-[250px] overflow-y-auto">
                                                                        <CommandEmpty>No dependants found.</CommandEmpty>
                                                                        <CommandGroup>
                                                                            {availableDependants.map(dep => {
                                                                                const depId = dep.id.toString();
                                                                                const isSelected = selectedDependants.includes(depId);
                                                                                return (
                                                                                    <CommandItem
                                                                                        key={dep.id}
                                                                                        onSelect={() => setSelectedDependants(prev =>
                                                                                            isSelected ? prev.filter(id => id !== depId) : [...prev, depId]
                                                                                        )}
                                                                                    >
                                                                                        <Check className={cn("mr-2 h-4 w-4 text-blue-600", isSelected ? "opacity-100" : "opacity-0")} />
                                                                                        {dep.full_name}
                                                                                        <span className="text-sm text-slate-400 uppercase ml-1.5">({dep.relationship_type})</span>
                                                                                    </CommandItem>
                                                                                );
                                                                            })}
                                                                        </CommandGroup>
                                                                    </CommandList>
                                                                </Command>
                                                            </PopoverContent>
                                                        </Popover>
                                                        {selectedDependants.length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {selectedDependants.map(depId => {
                                                                    const dep = availableDependants.find(d => d.id.toString() === depId);
                                                                    if (!dep) return null;
                                                                    return (
                                                                        <Badge key={depId} variant="secondary" className="text-sm py-1 px-2 bg-blue-50 text-blue-600 border-blue-100 flex items-center gap-1">
                                                                            {dep.full_name}
                                                                            <X
                                                                                className="h-3 w-3 cursor-pointer hover:text-blue-800"
                                                                                onClick={() => setSelectedDependants(prev => prev.filter(id => id !== depId))}
                                                                            />
                                                                        </Badge>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="text-sm text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100 italic">
                                                        No dependants associated with this principal.
                                                    </div>
                                                )}
                                            </TableRow>
                                        )}

                                        {selectedIndividual && applicantType === 'dependant' && (
                                            <TableRow label="Linked Principal" required hasValue={!!principalForDependant} error={submitAttempted ? clientIdentificationErrors.linked_principal : undefined}>
                                                {loadingRelations ? (
                                                    <div className="flex items-center gap-2 text-slate-400 text-sm italic"><Loader2 className="h-3 w-3 animate-spin" /> Loading principal...</div>
                                                ) : principalForDependant ? (
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="py-2 px-3 border-blue-200 bg-blue-50 text-blue-700 flex items-center gap-2">
                                                            <UserCheck className="h-3 w-3" />
                                                            {principalForDependant.full_name}
                                                        </Badge>
                                                        {/* CLEAR BUTTON FOR LINKED PRINCIPAL */}
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => setPrincipalForDependant(null)}
                                                            className="h-8 w-8 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50"
                                                            type="button"
                                                            title="Remove Linked Principal"
                                                        >
                                                            <X className="h-3 w-3" />
                                                            <span className="sr-only">Remove Principal</span>
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="text-sm text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100 italic">
                                                        No principal associated (or selected) with this dependant.
                                                    </div>
                                                )}
                                            </TableRow>
                                        )}

                                        {selectedIndividual && (
                                            <TableRow label="Workflow Check">
                                                <div className="space-y-2">
                                                    {checkingWorkflow ? (
                                                        <div className="flex items-center gap-2 text-slate-400 text-sm italic">
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                            Checking existing workflows and active tasks...
                                                        </div>
                                                    ) : duplicateTaskConflicts.length > 0 ? (
                                                        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                                                            <div className="flex items-start gap-2">
                                                                <AlertCircle className="mt-0.5 h-4 w-4 text-red-600" />
                                                                <div className="space-y-1 text-sm text-red-700">
                                                                    <p className="font-semibold">Active task already exists for this job level.</p>
                                                                    {duplicateTaskConflicts.slice(0, 3).map((conflict: any) => (
                                                                        <p key={conflict.id}>
                                                                            #{conflict.id} · {conflict.job_description || "Untitled task"} · {conflict.status}
                                                                        </p>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : duplicateTaskConflicts.length === 0 && workflowRestrictionSummary?.hasBlockingWorkflow ? (
                                                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                                            Workflow restriction detected for this selected job level.
                                                            {` Blocking state(s): ${(workflowRestrictionSummary.blockingReasons || []).map(formatWorkflowRestrictionReason).join(", ")}.`}
                                                        </div>
                                                    ) : formData.department_id && selectedJobLevelBundle && workflowRestrictionSummary?.matchedDocumentTypes?.length > 0 ? (
                                                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                                                            Workflow history exists for this selected job level.
                                                            {` ${workflowRestrictionSummary.matchedDocumentTypes.length} related workflow target(s) detected for the matched bundle, including pushed-only task workflow states.`}
                                                        </div>
                                                    ) : (
                                                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                                                            {formData.department_id
                                                                ? "No workflow or active task conflict detected for the selected job level."
                                                                : "Select a job level to run the workflow check."}
                                                        </div>
                                                    )}
                                                </div>
                                            </TableRow>
                                        )}

                                        {formData.class_id === CLASS_D_ID && (
                                            <TableRow label="Related Understudy" required hasValue={!!selectedUnderstudy} error={submitAttempted ? clientIdentificationErrors.understudy : undefined}>
                                                {loadingRelations ? (
                                                    <div className="flex items-center gap-2 text-slate-400 text-sm italic"><Loader2 className="h-3 w-3 animate-spin" /> Loading available understudies...</div>
                                                ) : understudies.length > 0 ? (
                                                    <SearchableSelect
                                                        value={selectedUnderstudy}
                                                        onValueChange={setSelectedUnderstudy}
                                                        options={understudyOptions}
                                                        placeholder="Select understudy..."
                                                        disabled={understudyOptions.length === 0}
                                                        emptyMessage="No understudies found."
                                                        searchPlaceholder="Search understudy..."
                                                        buttonClassName="h-11 border-amber-200 bg-amber-50/20"
                                                        popoverClassName="w-[--radix-popover-trigger-width]"
                                                        allowClear={true}
                                                    />
                                                ) : (
                                                    <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 italic">
                                                        No understudies linked to the selected company.
                                                    </div>
                                                )}
                                            </TableRow>
                                        )}

                                        {formData.subdepartment_id === SPONSOR_SUBDEPT_ID && (
                                            <TableRow label="Designated Sponsor" required hasValue={!!selectedSponsor} error={submitAttempted ? clientIdentificationErrors.sponsor : undefined}>
                                                <Popover open={isSponsorPopoverOpen} onOpenChange={setIsSponsorPopoverOpen}>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-between h-11 border-emerald-100 bg-emerald-50/30 hover:bg-emerald-50">
                                                            {selectedSponsor ? <span className="font-bold text-emerald-700">{selectedSponsor.full_name}</span> : <span className="text-emerald-400">Search for sponsor...</span>}
                                                            <Users className="h-4 w-4 text-emerald-400" />
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-[400px] p-0 max-h-[400px]" align="start">
                                                        <Command className="rounded-lg border shadow-md">
                                                            <CommandInput placeholder="Search sponsors..." />
                                                            <CommandList
                                                                className="max-h-[350px] overflow-y-auto overscroll-contain"
                                                                onWheel={(e) => e.stopPropagation()}
                                                            >
                                                                <CommandEmpty>No sponsors found.</CommandEmpty>
                                                                <CommandGroup>
                                                                    {sponsors.map(s => (
                                                                        <CommandItem key={s.id} onSelect={() => { setSelectedSponsor(s); setIsSponsorPopoverOpen(false); }}>
                                                                            <Check className={cn("mr-2 h-4 w-4 text-emerald-600", selectedSponsor?.id === s.id ? "opacity-100" : "opacity-0")} />
                                                                            {s.full_name}
                                                                        </CommandItem>
                                                                    ))}
                                                                </CommandGroup>
                                                            </CommandList>
                                                        </Command>
                                                    </PopoverContent>
                                                </Popover>
                                            </TableRow>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* PROCESS CLASSIFICATION SECTION */}
                                <Card className="border-blue-100 shadow-sm overflow-hidden bg-white mb-4">
                                    <CardHeader className="bg-blue-50/50 py-3 px-6 border-b border-blue-100">
                                        <CardTitle className="text-sm font-black text-blue-800 uppercase tracking-wider flex items-center gap-2">
                                            <Shield className="h-4 w-4" />
                                            Process Classification
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-0">
                                        <TableRow label="Department" required hasValue={!!formData.department_id}>
                                            <SearchableSelect
                                                value={formData.department_id}
                                                onValueChange={id => setFormData(prev => ({ ...prev, department_id: id, subdepartment_id: '', class_id: '' }))}
                                                options={departmentOptions}
                                                placeholder="Choose Department"
                                                disabled={departmentOptions.length === 0}
                                                emptyMessage="No departments found."
                                                searchPlaceholder="Search department..."
                                                buttonClassName="h-11 bg-white border-slate-200"
                                                popoverClassName="w-[--radix-popover-trigger-width]"
                                                allowClear={true}
                                            />
                                        </TableRow>

                                        <TableRow label="Sub-Department" hasValue={!!formData.subdepartment_id}>
                                            <SearchableSelect
                                                value={formData.subdepartment_id}
                                                onValueChange={id => setFormData(prev => ({ ...prev, subdepartment_id: id, class_id: '' }))}
                                                options={subdepartmentOptions}
                                                placeholder="Choose Sub-Department"
                                                disabled={!formData.department_id || subdepartmentOptions.length === 0}
                                                emptyMessage="No sub-departments found."
                                                searchPlaceholder="Search sub-department..."
                                                buttonClassName="h-11 bg-white border-slate-200"
                                                popoverClassName="w-[--radix-popover-trigger-width]"
                                                allowClear={true}
                                            />
                                        </TableRow>

                                        <TableRow label="Service Class" hasValue={!!formData.class_id}>
                                            <SearchableSelect
                                                value={formData.class_id}
                                                onValueChange={id => setFormData(prev => ({ ...prev, class_id: id }))}
                                                options={classOptions}
                                                placeholder="Choose Service Class"
                                                disabled={!formData.subdepartment_id || classOptions.length === 0}
                                                emptyMessage="No service classes found."
                                                searchPlaceholder="Search service class..."
                                                buttonClassName="h-11 bg-white border-slate-200"
                                                popoverClassName="w-[--radix-popover-trigger-width]"
                                                allowClear={true}
                                            />
                                        </TableRow>
                                    </CardContent>
                                </Card>

                                {/* INTERNAL PROCESSING SECTION */}
                                <Card className={`border-blue-100 shadow-sm overflow-hidden bg-white mb-4 ${workflowRestrictionSummary?.hasBlockingWorkflow && !taskToEdit ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <CardHeader className="bg-blue-50/50 py-3 px-6 border-b border-blue-100">
                                        <CardTitle className="text-sm font-black text-blue-800 uppercase tracking-wider flex items-center gap-2">
                                            <UserCheck className="h-4 w-4" />
                                            Internal Processing
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-0">
                                        {formData.department_id !== '1' && (
                                            <TableRow label="Assigned Officer" hasValue={!!formData.officer_id}>
                                                <div className="space-y-2">
                                                    <SearchableSelect
                                                        value={formData.officer_id}
                                                        onValueChange={id => setFormData(prev => ({ ...prev, officer_id: id }))}
                                                        options={officerOptions}
                                                        placeholder={officerPlaceholder}
                                                        disabled={isOfficerDisabled || (workflowRestrictionSummary?.hasBlockingWorkflow && !taskToEdit)}
                                                        emptyMessage="No officers found."
                                                        searchPlaceholder="Search officer..."
                                                        buttonClassName="h-11 bg-white border-slate-200"
                                                        popoverClassName="w-[--radix-popover-trigger-width]"
                                                        allowClear={true}
                                                    />
                                                    {formData.officer_id && formData.subdepartment_id && (
                                                        <div className="flex items-center gap-2 text-sm text-amber-600">
                                                            <Shield className="h-3 w-3" />
                                                            <span>Officer inherited from department hierarchy</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </TableRow>
                                        )}

                                        <TableRow label="Task Manager" hasValue={!!formData.task_manager_id}>
                                            <SearchableSelect
                                                value={formData.task_manager_id}
                                                onValueChange={id => setFormData(prev => ({ ...prev, task_manager_id: id }))}
                                                options={managerOpts}
                                                placeholder="Select Manager"
                                                disabled={isManagerDisabled || (workflowRestrictionSummary?.hasBlockingWorkflow && !taskToEdit)}
                                                emptyMessage="No managers found."
                                                searchPlaceholder="Search manager..."
                                                buttonClassName="h-11 bg-white border-slate-200"
                                            />
                                        </TableRow>

                                        <TableRow label="Task Assistant" hasValue={!!formData.task_assistant_id}>
                                            <SearchableSelect
                                                value={formData.task_assistant_id}
                                                onValueChange={id => setFormData(prev => ({ ...prev, task_assistant_id: id }))}
                                                options={assistantOpts}
                                                placeholder="Select Assistant"
                                                disabled={isAssistantDisabled || (workflowRestrictionSummary?.hasBlockingWorkflow && !taskToEdit)}
                                                emptyMessage="No assistants found."
                                                searchPlaceholder="Search assistant..."
                                                buttonClassName="h-11 bg-white border-slate-200"
                                            />
                                        </TableRow>

                                        <TableRow label="Enquiry Date">
                                            <div className="relative max-w-sm">
                                                <Input
                                                    type="text"
                                                    placeholder="DD/MM/YYYY"
                                                    value={formData.enquiry_date}
                                                    onChange={e => setFormData(prev => ({ ...prev, enquiry_date: e.target.value }))}
                                                    disabled={workflowRestrictionSummary?.hasBlockingWorkflow && !taskToEdit}
                                                    className={cn(
                                                        "pl-10 pr-10 h-11 border-slate-200 bg-white font-mono",
                                                        formData.enquiry_date && !isEnquiryDateValid && "border-red-300 focus-visible:ring-red-300"
                                                    )}
                                                />
                                                <Calendar className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                                                <Popover open={isEnquiryDatePickerOpen} onOpenChange={setIsEnquiryDatePickerOpen}>
                                                    <PopoverTrigger asChild>
                                                        <button
                                                            type="button"
                                                            className="absolute right-2 top-2 h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                                            disabled={workflowRestrictionSummary?.hasBlockingWorkflow && !taskToEdit}
                                                        >
                                                            <ChevronsUpDown className="h-3.5 w-3.5" />
                                                        </button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0 z-[9999]" align="start">
                                                        <CalendarPicker
                                                            mode="single"
                                                            selected={enquiryDateAsDate}
                                                            onSelect={(d) => {
                                                                if (!d) return;
                                                                setFormData(prev => ({ ...prev, enquiry_date: format(d, 'dd/MM/yyyy') }));
                                                                setIsEnquiryDatePickerOpen(false);
                                                            }}
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                            {formData.enquiry_date && !isEnquiryDateValid && (
                                                <p className="text-sm text-red-500 mt-1">Enter a valid date as DD/MM/YYYY, or pick one from the calendar.</p>
                                            )}
                                        </TableRow>

                                        <TableRow label="Passport Number" hasValue={!!formData.passport_number}>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="text"
                                                    value={formData.passport_number}
                                                    disabled={!taskToEdit}
                                                    onChange={e => setFormData(prev => ({ ...prev, passport_number: e.target.value }))}
                                                    placeholder="Enter passport number"
                                                    className="h-11 border-slate-200 bg-white"
                                                />
                                                {/* No number yet, and the field is disabled until one exists (see above) — the
                                                    only way forward is uploading the passport document itself, so surface that
                                                    inline rather than leaving a dead, disabled input with just a warning. */}
                                                {!formData.passport_number && (
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon"
                                                        onClick={() => setShowPassportUpload(true)}
                                                        disabled={!selectedIndividual}
                                                        className="h-11 w-11 shrink-0 border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-40"
                                                        title="Upload passport document"
                                                    >
                                                        <Upload className="h-4 w-4" />
                                                        <span className="sr-only">Upload passport document</span>
                                                    </Button>
                                                )}
                                            </div>
                                            {!taskToEdit && selectedIndividual && !formData.passport_number && (
                                                <div className="mt-2 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
                                                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                                    No passport found. Upload the passport document using the button above — the number will populate once it's processed.
                                                </div>
                                            )}
                                        </TableRow>

                                        <TableRow label="R Number" hasValue={!!editableRNumber || rNumberUnallocated}>
                                            <div className="flex items-center gap-3">
                                                <Input
                                                    type="text"
                                                    value={editableRNumber}
                                                    onChange={e => setEditableRNumber(e.target.value)}
                                                    disabled={!selectedIndividual || rNumberUnallocated}
                                                    placeholder={rNumberUnallocated ? "Unallocated" : selectedIndividual ? "Enter R number" : "—"}
                                                    className="h-11 border-slate-200 bg-white"
                                                />
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <Checkbox
                                                        id="r-number-unallocated"
                                                        checked={rNumberUnallocated}
                                                        disabled={!selectedIndividual}
                                                        onCheckedChange={(checked) => {
                                                            setRNumberUnallocated(checked === true);
                                                            if (checked) setEditableRNumber('');
                                                        }}
                                                    />
                                                    <Label htmlFor="r-number-unallocated" className="text-sm font-medium text-slate-500 cursor-pointer whitespace-nowrap">
                                                        Unallocated
                                                    </Label>
                                                </div>
                                            </div>
                                        </TableRow>

                                        {formData.department_id === '1' && (
                                            <TableRow label="Passport Endorsement" hasValue={!!formData.passport_handling_mode}>
                                                <Select
                                                    value={formData.passport_handling_mode || ''}
                                                    onValueChange={(v: any) => setFormData(prev => ({ ...prev, passport_handling_mode: v }))}
                                                >
                                                    <SelectTrigger className="h-11 border-slate-200 bg-white max-w-sm">
                                                        <SelectValue placeholder="Select who handles endorsement..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="bcl">BCL Handles Stamping</SelectItem>
                                                        <SelectItem value="client">Client Handles It</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-sm text-slate-400 mt-1.5">
                                                    Whether BCL staff will carry the passport to Nyayo House for stamping, or the client handles that themselves. Tracked in Passport Endorsement Tracking once this job reaches Write-up Completed.
                                                </p>
                                            </TableRow>
                                        )}

                                        {formData.department_id === '1' && formData.subdepartment_id === '26' && (
                                            <TableRow label="ETA Purpose" hasValue={!!formData.eta_purpose}>
                                                <Select
                                                    value={formData.eta_purpose || ''}
                                                    onValueChange={(v: any) => setFormData(prev => ({
                                                        ...prev,
                                                        eta_purpose: v,
                                                        eta_traveler_intent: v === 'tourism' ? 'visitor' : prev.eta_traveler_intent,
                                                    }))}
                                                >
                                                    <SelectTrigger className="h-11 border-slate-200 bg-white max-w-sm">
                                                        <SelectValue placeholder="Select the purpose of this ETA..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="tourism">Tourism</SelectItem>
                                                        <SelectItem value="fresh_settlement">Fresh Settlement</SelectItem>
                                                        <SelectItem value="resettlement">Resettlement</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-sm text-slate-400 mt-1.5">
                                                    {formData.eta_purpose === 'resettlement'
                                                        ? "Auto-selected — this applicant has prior immigration-status documents on file."
                                                        : "Tourism and Fresh Settlement have no prior status to detect from, so this is a manual pick. Resettlement auto-selects when the applicant already has a linkable prior document."}
                                                </p>
                                            </TableRow>
                                        )}

                                        {formData.department_id === '1' && formData.subdepartment_id === '26' && formData.eta_purpose !== 'tourism' && (
                                            <TableRow label="Traveler Intent" hasValue={!!formData.eta_traveler_intent}>
                                                <Select
                                                    value={formData.eta_traveler_intent || ''}
                                                    onValueChange={(v: any) => setFormData(prev => ({ ...prev, eta_traveler_intent: v }))}
                                                >
                                                    <SelectTrigger className="h-11 border-slate-200 bg-white max-w-sm">
                                                        <SelectValue placeholder="Select whether they're visiting or staying..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="visitor">Just visiting — leaving before/at ETA expiry</SelectItem>
                                                        <SelectItem value="extend_or_change_status">Staying — will need an extension or change of status</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-sm text-slate-400 mt-1.5">
                                                    Whether this person intends to leave the country before/when their ETA expires, or stay on and need a follow-on extension or change of status. Drives which workflow the Individual Document Manager's Visa/ETA tracker follows for this person.
                                                </p>
                                            </TableRow>
                                        )}

                                        {formData.department_id === '1' && formData.subdepartment_id === '26' && formData.eta_purpose === 'tourism' && (
                                            <TableRow label="Traveler Intent" hasValue>
                                                <p className="text-sm text-slate-500 pt-2">
                                                    Just visiting — leaving before/at ETA expiry. Tourism enquiries never need an extension or change of status, so this is fixed automatically.
                                                </p>
                                            </TableRow>
                                        )}

                                        {formData.department_id === '1' && formData.subdepartment_id === '26' && (
                                            <TableRow label="Confirmed Ticket?" hasValue={formData.eta_ticket_confirmed !== null}>
                                                <Select
                                                    value={formData.eta_ticket_confirmed === null ? '' : (formData.eta_ticket_confirmed ? 'yes' : 'no')}
                                                    onValueChange={(v: any) => setFormData(prev => ({
                                                        ...prev,
                                                        eta_ticket_confirmed: v === 'yes',
                                                        // Clear whichever side no longer applies rather than leaving stale
                                                        // values behind when the client switches their answer.
                                                        eta_tentative_arrival_date: v === 'yes' ? '' : prev.eta_tentative_arrival_date,
                                                        eta_tentative_departure_date: v === 'yes' ? '' : prev.eta_tentative_departure_date,
                                                        eta_confirmed_ticket_expected_date: v === 'yes' ? '' : prev.eta_confirmed_ticket_expected_date,
                                                        eta_return_ticket_is_real: v === 'no' ? null : prev.eta_return_ticket_is_real,
                                                    }))}
                                                >
                                                    <SelectTrigger className="h-11 border-slate-200 bg-white max-w-sm">
                                                        <SelectValue placeholder="Do they have a confirmed arrival ticket?" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="yes">Yes — confirmed arrival ticket</SelectItem>
                                                        <SelectItem value="no">No — tentative booking only</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-sm text-slate-400 mt-1.5">
                                                    {formData.eta_ticket_confirmed === true
                                                        ? "Upload the Airline/Cruise Ticket in the Individual Document Manager — its Arrival/Departure dates become authoritative."
                                                        : "If not confirmed yet, record the tentative dates below and when the client expects to get the real ticket."}
                                                </p>
                                            </TableRow>
                                        )}

                                        {formData.department_id === '1' && formData.subdepartment_id === '26' && formData.eta_ticket_confirmed === false && (
                                            <>
                                                <TableRow label="Tentative Arrival Date" hasValue={!!formData.eta_tentative_arrival_date}>
                                                    <Input
                                                        type="date"
                                                        value={formData.eta_tentative_arrival_date}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, eta_tentative_arrival_date: e.target.value }))}
                                                        className="h-11 border-slate-200 bg-white max-w-sm"
                                                    />
                                                </TableRow>
                                                <TableRow label="Tentative Departure Date" hasValue={!!formData.eta_tentative_departure_date}>
                                                    <Input
                                                        type="date"
                                                        value={formData.eta_tentative_departure_date}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, eta_tentative_departure_date: e.target.value }))}
                                                        className="h-11 border-slate-200 bg-white max-w-sm"
                                                    />
                                                </TableRow>
                                                <TableRow label="Confirmed Ticket Expected By" hasValue={!!formData.eta_confirmed_ticket_expected_date}>
                                                    <Input
                                                        type="date"
                                                        value={formData.eta_confirmed_ticket_expected_date}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, eta_confirmed_ticket_expected_date: e.target.value }))}
                                                        className="h-11 border-slate-200 bg-white max-w-sm"
                                                    />
                                                    <p className="text-sm text-slate-400 mt-1.5">
                                                        When the client expects to have a confirmed ticket in hand. The Visa/ETA tracker counts down to this date.
                                                    </p>
                                                </TableRow>
                                            </>
                                        )}

                                        {formData.department_id === '1' && formData.subdepartment_id === '26' && formData.eta_ticket_confirmed === true && (
                                            <TableRow label="Return Ticket" hasValue={formData.eta_return_ticket_is_real !== null}>
                                                <Select
                                                    value={formData.eta_return_ticket_is_real === null ? '' : (formData.eta_return_ticket_is_real ? 'real' : 'dummy')}
                                                    onValueChange={(v: any) => setFormData(prev => ({ ...prev, eta_return_ticket_is_real: v === 'real' }))}
                                                >
                                                    <SelectTrigger className="h-11 border-slate-200 bg-white max-w-sm">
                                                        <SelectValue placeholder="Is the return ticket real or a dummy booking?" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="real">Real — trust its return date</SelectItem>
                                                        <SelectItem value="dummy">Dummy — ignore its return date for now</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-sm text-slate-400 mt-1.5">
                                                    {formData.eta_return_ticket_is_real === false
                                                        ? "Return date will be left blank until a genuine return ticket is uploaded later, from the Visa/ETA tracker."
                                                        : "Whether the ticket's return/departure leg is genuine or a dummy booking used to satisfy visa requirements. Only a real one is trusted for the return-date countdown."}
                                                </p>
                                            </TableRow>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            <div className="col-span-1">
                                {/* REQUIREMENT INTELLIGENCE SECTION */}
                                <Card className={`border-blue-100 shadow-sm overflow-hidden bg-white mb-4 ${workflowRestrictionSummary?.hasBlockingWorkflow && !taskToEdit ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <CardHeader className="bg-blue-50/50 px-6 border-b border-blue-100">
                                        <CardTitle className="text-sm font-black text-blue-800 uppercase tracking-wider flex items-center gap-2">
                                            <HelpCircle className="h-4 w-4" />
                                            Job Specific Questions
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                        {Object.entries(groupedQuestions).length > 0 ? (
                                            <div className="space-y-6">
                                                {Object.entries(groupedQuestions).map(([category, questions]) => (
                                                    <div key={category} className="space-y-2">
                                                        <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                                                            <Folder className="h-4 w-4 text-blue-600" />
                                                            <h3 className="text-sm font-black text-blue-800 uppercase tracking-wider">{category}</h3>
                                                        </div>
                                                        <div className="space-y-0">
                                                            {questions.map((q) => (
                                                                <TableRow key={q.id} label={q.label} required={q.required} hasValue={isJobAnswerFilled(q)}>
                                                                    {q.type === 'text' && (
                                                                        <Input
                                                                            value={jobAnswers[q.id] || ''}
                                                                            onChange={e => setJobAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                                                            disabled={workflowRestrictionSummary?.hasBlockingWorkflow && !taskToEdit}
                                                                            className="h-11 bg-white border-slate-200"
                                                                        />
                                                                    )}

                                                                    {q.type === 'boolean' && (
                                                                        <>
                                                                        <RadioGroup
                                                                            value={jobAnswers[q.id] === undefined ? "" : String(jobAnswers[q.id])}
                                                                            onValueChange={v => {
                                                                                const boolVal = v === 'true';
                                                                                setJobAnswers(prev => ({ ...prev, [q.id]: boolVal }));
                                                                                if (!boolVal && q.third_party_role) {
                                                                                    setThirdPartySelections(prev => {
                                                                                        const next = { ...prev };
                                                                                        delete next[q.id];
                                                                                        return next;
                                                                                    });
                                                                                }
                                                                            }}
                                                                            disabled={workflowRestrictionSummary?.hasBlockingWorkflow && !taskToEdit}
                                                                            className="flex gap-4"
                                                                        >
                                                                            <div className="flex items-center space-x-2 bg-slate-50 px-4 py-2 rounded-md border border-slate-200">
                                                                                <RadioGroupItem value="true" id={`q-yes-${q.id}`} />
                                                                                <Label htmlFor={`q-yes-${q.id}`} className="text-sm cursor-pointer">Yes</Label>
                                                                            </div>
                                                                            <div className="flex items-center space-x-2 bg-slate-50 px-4 py-2 rounded-md border border-slate-200">
                                                                                <RadioGroupItem value="false" id={`q-no-${q.id}`} />
                                                                                <Label htmlFor={`q-no-${q.id}`} className="text-sm cursor-pointer">No</Label>
                                                                            </div>
                                                                        </RadioGroup>

                                                                        {q.third_party_role && jobAnswers[q.id] === true && (
                                                                            <div className="mt-3 space-y-1">
                                                                                <Label className="text-sm font-bold uppercase text-amber-600 flex items-center gap-1">
                                                                                    <User className="h-3 w-3" /> Select {q.third_party_role}
                                                                                </Label>
                                                                                <SearchableSelect
                                                                                    value={thirdPartySelections[q.id] || ''}
                                                                                    onValueChange={(val) => {
                                                                                        setThirdPartySelections(prev => ({ ...prev, [q.id]: val }));
                                                                                    }}
                                                                                    options={companyIndividuals.map(ind => ({
                                                                                        value: String(ind.id),
                                                                                        label: ind.full_name,
                                                                                        description: ind.associations?.map((a: any) => a.individual_type).filter(Boolean).join(', ')
                                                                                    }))}
                                                                                    placeholder={`Select a ${q.third_party_role}...`}
                                                                                    searchPlaceholder="Search individuals..."
                                                                                    disabled={workflowRestrictionSummary?.hasBlockingWorkflow && !taskToEdit}
                                                                                />
                                                                                {thirdPartySelections[q.id] && (
                                                                                    <p className="text-sm text-amber-600 italic">
                                                                                        Selected {q.third_party_role} will be stored in participants for document generation.
                                                                                    </p>
                                                                                )}
                                                                                {!companyIndividuals.length && selectedCompany && (
                                                                                    <p className="text-sm text-slate-400 italic">
                                                                                        No individuals found for the selected company.
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                        </>
                                                                    )}

                                                                    {(q.type === 'select' || q.type === 'multiselect') && (
                                                                        <div className="space-y-2">
                                                                            <Popover>
                                                                                <PopoverTrigger asChild>
                                                                                    <Button variant="outline" className="w-full justify-between h-11 bg-white border-slate-200" disabled={workflowRestrictionSummary?.hasBlockingWorkflow && !taskToEdit}>
                                                                                        <span className="truncate">
                                                                                            {q.type === 'multiselect'
                                                                                                ? (jobAnswers[q.id]?.length > 0 ? `${jobAnswers[q.id].length} Selected` : "Choose multiple...")
                                                                                                : (jobAnswers[q.id] || "Select option...")}
                                                                                        </span>
                                                                                        <ChevronsUpDown className="h-4 w-4 opacity-30" />
                                                                                    </Button>
                                                                                </PopoverTrigger>
                                                                                <PopoverContent className="w-[400px] p-0">
                                                                                    <Command>
                                                                                        <CommandInput placeholder="Filter..." />
                                                                                        <CommandList className="max-h-[250px] overflow-y-auto">
                                                                                            <CommandGroup>
                                                                                                {q.options?.map(opt => (
                                                                                                    <CommandItem key={opt} onSelect={() => {
                                                                                                        if (q.type === 'multiselect') {
                                                                                                            const current = jobAnswers[q.id] || [];
                                                                                                            const next = current.includes(opt) ? current.filter(x => x !== opt) : [...current, opt];
                                                                                                            setJobAnswers(prev => ({ ...prev, [q.id]: next }));
                                                                                                        } else {
                                                                                                            setJobAnswers(prev => ({ ...prev, [q.id]: opt }));
                                                                                                        }
                                                                                                    }}>
                                                                                                        <Check className={cn(
                                                                                                            "mr-2 h-4 w-4 text-blue-600",
                                                                                                            q.type === 'multiselect'
                                                                                                                ? jobAnswers[q.id]?.includes(opt) ? "opacity-100" : "opacity-0"
                                                                                                                : jobAnswers[q.id] === opt ? "opacity-100" : "opacity-0"
                                                                                                        )} />
                                                                                                        {opt}
                                                                                                    </CommandItem>
                                                                                                ))}
                                                                                            </CommandGroup>
                                                                                        </CommandList>
                                                                                    </Command>
                                                                                </PopoverContent>
                                                                            </Popover>

                                                                            {/* Multiselect Badges */}
                                                                            {q.type === 'multiselect' && jobAnswers[q.id]?.length > 0 && (
                                                                                <div className="flex flex-wrap gap-1.5">
                                                                                    {jobAnswers[q.id].map(val => (
                                                                                        <Badge key={val} variant="secondary" className="text-sm py-1 px-2 bg-blue-50 text-blue-600 border-blue-100 flex items-center gap-1">
                                                                                            {val}
                                                                                            <X
                                                                                                className="h-3 w-3 cursor-pointer hover:text-blue-800"
                                                                                                onClick={() => setJobAnswers(prev => ({ ...prev, [q.id]: prev[q.id].filter(x => x !== val) }))}
                                                                                            />
                                                                                        </Badge>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </TableRow>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-12">
                                                <div className="bg-slate-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                                                    <HelpCircle className="h-8 w-8 text-slate-400" />
                                                </div>
                                                <h3 className="text-lg font-semibold text-slate-700 mb-2">Job Questions Not Loaded</h3>
                                                <p className="text-sm text-slate-500 mb-4">Please select a job level to load requirement-specific questions</p>
                                                <div className="text-sm text-slate-400 bg-slate-50 rounded-lg p-3 max-w-md mx-auto">
                                                    <p>Select a Department, Sub-Department, and Service Class to load the relevant job questions for this enquiry.</p>
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* ADDITIONAL REMARKS SECTION */}
                                <Card className={`border-blue-100 shadow-sm overflow-hidden bg-white mb-4 ${workflowRestrictionSummary?.hasBlockingWorkflow && !taskToEdit ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <CardHeader className="bg-blue-50/50 py-3 px-6 border-b border-blue-100">
                                        <CardTitle className="text-sm font-black text-blue-800 uppercase tracking-wider flex items-center gap-2">
                                            <FileText className="h-4 w-4" />
                                            Additional Remarks
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                        <Textarea
                                            value={formData.job_description}
                                            onChange={e => setFormData(prev => ({ ...prev, job_description: e.target.value }))}
                                            disabled={workflowRestrictionSummary?.hasBlockingWorkflow && !taskToEdit}
                                            placeholder="Capture additional client context here..."
                                            className="min-h-[120px] bg-white border-slate-200 p-4"
                                        />
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </div>

                    {/* STATIC FOOTER */}
                    <DialogFooter className="p-6 bg-white border-t border-blue-100 shrink-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
                        <div className="flex items-center justify-between w-full">
                            <div className="flex flex-col">
                                <span className="text-sm text-slate-400 font-semibold uppercase tracking-wide">Enquiry Ready</span>
                                <span className="text-sm text-blue-600 font-bold truncate max-w-[400px]">
                                    {selectedIndividual?.full_name || "Awaiting Selection"}
                                </span>
                            </div>
                            <div className="flex gap-3">
                                <Button
                                    variant="ghost"
                                    onClick={() => onOpenChange(false)}
                                    disabled={loading}
                                    className="px-6 font-semibold uppercase text-sm tracking-wide text-slate-500 hover:text-slate-700"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleSubmit}
                                    disabled={loading || !selectedIndividual || !formData.department_id || (workflowRestrictionSummary?.hasBlockingWorkflow && !taskToEdit)}
                                    className="px-10 bg-blue-600 hover:bg-blue-700 h-11 text-white font-bold uppercase text-sm tracking-wide transition-all"
                                >
                                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                    {taskToEdit ? 'Update Enquiry' : 'Finalize Enquiry'}
                                </Button>
                            </div>
                        </div>
                    </DialogFooter>
                </DialogContent >
            </Dialog >

            {/* Passport Upload — same UploadModal (storage upload + extraction) RequirementsTab
                uses for every other document, pointed at this individual's passport row
                directly (acc_portal_directors_documents, keyed by director_id/document_id)
                rather than a task/stage, since this dialog can run before a task exists. */}
            {showPassportUpload && selectedIndividual && (
                <UploadModal
                    isOpen={showPassportUpload}
                    onClose={() => setShowPassportUpload(false)}
                    onSuccess={() => {
                        setShowPassportUpload(false);
                        fetchApplicantPhotoAndPassport(selectedIndividual.id);
                        toast({ title: "Passport Uploaded", description: "The passport number will populate automatically once it's processed." });
                    }}
                    documentName={passportKycDoc?.display_name || passportKycDoc?.name || "Passport"}
                    documentFields={passportKycDoc?.fields || []}
                    entityName={selectedIndividual.full_name}
                    entityId={String(selectedIndividual.id)}
                    selectedDoc={passportKycDoc ? { ...passportKycDoc, id: PASSPORT_DOCUMENT_ID } : undefined}
                    selectedMember={{ id: selectedIndividual.id, full_name: selectedIndividual.full_name, type: 'individual', name: selectedIndividual.full_name }}
                    selectedDocumentId={PASSPORT_DOCUMENT_ID}
                    targetTable="acc_portal_directors_documents"
                    idFieldName="director_id"
                    documentIdFieldName="document_id"
                />
            )}

            {/* Company Association Dialog */}
            < Dialog open={showCompanyAssociationDialog} onOpenChange={setShowCompanyAssociationDialog} >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Link2 className="h-5 w-5 text-blue-600" />
                            Associate Individual to Company
                        </DialogTitle>
                        <DialogDescription>
                            Link {selectedIndividual?.full_name} to a company with specified role and details.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Individual Type */}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="individual_type" className="">Role Type</Label>
                            <div className="col-span-3">
                                <Select
                                    value={newAssociationData.individual_type}
                                    onValueChange={(value) => setNewAssociationData(prev => ({ ...prev, individual_type: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select role type..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Principal">Principal</SelectItem>
                                        <SelectItem value="Director">Director</SelectItem>
                                        <SelectItem value="Employee">Employee</SelectItem>
                                        <SelectItem value="Shareholder">Shareholder</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Company Selection */}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="company" className="">Company</Label>
                            <div className="col-span-3">
                                <div className="space-y-3">
                                    <div className="relative">
                                        <Input
                                            placeholder="Search existing company or type new company name..."
                                            value={companySearchTerm}
                                            onChange={(e) => {
                                                setCompanySearchTerm(e.target.value);
                                                setNewAssociationData(prev => ({ ...prev, company_id: '' }));
                                            }}
                                        />

                                        {companySearchTerm.trim() && (
                                            <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg max-h-60">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setNewAssociationData(prev => ({ ...prev, company_id: 'unallocated' }));
                                                        setCompanySearchTerm('Un-allocated Company');
                                                    }}
                                                    className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left hover:bg-slate-50"
                                                >
                                                    <Building2 className="h-4 w-4 text-slate-500" />
                                                    <span className="text-sm">Un-allocated Company</span>
                                                    <Badge variant="secondary" className="ml-auto text-sm">Special</Badge>
                                                </button>

                                                {filteredAssociationCompanies.map(company => (
                                                    <button
                                                        key={company.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setNewAssociationData(prev => ({ ...prev, company_id: String(company.id) }));
                                                            setCompanySearchTerm(company.company_name);
                                                        }}
                                                        className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left hover:bg-gray-100 last:border-b-0"
                                                    >
                                                        <Building2 className="h-4 w-4 text-gray-500" />
                                                        <span className="text-sm">{company.company_name}</span>
                                                        <Badge variant="secondary" className="ml-auto text-sm">Existing</Badge>
                                                    </button>
                                                ))}

                                                {!allCompanies.some(company =>
                                                    company.company_name?.toLowerCase() === companySearchTerm.trim().toLowerCase()
                                                ) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenCompanyCreateDialog(companySearchTerm.trim())}
                                                            className="flex w-full items-center gap-2 bg-blue-50 px-3 py-2 text-left hover:bg-blue-100"
                                                        >
                                                            <PlusCircle className="h-4 w-4 text-blue-600" />
                                                            <span className="text-sm font-medium text-blue-800">Create "{companySearchTerm.trim()}"</span>
                                                            <Badge variant="default" className="ml-auto bg-blue-600 text-sm">New</Badge>
                                                        </button>
                                                    )}
                                            </div>
                                        )}
                                    </div>

                                    {newAssociationData.company_id && (
                                        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Building2 className="h-4 w-4 text-green-600" />
                                                    <span className="text-sm font-medium text-green-800">
                                                        {newAssociationData.company_id === 'unallocated'
                                                            ? 'Un-allocated Company'
                                                            : (allCompanies.find(company => String(company.id) === String(newAssociationData.company_id))?.company_name || companySearchTerm)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="default" className="bg-green-600 text-sm">Selected</Badge>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => {
                                                            setNewAssociationData(prev => ({ ...prev, company_id: '' }));
                                                            setCompanySearchTerm('');
                                                        }}
                                                        className="h-6 w-6 p-0 text-gray-500 hover:text-red-600"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Effective Dates - Show for applicable roles */}
                        {['Principal', 'Director', 'Employee', 'Shareholder'].includes(newAssociationData.individual_type) && (
                            <>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="effective_start_date" className="">Effective From</Label>
                                    <div className="col-span-3">
                                        <Input
                                            id="effective_start_date"
                                            type="date"
                                            value={newAssociationData.effective_start_date}
                                            onChange={(e) => setNewAssociationData(prev => ({ ...prev, effective_start_date: e.target.value }))}
                                            placeholder="DD/MM/YYYY"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="effective_end_date" className="">Effective To</Label>
                                    <div className="col-span-3">
                                        <Input
                                            id="effective_end_date"
                                            type="date"
                                            value={newAssociationData.effective_end_date}
                                            onChange={(e) => setNewAssociationData(prev => ({ ...prev, effective_end_date: e.target.value }))}
                                            placeholder="DD/MM/YYYY (optional)"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Shares Held - Show for Shareholder */}
                        {newAssociationData.individual_type === 'Shareholder' && (
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="shares_held" className="">Shares Held</Label>
                                <div className="col-span-3">
                                    <Input
                                        id="shares_held"
                                        type="number"
                                        value={newAssociationData.shares_held}
                                        onChange={(e) => setNewAssociationData(prev => ({ ...prev, shares_held: e.target.value }))}
                                        placeholder="e.g., 1000"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowCompanyAssociationDialog(false)}
                            disabled={associationLoading}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateCompanyAssociation}
                            disabled={associationLoading || !newAssociationData.individual_type || !newAssociationData.company_id}
                        >
                            {associationLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating Association...
                                </>
                            ) : (
                                <>
                                    <Link2 className="mr-2 h-4 w-4" />
                                    Create Association
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showCompanyCreateDialog} onOpenChange={setShowCompanyCreateDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <PlusCircle className="h-5 w-5 text-blue-600" />
                            Create Company
                        </DialogTitle>
                        <DialogDescription>
                            Create a new company using the same client-category setup used in quick add.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="new-company-name">Company Name</Label>
                            <Input
                                id="new-company-name"
                                value={newCompanyName}
                                onChange={(e) => setNewCompanyName(e.target.value)}
                                placeholder="Enter company name..."
                            />
                        </div>

                        <div className="space-y-4">
                            <Label>Client Categories</Label>
                            <div className="space-y-3">
                                {CLIENT_CATEGORIES.map((category) => (
                                    <div key={category} className="rounded-lg border p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <Checkbox
                                                    checked={companyCategories[category]?.isActive || false}
                                                    onCheckedChange={(checked) => handleCompanyCategoryChange(category, 'isActive', Boolean(checked))}
                                                />
                                                <span className="font-medium text-slate-800">{category}</span>
                                            </div>
                                            <Badge variant={companyCategories[category]?.isActive ? "default" : "secondary"}>
                                                {companyCategories[category]?.isActive ? "Active" : "Inactive"}
                                            </Badge>
                                        </div>

                                        <div className="mt-3 grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <Label className="text-sm text-slate-500">Effective From</Label>
                                                <Input
                                                    type="date"
                                                    value={companyCategories[category]?.wef || ''}
                                                    onChange={(e) => handleCompanyCategoryChange(category, 'wef', e.target.value)}
                                                    disabled={!companyCategories[category]?.isActive}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-sm text-slate-500">Effective To</Label>
                                                <Input
                                                    type="date"
                                                    value={companyCategories[category]?.to || ''}
                                                    onChange={(e) => handleCompanyCategoryChange(category, 'to', e.target.value)}
                                                    disabled={!companyCategories[category]?.isActive}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowCompanyCreateDialog(false);
                                resetCompanyCreationState();
                            }}
                            disabled={associationLoading}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleCreateCompany} disabled={associationLoading || !newCompanyName.trim()}>
                            {associationLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating Company...
                                </>
                            ) : (
                                <>
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Create Company
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
