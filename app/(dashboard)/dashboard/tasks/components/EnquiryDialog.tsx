// @ts-nocheck
"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { User, Users, Phone, Mail, MapPin, Building2, Loader2, Info, FileText, Briefcase, UserPlus } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { fetchDepartments } from "../../departments/departments/database"

interface Individual {
    id: number
    full_name: string
    first_name?: string
    last_name?: string
    contact_details?: {
        phone?: {
            kenyan?: { primary?: string }
            whatsapp?: string
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
    const [selectedIndividual, setSelectedIndividual] = useState<Individual | null>(null)
    const [departments, setDepartments] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [searchLoading, setSearchLoading] = useState(false)
    const [taskType, setTaskType] = useState<'new' | 'renewal'>('new')
    const [includeDependants, setIncludeDependants] = useState(false)
    const [availableDependants, setAvailableDependants] = useState<Individual[]>([])
    const [selectedDependants, setSelectedDependants] = useState<string[]>([])
    const [companies, setCompanies] = useState<any[]>([])
    const [selectedCompany, setSelectedCompany] = useState<string>('')
    const [understudies, setUnderstudies] = useState<any[]>([])
    const [selectedUnderstudy, setSelectedUnderstudy] = useState<string>('')
    const [loadingCompanies, setLoadingCompanies] = useState(false)
    const [loadingUnderstudies, setLoadingUnderstudies] = useState(false)
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
                    employment_history
                `)
                .eq('individual_type', type)
                .order('full_name')

            if (error) throw error

            setIndividuals(data || [])

            // If searching for principals, show their dependants in the include section
            if (type === 'principal' && selectedIndividual?.individual_type === 'principal') {
                const dependants = await fetchDependants(selectedIndividual.id)
                setAvailableDependants(dependants)
            }
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
    }, [selectedIndividual])

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

            // Extract all related individual IDs from relationships
            const relatedIds = principal.relationships
                .filter((rel: any) => rel.individual_id && rel.individual_id !== principalId)
                .map((rel: any) => rel.individual_id)

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
                    r_number,
                    relationships
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

    // Fetch companies for the selected individual
    const fetchCompanies = async (individualId: number) => {
        if (!individualId) return;

        setLoadingCompanies(true);
        try {
            // Get the individual with their employment history
            const { data: individualData, error: individualError } = await supabase
                .from('registry_individuals')
                .select('employment_history')
                .eq('id', individualId)
                .single();

            if (individualError) throw individualError;

            const employmentHistory = individualData?.employment_history || [];
            
            if (!employmentHistory || employmentHistory.length === 0) {
                setCompanies([]);
                setSelectedCompany('');
                setUnderstudies([]);
                setSelectedUnderstudy('');
                return;
            }

            // Extract unique company IDs from employment history
            const companyIds = [...new Set(
                employmentHistory
                    .filter((job: any) => job.company_id)
                    .map((job: any) => job.company_id)
            )];

            if (companyIds.length === 0) {
                setCompanies([]);
                setSelectedCompany('');
                setUnderstudies([]);
                setSelectedUnderstudy('');
                return;
            }

            // Fetch company details from acc_portal_company_duplicate
            const { data: companiesData, error: companiesError } = await supabase
                .from('acc_portal_company_duplicate')
                .select('*')
                .in('id', companyIds);

            if (companiesError) throw companiesError;

            // Map the companies with their employment details
            const companiesWithRoles = companiesData?.map(company => {
                // Find the employment record for this company
                const employment = employmentHistory.find(
                    (job: any) => job.company_id === company.id
                );
                
                return {
                    id: company.id,
                    name: company.company_name || 'Unnamed Company',
                    role: employment?.role || 'Employee',
                    start_date: employment?.start_date,
                    end_date: employment?.end_date,
                    on_payroll: employment?.on_payroll === 'Yes',
                    ...company
                };
            }) || [];

            setCompanies(companiesWithRoles);

            // Auto-select the first company if only one exists
            if (companiesWithRoles.length === 1) {
                setSelectedCompany(companiesWithRoles[0].id);
                fetchUnderstudies(companiesWithRoles[0].id);
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

    // Fetch understudies for the selected company
    const fetchUnderstudies = async (companyId: string) => {
        if (!companyId) {
            setUnderstudies([]);
            setSelectedUnderstudy('');
            return;
        }

        setLoadingUnderstudies(true);
        try {
            const { data, error } = await supabase
                .from('registry_individuals')
                .select('*, employment_history')
                .eq('company_id', companyId)
                .eq('is_understudy', true);

            if (error) throw error;

            setUnderstudies(data || []);
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
            setCompanies([]);
            setSelectedCompany('');
            setUnderstudies([]);
            setSelectedUnderstudy('');
            setFormData(prev => ({
                ...prev,
                principal_member_id: ''
            }));
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
            if (!selectedIndividual) {
                throw new Error('Please select an individual');
            }

            // Prepare the task data
            const taskData = {
                title: `Enquiry for ${selectedIndividual.full_name}`,
                description: formData.job_description,
                status: 'new',
                priority: 'medium',
                due_date: null, // Set appropriate due date if needed
                assigned_to: null, // Will be assigned by the workflow
                created_by: null, // Will be set by the server
                department_id: formData.department_id || null,
                subdepartment_id: formData.subdepartment_id || null,
                class_id: formData.class_id || null,
                subclass_id: formData.subclass_id || null,
                individual_id: selectedIndividual.id,
                task_type: taskType,
                dependant_data: {
                    company_id: selectedCompany || null,
                    understudy_id: selectedUnderstudy || null,
                    dependants: includeDependants ? selectedDependants : []
                },
                metadata: {
                    enquiry_date: formData.enquiry_date,
                    applicant_type: applicantType,
                    ...(applicantType === 'dependant' && principalMemberDetails && {
                        principal_member_id: principalMemberDetails.id,
                        relationship_type: principalMemberDetails.relationship_type
                    })
                }
            };

            // Insert the task into the database
            const { data, error } = await supabase
                .from('tasks')
                .insert([taskData])
                .select()
                .single();

            if (error) throw error;

            // Notify parent component
            onEnquiryCreated(data);

            // Reset form
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
            });
            setSelectedIndividual(null);
            setSelectedCompany('');
            setSelectedUnderstudy('');
            setSelectedDependants([]);
            setIncludeDependants(false);

            // Close the dialog
            onOpenChange(false);

            // Show success message
            toast({
                title: 'Success',
                description: 'Enquiry created successfully',
                variant: 'default'
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

    // Get principal member details for dependants
    const principalMemberDetails = useMemo(() => {
        if (applicantType !== 'dependant' || !selectedIndividual?.relationships?.length) return null

        // Find the principal relationship
        const principalRelation = selectedIndividual.relationships.find(
            (rel: any) => rel.isPrincipal === 'Yes' ||
                rel.relationship === 'principal' ||
                rel.relationship === 'spouse' ||
                rel.relationship === 'husband' ||
                rel.relationship === 'wife'
        )

        if (!principalRelation) return null

        // If we have the principal's details in the relationship, use them
        if (principalRelation.full_name) {
            return {
                id: principalRelation.individual_id,
                full_name: principalRelation.full_name,
                relationship_type: principalRelation.relationship
            }
        }

        // Otherwise, we need to fetch the principal's details
        const fetchPrincipal = async () => {
            const { data, error } = await supabase
                .from('registry_individuals')
                .select('id, full_name')
                .eq('id', principalRelation.individual_id)
                .single()

            if (error || !data) return null

            return {
                id: data.id,
                full_name: data.full_name,
                relationship_type: principalRelation.relationship
            }
        }

        // Return a promise that will be handled by the component
        return fetchPrincipal()
    }, [applicantType, selectedIndividual])

    const handleFormChange = (field: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }))
    }

    const handleIndividualSelect = async (individual: Individual) => {
        setSelectedIndividual(individual);

        // Reset company and understudy selections
        setCompanies([]);
        setSelectedCompany('');
        setUnderstudies([]);
        setSelectedUnderstudy('');

        // Update form data with individual details
        const formUpdate: any = {
            full_name: individual.full_name,
            mobile_number: individual.contact_details?.personal_mobile_num_kenyan_1 ||
                individual.contact_details?.personal_mobile_num_kenyan_2 ||
                individual.contact_details?.office_phone_number ||
                individual.contact_details?.broadcast_whatsapp_number ||
                '',
            principal_member_id: ''
        };

        if (individual.individual_type === 'principal') {
            // If selecting a principal, fetch their family members and companies
            const [familyMembers] = await Promise.all([
                fetchDependants(individual.id),
                fetchCompanies(individual.id)
            ]);
            setAvailableDependants(familyMembers);
        } else if (individual.individual_type === 'dependant' && individual.relationships?.length) {
            // For dependants, find the principal from relationships
            const principalRelation = individual.relationships.find(
                (rel: any) => rel.isPrincipal === 'Yes' ||
                    rel.relationship === 'principal' ||
                    rel.relationship === 'spouse' ||
                    rel.relationship === 'husband' ||
                    rel.relationship === 'wife'
            );

            if (principalRelation) {
                formUpdate.principal_member_id = principalRelation.individual_id.toString();

                // If we have the principal's details in the relationship, update the form
                if (principalRelation.full_name) {
                    formUpdate.principal_member_name = principalRelation.full_name;
                }

                // Fetch companies for the principal
                if (principalRelation.individual_id) {
                    await fetchCompanies(principalRelation.individual_id);
                }
            }

            setFormData(prev => ({
                ...prev,
                ...formUpdate
            }))
        }

        const createNewIndividual = async (individualData: any) => {
            try {
                const newIndividual = {
                    full_name: individualData.full_name,
                    first_name: individualData.full_name.split(' ')[0] || '',
                    last_name: individualData.full_name.split(' ').slice(-1)[0] || '',
                    individual_type: applicantType,
                    contact_details: {
                        phone: {
                            kenyan: {
                                primary: individualData.mobile_number
                            }
                        }
                    },
                    status: 'Active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }

                const { data, error } = await supabase
                    .from('registry_individuals')
                    .insert([newIndividual])
                    .select()
                    .single()

                if (error) throw error
                return data
            } catch (error) {
                console.error('Error creating individual:', error)
                throw error
            }
        }

        const handleSubmit = async (e: React.FormEvent) => {
            e.preventDefault();
            setLoading(true);

            try {
                let individualId = selectedIndividual?.id;

                // If no individual selected, create a new one
                if (!selectedIndividual) {
                    if (!formData.full_name || !formData.mobile_number) {
                        throw new Error('Please provide name and mobile number for new individual');
                    }

                    const newIndividual = await createNewIndividual({
                        full_name: formData.full_name,
                        mobile_number: formData.mobile_number
                    });
                    individualId = newIndividual.id;
                }

                // Prepare dependant data
                const dependantData = {
                    company_id: selectedCompany || null,
                    understudy_id: selectedUnderstudy || null,
                    dependants: includeDependants ? selectedDependants : []
                };

                // Get stage IDs
                const enquiryStageId = "1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa"

                // Format date as DD/MM/YYYY
                const enquiryDate = new Date(formData.enquiry_date);
                const formattedDate = `${String(enquiryDate.getDate()).padStart(2, '0')}/` +
                    `${String(enquiryDate.getMonth() + 1).padStart(2, '0')}/` +
                    `${enquiryDate.getFullYear()}`;

                // Create the stages JSON object with enquiry stage completed
                const stagesData = {
                    [enquiryStageId]: {
                        date: formattedDate,
                        status: 'completed',
                        completedAt: new Date().toISOString()
                    }
                }

                // Create the task with enquiry status and stages data
                const taskData = {
                    job_description: formData.job_description,
                    status: 'enquiry',
                    department_id: Number(formData.department_id),
                    subdepartment_id: Number(formData.subdepartment_id),
                    class_id: formData.class_id ? Number(formData.class_id) : null,
                    subclass_id: formData.subclass_id ? Number(formData.subclass_id) : null,
                    applicant_type: applicantType,
                    task_type: taskType,
                    applicant_name: formData.full_name,
                    principal_member_name: principalMemberDetails?.full_name || '',
                    date_initiated: new Date(formData.enquiry_date).toISOString(),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    r_number: selectedIndividual?.r_number || null,
                    individual_id: individualId,
                    include_dependants: includeDependants,
                    selected_dependants: includeDependants ? selectedDependants : [],
                    dependant_data: dependantData,
                    stages: stagesData, // Store as JSON in the stages column
                }

                const { data: newTask, error: taskError } = await supabase
                    .from('tm_tasks')
                    .insert([taskData])
                    .select('*')
                    .single()

                if (taskError) throw taskError

                toast({
                    title: "Success",
                    description: "Enquiry recorded successfully",
                })

                onEnquiryCreated(newTask)
                onOpenChange(false)

                // Reset form
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

            } catch (error) {
                console.error('Error creating enquiry:', error)
                toast({
                    title: "Error",
                    description: error instanceof Error ? error.message : "Failed to create enquiry",
                    variant: "destructive"
                })
            } finally {
                setLoading(false)
            }
        }

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
            setApplicantType('principal')
            setTaskType('new')
            setIncludeDependants(false)
            setSelectedDependants([])
            setAvailableDependants([])
        }
        const handleChange = useCallback((field: keyof FormData, value: any) => {
            setFormData(prev => {
                // If changing applicant type, reset related fields
                if (field === 'applicant_type') {
                    return {
                        ...prev,
                        applicant_type: value,
                        client_name: '',
                        principal_member_id: '',
                        principal_member_name: '',
                    };
                }

                // If changing department, reset subdepartment and its dependant fields
                if (field === 'department_id') {
                    const selectedDept = departments.find(d => d.id === value);
                    return {
                        ...prev,
                        department_id: value,
                        department_name: selectedDept?.name || '',
                        subdepartment_id: '',
                        subdepartment_name: '',
                        task_manager_id: '',
                        task_manager_name: '',
                        task_assistant_id: '',
                        task_assistant_name: '',
                        class_id: '',
                        class_name: ''
                    };
                }

                // If changing subdepartment, reset dependant fields but auto-populate task manager/assistant
                if (field === 'subdepartment_id') {
                    const selectedSubdept = subdepartments.find(s => s.id.toString() === value.toString());

                    return {
                        ...prev,
                        subdepartment_id: value,
                        subdepartment_name: selectedSubdept?.name || '',
                        task_manager_id: selectedSubdept?.taskManager?.id?.toString() || '',
                        task_manager_name: selectedSubdept?.taskManager?.name || '',
                        task_assistant_id: selectedSubdept?.taskAssistant?.id?.toString() || '',
                        task_assistant_name: selectedSubdept?.taskAssistant?.name || '',
                        class_id: '',
                        class_name: ''
                    };
                }
                // If changing class
                if (field === 'class_id') {
                    const selectedSubdept = subdepartments.find(s => s.id.toString() === prev.subdepartment_id.toString());
                    const selectedClass = selectedSubdept?.classes?.find(c => c.id.toString() === value);
                    return {
                        ...prev,
                        class_id: value,
                        class_name: selectedClass?.name || '',
                        class_description: selectedClass?.description || null,
                        subclass_id: '',
                        subclass_name: '',
                        subclass_description: null
                    };
                }

                // If changing subclass
                if (field === 'subclass_id') {
                    const selectedSubdept = subdepartments.find(s => s.id.toString() === prev.subdepartment_id.toString());
                    const selectedClass = selectedSubdept?.classes?.find(c => c.id.toString() === prev.class_id);
                    const selectedSubclass = selectedClass?.subClasses?.find(sc => sc.id.toString() === value);

                    return {
                        ...prev,
                        subclass_id: value,
                        subclass_name: selectedSubclass?.name || '',
                        subclass_description: selectedSubclass?.description || null
                    };
                }

                // For all other fields, update normally
                const newState = {
                    ...prev,
                    [field]: value
                };

                console.log('Updated form data:', newState);
                return newState;
            });
        }, [subdepartments, departments]);

            }
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
                                                        <SelectValue placeholder={`Select ${applicantType}...`} />
                                                    </SelectTrigger>
                                                    <SelectContent className="max-h-60">
                                                        {individuals.map((individual) => (
                                                            <SelectItem key={individual.id} value={individual.id.toString()}>
                                                                <div className="flex flex-col">
                                                                    <span>{individual.full_name}</span>
                                                                    {individual.contact_details?.phone?.kenyan?.primary && (
                                                                        <span className="text-xs text-gray-500">
                                                                            {individual.contact_details.phone.kenyan.primary}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
    
                                            <div className="space-y-3">
                                                <div className="relative">
                                                    <div className="absolute inset-0 flex items-center">
                                                        <span className="w-full border-t" />
                                                    </div>
                                                    <div className="relative flex justify-center text-xs uppercase">
                                                        <span className="bg-background px-2 text-muted-foreground">Or create new</span>
                                                    </div>
                                                </div>
    
                                                <div className="space-y-3">
                                                    <div>
                                                        <Label htmlFor="full-name" className="text-sm font-medium">
                                                            Full Name <span className="text-red-500">*</span>
                                                        </Label>
                                                        <Input
                                                            id="full-name"
                                                            value={formData.full_name}
                                                            onChange={(e) => handleFormChange('full_name', e.target.value)}
                                                            placeholder="Enter full name"
                                                            required={!selectedIndividual}
                                                            className="mt-1"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label htmlFor="mobile" className="text-sm font-medium">
                                                            Mobile Number <span className="text-red-500">*</span>
                                                        </Label>
                                                        <Input
                                                            id="mobile"
                                                            type="tel"
                                                            value={formData.mobile_number}
                                                            onChange={(e) => handleFormChange('mobile_number', e.target.value)}
                                                            placeholder="Enter mobile number"
                                                            required={!selectedIndividual}
                                                            className="mt-1"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
    
                                    {/* Company Selection */}
                                    {selectedIndividual && (
                                        <Card className="border border-gray-200 rounded-lg mt-6">
                                            <CardHeader className="pb-3">
                                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                                    <Briefcase className="h-4 w-4" />
                                                    Company Information
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-4">
                                                <div>
                                                    <Label htmlFor="company" className="text-sm font-medium">
                                                        Associated Company
                                                    </Label>
                                                    <Select
                                                        value={selectedCompany}
                                                        onValueChange={setSelectedCompany}
                                                        disabled={loadingCompanies || companies.length === 0}
                                                    >
                                                        <SelectTrigger className="mt-1">
                                                            <SelectValue
                                                                placeholder={
                                                                    loadingCompanies
                                                                        ? "Loading companies..."
                                                                        : companies.length === 0
                                                                            ? "No companies found"
                                                                            : "Select a company"
                                                                }
                                                            />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {companies.map(company => (
                                                                <SelectItem key={company.id} value={company.id}>
                                                                    <div className="flex flex-col">
                                                                        <span>{company.company_name}</span>
                                                                        <span className="text-xs text-gray-500">
                                                                            {company.registration_number} • {company.relation}
                                                                        </span>
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
    
                                                {selectedCompany && (
                                                    <div>
                                                        <Label htmlFor="understudy" className="text-sm font-medium flex items-center gap-2">
                                                            <UserPlus className="h-4 w-4" />
                                                            Assign Understudy (Optional)
                                                        </Label>
                                                        <Select
                                                            value={selectedUnderstudy}
                                                            onValueChange={setSelectedUnderstudy}
                                                            disabled={loadingUnderstudies || understudies.length === 0}
                                                        >
                                                            <SelectTrigger className="mt-1">
                                                                <SelectValue
                                                                    placeholder={
                                                                        loadingUnderstudies
                                                                            ? "Loading understudies..."
                                                                            : understudies.length === 0
                                                                                ? "No understudies available"
                                                                                : "Select an understudy"
                                                                    }
                                                                />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="">None</SelectItem>
                                                                {understudies.map(understudy => (
                                                                    <SelectItem key={understudy.individual.id} value={understudy.individual.id}>
                                                                        <div className="flex flex-col">
                                                                            <span>{understudy.individual.full_name}</span>
                                                                            {understudy.individual.contact_details?.phone?.kenyan?.primary && (
                                                                                <span className="text-xs text-gray-500">
                                                                                    {understudy.individual.contact_details.phone.kenyan.primary}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    )}
    
                                    {/* Family Members for Principal */}
                                    {applicantType === 'principal' && (
                                        <Card className="border border-gray-200 rounded-lg mt-6">
                                            <CardHeader className="pb-3">
                                                <div className="flex items-center justify-between">
                                                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                                                        <Users className="h-4 w-4" />
                                                        Family Members
                                                    </CardTitle>
                                                    <div className="flex items-center space-x-2">
                                                        <Label htmlFor="include-dependants" className="text-sm font-medium">
                                                            Include Family Members
                                                        </Label>
                                                        <input
                                                            id="include-dependants"
                                                            type="checkbox"
                                                            checked={includeDependants}
                                                            onChange={(e) => {
                                                                setIncludeDependants(e.target.checked)
                                                                if (!e.target.checked) {
                                                                    setSelectedDependants([])
                                                                }
                                                            }}
                                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            {includeDependants && (
                                                <CardContent>
                                                    <div className="space-y-3">
                                                        <Label className="text-sm font-medium">
                                                            Select Family Members
                                                        </Label>
                                                        <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                                                            {availableDependants.map((dependant) => (
                                                                <div key={dependant.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded">
                                                                    <input
                                                                        type="checkbox"
                                                                        id={`dependant-${dependant.id}`}
                                                                        checked={selectedDependants.includes(dependant.id.toString())}
                                                                        onChange={(e) => {
                                                                            if (e.target.checked) {
                                                                                setSelectedDependants([...selectedDependants, dependant.id.toString()])
                                                                            } else {
                                                                                setSelectedDependants(selectedDependants.filter(id => id !== dependant.id.toString()))
                                                                            }
                                                                        }}
                                                                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                                    />
                                                                    <label htmlFor={`dependant-${dependant.id}`} className="text-sm">
                                                                        {dependant.full_name}
                                                                        {dependant.relationship_type && (
                                                                            <span className="ml-2 text-xs text-gray-500">
                                                                                ({dependant.relationship_type})
                                                                            </span>
                                                                        )}
                                                                    </label>
                                                                </div>
                                                            ))}
                                                            {availableDependants.length === 0 && (
                                                                <p className="text-sm text-gray-500 p-2">No dependants found for this principal.</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            )}
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