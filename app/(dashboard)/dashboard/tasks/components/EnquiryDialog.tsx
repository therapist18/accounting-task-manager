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
    // Core state
    const [applicantType, setApplicantType] = useState<'principal' | 'dependant'>('principal')
    const [individuals, setIndividuals] = useState<Individual[]>([])
    const selectedIndividualRef = useRef<Individual | null>(null)
    const [selectedIndividual, setSelectedIndividualState] = useState<Individual | null>(null)
    const [departments, setDepartments] = useState<any[]>(propDepartments || [])
    const [localUsers, setLocalUsers] = useState<any[]>(users || [])
    const [localOfficers, setLocalOfficers] = useState<any[]>(officers || [])
    
    // Loading states
    const [loadingStaff, setLoadingStaff] = useState(false)
    const [loading, setLoading] = useState(false)
    const [searchLoading, setSearchLoading] = useState(false)
    const [loadingCompanies, setLoadingCompanies] = useState(false)
    const [loadingUnderstudies, setLoadingUnderstudies] = useState(false)
    
    // Task configuration
    const [taskType, setTaskType] = useState<'new' | 'renewal'>('new')
    
    // Dependants and references
    const [includeDependants, setIncludeDependants] = useState(false)
    const [availableDependants, setAvailableDependants] = useState<Individual[]>([])
    const [selectedDependants, setSelectedDependants] = useState<string[]>([])
    const [includeReferences, setIncludeReferences] = useState(false)
    const [availableReferences, setAvailableReferences] = useState<Individual[]>([])
    const [selectedReferences, setSelectedReferences] = useState<string[]>([])
    
    // Company and understudy
    const [companies, setCompanies] = useState<any[]>([])
    const [selectedCompany, setSelectedCompany] = useState<string>('')
    const [understudies, setUnderstudies] = useState<any[]>([])
    const [selectedUnderstudy, setSelectedUnderstudy] = useState<string>('')
    
    // Principal for dependant
    const [principalForDependant, setPrincipalForDependant] = useState<Individual | null>(null)
    
    // Available staff (filtered)
    const [availableOfficers, setAvailableOfficers] = useState([])
    const [availableManagers, setAvailableManagers] = useState([])
    const [availableAssistants, setAvailableAssistants] = useState([])
    
    // UI state
    const [isIndividualPopoverOpen, setIsIndividualPopoverOpen] = useState(false)

    // Form data
    const [formData, setFormData] = useState({
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

    // Unified setter for selectedIndividual
    const setSelectedIndividual = useCallback((individual: Individual | null) => {
        selectedIndividualRef.current = individual
        setSelectedIndividualState(individual)
    }, [])

    // Optimized form change handler
    const handleChange = useCallback((field: keyof typeof formData, value: any) => {
        setFormData(prev => {
            // Handle cascading resets for department hierarchy
            if (field === 'department_id') {
                return {
                    ...prev,
                    department_id: value,
                    subdepartment_id: '',
                    class_id: '',
                    subclass_id: '',
                    subdepartment_name: '',
                    class_name: '',
                    subclass_name: ''
                }
            }
            
            if (field === 'subdepartment_id') {
                return {
                    ...prev,
                    subdepartment_id: value,
                    class_id: '',
                    subclass_id: '',
                    class_name: '',
                    subclass_name: ''
                }
            }
            
            if (field === 'class_id') {
                return {
                    ...prev,
                    class_id: value,
                    subclass_id: '',
                    subclass_name: ''
                }
            }
            
            return { ...prev, [field]: value }
        })
    }, [])

    // Memoized computed values
    const availableSubdepartments = useMemo(() => {
        if (!formData.department_id) return []
        const dept = departments.find(d => d.id.toString() === formData.department_id)
        return dept?.tm_subdepartments || []
    }, [formData.department_id, departments])

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

    // Current subdepartment (memoized)
    const currentSubdepartment = useMemo(() => {
        if (!formData.subdepartment_id) return null
        return availableSubdepartments.find(s => s.id.toString() === formData.subdepartment_id)
    }, [availableSubdepartments, formData.subdepartment_id])

    // Optimized staff filtering
    const findActiveStaffForSubdept = useCallback((subdept, allUsers, allOfficers) => {
        if (!subdept || !allUsers || !allOfficers) {
            return { officers: [], managers: [], assistants: [] }
        }

        const hasOfficerHistory = subdept.officer_history?.length > 0
        const hasManagerHistory = subdept.manager_history?.length > 0
        const hasAssistantHistory = subdept.assistant_history?.length > 0

        // Fallback to all available staff if no history
        if (!hasOfficerHistory && !hasManagerHistory && !hasAssistantHistory) {
            return {
                officers: allOfficers,
                managers: allUsers.filter(u => u.role === 'user' || u.role === 'admin'),
                assistants: allUsers.filter(u => u.role === 'user')
            }
        }

        // Helper to get active user IDs
        const getActiveUserIds = (historyArray) => {
            if (!Array.isArray(historyArray)) return []
            return historyArray
                .filter(item => item && !item.end_date)
                .map(item => item.id)
                .filter(Boolean)
        }

        const activeOfficerIds = getActiveUserIds(subdept.officer_history)
        const activeManagerIds = getActiveUserIds(subdept.manager_history)
        const activeAssistantIds = getActiveUserIds(subdept.assistant_history)

        const hasSpecificAssignments = 
            activeOfficerIds.length > 0 || 
            activeManagerIds.length > 0 || 
            activeAssistantIds.length > 0

        if (!hasSpecificAssignments) {
            return {
                officers: allOfficers,
                managers: allUsers.filter(u => u.role === 'user' || u.role === 'admin'),
                assistants: allUsers.filter(u => u.role === 'user')
            }
        }

        return {
            officers: allOfficers.filter(o => activeOfficerIds.includes(o.id)),
            managers: allUsers.filter(u => activeManagerIds.includes(u.id)),
            assistants: allUsers.filter(u => activeAssistantIds.includes(u.id))
        }
    }, [])

    // Load staff data once
    const loadStaffData = useCallback(async () => {
        setLoadingStaff(true)
        try {
            const [usersResult, officersResult] = await Promise.all([
                supabase.from('tm_users').select('*').order('name'),
                supabase.from('tm_users').select('*').eq('role', 'officer').order('name')
            ])

            if (usersResult.error) throw usersResult.error
            if (officersResult.error) throw officersResult.error

            setLocalUsers(usersResult.data || [])
            setLocalOfficers(officersResult.data || [])
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to load staff data",
                variant: "destructive"
            })
        } finally {
            setLoadingStaff(false)
        }
    }, [])

    // Search individuals
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
                    employment_data
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

    // Fetch dependants
    const fetchDependants = useCallback(async (principalId: number) => {
        try {
            const { data: principal, error: principalError } = await supabase
                .from('registry_individuals')
                .select('id, relationships')
                .eq('id', principalId)
                .single()

            if (principalError) throw principalError
            if (!principal?.relationships?.length) return []

            const relatedIds = principal.relationships
                .map((rel: any) => rel.individual_id)
                .filter((id: number) => id && id !== principalId)

            if (relatedIds.length === 0) return []

            const { data: familyMembers, error } = await supabase
                .from('registry_individuals')
                .select('id, full_name, first_name, last_name, contact_details, individual_type, r_number')
                .in('id', relatedIds)
                .order('full_name')

            if (error) throw error

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
    }, [])

    // Fetch references
    const fetchReferences = useCallback(async (individualId: number) => {
        try {
            const { data: individual, error } = await supabase
                .from('registry_individuals')
                .select('id, references')
                .eq('id', individualId)
                .single()

            if (error) throw error
            if (!individual?.references?.length) return []

            const referenceIds = individual.references
                .map((ref: any) => ref.id)
                .filter((id: number) => id && id !== individualId)

            if (referenceIds.length === 0) return []

            const { data: referenceMembers, error: refError } = await supabase
                .from('registry_individuals')
                .select('id, full_name, first_name, last_name, contact_details, individual_type, r_number')
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
    }, [])

    // Fetch companies
    const fetchCompanies = useCallback(async (individualId: number) => {
        if (!individualId) return
        
        setLoadingCompanies(true)
        try {
            const { data: individualData, error: individualError } = await supabase
                .from('registry_individuals')
                .select('employment_data')
                .eq('id', individualId)
                .single()

            if (individualError) throw individualError

            const employmentData = individualData?.employment_data
            
            if (!employmentData?.associations?.length) {
                setCompanies([])
                setSelectedCompany('')
                setUnderstudies([])
                setSelectedUnderstudy('')
                return
            }

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
                }))

            if (principalAssociations.length === 0) {
                setCompanies([])
                setSelectedCompany('')
                setUnderstudies([])
                setSelectedUnderstudy('')
                return
            }

            const companyIds = [...new Set(principalAssociations.map(assoc => assoc.company_id))]

            const { data: companiesData, error: companiesError } = await supabase
                .from('acc_portal_company_duplicate')
                .select('id, company_name, understudy')
                .in('id', companyIds)

            if (companiesError) throw companiesError

            const associationMap = new Map()
            principalAssociations.forEach(assoc => {
                const companyId = assoc.company_id
                if (!associationMap.has(companyId)) {
                    associationMap.set(companyId, [])
                }
                associationMap.get(companyId).push(assoc)
            })

            const companiesWithDetails = (companiesData || []).map(company => {
                const companyId = company.id?.toString()
                const associations = associationMap.get(companyId) || []
                const hasCurrent = associations.some(assoc => assoc.is_current)
                
                return {
                    id: companyId,
                    company_name: company.company_name || 'Unnamed Company',
                    is_bill_to: hasCurrent,
                    is_current: hasCurrent,
                    understudy: company.understudy || null,
                    associations: associations
                }
            })

            setCompanies(companiesWithDetails)

            // Auto-select logic
            if (companiesWithDetails.length === 1) {
                const selectedCompanyId = companiesWithDetails[0].id
                setSelectedCompany(selectedCompanyId)
                fetchUnderstudies(selectedCompanyId)
            } else if (companiesWithDetails.length > 1) {
                const currentCompany = companiesWithDetails.find(c => c.is_current && c.is_bill_to)
                const fallbackCompany = companiesWithDetails.find(c => c.is_current) || 
                                      companiesWithDetails.find(c => c.is_bill_to)
                
                const autoSelectCompany = currentCompany || fallbackCompany
                
                if (autoSelectCompany) {
                    setSelectedCompany(autoSelectCompany.id)
                    fetchUnderstudies(autoSelectCompany.id)
                } else {
                    setSelectedCompany('')
                    setUnderstudies([])
                    setSelectedUnderstudy('')
                }
            }
        } catch (error) {
            console.error('Error fetching companies:', error)
            toast({
                title: "Error",
                description: "Failed to load companies",
                variant: "destructive"
            })
            setCompanies([])
            setSelectedCompany('')
            setUnderstudies([])
            setSelectedUnderstudy('')
        } finally {
            setLoadingCompanies(false)
        }
    }, [])

    // Fetch understudies
    const fetchUnderstudies = useCallback(async (companyId: string) => {
        if (!companyId) {
            setUnderstudies([])
            setSelectedUnderstudy('')
            return
        }

        setLoadingUnderstudies(true)
        try {
            const { data: companyData, error: companyError } = await supabase
                .from('acc_portal_company_duplicate')
                .select('understudy')
                .eq('id', companyId)
                .single()

            if (companyError) throw companyError
            
            const understudiesData = companyData?.understudy || []
            
            if (!understudiesData.length) {
                setUnderstudies([])
                setSelectedUnderstudy('')
                return
            }
            
            const { data: understudies, error } = await supabase
                .from('registry_individuals')
                .select('*')
                .in('id', understudiesData.map((u: any) => u.individual_id))

            if (error) throw error

            const understudiesWithDetails = understudies.map(understudy => {
                const understudyInfo = understudiesData.find((u: any) => 
                    u.individual_id === understudy.id
                )
                
                return {
                    ...understudy,
                    employment_details: understudyInfo?.details || {}
                }
            })

            setUnderstudies(understudiesWithDetails)
            setSelectedUnderstudy('')
        } catch (error) {
            console.error('Error fetching understudies:', error)
            toast({
                title: "Error",
                description: "Failed to load understudies",
                variant: "destructive"
            })
        } finally {
            setLoadingUnderstudies(false)
        }
    }, [])

    // Handle individual selection
    const handleIndividualSelect = useCallback(async (individual: Individual) => {
        setSelectedIndividual(individual)
        setPrincipalForDependant(null)
        setSelectedCompany('')
        setCompanies([])
        setUnderstudies([])
        setSelectedUnderstudy('')
        setAvailableDependants([])
        setSelectedDependants([])
        setIncludeDependants(false)
        setAvailableReferences([])
        setSelectedReferences([])
        setIncludeReferences(false)

        const primaryPhone = individual.contact_details?.phone?.kenyan?.primary || ''
        const formUpdate: any = {
            full_name: individual.full_name,
            mobile_number: primaryPhone,
            principal_member_id: ''
        }

        const [references, familyMembers] = await Promise.all([
            fetchReferences(individual.id),
            fetchDependants(individual.id)
        ])

        setAvailableReferences(references)

        if (individual.individual_type === 'principal') {
            setAvailableDependants(familyMembers)
            await fetchCompanies(individual.id)
        } else if (individual.individual_type === 'dependant') {
            const principalRelation = individual.relationships?.find(
                (rel: any) => rel.isPrincipal === 'Yes' || 
                ['principal', 'spouse', 'husband', 'wife'].includes(rel.relationship?.toLowerCase())
            )

            if (principalRelation?.individual_id) {
                const principalId = principalRelation.individual_id
                formUpdate.principal_member_id = principalId.toString()

                const { data: principalData, error: principalError } = await supabase
                    .from('registry_individuals')
                    .select('id, full_name')
                    .eq('id', principalId)
                    .single()

                if (principalError) {
                    toast({ 
                        title: "Error", 
                        description: "Could not load principal member's details.", 
                        variant: "destructive" 
                    })
                    return
                }

                setPrincipalForDependant(principalData)
                await fetchCompanies(principalId)

                const principalIndex = familyMembers.findIndex(fm => fm.id === principalId)
                const allFamilyForSelection = principalIndex !== -1
                    ? familyMembers
                        .filter(fm => fm.id !== individual.id)
                        .map(fm => fm.id === principalId
                            ? { ...fm, relationship_type: 'Principal Member' }
                            : fm
                        )
                    : [
                        { ...principalData, relationship_type: 'Principal Member' },
                        ...familyMembers.filter(fm => fm.id !== individual.id)
                    ]

                setAvailableDependants(allFamilyForSelection)
                setIncludeDependants(true)
                setSelectedDependants([principalData.id.toString()])
            } else {
                toast({ 
                    title: "Info", 
                    description: "No principal member found for this dependant.", 
                    variant: "default" 
                })
            }
        }

        setFormData(prev => ({ ...prev, ...formUpdate }))
    }, [fetchReferences, fetchDependants, fetchCompanies, setSelectedIndividual])

    // Reset form
    const resetForm = useCallback(() => {
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
        setPrincipalForDependant(null)
        setApplicantType('principal')
        setTaskType('new')
        setIncludeDependants(false)
        setSelectedDependants([])
        setAvailableDependants([])
        setIncludeReferences(false)
        setSelectedReferences([])
        setAvailableReferences([])
        setSelectedCompany('')
        setSelectedUnderstudy('')
        setCompanies([])
        setUnderstudies([])
        setAvailableOfficers([])
        setAvailableManagers([])
        setAvailableAssistants([])
    }, [setSelectedIndividual])

    // Submit handler
    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const individualToUse = selectedIndividualRef.current

            if (!individualToUse) {
                throw new Error('No individual selected. Please select an individual from the dropdown.')
            }

            const individualId = individualToUse.id
            if (!individualId) {
                throw new Error('Selected individual does not have a valid ID')
            }

            const dependantsToSave = includeDependants
                ? selectedDependants
                    .map(id => {
                        const dependant = availableDependants.find(d => d.id.toString() === id)
                        return dependant ? {
                            id: dependant.id,
                            name: dependant.full_name,
                            relationship: dependant.relationship_type === 'Principal Member' 
                                ? 'Principal' 
                                : (dependant.relationship_type || 'Family Member')
                        } : null
                    })
                    .filter(Boolean)
                    .filter(dependant => dependant.relationship !== 'Principal')
                : []

            const referencesToSave = includeReferences
                ? selectedReferences
                    .map(id => {
                        const reference = availableReferences.find(r => r.id.toString() === id)
                        return reference ? {
                            id: reference.id,
                            name: reference.full_name,
                            relationship: reference.relationship_type || 'reference'
                        } : null
                    })
                    .filter(Boolean)
                : []

            const enquiryStageId = '1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa'
            const now = new Date()
            const formattedDate = format(now, 'dd/MM/yyyy')
            const initialStages = {
                [enquiryStageId]: {
                    date: formattedDate,
                    status: 'completed',
                    completedAt: now.toISOString(),
                },
            }

            const taskData: any = {
                job_description: formData.job_description || '',
                status: 'enquiry',
                renewal_status: taskType,
                department_id: formData.department_id,
                subdepartment_id: formData.subdepartment_id,
                individual_id: individualId,
                applicant_type: applicantType,
                class_id: formData.class_id || null,
                subclass_id: formData.subclass_id || null,
                date_initiated: new Date(formData.enquiry_date),
                applicant_name: individualToUse.full_name,
                stages: initialStages,
                dependant_member: dependantsToSave,
                references: referencesToSave,
                understudy: selectedUnderstudy || null,
                company_id: selectedCompany || null,
                officer_id: formData.officer_id && formData.officer_id !== 'none' ? formData.officer_id : null,
                task_manager_id: formData.task_manager_id && formData.task_manager_id !== 'none' ? formData.task_manager_id : null,
                task_assistant_id: formData.task_assistant_id && formData.task_assistant_id !== 'none' ? formData.task_assistant_id : null,
            }

            if (applicantType === 'principal') {
                taskData.principal_member = individualId
            } else if (applicantType === 'dependant') {
                const principalId = formData.principal_member_id
                if (!principalId) {
                    throw new Error("Principal member could not be identified for the selected dependant. Cannot create enquiry.")
                }
                taskData.principal_member = principalId
            }

            const { data, error } = await supabase
                .from('tm_tasks')
                .insert([taskData])
                .select()
                .single()

            if (error) throw error

            const { data: fullTask, error: fetchError } = await supabase
                .from('tm_tasks')
                .select(`*,department:department_id(name),subdepartment:subdepartment_id(name),individual:individual_id(full_name)`)
                .eq('id', data.id)
                .single()

            onEnquiryCreated(fullTask || data)
            resetForm()
            onOpenChange(false)

            toast({
                title: 'Success',
                description: `${taskType === 'renewal' ? 'Renewal' : 'Enquiry'} created successfully`,
            })
        } catch (error) {
            console.error('Error creating enquiry:', error)
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to create enquiry',
                variant: 'destructive'
            })
        } finally {
            setLoading(false)
        }
    }, [
        applicantType, taskType, formData, includeDependants, selectedDependants, 
        availableDependants, includeReferences, selectedReferences, availableReferences,
        selectedCompany, selectedUnderstudy, onEnquiryCreated, resetForm, onOpenChange
    ])

    // EFFECTS

    // Load staff data when dialog opens
    useEffect(() => {
        if (!open) return

        if (users?.length > 0 && officers?.length > 0) {
            setLocalUsers(users)
            setLocalOfficers(officers)
            return
        }

        if (localUsers.length === 0 || localOfficers.length === 0) {
            loadStaffData()
        }
    }, [open, users, officers, localUsers.length, localOfficers.length, loadStaffData])

    // Update local users/officers when props change
    useEffect(() => {
        if (users?.length > 0) setLocalUsers(users)
        if (officers?.length > 0) setLocalOfficers(officers)
    }, [users, officers])

    // Load individuals and reset when applicant type or dialog state changes
    useEffect(() => {
        if (open) {
            searchIndividuals(applicantType)
            setSelectedIndividual(null)
            setPrincipalForDependant(null)
            setCompanies([])
            setSelectedCompany('')
            setUnderstudies([])
            setSelectedUnderstudy('')
            setFormData(prev => ({
                ...prev,
                principal_member_id: '',
                officer_id: '',
                task_manager_id: '',
                task_assistant_id: ''
            }))
            setIncludeReferences(false)
            setAvailableReferences([])
            setSelectedReferences([])
            setIncludeDependants(false)
            setAvailableDependants([])
            setSelectedDependants([])
            setAvailableOfficers([])
            setAvailableManagers([])
            setAvailableAssistants([])
        }
    }, [applicantType, open, searchIndividuals, setSelectedIndividual])

    // Fetch understudies when company changes
    useEffect(() => {
        if (selectedCompany) {
            fetchUnderstudies(selectedCompany)
        } else {
            setUnderstudies([])
            setSelectedUnderstudy('')
        }
    }, [selectedCompany, fetchUnderstudies])

    // CONSOLIDATED AUTO-SELECTION AND STAFF FILTERING EFFECT
    useEffect(() => {
        if (!open) return

        // Auto-select department if not selected
        if (departments.length > 0 && !formData.department_id) {
            const firstDept = departments[0]
            if (firstDept) {
                handleChange('department_id', firstDept.id.toString())
                handleChange('department_name', firstDept.name)
            }
            return // Exit early to let next render handle subdepartment
        }

        // Auto-select subdepartment if department is selected but subdepartment is not
        if (formData.department_id && !formData.subdepartment_id && availableSubdepartments.length > 0) {
            const firstSubdept = availableSubdepartments[0]
            if (firstSubdept) {
                handleChange('subdepartment_id', firstSubdept.id.toString())
                handleChange('subdepartment_name', firstSubdept.name)
            }
            return // Exit early to let next render handle class
        }

        // Auto-select class if subdepartment is selected but class is not
        if (formData.subdepartment_id && !formData.class_id && availableClasses.length > 0) {
            const firstClass = availableClasses[0]
            if (firstClass) {
                handleChange('class_id', firstClass.id.toString())
                handleChange('class_name', firstClass.name)
            }
            return // Exit early to let next render handle subclass
        }

        // Auto-select subclass if class is selected but subclass is not
        if (formData.class_id && !formData.subclass_id && availableSubclasses.length > 0) {
            const firstSubclass = availableSubclasses[0]
            if (firstSubclass) {
                handleChange('subclass_id', firstSubclass.id.toString())
                handleChange('subclass_name', firstSubclass.name)
            }
        }

        // Filter staff when subdepartment is selected
        if (formData.subdepartment_id && currentSubdepartment && localUsers.length > 0 && localOfficers.length > 0) {
            const staff = findActiveStaffForSubdept(currentSubdepartment, localUsers, localOfficers)
            setAvailableOfficers(staff.officers)
            setAvailableManagers(staff.managers)
            setAvailableAssistants([]) // Reset assistants until manager is selected
        }
    }, [
        open,
        departments,
        formData.department_id,
        formData.subdepartment_id,
        formData.class_id,
        formData.subclass_id,
        availableSubdepartments,
        availableClasses,
        availableSubclasses,
        currentSubdepartment,
        localUsers,
        localOfficers,
        handleChange,
        findActiveStaffForSubdept
    ])

    // Filter assistants when manager changes
    useEffect(() => {
        if (!formData.subdepartment_id || !formData.task_manager_id || !currentSubdepartment) {
            setAvailableAssistants([])
            return
        }

        const assistantsForManager = currentSubdepartment.assistant_history
            ?.filter(assistant =>
                !assistant.end_date &&
                assistant.manager_id?.toString() === formData.task_manager_id
            )
            ?.map(assistant => assistant.id) || []

        const filteredAssistants = localUsers.filter(user =>
            assistantsForManager.includes(user.id)
        )

        setAvailableAssistants(filteredAssistants)
    }, [formData.task_manager_id, formData.subdepartment_id, currentSubdepartment, localUsers])

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
                                        <div className="flex items-center space-x-2 border-b border-gray-200/50 pb-2">
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
                                                                    handleIndividualSelect(individual)
                                                                    setIsIndividualPopoverOpen(false)
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
                                        <Building2 className="h-4 w-4" />
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
                                            {companies?.length > 0 ? (
                                                companies.map((company) => (
                                                    <SelectItem key={company.id} value={company.id.toString()}>
                                                        <div className="flex items-center justify-between w-full">
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
                                                        </div>
                                                    </SelectItem>
                                                ))
                                            ) : (
                                                <div className="px-3 py-2 text-blue-500 text-sm">No companies found</div>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </CardContent>
                            </Card>

                            {/* Understudy Selection */}
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
                                            {understudies?.length > 0 ? (
                                                understudies.map((understudy) => (
                                                    <SelectItem key={understudy.id} value={understudy.id.toString()}>
                                                        {understudy.full_name}
                                                    </SelectItem>
                                                ))
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
                                        <div className="space-y-2">
                                            <div className="flex items-center space-x-2 border-b border-gray-200/50 pb-2">
                                                <input
                                                    type="checkbox"
                                                    id="include-dependants"
                                                    checked={includeDependants}
                                                    onChange={(e) => {
                                                        setIncludeDependants(e.target.checked)
                                                        if (!e.target.checked) setSelectedDependants([])
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
                                                                    )
                                                                }}
                                                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <label htmlFor={`dependant-${dependant.id}`} className="text-blue-700 text-sm flex-1 flex justify-between items-center">
                                                                <span>{dependant.full_name}</span>
                                                                {dependant.relationship_type === 'Principal Member' ? (
                                                                    <Badge variant="outline" className="text-xs">Principal</Badge>
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
                                        <div className="space-y-2">
                                            <div className="flex items-center space-x-2 border-b border-gray-200/50 pb-2">
                                                <input
                                                    type="checkbox"
                                                    id="include-references"
                                                    checked={includeReferences}
                                                    onChange={(e) => {
                                                        setIncludeReferences(e.target.checked)
                                                        if (!e.target.checked) setSelectedReferences([])
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
                                                                    )
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
                            {/* Enquiry Details */}
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
                                                onChange={(e) => setFormData(prev => ({ ...prev, enquiry_date: e.target.value }))}
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
                                            onChange={(e) => setFormData(prev => ({ ...prev, job_description: e.target.value }))}
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
                                            <Select
                                                value={formData.department_id}
                                                onValueChange={(value) => {
                                                    const selectedDept = departments.find(d => d.id.toString() === value)
                                                    if (selectedDept) {
                                                        handleChange('department_id', value)
                                                        handleChange('department_name', selectedDept.name)
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
                                            <Select
                                                value={formData.subdepartment_id}
                                                onValueChange={(value) => {
                                                    const selectedSubdept = availableSubdepartments.find(sd => sd.id.toString() === value)
                                                    if (selectedSubdept) {
                                                        handleChange('subdepartment_id', value)
                                                        handleChange('subdepartment_name', selectedSubdept.name)
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
                                            <Select
                                                value={formData.class_id}
                                                onValueChange={(value) => {
                                                    const selectedClass = availableClasses.find(c => c.id.toString() === value)
                                                    if (selectedClass) {
                                                        handleChange('class_id', value)
                                                        handleChange('class_name', selectedClass.name)
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
                                            <Select
                                                value={formData.subclass_id}
                                                onValueChange={(value) => {
                                                    const selectedSubclass = availableSubclasses.find(sc => sc.id.toString() === value)
                                                    if (selectedSubclass) {
                                                        handleChange('subclass_id', value)
                                                        handleChange('subclass_name', selectedSubclass.name)
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

                            {/* Staff Assignment */}
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

                                    {/* Task Assistant Selection */}
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
                    <DialogFooter className="border-t border-gray-200/50 pt-4 bg-white/50">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                resetForm()
                                onOpenChange(false)
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
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}