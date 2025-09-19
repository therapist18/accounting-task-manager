// @ts-nocheck
"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { User, Users, Phone, Mail, MapPin, Building2, Loader2, Info, FileText, Briefcase, UserPlus, UserCheck, Shield } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { fetchDepartments } from "../../departments/departments/database"
import { format } from "date-fns"

interface Individual {
    id: number
    full_name: string
    first_name?: string
    last_name?: string
    contact_details?: {
        phone?: {
            kenyan?: { primary?: string }
        }
        email?: { primary?: string }
    }
    individual_type: 'principal' | 'dependant'
    relationships?: Array<{
        related_individual_id: number
        relationship_type: string
        related_individual?: {
            id: number
            full_name: string
        }
    }>
    r_number?: string
}

interface EnquiryDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onEnquiryCreated: (enquiry: any) => void
    departments: any[]
    users: any[]
    officers: any[]
}

export function EnquiryDialog({
    open,
    onOpenChange,
    onEnquiryCreated,
    departments: propDepartments = [],
    users = [],
    officers = []
}: EnquiryDialogProps) {
    const [applicantType, setApplicantType] = useState<'principal' | 'dependant'>('principal')
    const [individuals, setIndividuals] = useState<Individual[]>([])
    const selectedIndividualRef = useRef<Individual | null>(null);
    const [selectedIndividual, setSelectedIndividualState] = useState<Individual | null>(null);
    const setSelectedIndividual = useCallback((individual: Individual | null) => {
        selectedIndividualRef.current = individual;
        setSelectedIndividualState(individual);
    }, []);
    const [departments, setDepartments] = useState<any[]>(propDepartments || [])
    const [localUsers, setLocalUsers] = useState<any[]>(users || [])
    const [localOfficers, setLocalOfficers] = useState<any[]>(officers || [])
    const [loadingStaff, setLoadingStaff] = useState(false)
    const [loading, setLoading] = useState(false)
    const [searchLoading, setSearchLoading] = useState(false)
    const [taskType, setTaskType] = useState<'new' | 'renewal'>('new')
    const [includeDependants, setIncludeDependants] = useState(false)
    const [availableDependants, setAvailableDependants] = useState<Individual[]>([])
    const [selectedDependants, setSelectedDependants] = useState<string[]>([])
    const [includeReferences, setIncludeReferences] = useState(false)
    const [availableReferences, setAvailableReferences] = useState<Individual[]>([])
    const [selectedReferences, setSelectedReferences] = useState<string[]>([])
    const [companies, setCompanies] = useState<any[]>([])
    const [selectedCompany, setSelectedCompany] = useState<string>('')
    const [understudies, setUnderstudies] = useState<any[]>([])
    const [selectedUnderstudy, setSelectedUnderstudy] = useState<string>('')
    const [loadingCompanies, setLoadingCompanies] = useState(false)
    const [loadingUnderstudies, setLoadingUnderstudies] = useState(false)
    const [principalForDependant, setPrincipalForDependant] = useState<Individual | null>(null);
    const [availableOfficers, setAvailableOfficers] = useState([])
    const [availableManagers, setAvailableManagers] = useState([])
    const [availableAssistants, setAvailableAssistants] = useState([])
    const isInitialLoad = useRef(true);
    // State to control the individual selection popover
    const [isIndividualPopoverOpen, setIsIndividualPopoverOpen] = useState(false);


    // Form data - enhanced with staff fields
    const [formData, setFormData] = useState({
        // Individual details (for new individuals)
        full_name: '',
        mobile_number: '',

        // Job details
        job_description: '',
        department_id: '',
        subdepartment_id: '',
        class_id: '',
        subclass_id: '',
        department_name: '',
        subdepartment_name: '',
        class_name: '',

        // Principal member (for dependants)
        principal_member_id: '',

        // Staff assignments
        officer_id: '',
        task_manager_id: '',
        task_assistant_id: '',

        // Enquiry date
        enquiry_date: new Date().toISOString().split('T')[0]
    })
    const handleChange = useCallback((field: keyof FormData, value: any) => {
        setFormData(prev => {
            if (field === 'department_id') {
                console.log(`[LOG] Department changed to ID: ${value}. Resetting sub-dept, class, and staff.`);
                return {
                    ...prev,
                    department_id: value,
                    subdepartment_id: '',
                    class_id: '',
                    subclass_id: '',
                    // Clear all staff assignments when department changes
                    officer_id: '',
                    task_manager_id: '',
                    task_assistant_id: ''
                };
            }

            if (field === 'subdepartment_id') {
                console.log(`[LOG] Subdepartment changed to ID: ${value}. Resetting class and staff.`);
                return {
                    ...prev,
                    subdepartment_id: value,
                    class_id: '',
                    subclass_id: '',
                    // Clear all staff assignments when subdepartment changes
                    officer_id: '',
                    task_manager_id: '',
                    task_assistant_id: ''
                };
            }

            if (field === 'class_id') {
                return { ...prev, class_id: value, subclass_id: '' };
            }

            // When manager changes, clear assistant
            if (field === 'task_manager_id') {
                console.log(`[LOG] Task Manager changed to ID: ${value}. Resetting assistant.`);
                return {
                    ...prev,
                    task_manager_id: value,
                    task_assistant_id: '' // Always reset assistant when manager changes
                };
            }

            return { ...prev, [field]: value };
        });
    }, []);

    const loadStaffData = useCallback(async () => {
        console.log('📥 [LOG] Loading staff data from database...');
        setLoadingStaff(true);

        try {
            const [usersResult, officersResult] = await Promise.all([
                supabase.from('tm_users').select('*').order('name'),
                supabase.from('tm_users').select('*').eq('role', 'officer').order('name')
            ]);

            if (usersResult.error) throw usersResult.error;
            if (officersResult.error) throw officersResult.error;

            setLocalUsers(usersResult.data || []);
            setLocalOfficers(officersResult.data || []);
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to load staff data",
                variant: "destructive"
            });
        } finally {
            setLoadingStaff(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return;

        if ((users && users.length > 0) && (officers && officers.length > 0)) {
            setLocalUsers(users);
            setLocalOfficers(officers);
            return;
        }

        if (localUsers.length === 0 || localOfficers.length === 0) {
            loadStaffData();
        }
    }, [open]);

    useEffect(() => {
        if (users && users.length > 0) {
            setLocalUsers(users);
        }
        if (officers && officers.length > 0) {
            setLocalOfficers(officers);
        }
    }, [users, officers]);

    const findActiveStaffForSubdept = useCallback((subdept, allUsers, allOfficers) => {
        console.log('🔍 [LOG] findActiveStaffForSubdept called for:', subdept?.name);

        if (!subdept || !allUsers || !allOfficers) {
            console.log('❌ [LOG] Missing required data for staff filtering');
            return { officers: [], managers: [], assistants: [] };
        }

        // Check if history fields exist
        const hasOfficerHistory = subdept.officer_history && Array.isArray(subdept.officer_history);
        const hasManagerHistory = subdept.manager_history && Array.isArray(subdept.manager_history);
        const hasAssistantHistory = subdept.assistant_history && Array.isArray(subdept.assistant_history);

        if (!hasOfficerHistory && !hasManagerHistory && !hasAssistantHistory) {
            console.log('⚠️ [LOG] No history fields found - using fallback to all available staff');
            return {
                officers: allOfficers,
                managers: allUsers.filter(u => u.role === 'user' || u.role === 'admin'),
                assistants: allUsers.filter(u => u.role === 'user')
            };
        }

        // Helper to get active user IDs from a history array
        const getActiveUserIds = (historyArray) => {
            if (!historyArray || !Array.isArray(historyArray)) return [];
            return historyArray
                .filter(item => item && !item.end_date) // Active if no end date
                .map(item => item.id) // Use 'id' instead of 'user_id'
                .filter(Boolean); // Remove null/undefined IDs
        };

        const activeOfficerIds = getActiveUserIds(subdept.officer_history);
        const activeManagerIds = getActiveUserIds(subdept.manager_history);
        const activeAssistantIds = getActiveUserIds(subdept.assistant_history);
        
        console.log('[LOG] Active staff IDs found:', {
            officers: activeOfficerIds,
            managers: activeManagerIds,
            assistants: activeAssistantIds
        });


        const hasSpecificAssignments = activeOfficerIds.length > 0 || activeManagerIds.length > 0 || activeAssistantIds.length > 0;

        if (!hasSpecificAssignments) {
            console.log(`⚠️ [LOG] No specific staff assignments for subdept "${subdept.name}". Using fallback roles.`);
            return {
                officers: allOfficers,
                managers: allUsers.filter(u => u.role === 'user' || u.role === 'admin'),
                assistants: allUsers.filter(u => u.role === 'user')
            };
        }

        const staff = {
            officers: allOfficers.filter(o => activeOfficerIds.includes(o.id)),
            managers: allUsers.filter(u => activeManagerIds.includes(u.id)),
            assistants: allUsers.filter(u => activeAssistantIds.includes(u.id)),
        };

        console.log(`✅ [LOG] Found filtered staff for subdept "${subdept.name}":`, staff);
        return staff;
    }, []);

    const updateTaskFields = useCallback(async (taskData: any) => {
        if (!taskData) return;

        // Update IDs first
        setFormData(prev => ({
            ...prev,
            department_id: taskData.department_id?.toString() || '',
            subdepartment_id: taskData.subdepartment_id?.toString() || '',
            class_id: taskData.class_id?.toString() || '',
            subclass_id: taskData.subclass_id?.toString() || '',
            job_description: taskData.job_description || '',
            officer_id: taskData.officer_id || '',
            task_manager_id: taskData.task_manager_id || '',
            task_assistant_id: taskData.task_assistant_id || ''
        }));

        // Fetch department, subdepartment, and class names
        try {
            // Fetch department and subdepartment details
            const { data: deptData } = await supabase
                .from('tm_departments')
                .select('id, name, tm_subdepartments(id, name, classes(id, name))')
                .eq('id', taskData.department_id)
                .single();

            if (deptData) {
                // Update form data with names
                const subdept = deptData.tm_subdepartments.find(s => s.id === taskData.subdepartment_id);
                const cls = subdept?.classes?.find(c => c.id.toString() === taskData.class_id);

                setFormData(prev => ({
                    ...prev,
                    department_name: deptData.name,
                    subdepartment_name: subdept?.name || '',
                    class_name: cls?.name || ''
                }));
            }

            // Update selections
            if (taskData.department_id) {
                handleChange('department_id', taskData.department_id);
            }
            if (taskData.subdepartment_id) {
                handleChange('subdepartment_id', taskData.subdepartment_id);
            }
            if (taskData.class_id) {
                handleChange('class_id', taskData.class_id);
            }
        } catch (error) {
            console.error('Error fetching department details:', error);
            toast({
                title: "Error",
                description: "Failed to load department details",
                variant: "destructive"
            });
        }
    }, [handleChange])

    useEffect(() => {
        const loadDepartments = async () => {
            try {
                // Use prop departments if available, otherwise fetch
                if (propDepartments && propDepartments.length > 0) {
                    console.log('📦 [LOG] Using prop departments:', propDepartments.length);
                    setDepartments(propDepartments);
                } else {
                    console.log('🔄 [LOG] Fetching departments from API...');
                    const depts = await fetchDepartments()
                    setDepartments(depts)
                }
            } catch (error) {
                console.error('Error loading departments:', error)
            }
        }

        // Only load departments if we don't have them yet and dialog is open
        if (open && departments.length === 0) {
            loadDepartments()
        }
    }, [open, propDepartments, departments.length])

    useEffect(() => {
        if (!open || !formData.subdepartment_id || localUsers.length === 0 || localOfficers.length === 0) {
            return;
        }

        console.log(`🔄 [LOG] Filtering staff for subdepartment ID: ${formData.subdepartment_id}`);

        const dept = departments.find(d => d.id.toString() === formData.department_id);
        const subdept = dept?.tm_subdepartments?.find(s => s.id.toString() === formData.subdepartment_id);

        if (subdept) {
            const activeStaff = findActiveStaffForSubdept(subdept, localUsers, localOfficers);

            setAvailableOfficers(activeStaff.officers);
            setAvailableManagers(activeStaff.managers);
            setAvailableAssistants([]); // Assistants depend on manager selection, so clear for now

            // Reset selections
            setFormData(prev => ({
                ...prev,
                officer_id: '',
                task_manager_id: '',
                task_assistant_id: ''
            }));
        }
    }, [open, formData.subdepartment_id, localUsers.length, localOfficers.length, departments.length, findActiveStaffForSubdept]);

    useEffect(() => {
        if (!open || !formData.subdepartment_id || !formData.task_manager_id) {
            // If no manager selected, clear assistants
            setAvailableAssistants([]);
            return;
        }
        
        const filterAssistantsByManager = () => {
            console.log(`[LOG] Filtering assistants for Manager ID: ${formData.task_manager_id}`);
            const dept = departments.find(d => d.id.toString() === formData.department_id);
            const subdept = dept?.tm_subdepartments?.find(s => s.id.toString() === formData.subdepartment_id);

            if (!subdept) return;

            // Get assistants assigned to this subdepartment and linked to the selected manager
            const assistantsForManager = subdept.assistant_history
                ?.filter(assistant =>
                    !assistant.end_date && // Active assignments only
                    assistant.manager_id?.toString() === formData.task_manager_id
                )
                ?.map(assistant => assistant.id) || [];

            // Filter local users to get the actual assistant user objects
            const availableAssistants = localUsers.filter(user =>
                assistantsForManager.includes(user.id)
            );

            console.log(`🎯 [LOG] Found ${availableAssistants.length} assistants for manager ${formData.task_manager_id}`);
            setAvailableAssistants(availableAssistants);
        };

        filterAssistantsByManager();
    }, [formData.task_manager_id, formData.subdepartment_id, departments, localUsers]);

    const searchIndividuals = useCallback(async (type: 'principal' | 'dependant') => {
        console.log(`🔍 [LOG] Searching for individuals of type: ${type}`);
        setSearchLoading(true)
        try {
            const { data, error } = await supabase
                .from('registry_individuals')
                .select(`
                    id,
                    full_name,
                    first_name,
                    last_name,
                    contact_details,
                    individual_type,
                    r_number,
                    relationships, 
                    references,
                    employment_data
                `)
                .eq('individual_type', type)
                .order('full_name')

            if (error) throw error
            
            console.log(`✅ [LOG] Found ${data?.length || 0} individuals.`);
            setIndividuals(data || [])
        } catch (error) {
            console.error('Error searching individuals:', error)
            toast({
                title: "Error",
                description: "Failed to load individuals",
                variant: "destructive"
            })
        } finally {
            setSearchLoading(false)
        }
    }, [])

    const fetchDependants = async (principalId: number) => {
        console.log(`👨‍👩‍👧 [LOG] Fetching dependants for principal ID: ${principalId}`);
        try {
            // First, get the principal with their relationships
            const { data: principal, error: principalError } = await supabase
                .from('registry_individuals')
                .select(`
                id,
                relationships
            `)
                .eq('id', principalId)
                .single()

            if (principalError) throw principalError
            if (!principal?.relationships?.length) return []

            // Extract all related individual IDs from relationships (excluding self)
            const relatedIds = principal.relationships
                .map((rel: any) => rel.individual_id)
                .filter((id: number) => id && id !== principalId)

            if (relatedIds.length === 0) return []

            // Fetch all related individuals
            const { data: familyMembers, error } = await supabase
                .from('registry_individuals')
                .select(`
                id,
                full_name,
                first_name,
                last_name,
                contact_details,
                individual_type,
                r_number
            `)
                .in('id', relatedIds)
                .order('full_name')

            if (error) throw error

            // Map relationships to include the relationship type
            return (familyMembers || []).map(member => {
                const relationship = principal.relationships.find(
                    (rel: any) => rel.individual_id === member.id
                )
                return {
                    ...member,
                    relationship_type: relationship?.relationship || 'family member'
                }
            })
        } catch (error) {
            console.error('Error fetching dependants:', error)
            return []
        }
    }

    const fetchReferences = async (individualId: number) => {
        console.log(`🔗 [LOG] Fetching references for individual ID: ${individualId}`);
        try {
            const { data: individual, error } = await supabase
                .from('registry_individuals')
                .select(`
                id,
                references
            `)
                .eq('id', individualId)
                .single()

            if (error) throw error
            if (!individual?.references?.length) return []

            // Extract reference IDs from the references array
            const referenceIds = individual.references
                .map((ref: any) => ref.id)
                .filter((id: number) => id && id !== individualId)

            if (referenceIds.length === 0) return []

            // Fetch all reference individuals
            const { data: referenceMembers, error: refError } = await supabase
                .from('registry_individuals')
                .select(`
                id,
                full_name,
                first_name,
                last_name,
                contact_details,
                individual_type,
                r_number
            `)
                .in('id', referenceIds)
                .order('full_name')

            if (refError) throw refError

            return (referenceMembers || []).map(member => ({
                ...member,
                relationship_type: 'reference'
            }))
        } catch (error) {
            console.error('Error fetching references:', error)
            return []
        }
    }

    const fetchCompanies = async (individualId: number) => {
        if (!individualId) return;
        
        console.log(`🏢 [LOG] Fetching companies for individual ID: ${individualId}`);
        setLoadingCompanies(true);
        
        try {
            // Get the individual with their employment data
            const { data: individualData, error: individualError } = await supabase
                .from('registry_individuals')
                .select('employment_data')
                .eq('id', individualId)
                .single();
    
            if (individualError) throw individualError;
    
            const employmentData = individualData?.employment_data;
            
            // Check if employment_data exists and has associations
            if (!employmentData?.associations || !Array.isArray(employmentData.associations)) {
                console.log('📭 [LOG] No employment associations found');
                setCompanies([]);
                setSelectedCompany('');
                setUnderstudies([]);
                setSelectedUnderstudy('');
                return;
            }
    
            // Filter associations by individual_type = 'Principal' and extract company info
            const principalAssociations = employmentData.associations
                .filter((association: any) => 
                    association?.individual_type === 'Principal' && 
                    association?.company_id
                )
                .map((association: any) => ({
                    company_id: association.company_id.toString(),
                    is_current: association.is_current === true,
                    role: association.role || '',
                    start_date: association.start_date,
                    end_date: association.end_date
                }));
    
            console.log(`👔 [LOG] Found ${principalAssociations.length} Principal associations`);
    
            if (principalAssociations.length === 0) {
                console.log('📭 [LOG] No Principal associations found');
                setCompanies([]);
                setSelectedCompany('');
                setUnderstudies([]);
                setSelectedUnderstudy('');
                return;
            }
    
            // Get unique company IDs
            const companyIds = [...new Set(principalAssociations.map(assoc => assoc.company_id))];
    
            // Fetch company details in a single query
            const { data: companiesData, error: companiesError } = await supabase
                .from('acc_portal_company_duplicate')
                .select('id, company_name, understudy')
                .in('id', companyIds);
    
            if (companiesError) throw companiesError;
    
            // Create a map for quick lookup of association data
            const associationMap = new Map();
            principalAssociations.forEach(assoc => {
                const companyId = assoc.company_id;
                if (!associationMap.has(companyId)) {
                    associationMap.set(companyId, []);
                }
                associationMap.get(companyId).push(assoc);
            });
    
            // Enrich company data with employment info
            const companiesWithDetails = (companiesData || []).map(company => {
                const companyId = company.id?.toString();
                const associations = associationMap.get(companyId) || [];
                
                // Determine if any association is current
                const hasCurrent = associations.some(assoc => assoc.is_current);
                
                // For Principal type, we'll consider it as "bill_to" if it's current
                // You can adjust this logic based on your business rules
                const isBillTo = hasCurrent;
                
                return {
                    id: companyId,
                    company_name: company.company_name || 'Unnamed Company',
                    is_bill_to: isBillTo,
                    is_current: hasCurrent,
                    understudy: company.understudy || null,
                    associations: associations // Include all associations for this company
                };
            });
    
            console.log(`✅ [LOG] Processed ${companiesWithDetails.length} companies for Principal`);
            setCompanies(companiesWithDetails);
    
            // Auto-select company logic
            if (companiesWithDetails.length === 1) {
                // If only one company, auto-select it
                const selectedCompanyId = companiesWithDetails[0].id;
                setSelectedCompany(selectedCompanyId);
                fetchUnderstudies(selectedCompanyId);
                console.log(`🎯 [LOG] Auto-selected single company: ${companiesWithDetails[0].company_name}`);
            } else if (companiesWithDetails.length > 1) {
                // If multiple companies, try to select current one or bill_to
                const currentCompany = companiesWithDetails.find(c => c.is_current && c.is_bill_to);
                const fallbackCompany = companiesWithDetails.find(c => c.is_current) || 
                                      companiesWithDetails.find(c => c.is_bill_to);
                
                const autoSelectCompany = currentCompany || fallbackCompany;
                
                if (autoSelectCompany) {
                    setSelectedCompany(autoSelectCompany.id);
                    fetchUnderstudies(autoSelectCompany.id);
                    console.log(`🎯 [LOG] Auto-selected company: ${autoSelectCompany.company_name}`);
                } else {
                    setSelectedCompany('');
                    setUnderstudies([]);
                    setSelectedUnderstudy('');
                    console.log(`⚠️ [LOG] Multiple companies found, no auto-selection made`);
                }
            } else {
                // No companies found
                setSelectedCompany('');
                setUnderstudies([]);
                setSelectedUnderstudy('');
            }
    
        } catch (error) {
            console.error('❌ [LOG] Error fetching companies:', error);
            toast({
                title: "Error",
                description: "Failed to load companies",
                variant: "destructive"
            });
            
            // Reset state on error
            setCompanies([]);
            setSelectedCompany('');
            setUnderstudies([]);
            setSelectedUnderstudy('');
        } finally {
            setLoadingCompanies(false);
        }
    };

    const fetchUnderstudies = async (companyId: string) => {
        if (!companyId) {
            setUnderstudies([]);
            setSelectedUnderstudy('');
            return;
        }
        console.log(`👥 [LOG] Fetching understudies for company ID: ${companyId}`);
        setLoadingUnderstudies(true);
        try {
            // First get the company to check for understudies
            const { data: companyData, error: companyError } = await supabase
                .from('acc_portal_company_duplicate')
                .select('understudy')
                .eq('id', companyId)
                .single();
    
            if (companyError) throw companyError;
            
            const understudiesData = companyData?.understudy || [];
            
            if (!understudiesData.length) {
                setUnderstudies([]);
                setSelectedUnderstudy('');
                return;
            }
            
            // Get understudy details from registry_individuals
            const { data: understudies, error } = await supabase
                .from('registry_individuals')
                .select('*')
                .in('id', understudiesData.map((u: any) => u.individual_id));
    
            if (error) throw error;
    
            // Map understudy data with their details
            const understudiesWithDetails = understudies.map(understudy => {
                const understudyInfo = understudiesData.find((u: any) => 
                    u.individual_id === understudy.id
                );
                
                return {
                    ...understudy,
                    employment_details: understudyInfo?.details || {}
                };
            });
    
            setUnderstudies(understudiesWithDetails);
            setSelectedUnderstudy('');
        } catch (error) {
            console.error('Error fetching understudies:', error);
            toast({
                title: "Error",
                description: "Failed to load understudies",
                variant: "destructive"
            });
        } finally {
            setLoadingUnderstudies(false);
        }
    };

    // Load individuals when applicant type changes
    useEffect(() => {
        if (open) {
            console.log(`🔄 [LOG] Applicant type changed to: ${applicantType}. Reloading and resetting.`);
            searchIndividuals(applicantType);
            setSelectedIndividual(null);
            setPrincipalForDependant(null);
            setCompanies([]);
            setSelectedCompany('');
            setUnderstudies([]);
            setSelectedUnderstudy('');
            setFormData(prev => ({
                ...prev,
                principal_member_id: '',
                officer_id: '',
                task_manager_id: '',
                task_assistant_id: ''
            }));
            setIncludeReferences(false);
            setAvailableReferences([]);
            setSelectedReferences([]);
            setIncludeDependants(false);
            setAvailableDependants([]);
            setSelectedDependants([]);
            setAvailableOfficers([]);
            setAvailableManagers([]);
            setAvailableAssistants([]);
        }
    }, [applicantType, open, searchIndividuals]);

    // Handle company selection change
    useEffect(() => {
        if (selectedCompany) {
            console.log(`[LOG] Company selected: ID ${selectedCompany}. Fetching understudies.`);
            fetchUnderstudies(selectedCompany);
        } else {
            setUnderstudies([]);
            setSelectedUnderstudy('');
        }
    }, [selectedCompany]);

    const availableSubdepartments = useMemo(() => {
        if (!formData.department_id) return []
        const dept = departments.find(d => d.id.toString() === formData.department_id)
        return dept?.tm_subdepartments || []
    }, [departments, formData.department_id])

    const availableClasses = useMemo(() => {
        if (!formData.subdepartment_id) return []
        const subdept = availableSubdepartments.find(s => s.id.toString() === formData.subdepartment_id)
        return subdept?.classes || []
    }, [availableSubdepartments, formData.subdepartment_id])

    const availableSubclasses = useMemo(() => {
        if (!formData.class_id) return []
        const cls = availableClasses.find(c => c.id.toString() === formData.class_id)
        return cls?.subClasses || []
    }, [availableClasses, formData.class_id])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        console.log("🚀 [LOG] Attempting to create enquiry...");
        console.log("📋 [LOG] Current form state:", {
            taskType,
            applicantType,
            selectedIndividual: selectedIndividual?.full_name,
            formData
        });
    
        try {
            const individualToUse = selectedIndividualRef.current;
    
            if (!individualToUse) {
                throw new Error('No individual selected. Please select an individual from the dropdown.');
            }
    
            const individualId = individualToUse.id;
            if (!individualId) {
                throw new Error('Selected individual does not have a valid ID');
            }
    
            console.log("👤 [LOG] Using individual:", {
                id: individualId,
                name: individualToUse.full_name,
                type: individualToUse.individual_type
            });
    
            const dependantsToSave = includeDependants
                ? selectedDependants.map(id => {
                    const dependant = availableDependants.find(d => d.id.toString() === id);
                    return dependant ? {
                        id: dependant.id,
                        name: dependant.full_name,
                        relationship: dependant.relationship_type === 'Principal Member' ? 'Principal' : (dependant.relationship_type || 'Family Member')
                    } : null;
                }).filter(Boolean)
                    .filter(dependant => dependant.relationship !== 'Principal')
                : [];
    
            const referencesToSave = includeReferences
                ? selectedReferences.map(id => {
                    const reference = availableReferences.find(r => r.id.toString() === id);
                    return reference ? {
                        id: reference.id,
                        name: reference.full_name,
                        relationship: reference.relationship_type || 'reference'
                    } : null;
                }).filter(Boolean)
                : [];
    
            console.log("👨‍👩‍👧‍👦 [LOG] Dependants to save:", dependantsToSave);
            console.log("🔗 [LOG] References to save:", referencesToSave);
    
            const enquiryStageId = '1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa';
            const now = new Date();
            const formattedDate = format(now, 'dd/MM/yyyy');
            const initialStages = {
                [enquiryStageId]: {
                    date: formattedDate,
                    status: 'completed',
                    completedAt: now.toISOString(),
                },
            };
    
            const taskData: any = {
                job_description: formData.job_description || '',
                status: 'enquiry',
                renewal_status: taskType, // Also add renewal_status field if your schema supports it
                department_id: formData.department_id,
                subdepartment_id: formData.subdepartment_id,
                individual_id: individualId,
                applicant_type: applicantType,
                class_id: formData.class_id || null,
                subclass_id: formData.subclass_id || null,
                date_initiated: new Date(formData.enquiry_date), // Use the selected date
                applicant_name: individualToUse.full_name,
                stages: initialStages,
                dependant_member: dependantsToSave,
                references: referencesToSave,
                understudy: selectedUnderstudy || null,
                company_id: selectedCompany || null,
                officer_id: formData.officer_id && formData.officer_id !== 'none' ? formData.officer_id : null,
                task_manager_id: formData.task_manager_id && formData.task_manager_id !== 'none' ? formData.task_manager_id : null,
                task_assistant_id: formData.task_assistant_id && formData.task_assistant_id !== 'none' ? formData.task_assistant_id : null,
            };
    
            if (applicantType === 'principal') {
                taskData.principal_member = individualId;
                console.log("👑 [LOG] Set principal_member to:", individualId);
            } else if (applicantType === 'dependant') {
                const principalId = formData.principal_member_id;
                if (!principalId) {
                    throw new Error("Principal member could not be identified for the selected dependant. Cannot create enquiry.");
                }
                taskData.principal_member = principalId;
                console.log("👑 [LOG] Set principal_member for dependant to:", principalId);
            }
    
            // Enhanced logging for staff assignments
            console.log("👥 [LOG] Staff assignments:", {
                officer_id: taskData.officer_id,
                task_manager_id: taskData.task_manager_id,
                task_assistant_id: taskData.task_assistant_id,
                department_id: taskData.department_id,
                subdepartment_id: taskData.subdepartment_id
            });
    
            // --- CRITICAL LOG: SHOW DATA BEFORE SUBMISSION ---
            console.log('📦 [LOG] Submitting the following task data to Supabase:', JSON.stringify(taskData, null, 2));
    
            const { data, error } = await supabase
                .from('tm_tasks')
                .insert([taskData])
                .select()
                .single();
    
            if (error) {
                console.error('❌ [LOG] Supabase insertion error:', error);
                throw error;
            }
            
            console.log('✅ [LOG] Enquiry created successfully! Response:', data);
    
            const { data: fullTask, error: fetchError } = await supabase
                .from('tm_tasks')
                .select(`*,department:department_id(name),subdepartment:subdepartment_id(name),individual:individual_id(full_name)`)
                .eq('id', data.id)
                .single();
                
            if (fetchError) {
                console.error('⚠️ [LOG] Error fetching full task details:', fetchError);
            } else {
                console.log('📋 [LOG] Full task details retrieved:', fullTask);
            }
    
            updateTaskFields(fullTask || data);
    
            onEnquiryCreated(fullTask || data);
            resetForm();
            onOpenChange(false);
    
            toast({
                title: 'Success',
                description: `${taskType === 'renewal' ? 'Renewal' : 'Enquiry'} created successfully with staff assignments`,
            });
        } catch (error) {
            console.error('❌ [LOG] Error creating enquiry:', error);
            console.error('❌ [LOG] Error details:', {
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                formData: formData,
                taskType: taskType,
                applicantType: applicantType
            });
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to create enquiry',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };
    const resetForm = () => {
        console.log("🧹 [LOG] Resetting form to initial state.");
        setFormData({
            full_name: '',
            mobile_number: '',
            job_description: '',
            department_id: '',
            subdepartment_id: '',
            class_id: '',
            subclass_id: '',
            department_name: '',
            subdepartment_name: '',
            class_name: '',
            principal_member_id: '',
            officer_id: '',
            task_manager_id: '',
            task_assistant_id: '',
            enquiry_date: new Date().toISOString().split('T')[0]
        })
        setSelectedIndividual(null)
        setPrincipalForDependant(null);
        setApplicantType('principal')
        setTaskType('new')
        includeDependants && setIncludeDependants(false)
        setSelectedDependants([])
        setAvailableDependants([])
        includeReferences && setIncludeReferences(false)
        setSelectedReferences([])
        setAvailableReferences([])
        setSelectedCompany('')
        setSelectedUnderstudy('')
        setCompanies([])
        setUnderstudies([])
        setAvailableOfficers([])
        setAvailableManagers([])
        setAvailableAssistants([])
    }

    const handleFormChange = (field: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }))
    }

    const handleIndividualSelect = async (individual: Individual) => {
        console.log(`👤 [LOG] Individual selected: ${individual.full_name} (ID: ${individual.id})`);
        setSelectedIndividual(individual);
        setPrincipalForDependant(null);
        setSelectedCompany('');
        setCompanies([]);
        setUnderstudies([]);
        setSelectedUnderstudy('');
        setAvailableDependants([]);
        setSelectedDependants([]);
        setIncludeDependants(false);
        setAvailableReferences([]);
        setSelectedReferences([]);
        setIncludeReferences(false);

        const primaryPhone = individual.contact_details?.phone?.kenyan?.primary || '';
        const formUpdate: any = {
            full_name: individual.full_name,
            mobile_number: primaryPhone,
            principal_member_id: ''
        };

        const references = await fetchReferences(individual.id);
        setAvailableReferences(references);

        const familyMembers = await fetchDependants(individual.id);

        if (individual.individual_type === 'principal') {
            console.log('[LOG] Selected individual is a Principal. Fetching their companies and dependants.');
            setAvailableDependants(familyMembers);
            await fetchCompanies(individual.id);
        } else if (individual.individual_type === 'dependant') {
            console.log('[LOG] Selected individual is a Dependant. Finding their principal member.');
            const principalRelation = individual.relationships?.find(
                (rel: any) => rel.isPrincipal === 'Yes' || ['principal', 'spouse', 'husband', 'wife'].includes(rel.relationship?.toLowerCase())
            );

            if (principalRelation && principalRelation.individual_id) {
                const principalId = principalRelation.individual_id;
                formUpdate.principal_member_id = principalId.toString();
                console.log(`[LOG] Found Principal ID: ${principalId}. Fetching details and companies.`);

                const principalResult = await supabase
                    .from('registry_individuals')
                    .select('id, full_name')
                    .eq('id', principalId)
                    .single();

                if (principalResult.error) {
                    console.error("[LOG] Error fetching principal details:", principalResult.error);
                    toast({ title: "Error", description: "Could not load principal member's details.", variant: "destructive" });
                    return;
                }

                const principalData = principalResult.data;
                setPrincipalForDependant(principalData);

                await fetchCompanies(principalId);

                const principalIndex = familyMembers.findIndex(fm => fm.id === principalId);
                let allFamilyForSelection;

                if (principalIndex !== -1) {
                    allFamilyForSelection = familyMembers
                        .filter(fm => fm.id !== individual.id)
                        .map(fm => fm.id === principalId
                            ? { ...fm, relationship_type: 'Principal Member' }
                            : fm
                        );
                } else {
                    allFamilyForSelection = [
                        { ...principalData, relationship_type: 'Principal Member' },
                        ...familyMembers.filter(fm => fm.id !== individual.id)
                    ];
                }

                setAvailableDependants(allFamilyForSelection);

                console.log('[LOG] Auto-including family members and selecting the Principal.');
                setIncludeDependants(true);
                setSelectedDependants([principalData.id.toString()]);
            } else {
                toast({ title: "Info", description: "No principal member found for this dependant.", variant: "default" });
            }
        }

        setFormData(prev => ({ ...prev, ...formUpdate }));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto border border-gray-200/50 shadow-lg">
                <DialogHeader className="border-b border-gray-200/50 pb-4 bg-white/50">
                    <DialogTitle className="text-2xl font-bold text-gray-900">New Enquiry</DialogTitle>
                    <DialogDescription className="text-gray-600">
                        Record a new client enquiry to start the process
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Main Grid Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left Column - Applicant Information */}
                        <div className="lg:col-span-1 space-y-6">
                            {/* Applicant Type */}
                            <Card className="border border-gray-200/50 rounded-lg bg-white/50 shadow-sm hover:shadow-md transition-shadow duration-200">
                                <CardHeader className="pb-3 bg-blue-50/50 border-b border-gray-200/50">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                                        <User className="h-4 w-4" />
                                        Applicant Type
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <RadioGroup
                                        value={applicantType}
                                        onValueChange={(value: 'principal' | 'dependant') => setApplicantType(value)}
                                        className="space-y-2"
                                    >
                                        <div className="flex items-center space-x-2 border-b border-gray-200/50 pb-2 ">
                                            <RadioGroupItem className="border-2 border-blue-500/50 hover:border-blue-500/70 transition-colors duration-200" value="principal" id="principal" />
                                            <Label htmlFor="principal" className="font-normal text-blue-700">
                                                Principal
                                            </Label>
                                        </div>
                                        <div className="flex items-center space-x-2 border-b border-gray-200/50 pb-2">
                                            <RadioGroupItem className="border-2 border-blue-500/50 hover:border-blue-500/70 transition-colors duration-200" value="dependant" id="dependant" />
                                            <Label htmlFor="dependant" className="font-normal">
                                                Dependant
                                            </Label>
                                        </div>
                                    </RadioGroup>
                                </CardContent>
                            </Card>

                            {/* Individual Selection */}
                            <Card className="border border-gray-200/50 rounded-lg bg-white/50 shadow-sm hover:shadow-md transition-shadow duration-200">
                                <CardHeader className="pb-3 bg-blue-50/50 border-b border-gray-200/50">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                                        <Users className="h-4 w-4" />
                                        {selectedIndividual ? 'Selected Individual' : 'Select Individual'}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {searchLoading ? (
                                        <div className="flex items-center justify-center p-4">
                                            <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                                        </div>
                                    ) : (
                                        <Popover open={isIndividualPopoverOpen} onOpenChange={setIsIndividualPopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    className={cn(
                                                        "w-full justify-between",
                                                        !selectedIndividual && "text-muted-foreground"
                                                    )}
                                                >
                                                    {selectedIndividual
                                                        ? individuals.find(
                                                            (individual) => individual.id === selectedIndividual.id
                                                        )?.full_name
                                                        : `Select ${applicantType}...`}
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-full p-0">
                                                <Command>
                                                    <CommandInput placeholder={`Search ${applicantType}...`} className="h-9" />
                                                    <CommandEmpty>No {applicantType} found.</CommandEmpty>
                                                    <CommandGroup className="max-h-60 overflow-auto">
                                                        {individuals.map((individual) => (
                                                            <CommandItem
                                                                value={individual.full_name}
                                                                key={individual.id}
                                                                onSelect={() => {
                                                                    handleIndividualSelect(individual);
                                                                    setIsIndividualPopoverOpen(false); // Close popover on select
                                                                }}
                                                            >
                                                                {individual.full_name}
                                                                <Check
                                                                    className={cn(
                                                                        "ml-auto h-4 w-4",
                                                                        selectedIndividual?.id === individual.id
                                                                            ? "opacity-100"
                                                                            : "opacity-0"
                                                                    )}
                                                                />
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Company Selection */}
                            <Card className="border border-gray-200/50 rounded-lg bg-white/50 shadow-sm hover:shadow-md transition-shadow duration-200">
                                <CardHeader className="pb-3 bg-blue-50/50 border-b border-gray-200/50">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                                        <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                                            <Building2 className="h-4 w-4" />
                                        </Button>
                                        {applicantType === 'dependant' && principalForDependant
                                            ? 'Company (Linked to Principal)'
                                            : 'Select Company'}
                                    </CardTitle>
                                    {applicantType === 'dependant' && principalForDependant && (
                                        <CardDescription className="text-blue-600">
                                            Showing companies for: {principalForDependant.full_name}
                                        </CardDescription>
                                    )}
                                </CardHeader>
                                <CardContent>
                                    <Select
                                        value={selectedCompany}
                                        onValueChange={setSelectedCompany}
                                        disabled={loadingCompanies || !selectedIndividual}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder={loadingCompanies ? "Loading..." : "Select company..."} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {companies && companies.length > 0 ? (
                                                <>
                                                    {companies.map((company) => (
                                                        <SelectItem key={company.id} value={company.id.toString()} className="flex items-center justify-between">
                                                            <span>{company.company_name}</span>
                                                            <div className="flex items-center gap-2 ml-2">
                                                                {company.is_current && (
                                                                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                                                        Current
                                                                    </Badge>
                                                                )}
                                                                {company.is_bill_to && (
                                                                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                                                        Bill To
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </>
                                            ) : (
                                                <div className="px-3 py-2 text-blue-500 text-sm">No companies found</div>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </CardContent>
                            </Card>

                            <Card className="border border-gray-200/50 rounded-lg bg-white/50 shadow-sm hover:shadow-md transition-shadow duration-200">
                                <CardHeader className="pb-3 bg-blue-50/50 border-b border-gray-200/50">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                                        <UserPlus className="h-4 w-4" />
                                        Select Understudy
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Select
                                        value={selectedUnderstudy}
                                        onValueChange={setSelectedUnderstudy}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select understudy..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {understudies && understudies.length > 0 ? (
                                                <>
                                                    {understudies.map((understudy) => (
                                                        <SelectItem key={understudy.id} value={understudy.id.toString()}>
                                                            {understudy.full_name}
                                                        </SelectItem>
                                                    ))}
                                                </>
                                            ) : (
                                                <div className="px-3 py-2 text-blue-500 text-sm">No understudies found</div>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </CardContent>
                            </Card>

                            {/* Dependants Selection */}
                            {availableDependants.length > 0 && (
                                <Card className="border border-gray-200/50 rounded-lg bg-white/50 shadow-sm hover:shadow-md transition-shadow duration-200">
                                    <CardHeader className="pb-3 bg-blue-50/50 border-b border-gray-200/50">
                                        <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                                            <Users className="h-4 w-4" />
                                            Include Family Members
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2 border-b border-gray-200/50 pb-2">
                                            <div className="flex items-center space-x-2 border-b border-gray-200/50 pb-2">
                                                <input
                                                    type="checkbox"
                                                    id="include-dependants"
                                                    checked={includeDependants}
                                                    onChange={(e) => {
                                                        setIncludeDependants(e.target.checked);
                                                        if (!e.target.checked) setSelectedDependants([]);
                                                    }}
                                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <label htmlFor="include-dependants" className="text-blue-700">
                                                    Include family members
                                                </label>
                                            </div>
                                            {includeDependants && (
                                                <div className="mt-2 space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                                                    {availableDependants.map((dependant) => (
                                                        <div key={dependant.id} className="flex items-center space-x-2 p-1 hover:bg-gray-50 rounded">
                                                            <input
                                                                type="checkbox"
                                                                id={`dependant-${dependant.id}`}
                                                                checked={selectedDependants.includes(dependant.id.toString())}
                                                                onChange={(e) => {
                                                                    setSelectedDependants(prev => e.target.checked
                                                                        ? [...prev, dependant.id.toString()]
                                                                        : prev.filter(id => id !== dependant.id.toString())
                                                                    );
                                                                }}
                                                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <label htmlFor={`dependant-${dependant.id}`} className="text-blue-700 text-sm flex-1 flex justify-between items-center">
                                                                <span>{dependant.full_name}</span>
                                                                {dependant.relationship_type === 'Principal Member' ? (
                                                                    <Button type="button" variant="outline" className="border-blue-500 hover:bg-blue-50 text-blue-700 hover:text-blue-900">
                                                                        Principal
                                                                    </Button>
                                                                ) : (
                                                                    <span className="text-xs text-gray-500 capitalize">
                                                                        {dependant.relationship_type || 'Family Member'}
                                                                    </span>
                                                                )}
                                                            </label>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* References Selection */}
                            {availableReferences.length > 0 && (
                                <Card className="border border-gray-200/50 rounded-lg bg-white/50 shadow-sm hover:shadow-md transition-shadow duration-200">
                                    <CardHeader className="pb-3 bg-blue-50/50 border-b border-gray-200/50">
                                        <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                                            <UserCheck className="h-4 w-4" />
                                            Include References
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2 border-b border-gray-200/50 pb-2">
                                            <div className="flex items-center space-x-2 border-b border-gray-200/50 pb-2">
                                                <input
                                                    type="checkbox"
                                                    id="include-references"
                                                    checked={includeReferences}
                                                    onChange={(e) => {
                                                        setIncludeReferences(e.target.checked);
                                                        if (!e.target.checked) setSelectedReferences([]);
                                                    }}
                                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <label htmlFor="include-references" className="text-blue-700">
                                                    Include references
                                                </label>
                                            </div>
                                            {includeReferences && (
                                                <div className="mt-2 space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                                                    {availableReferences.map((reference) => (
                                                        <div key={reference.id} className="flex items-center space-x-2 p-1 hover:bg-gray-50 rounded">
                                                            <input
                                                                type="checkbox"
                                                                id={`reference-${reference.id}`}
                                                                checked={selectedReferences.includes(reference.id.toString())}
                                                                onChange={(e) => {
                                                                    setSelectedReferences(prev => e.target.checked
                                                                        ? [...prev, reference.id.toString()]
                                                                        : prev.filter(id => id !== reference.id.toString())
                                                                    );
                                                                }}
                                                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <label htmlFor={`reference-${reference.id}`} className="text-blue-700 text-sm flex-1">
                                                                {reference.full_name}
                                                            </label>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>

                        {/* Right Column - Enquiry Details */}
                        <div className="lg:col-span-2 space-y-6">
                            <Card className="border border-gray-200/50 rounded-lg bg-white/50 shadow-sm hover:shadow-md transition-shadow duration-200">
                                <CardHeader className="pb-3 bg-blue-50/50 border-b border-gray-200/50">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                                        <FileText className="h-4 w-4" />
                                        Enquiry Details
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="task-type" className="text-sm font-medium">
                                                Task Type <span className="text-red-500">*</span>
                                            </Label>
                                            <Select className="w-full"
                                                value={taskType}
                                                onValueChange={(value: 'new' | 'renewal') => setTaskType(value)}
                                            >
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue placeholder="Select task type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="new">New</SelectItem>
                                                    <SelectItem value="renewal">Renewal</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label htmlFor="enquiry-date" className="text-sm font-medium">
                                                Enquiry Date <span className="text-red-500">*</span>
                                            </Label>
                                            <Input
                                                id="enquiry-date"
                                                type="date"
                                                value={formData.enquiry_date}
                                                onChange={(e) => handleFormChange('enquiry_date', e.target.value)}
                                                className="mt-1"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <Label htmlFor="job-description" className="text-sm font-medium">
                                            Job Description <span className="text-red-500">*</span>
                                        </Label>
                                        <Textarea
                                            id="job-description"
                                            value={formData.job_description}
                                            onChange={(e) => handleFormChange('job_description', e.target.value)}
                                            placeholder="Describe the enquiry details..."
                                            className="mt-1 min-h-[100px]"
                                            required
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Department & Classification */}
                            <Card className="border border-gray-200/50 rounded-lg bg-white/50 shadow-sm hover:shadow-md transition-shadow duration-200">
                                <CardHeader className="pb-3 bg-blue-50/50 border-b border-gray-200/50">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                                        <Building2 className="h-4 w-4" />
                                        Department & Classification
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="department" className="text-sm font-medium">
                                                Department <span className="text-red-500">*</span>
                                            </Label>
                                            <Select className="w-full"
                                                value={formData.department_id}
                                                onValueChange={(value) => {
                                                    const selectedDept = departments.find(d => d.id.toString() === value);
                                                    if (selectedDept) {
                                                        handleChange('department_id', value);
                                                        handleChange('department_name', selectedDept.name);
                                                        handleChange('subdepartment_id', '');
                                                    }
                                                }}
                                                disabled={departments.length === 0}
                                            >
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue
                                                        placeholder={
                                                            departments.length === 0
                                                                ? "Loading departments..."
                                                                : "Select department"
                                                        }
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {departments.map((dept) => (
                                                        <SelectItem key={dept.id} value={dept.id.toString()}>
                                                            {dept.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div>
                                            <Label htmlFor="subdepartment" className="text-sm font-medium">
                                                Subdepartment
                                            </Label>
                                            <Select className="w-full"
                                                value={formData.subdepartment_id}
                                                onValueChange={(value) => {
                                                    const selectedSubdept = availableSubdepartments.find(sd => sd.id.toString() === value);
                                                    if (selectedSubdept) {
                                                        handleChange('subdepartment_id', value);
                                                        handleChange('subdepartment_name', selectedSubdept.name);
                                                    }
                                                }}
                                                disabled={!formData.department_id || availableSubdepartments.length === 0}
                                            >
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue
                                                        placeholder={
                                                            !formData.department_id
                                                                ? "Select department first"
                                                                : availableSubdepartments.length === 0
                                                                    ? "No subdepartments available"
                                                                    : "Select subdepartment"
                                                        }
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableSubdepartments.map((subdept) => (
                                                        <SelectItem key={subdept.id} value={subdept.id.toString()}>
                                                            {subdept.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="class" className="text-sm font-medium">
                                                Class
                                            </Label>
                                            <Select className="w-full"
                                                value={formData.class_id}
                                                onValueChange={(value) => {
                                                    const selectedClass = availableClasses.find(c => c.id.toString() === value);
                                                    if (selectedClass) {
                                                        handleChange('class_id', value);
                                                        handleChange('class_name', selectedClass.name);
                                                    }
                                                }}
                                                disabled={!formData.subdepartment_id || availableClasses.length === 0}
                                            >
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue
                                                        placeholder={
                                                            !formData.subdepartment_id
                                                                ? "Select subdepartment first"
                                                                : availableClasses.length === 0
                                                                    ? "No classes available"
                                                                    : "Select class"
                                                        }
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableClasses.map((cls) => (
                                                        <SelectItem key={cls.id} value={cls.id.toString()}>
                                                            {cls.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div>
                                            <Label htmlFor="subclass" className="text-sm font-medium">
                                                Subclass
                                            </Label>
                                            <Select className="w-full"
                                                value={formData.subclass_id}
                                                onValueChange={(value) => {
                                                    const selectedSubclass = availableSubclasses.find(sc => sc.id.toString() === value);
                                                    if (selectedSubclass) {
                                                        handleChange('subclass_id', value);
                                                        handleChange('subclass_name', selectedSubclass.name);
                                                    }
                                                }}
                                                disabled={!formData.class_id || availableSubclasses.length === 0}
                                            >
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue
                                                        placeholder={
                                                            !formData.class_id
                                                                ? "Select class first"
                                                                : availableSubclasses.length === 0
                                                                    ? "No subclasses available"
                                                                    : "Select subclass"
                                                        }
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableSubclasses.map((subclass) => (
                                                        <SelectItem key={subclass.id} value={subclass.id.toString()}>
                                                            {subclass.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Staff Assignment Section - NEW */}
                            <Card className="border border-gray-200/50 rounded-lg bg-white/50 shadow-sm hover:shadow-md transition-shadow duration-200">
                                <CardHeader className="pb-3 bg-blue-50/50 border-b border-gray-200/50">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                                        <Shield className="h-4 w-4" />
                                        Staff Assignment
                                    </CardTitle>
                                    <CardDescription className="text-blue-600 text-xs">
                                        {!formData.subdepartment_id
                                            ? "Select a subdepartment first to see available staff"
                                            : "Staff filtered based on subdepartment assignments"
                                        }
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* Officer Selection */}
                                    <div className="space-y-2">
                                        <Label className="text-xs font-medium flex items-center">
                                            <Shield className="w-3 h-3 mr-1" />
                                            Officer
                                            {formData.subdepartment_id && (
                                                <span className="ml-2 text-xs text-slate-500">
                                                    ({availableOfficers.length} available)
                                                </span>
                                            )}
                                        </Label>
                                        <Select
                                            value={formData.officer_id}
                                            onValueChange={(value) => handleChange('officer_id', value)}
                                            disabled={!formData.subdepartment_id || loadingStaff}
                                        >
                                            <SelectTrigger className="w-full h-8 text-xs">
                                                <SelectValue placeholder={
                                                    !formData.subdepartment_id
                                                        ? "Select subdepartment first"
                                                        : loadingStaff
                                                            ? "Loading..."
                                                            : "Select officer"
                                                } />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">No Officer</SelectItem>
                                                {availableOfficers.map((officer) => (
                                                    <SelectItem key={officer.id} value={officer.id.toString()}>
                                                        {officer.name || officer.email}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {formData.subdepartment_id && availableOfficers.length === 0 && !loadingStaff && (
                                            <p className="text-xs text-amber-600">No officers assigned to this subdepartment.</p>
                                        )}
                                    </div>

                                    {/* Task Manager Selection */}
                                    <div className="space-y-2">
                                        <Label className="text-xs font-medium flex items-center">
                                            <User className="w-3 h-3 mr-1" />
                                            Task Manager
                                            {formData.subdepartment_id && (
                                                <span className="ml-2 text-xs text-slate-500">
                                                    ({availableManagers.length} available)
                                                </span>
                                            )}
                                        </Label>
                                        <Select
                                            value={formData.task_manager_id}
                                            onValueChange={(value) => handleChange('task_manager_id', value)}
                                            disabled={!formData.subdepartment_id || loadingStaff}
                                        >
                                            <SelectTrigger className="w-full h-8 text-xs">
                                                <SelectValue placeholder={
                                                    !formData.subdepartment_id
                                                        ? "Select subdepartment first"
                                                        : loadingStaff
                                                            ? "Loading..."
                                                            : "Select task manager"
                                                } />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">No Task Manager</SelectItem>
                                                {availableManagers.map((manager) => (
                                                    <SelectItem key={manager.id} value={manager.id.toString()}>
                                                        {manager.name || manager.email}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {formData.subdepartment_id && availableManagers.length === 0 && !loadingStaff && (
                                            <p className="text-xs text-amber-600">No managers assigned to this subdepartment.</p>
                                        )}
                                    </div>

                                    {/* Task Assistant Selection - Only shown when manager is selected */}
                                    <div className="space-y-2">
                                        <Label className="text-xs font-medium flex items-center">
                                            <UserCheck className="w-3 h-3 mr-1" />
                                            Task Assistant
                                            {formData.task_manager_id && (
                                                <span className="ml-2 text-xs text-slate-500">
                                                    ({availableAssistants.length} available for selected manager)
                                                </span>
                                            )}
                                        </Label>
                                        <Select
                                            value={formData.task_assistant_id}
                                            onValueChange={(value) => handleChange('task_assistant_id', value)}
                                            disabled={!formData.task_manager_id || loadingStaff}
                                        >
                                            <SelectTrigger className="w-full h-8 text-xs">
                                                <SelectValue placeholder={
                                                    !formData.subdepartment_id
                                                        ? "Select subdepartment first"
                                                        : !formData.task_manager_id
                                                            ? "Select a manager first"
                                                            : loadingStaff
                                                                ? "Loading..."
                                                                : availableAssistants.length === 0
                                                                    ? "No assistants available for this manager"
                                                                    : "Select task assistant"
                                                } />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">No Task Assistant</SelectItem>
                                                {availableAssistants.map((assistant) => (
                                                    <SelectItem key={assistant.id} value={assistant.id.toString()}>
                                                        {assistant.name || assistant.email}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        {/* Helper text */}
                                        {!formData.task_manager_id ? (
                                            <p className="text-xs text-blue-500">Select a manager to see available assistants</p>
                                        ) : formData.task_manager_id && availableAssistants.length === 0 && !loadingStaff ? (
                                            <p className="text-xs text-amber-600">
                                                No assistants are linked to the selected manager in this subdepartment.
                                            </p>
                                        ) : null}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    {/* Form Actions */}
                    <DialogFooter className="border-t border-gray-200/50 pt-4 bg-white/50 flex flex-col sm:flex-row sm:justify-between gap-3 flex-end">
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-blue-500 hover:bg-blue-50 text-blue-700 hover:text-blue-900"
                                onClick={() => {
                                    resetForm();
                                    onOpenChange(false);
                                }}
                                disabled={loading}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    'Create Enquiry'
                                )}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}