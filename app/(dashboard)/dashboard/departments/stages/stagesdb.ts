// @ts-nocheck
import supabase from '@/lib/supabase/client'
import type { EfnsTrigger } from "@/lib/efnsFiling"

export type StageInputType =
    | 'document'    // Linked to a document (current behavior)
    | 'text'        // Free text input
    | 'textarea'    // Multi-line text input
    | 'number'      // Numeric input
    | 'date'        // Date picker
    | 'datetime'    // Date + time picker
    | 'dropdown'    // Single-select dropdown
    | 'multiselect' // Multi-select dropdown
    | 'checkbox'    // Boolean checkbox
    | 'file'        // File upload only (no extraction)
    | 'url'         // URL input
    | 'email'       // Email input
    | 'phone'       // Phone number input

export type StageDependencyType =
    | 'visible_when_completed'   // Show this stage only when dependency is completed
    | 'visible_when_started'     // Show this stage only when dependency has started
    | 'always_visible'           // Always show but mark dependency
    | 'sequential'               // Enforce sequential completion

export interface StageDependency {
    stageId: string
    stageName?: string
    dependencyType: StageDependencyType
}

// Attribute-based applicability — distinct from StageAllocation.applicable (which is
// structural, per subdept/class/subclass). A condition here gates a stage on the TASK's own
// data (e.g. "only for New/Fresh applications") regardless of which job level it's assigned
// to. Multiple conditions on one stage are AND'd together (see
// tasks/overall-view/tableUtils.tsx's stageApplicabilityConditionsMet, the single shared
// evaluator tasks/DepartmentTasksManager.tsx and tasks/components/EditableStageCell.tsx both
// call — deliberately not re-implemented per-consumer, unlike the older applicable/dependency
// checks which ended up with ~20 hand-duplicated copies across the codebase).
export type StageConditionField = 'renewal_status' | 'nationality' | 'age'
export type StageConditionOperator = 'equals' | 'not_equals' | 'gte' | 'lte' // gte/lte only meaningful for 'age'

export interface StageApplicabilityCondition {
    field: StageConditionField
    operator: StageConditionOperator
    value: string | number
}

export interface StageMasterFieldLink {
    masterFieldId: string
    masterFieldLabel?: string
    fieldKey?: string
    fieldType?: string
}

export type DocumentExtraction = {
    id: string
    fieldName: string
    fieldType: 'text' | 'date' | 'number' | 'boolean' | 'file' | 'dropdown' | 'multiselect' | 'url' | 'email' | 'phone' | 'textarea'
    isRequired: boolean
    description?: string
    options?: string[]  // For dropdown/multiselect types
    extractionRules?: {
        format?: string
        validation?: string
        defaultValue?: any
    }
}

// Updated StageDocument interface
export interface StageDocument {
    id: string
    name: string
    description?: string
    isRequired: boolean
    documentType: 'upload' | 'extraction' | 'both'
    inputType?: 'file' | 'message' | 'both' | StageInputType
    extractionSpecs?: DocumentExtraction[]
    isSpecial?: boolean
    entityType?: 'subdept' | 'class' | 'subclass'
    subdept_id?: number
    class_id?: string | number
    subclass_id?: string | number
    entityName?: string
    targetEntities?: Array<{
        entityType: 'subdept' | 'class' | 'subclass'
        subdept_id: number
        class_id?: string | number
        subclass_id?: string | number
        entityName: string
    }>
    kycId?: string
    linkedKycDocument?: string
    docType?: 'form' | 'normal_doc'
    // New: Input type configuration for the stage itself
    stageInputType?: StageInputType
    // New: Master field linking (like automation mapping dialog pattern)
    linkedMasterFieldIds?: string[]
    linkedMasterFields?: StageMasterFieldLink[]
    // New: For dropdown/multiselect input types
    dropdownOptions?: string[]
    dropdownPlaceholder?: string
    // New: Default value for the field
    defaultValue?: string
    // New: Validation rules
    validationPattern?: string
    validationMessage?: string
    // New: Whether this field is editable after submission
    isEditableAfterSubmission?: boolean
    // EFNS auto-filing trigger for this document (set on the stage's document)
    efnsTrigger?: EfnsTrigger | null
}

export interface EntityOption {
    id: string | number
    name: string
    type: 'subdept' | 'class' | 'subclass'
    level: number
    subdept_id?: number
    class_id?: string | number
    subclass_id?: string | number
    selected?: boolean
}

// Update NewStage interface if needed
export interface NewStage {
    id: string
    name: string
    description?: string
    days: number
    hours: number
    minutes: number
    followUp: string
    officer_ids?: string[] // Multiple officers assigned when follow_up is 'Officer'
    isSpecial: boolean
    timeConfigs: TimeConfig[]
    documents: StageDocument[] // Updated to use the enhanced StageDocument interface
    // New: Stage input type configuration
    stageInputType?: StageInputType
    linkedMasterFieldIds?: string[]
    linkedMasterFields?: StageMasterFieldLink[]
    dropdownOptions?: string[]
    defaultValue?: string
    // New: Stage dependencies
    dependencies?: StageDependency[]
    // New: Attribute-based applicability conditions (renewal status / nationality / age)
    applicabilityConditions?: StageApplicabilityCondition[]
    // When this stage is completed, transition the task to this status.
    // Valid values: 'in_progress' | 'write_up_completed' | 'endorsed' | '' (none)
    triggers_task_status?: string
}

// Update Stage interface if needed
export interface Stage {
    id: string
    name: string
    description?: string
    order_num: number
    estimated_time: number | null
    follow_up?: 'Client' | 'Officer' | 'BCL' | null
    officer_ids?: string[] // Multiple officers assigned when follow_up is 'Officer'
    isSpecial?: boolean
    timeConfigs?: TimeConfig[]
    documents?: StageDocument[] // Updated to use the enhanced StageDocument interface
    // New: Stage input type configuration
    stageInputType?: StageInputType
    linkedMasterFieldIds?: string[]
    linkedMasterFields?: StageMasterFieldLink[]
    dropdownOptions?: string[]
    defaultValue?: string
    // New: Stage dependencies
    dependencies?: StageDependency[]
    // New: Attribute-based applicability conditions (renewal status / nationality / age)
    applicabilityConditions?: StageApplicabilityCondition[]
    // When this stage is completed, transition the task to this status.
    // Valid values: 'in_progress' | 'write_up_completed' | 'endorsed' | '' (none)
    triggers_task_status?: string
    allocations?: {
        [key: string]: {
            applicable: boolean
            display: boolean
            classId?: string
            duration?: {
                days: number
                hours: number
                minutes: number
            }
            followUpWith?: 'Client' | 'Officer' | 'BCL' | null
            documents?: StageDocument[]
        }
    }
}

// An "officer section" groups a contiguous-ish set of steps in a department's workflow that
// are handled by the same officer (e.g. "Processing to Approval" then "Approval to Write up").
// Membership is keyed by stable stage UUIDs (never order indexes), so reordering or inserting
// stages elsewhere in the department can never displace which stages belong to a section.
// Stored on the department as `tm_departments.officer_sections` (JSONB array). When officers
// are assigned per task, an officer picked for a section fans out to every member stage whose
// follow_up === 'Officer'.
export interface OfficerSection {
    id: string
    name: string
    stage_ids: string[]
}

export type TimeConfig = {
    applicationType: string
    days: number
    hours: number
    minutes: number
}

export type ClassRequirement = {
    name: string
    description: string | null
    is_required: boolean
}

export type SubdepartmentClass = {
    id?: string
    name: string
    description: string | null
    requirements: ClassRequirement[]
    stages?: StageAllocation[]
}

export type StageAllocation = {
    stage_id: string
    applicable: boolean
    display: boolean
    // Per-job-level override of Stage.triggers_task_status — lets the same shared stage
    // trigger a different task status for this specific subdept/class/subclass (e.g. a shared
    // "Endorsement" stage that should jump straight to 'endorsed' for most classes but only to
    // 'write_up_completed' for a class whose pipeline has no separate Write Up step).
    // Undefined/absent = inherit the stage's own default; '' = explicit "no trigger" override.
    triggers_task_status?: string
}

export type Subdepartment = {
    id: number
    name: string
    department_id: string
    classes?: SubdepartmentClass[]
    stages?: StageAllocation[]
    hasClasses: boolean
}

export type Department = {
    id: string
    name: string
    stages: Stage[]
    tm_subdepartments?: Subdepartment[]
    subdepartments?: Subdepartment[]
    officer_sections?: OfficerSection[]
}

export type DepartmentOption = {
    id: string
    name: string
}

export type SubClass = {
    id: number
    name: string
    description?: string
    order: number
    isVisible: boolean
    requirements: any[]
    stageAllocations?: StageAllocation[]
}

export type Class = {
    id: number
    name: string
    description?: string
    order: number
    isVisible: boolean
    requirements: any[]
    subClasses: SubClass[]
    stageAllocations?: StageAllocation[]
}

export type StageForm = {
    name: string
    description: string
    duration: StageDuration
    follow_up: 'Client' | 'Officer' | 'BCL' | 'none'
    officer_ids?: string[] // Multiple officers assigned when follow_up is 'Officer'
    documents: StageDocument[]
}

// Helper function to generate IDs
const generateId = () => Math.random().toString(36).substring(2) + Date.now().toString(36)

// Fetch department with stages
export async function fetchDepartmentWithStages(departmentId: string): Promise<Department | null> {
    try {
        const { data, error } = await supabase
            .from('tm_departments')
            .select(`
        *,
        tm_subdepartments (*)
      `)
            .eq('id', departmentId)
            .order('order', { ascending: true })
            .single()

        if (error) throw error
        if (!data) return null

        // Process subdepartments and their stage allocations
        const subdepartments = (data.tm_subdepartments || []).map((subdept: any) => {
            const classes = (subdept.classes || []).map((cls: any) => ({
                ...cls,
                subClasses: (cls.subClasses || []).map((subCls: any) => ({
                    ...subCls,
                    stageAllocations: subCls.stageAllocations || []
                })),
                stageAllocations: cls.stageAllocations || []
            }))

            return {
                ...subdept,
                classes,
                stageAllocations: subdept.stageAllocations || []
            }
        })

        return {
            ...data,
            stages: data.stages || [],
            subdepartments
        }
    } catch (error) {
        console.error('Error fetching department with stages:', error)
        throw new Error('Failed to fetch department with stages')
    }
}

// Create a new stage
export async function createStage(departmentId: string, stageData: StageForm): Promise<Stage> {
    try {
        // Get current department data
        const { data: currentDept, error: fetchError } = await supabase
            .from('tm_departments')
            .select('stages')
            .order('order', { ascending: true })
            .eq('id', departmentId)
            .single()

        if (fetchError) throw fetchError

        const currentStages = currentDept.stages || []
        const nextOrder = Math.max(0, ...currentStages.map((s: Stage) => s.order_num)) + 1

        const newStage: Stage = {
            id: generateId(),
            name: stageData.name,
            description: stageData.description || '',
            order_num: nextOrder,
            estimated_time: stageData.duration,
            follow_up: stageData.follow_up === 'none' ? null : stageData.follow_up as any,
            officer_ids: stageData.officer_ids || [],
            documents: stageData.documents
        }

        const updatedStages = [...currentStages, newStage]

        const { error: updateError } = await supabase
            .from('tm_departments')
            .update({
                stages: updatedStages,
                updated_at: new Date().toISOString()
            })
            .eq('id', departmentId)

        if (updateError) throw updateError

        return newStage
    } catch (error) {
        console.error('Error creating stage:', error)
        throw new Error('Failed to create stage')
    }
}

// Update a stage
export async function updateStage(departmentId: string, stageId: string, stageData: Partial<StageForm>): Promise<void> {
    try {
        const { data: currentDept, error: fetchError } = await supabase
            .from('tm_departments')
            .select('stages')
            .order('order', { ascending: true })
            .eq('id', departmentId)
            .single()

        if (fetchError) throw fetchError

        const currentStages = currentDept.stages || []
        const updatedStages = currentStages.map((stage: Stage) => {
            if (stage.id === stageId) {
                return {
                    ...stage,
                    ...(stageData.name && { name: stageData.name }),
                    ...(stageData.description !== undefined && { description: stageData.description }),
                    ...(stageData.duration && { estimated_time: stageData.duration }),
                    ...(stageData.follow_up !== undefined && {
                        follow_up: stageData.follow_up === 'none' ? null : stageData.follow_up
                    }),
                    ...(stageData.officer_ids !== undefined && { officer_ids: stageData.officer_ids }),
                    ...(stageData.documents && { documents: stageData.documents })
                }
            }
            return stage
        })

        const { error: updateError } = await supabase
            .from('tm_departments')
            .update({
                stages: updatedStages,
                updated_at: new Date().toISOString()
            })
            .eq('id', departmentId)

        if (updateError) throw updateError
    } catch (error) {
        console.error('Error updating stage:', error)
        throw new Error('Failed to update stage')
    }
}

// Delete a stage
export async function deleteStage(departmentId: string, stageId: string): Promise<void> {
    try {
        const { data: currentDept, error: fetchError } = await supabase
            .from('tm_departments')
            .select('stages')
            .order('order', { ascending: true })
            .eq('id', departmentId)
            .single()

        if (fetchError) throw fetchError

        const currentStages = currentDept.stages || []
        const updatedStages = currentStages.filter((stage: Stage) => stage.id !== stageId)

        // Reorder remaining stages
        const reorderedStages = updatedStages.map((stage: Stage, index: number) => ({
            ...stage,
            order_num: index + 1
        }))

        const { error: updateError } = await supabase
            .from('tm_departments')
            .update({
                stages: reorderedStages,
                updated_at: new Date().toISOString()
            })
            .eq('id', departmentId)

        if (updateError) throw updateError
    } catch (error) {
        console.error('Error deleting stage:', error)
        throw new Error('Failed to delete stage')
    }
}

// Replace the department's officer_sections wholesale.
export async function updateOfficerSections(departmentId: string, sections: OfficerSection[]): Promise<void> {
    try {
        const { error } = await supabase
            .from('tm_departments')
            .update({
                officer_sections: sections,
                updated_at: new Date().toISOString()
            })
            .eq('id', departmentId)

        if (error) throw error
    } catch (error) {
        console.error('Error updating officer sections:', error)
        throw new Error('Failed to update officer sections')
    }
}

// Update stage order
export async function updateStageOrder(departmentId: string, stageOrders: Array<{ id: string, order: number }>): Promise<void> {
    try {
        const { data: currentDept, error: fetchError } = await supabase
            .from('tm_departments')
            .select('stages')
            .order('order', { ascending: true })
            .eq('id', departmentId)
            .single()

        if (fetchError) throw fetchError

        const currentStages = currentDept.stages || []
        const updatedStages = currentStages.map((stage: Stage) => {
            const newOrder = stageOrders.find(so => so.id === stage.id)
            return newOrder ? { ...stage, order_num: newOrder.order } : stage
        }).sort((a, b) => a.order_num - b.order_num)

        const { error: updateError } = await supabase
            .from('tm_departments')
            .update({
                stages: updatedStages,
                updated_at: new Date().toISOString()
            })
            .eq('id', departmentId)

        if (updateError) throw updateError
    } catch (error) {
        console.error('Error updating stage order:', error)
        throw new Error('Failed to update stage order')
    }
}

// Update stage allocation for subdepartment/class/subclass
export async function updateStageAllocation(
    subdepartmentId: string,
    stageId: string,
    allocation: StageAllocation,
    targetType: 'subdepartment' | 'class' | 'subclass',
    targetPath?: string // For classes: classId, for subclasses: classId_subclassId
): Promise<void> {
    try {
        const { data: currentSubdept, error: fetchError } = await supabase
            .from('tm_subdepartments')
            .select('*')
            .eq('id', subdepartmentId)
            .single()

        if (fetchError) throw fetchError

        let updateData: any = {}

        if (targetType === 'subdepartment') {
            // Update subdepartment stage allocations
            const currentAllocations = currentSubdept.stageAllocations || []
            const existingIndex = currentAllocations.findIndex((a: StageAllocation) => a.stage_id === stageId)

            if (existingIndex >= 0) {
                currentAllocations[existingIndex] = allocation
            } else {
                currentAllocations.push(allocation)
            }

            updateData.stageAllocations = currentAllocations

        } else if (targetType === 'class' && targetPath) {
            // Update class stage allocations
            const classes = [...(currentSubdept.classes || [])]
            const classIndex = classes.findIndex(c => c.id.toString() === targetPath)

            if (classIndex >= 0) {
                const currentAllocations = classes[classIndex].stageAllocations || []
                const existingIndex = currentAllocations.findIndex((a: StageAllocation) => a.stage_id === stageId)

                if (existingIndex >= 0) {
                    currentAllocations[existingIndex] = allocation
                } else {
                    currentAllocations.push(allocation)
                }

                classes[classIndex].stageAllocations = currentAllocations
                updateData.classes = classes
            }

        } else if (targetType === 'subclass' && targetPath) {
            // Update subclass stage allocations
            const [classId, subclassId] = targetPath.split('_')
            const classes = [...(currentSubdept.classes || [])]
            const classIndex = classes.findIndex(c => c.id.toString() === classId)

            if (classIndex >= 0) {
                const subclasses = [...(classes[classIndex].subClasses || [])]
                const subclassIndex = subclasses.findIndex(sc => sc.id.toString() === subclassId)

                if (subclassIndex >= 0) {
                    const currentAllocations = subclasses[subclassIndex].stageAllocations || []
                    const existingIndex = currentAllocations.findIndex((a: StageAllocation) => a.stage_id === stageId)

                    if (existingIndex >= 0) {
                        currentAllocations[existingIndex] = allocation
                    } else {
                        currentAllocations.push(allocation)
                    }

                    subclasses[subclassIndex].stageAllocations = currentAllocations
                    classes[classIndex].subClasses = subclasses
                    updateData.classes = classes
                }
            }
        }

        const { error: updateError } = await supabase
            .from('tm_subdepartments')
            .update({
                ...updateData,
                updated_at: new Date().toISOString()
            })
            .eq('id', subdepartmentId)

        if (updateError) throw updateError
    } catch (error) {
        console.error('Error updating stage allocation:', error)
        throw new Error('Failed to update stage allocation')
    }
}