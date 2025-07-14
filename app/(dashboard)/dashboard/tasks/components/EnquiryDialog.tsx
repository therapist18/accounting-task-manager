// @ts-nocheck
"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { User, Users, Phone, Mail, MapPin, Building2, Loader2, Info, FileText, Briefcase, UserPlus, UserCheck } from "lucide-react"
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
}

export function EnquiryDialog({ open, onOpenChange, onEnquiryCreated }: EnquiryDialogProps) {
    const [applicantType, setApplicantType] = useState<'principal' | 'dependant'>('principal')
    const [individuals, setIndividuals] = useState<Individual[]>([])
    // Use a ref to maintain the selected individual across re-renders
    const selectedIndividualRef = useRef<Individual | null>(null);
    const [selectedIndividual, setSelectedIndividualState] = useState<Individual | null>(null);

    // Update both the state and ref when selected individual changes
    const setSelectedIndividual = useCallback((individual: Individual | null) => {
        selectedIndividualRef.current = individual;
        setSelectedIndividualState(individual);
    }, []);
    const [departments, setDepartments] = useState<any[]>([])
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
    const [subdepartments, setSubdepartments] = useState<Array<Subdepartment & {
        taskManager?: {
            id: string;
            name: string | null;
            email: string | null;
            phone_number?: string | null;
            start_date?: string;
            end_date?: string | null;
        } | null;
        taskAssistant?: {
            id: string;
            name: string | null;
            email: string | null;
            phone_number?: string | null;
            start_date?: string;
            end_date?: string | null;
        } | null;
        task_manager?: {
            id: number;
            start_date?: string;
            end_date?: string | null;
        } | null;
        task_assistant?: {
            id: number;
            start_date?: string;
            end_date?: string | null;
        } | null;
        classes?: Array<{
            name: string;
            description: string | null;
            requirements: Array<{
                name: string;
                description: string | null;
                is_required?: boolean;
            }>;
        }>;
    }>>([]);
    // Form data
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

        // Principal member (for dependants)
        principal_member_id: '',

        // Enquiry date
        enquiry_date: new Date().toISOString().split('T')[0]
    })

    // Load departments on mount
    useEffect(() => {
        const loadDepartments = async () => {
            try {
                const depts = await fetchDepartments()
                setDepartments(depts)
            } catch (error) {
                console.error('Error loading departments:', error)
            }
        }

        if (open) {
            loadDepartments()
        }
    }, [open])

    // Search for individuals based on applicant type
    const searchIndividuals = useCallback(async (type: 'principal' | 'dependant') => {
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
                    employment_history
                `)
                .eq('individual_type', type)
                .order('full_name')

            if (error) throw error

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

    // Fetch family members for a principal
    const fetchDependants = async (principalId: number) => {
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

    // Fetch references for an individual
    const fetchReferences = async (individualId: number) => {
        try {
            // Get the individual with their references array
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

        setLoadingCompanies(true);
        try {
            // Get the individual with their employment history and bill_to information
            const { data: individualData, error: individualError } = await supabase
                .from('registry_individuals')
                .select('employment_history, bill_to')
                .eq('id', individualId)
                .single();

            if (individualError) throw individualError;

            const employmentHistory = individualData?.employment_history || [];
            const individualBillTo = individualData?.bill_to || null;

            if (!employmentHistory || employmentHistory.length === 0) {
                setCompanies([]);
                setSelectedCompany('');
                setUnderstudies([]);
                setSelectedUnderstudy('');
                return;
            }

            // Filter for director roles and get unique company IDs
            const directorCompanies = employmentHistory
                .filter((job: any) =>
                    job.role?.toLowerCase() === 'director' &&
                    job.company_id
                )
                .map((job: any) => job.company_id);

            const uniqueCompanyIds = [...new Set(directorCompanies)];

            if (uniqueCompanyIds.length === 0) {
                setCompanies([]);
                setSelectedCompany('');
                setUnderstudies([]);
                setSelectedUnderstudy('');
                return;
            }

            // Get the bill_to company ID if it exists
            const billToCompanyId = individualBillTo?.company?.toString();

            // Convert all company IDs to strings for consistent comparison
            const uniqueCompanyIdsStr = uniqueCompanyIds.map(id => id.toString());

            // Combine all company IDs (director companies + bill_to company if different)
            const allCompanyIds = [...new Set([...uniqueCompanyIdsStr, billToCompanyId].filter(Boolean))];

            // Fetch all companies including the bill_to company
            const { data: companiesData, error: companiesError } = await supabase
                .from('acc_portal_company_duplicate')
                .select('id, company_name')
                .in('id', allCompanyIds);

            if (companiesError) throw companiesError;

            console.log('Raw companies data from database:', companiesData);

            // Create a map of company IDs to their data for easy lookup
            const companyMap = new Map();

            (companiesData || []).forEach(company => {
                if (!company) return;
                const companyId = company.id?.toString();
                if (!companyId) return;

                const mappedCompany = {
                    ...company,
                    id: companyId,
                    company_name: company.company_name || 'Unnamed Company',
                    is_bill_to: companyId === billToCompanyId
                };
                companyMap.set(companyId, mappedCompany);
                console.log('Mapped company:', mappedCompany);
            });

            const companiesWithDetails = Array.from(companyMap.values())
                .filter(company => {
                    // Convert both IDs to strings for comparison
                    const companyId = company.id?.toString();
                    return uniqueCompanyIdsStr.includes(companyId) ||
                        (billToCompanyId === companyId && !uniqueCompanyIdsStr.includes(companyId));
                });

            console.log('Filtered companies:', companiesWithDetails);
            setCompanies(companiesWithDetails);
            console.log('Companies state after setting:', companiesWithDetails);

            // Auto-select the first company if only one exists
            if (companiesWithDetails.length === 1) {
                setSelectedCompany(companiesWithDetails[0].id);
                fetchUnderstudies(companiesWithDetails[0].id);
            } else {
                setSelectedCompany('');
                setUnderstudies([]);
                setSelectedUnderstudy('');
            }
        } catch (error) {
            console.error('Error fetching companies:', error);
            toast({
                title: "Error",
                description: "Failed to load companies",
                variant: "destructive"
            });
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

        setLoadingUnderstudies(true);
        try {
            // Get all individuals who have this company in their employment history as understudies
            const { data: individuals, error } = await supabase
                .from('registry_individuals')
                .select('*');

            if (error) throw error;

            // Filter individuals who are understudies for this company
            const understudiesList = individuals.filter(individual => {
                if (!individual.employment_history) return false;

                return individual.employment_history.some((job: any) =>
                    job.company_id === companyId &&
                    job.understudy?.is_understudy === true
                );
            });

            // Add employment details to each understudy
            const understudiesWithDetails = understudiesList.map(understudy => {
                const employment = understudy.employment_history.find((job: any) =>
                    job.company_id === companyId &&
                    job.understudy?.is_understudy === true
                );

                return {
                    ...understudy,
                    employment_details: employment?.understudy || {}
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
            searchIndividuals(applicantType);
            setSelectedIndividual(null);
            setPrincipalForDependant(null);
            setCompanies([]);
            setSelectedCompany('');
            setUnderstudies([]);
            setSelectedUnderstudy('');
            setFormData(prev => ({
                ...prev,
                principal_member_id: ''
            }));
            // Clear references and dependants when dialog opens
            setIncludeReferences(false);
            setAvailableReferences([]);
            setSelectedReferences([]);
            setIncludeDependants(false);
            setAvailableDependants([]);
            setSelectedDependants([]);
        }
    }, [applicantType, open, searchIndividuals]);

    // Handle company selection change
    useEffect(() => {
        if (selectedCompany) {
            fetchUnderstudies(selectedCompany);
        } else {
            setUnderstudies([]);
            setSelectedUnderstudy('');
        }
    }, [selectedCompany]);

    // Get available subdepartments
    const availableSubdepartments = useMemo(() => {
        if (!formData.department_id) return []
        const dept = departments.find(d => d.id === formData.department_id)
        return dept?.tm_subdepartments || []
    }, [departments, formData.department_id])

    // Get available classes
    const availableClasses = useMemo(() => {
        if (!formData.subdepartment_id) return []
        const subdept = availableSubdepartments.find(s => s.id === formData.subdepartment_id)
        return subdept?.classes || []
    }, [availableSubdepartments, formData.subdepartment_id])

    // Get available subclasses
    const availableSubclasses = useMemo(() => {
        if (!formData.class_id) return []
        const cls = availableClasses.find(c => c.id.toString() === formData.class_id)
        return cls?.subClasses || []
    }, [availableClasses, formData.class_id])

    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const individualToUse = selectedIndividualRef.current;

            if (!individualToUse) {
                // Logic to handle newly created individual can be added here if needed
                throw new Error('No individual selected. Please select an individual from the dropdown.');
            }

            const individualId = individualToUse.id;
            if (!individualId) {
                throw new Error('Selected individual does not have a valid ID');
            }

            // Prepare dependant and reference data with full details
            const dependantsToSave = includeDependants
                ? selectedDependants.map(id => {
                    const dependant = availableDependants.find(d => d.id.toString() === id);
                    return dependant ? {
                        id: dependant.id,
                        name: dependant.full_name,
                        relationship: dependant.relationship_type === 'Principal Member' ? 'Principal' : (dependant.relationship_type || 'Family Member')
                    } : null;
                }).filter(Boolean)
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

            // Prepare the initial stage data
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

            // Prepare the task data
            const taskData: any = {
                job_description: formData.job_description || '',
                status: 'enquiry',
                department_id: formData.department_id,
                subdepartment_id: formData.subdepartment_id,
                individual_id: individualId,
                applicant_type: applicantType,
                class_id: formData.class_id || null,
                subclass_id: formData.subclass_id || null,
                date_initiated: now,
                applicant_name: individualToUse.full_name,
                stages: initialStages,
                dependant_member: dependantsToSave,
                references: referencesToSave,
                understudy: selectedUnderstudy || null,
                company_id: selectedCompany || null,
            };

            // Assign principal member based on applicant type
            if (applicantType === 'principal') {
                taskData.principal_member = individualId;
            } else if (applicantType === 'dependant') {
                const principalId = formData.principal_member_id;
                if (!principalId) {
                    throw new Error("Principal member could not be identified for the selected dependant. Cannot create enquiry.");
                }
                taskData.principal_member = principalId;
            }

            // Insert the task into the database
            const { data, error } = await supabase
                .from('tm_tasks')
                .insert([taskData])
                .select()
                .single();

            if (error) throw error;

            // Notify parent component
            const { data: fullTask, error: fetchError } = await supabase.from('tm_tasks').select(`*,department:department_id(name),subdepartment:subdepartment_id(name),individual:individual_id(full_name)`).eq('id', data.id).single();
            if (fetchError) console.error('Error fetching task details:', fetchError);

            onEnquiryCreated(fullTask || data);
            resetForm();
            onOpenChange(false);

            toast({
                title: 'Success',
                description: 'Enquiry created successfully',
            });
        } catch (error) {
            console.error('Error creating enquiry:', error);
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
        setFormData({
            full_name: '',
            mobile_number: '',
            job_description: '',
            department_id: '',
            subdepartment_id: '',
            class_id: '',
            subclass_id: '',
            principal_member_id: '',
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
    }

    const handleChange = useCallback((field: keyof FormData, value: any) => {
        setFormData(prev => {
            if (field === 'department_id') {
                return {
                    ...prev,
                    department_id: value,
                    subdepartment_id: '',
                    class_id: '',
                    subclass_id: '',
                };
            }
            if (field === 'subdepartment_id') {
                return { ...prev, subdepartment_id: value, class_id: '', subclass_id: '' };
            }
            if (field === 'class_id') {
                return { ...prev, class_id: value, subclass_id: '' };
            }
            return { ...prev, [field]: value };
        });
    }, []);

    const handleFormChange = (field: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }))
    }

    const handleIndividualSelect = async (individual: Individual) => {
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

        // Fetch family members for the selected individual
        const familyMembers = await fetchDependants(individual.id);

        if (individual.individual_type === 'principal') {
            setAvailableDependants(familyMembers);
        } else if (individual.individual_type === 'dependant') {
            const principalRelation = individual.relationships?.find(
                (rel: any) => rel.isPrincipal === 'Yes' || ['principal', 'spouse', 'husband', 'wife'].includes(rel.relationship?.toLowerCase())
            );

            if (principalRelation && principalRelation.individual_id) {
                const principalId = principalRelation.individual_id;
                formUpdate.principal_member_id = principalId.toString();

                // Fetch principal details and their companies
                const [principalResult, companiesResult] = await Promise.all([
                    supabase.from('registry_individuals').select('id, full_name').eq('id', principalId).single(),
                    fetchCompanies(principalId)
                ]);

                if (principalResult.error) {
                    console.error("Error fetching principal details:", principalResult.error);
                    toast({ title: "Error", description: "Could not load principal member's details.", variant: "destructive" });
                    return;
                }

                const principalData = principalResult.data;
                setPrincipalForDependant(principalData);

                // Include principal in selection but exclude selected individual
                const allFamilyForSelection = [
                    { ...principalData, relationship_type: 'Principal Member' },
                    ...familyMembers.filter(fm => fm.id !== individual.id)
                ];

                // Only show family members of the selected applicant
                setAvailableDependants([
                    ...familyMembers.filter(fm => fm.id !== individual.id)
                ]);

                // Set companies linked to the principal member
                setCompanies(companiesResult);
                setSelectedCompany('');
            } else {
                toast({ title: "Info", description: "No principal member found for this dependant.", variant: "default" });
            }
        }

        setFormData(prev => ({ ...prev, ...formUpdate }));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
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
                            <Card className="border border-gray-200 rounded-lg">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2">
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
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="principal" id="principal" />
                                            <Label htmlFor="principal" className="font-normal">
                                                Principal
                                            </Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="dependant" id="dependant" />
                                            <Label htmlFor="dependant" className="font-normal">
                                                Dependant
                                            </Label>
                                        </div>
                                    </RadioGroup>
                                </CardContent>
                            </Card>

                            {/* Individual Selection */}
                            <Card className="border border-gray-200 rounded-lg">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2">
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
                                        <Select
                                            value={selectedIndividual?.id?.toString() || ''}
                                            onValueChange={(value) => {
                                                const individual = individuals.find(i => i.id.toString() === value);
                                                if (individual) handleIndividualSelect(individual);
                                            }}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder={`Select ${applicantType}...`}>
                                                    {selectedIndividual && <span>{selectedIndividual.full_name}</span>}
                                                </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent className="max-h-60">
                                                {individuals.map((individual) => (
                                                    <SelectItem key={individual.id} value={individual.id.toString()}>
                                                        {individual.full_name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}

                                    {/* OR Create New section remains for manual entry */}
                                </CardContent>
                            </Card>

                            {/* Company Selection */}
                            <Card className="border border-gray-200 rounded-lg">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                                        <Building2 className="h-4 w-4" />
                                        {applicantType === 'dependant' && principalForDependant
                                            ? 'Company (Linked to Principal)'
                                            : 'Select Company'}
                                    </CardTitle>
                                    {applicantType === 'dependant' && principalForDependant && (
                                        <CardDescription>
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
                                                        <SelectItem key={company.id} value={company.id.toString()}>
                                                            {company.company_name} {company.is_bill_to && "(Bill To)"}
                                                        </SelectItem>
                                                    ))}
                                                </>
                                            ) : (
                                                <div className="px-3 py-2 text-sm text-muted-foreground">No companies found</div>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </CardContent>
                            </Card>

                            {/* Understudy Selection */}
                            {selectedCompany && (
                                <Card className="border border-gray-200 rounded-lg">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                                            <UserPlus className="h-4 w-4" />
                                            Select Understudy
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <Select value={selectedUnderstudy} onValueChange={setSelectedUnderstudy}>
                                            <SelectTrigger><SelectValue placeholder="Select understudy..." /></SelectTrigger>
                                            <SelectContent>
                                                {understudies.length > 0 ? (
                                                    understudies.map((understudy) => (
                                                        <SelectItem key={understudy.id} value={understudy.id}>
                                                            {understudy.full_name}
                                                        </SelectItem>
                                                    ))
                                                ) : (
                                                    <div className="px-3 py-2 text-sm text-muted-foreground">No understudies found</div>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </CardContent>
                                </Card>)}

                            {/* Dependants Selection */}
                            {availableDependants.length > 0 && (
                                <Card className="border border-gray-200 rounded-lg">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                                            <Users className="h-4 w-4" />
                                            Include Family Members
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2">
                                            <div className="flex items-center space-x-2">
                                                <input
                                                    type="checkbox" id="include-dependants" checked={includeDependants}
                                                    onChange={(e) => {
                                                        setIncludeDependants(e.target.checked);
                                                        if (!e.target.checked) setSelectedDependants([]);
                                                    }}
                                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <label htmlFor="include-dependants" className="text-sm font-medium">Include family members</label>
                                            </div>
                                            {includeDependants && (
                                                <div className="mt-2 space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                                                    {availableDependants.map((dependant) => (
                                                        <div key={dependant.id} className="flex items-center space-x-2 p-1 hover:bg-gray-50 rounded">
                                                            <input
                                                                type="checkbox" id={`dependant-${dependant.id}`}
                                                                checked={selectedDependants.includes(dependant.id.toString())}
                                                                onChange={(e) => {
                                                                    setSelectedDependants(prev => e.target.checked
                                                                        ? [...prev, dependant.id.toString()]
                                                                        : prev.filter(id => id !== dependant.id.toString())
                                                                    );
                                                                }}
                                                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <label htmlFor={`dependant-${dependant.id}`} className="text-sm flex-1 flex justify-between items-center">
                                                                <span>{dependant.full_name}</span>
                                                                {dependant.relationship_type === 'Principal Member' ? (
                                                                    <Badge variant="outline">Principal</Badge>
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
                                <Card className="border border-gray-200 rounded-lg">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                                            <UserCheck className="h-4 w-4" />
                                            Include References
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2">
                                            <div className="flex items-center space-x-2">
                                                <input
                                                    type="checkbox" id="include-references" checked={includeReferences}
                                                    onChange={(e) => {
                                                        setIncludeReferences(e.target.checked);
                                                        if (!e.target.checked) setSelectedReferences([]);
                                                    }}
                                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <label htmlFor="include-references" className="text-sm font-medium">Include references</label>
                                            </div>
                                            {includeReferences && (
                                                <div className="mt-2 space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                                                    {availableReferences.map((reference) => (
                                                        <div key={reference.id} className="flex items-center space-x-2 p-1 hover:bg-gray-50 rounded">
                                                            <input
                                                                type="checkbox" id={`reference-${reference.id}`}
                                                                checked={selectedReferences.includes(reference.id.toString())}
                                                                onChange={(e) => {
                                                                    setSelectedReferences(prev => e.target.checked
                                                                        ? [...prev, reference.id.toString()]
                                                                        : prev.filter(id => id !== reference.id.toString())
                                                                    );
                                                                }}
                                                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <label htmlFor={`reference-${reference.id}`} className="text-sm flex-1">{reference.full_name}</label>
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
                            <Card className="border border-gray-200 rounded-lg">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2">
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
                                            <Select
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
                            <Card className="border border-gray-200 rounded-lg">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2">
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
                                            <Select
                                                value={formData.department_id}
                                                onValueChange={(value) => {
                                                    const selectedDept = departments.find(d => d.id === value);
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
                                                        <SelectItem key={dept.id} value={dept.id}>
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
                                            <Select
                                                value={formData.subdepartment_id}
                                                onValueChange={(value) => {
                                                    const selectedSubdept = availableSubdepartments.find(sd => sd.id === value);
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
                                                        <SelectItem key={subdept.id} value={subdept.id}>
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
                                            <Select
                                                value={formData.class_id}
                                                onValueChange={(value) => {
                                                    const selectedClass = availableClasses.find(c => c.id === value);
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
                                                        <SelectItem key={cls.id} value={cls.id}>
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
                                            <Select
                                                value={formData.subclass_id}
                                                onValueChange={(value) => {
                                                    const selectedSubclass = availableSubclasses.find(sc => sc.id === value);
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
                                                        <SelectItem key={subclass.id} value={subclass.id}>
                                                            {subclass.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                    {/* Form Actions */}
                    <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                resetForm();
                                onOpenChange(false);
                            }}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                'Create Enquiry'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
