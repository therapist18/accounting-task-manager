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
import { User, Users, Phone, Mail, MapPin, Building2, Loader2, Info, FileText } from "lucide-react"
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
          relationships
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

    // Load individuals when applicant type changes
    useEffect(() => {
        if (open) {
            searchIndividuals(applicantType)
            setSelectedIndividual(null)
            setFormData(prev => ({
                ...prev,
                principal_member_id: ''
            }))
        }
    }, [applicantType, open, searchIndividuals])

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

    // Get principal member details for dependants
    const principalMemberDetails = useMemo(() => {
        if (applicantType !== 'dependant' || !selectedIndividual?.relationships) return null

        const principalRelation = selectedIndividual.relationships.find(
            rel => rel.relationship_type === 'principal' || rel.relationship_type === 'spouse'
        )

        return principalRelation?.related_individual || null
    }, [applicantType, selectedIndividual])

    const handleFormChange = (field: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }))
    }

    const handleIndividualSelect = (individual: Individual) => {
        setSelectedIndividual(individual)
        setFormData(prev => ({
            ...prev,
            full_name: individual.full_name,
            mobile_number: individual.contact_details?.phone?.kenyan?.primary ||
                individual.contact_details?.phone?.whatsapp || '',
            principal_member_id: principalMemberDetails?.id?.toString() || ''
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

    // In EnquiryDialog component, update the handleSubmit function:

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            let individualId = selectedIndividual?.id

            // If no individual selected, create a new one
            if (!selectedIndividual) {
                if (!formData.full_name || !formData.mobile_number) {
                    throw new Error('Please provide name and mobile number for new individual')
                }

                const newIndividual = await createNewIndividual({
                    full_name: formData.full_name,
                    mobile_number: formData.mobile_number
                })
                individualId = newIndividual.id
            }

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
                applicant_name: formData.full_name,
                principal_member_name: principalMemberDetails?.full_name || '',
                date_initiated: new Date(formData.enquiry_date).toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                r_number: selectedIndividual?.r_number || null,
                individual_id: individualId,
                stages: stagesData // Store as JSON in the stages column
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