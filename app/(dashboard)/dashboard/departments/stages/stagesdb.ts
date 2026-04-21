// @ts-nocheck
import supabase from '@/lib/supabase/client'
export type DocumentExtraction = {
    id: string
    fieldName: string
    fieldType: 'text' | 'date' | 'number' | 'boolean' | 'file'
    isRequired: boolean
    description?: string
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
    inputType?: 'file' | 'message' | 'both'
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