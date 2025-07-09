// JobSpecificQuestions.tsx
// @ts-nocheck
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Pencil, Trash2, ArrowUp, ArrowDown, Plus, X, Check, ChevronRight, ChevronDown, BookOpen, Layers, AlertTriangle, Eye, EyeOff, Info, FileText } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Checkbox } from "@/components/ui/checkbox"
import supabase from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { DepartmentSidebar } from "../main-shared-components/department-sidebar"
import type { Department } from "./database"

interface JobSpecificQuestionsProps {
  departments: Department[]
}

interface EditingContext {
  type: 'subdepartment' | 'class' | 'subclass'
  departmentId: string
  subdepartmentId: string
  classId?: string
  subclassId?: string
}

// Function to generate sequential question IDs
const generateQuestionId = (index: number, existingQuestions: ApiQuestion[] = []): string => {
  if (existingQuestions.length === 0) {
    return index.toString();
  }

  // Find the highest existing ID
  const maxId = existingQuestions.reduce((max, question) => {
    const id = parseInt(question.id || '0', 10);
    return isNaN(id) ? max : Math.max(max, id);
  }, -1);

  return (maxId + 1 + index).toString();
}

export default function JobSpecificQuestions({ departments: initialDepartments }: JobSpecificQuestionsProps) {
  const [departments, setDepartments] = useState<Department[]>(initialDepartments)
  const [activeDept, setActiveDept] = useState<string>('')
  const [activeSubdept, setActiveSubdept] = useState<Record<string, string>>({})
  const [activeClass, setActiveClass] = useState<Record<string, string>>({})
  const [activeSubclass, setActiveSubclass] = useState<Record<string, string>>({})
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})

  // Handlers for sidebar interactions
  const handleDeptClick = (deptId: string) => {
    setActiveDept(deptId)
    // Reset subdepartment selection when changing department
    setActiveSubdept(prev => ({ ...prev, [deptId]: '' }))
  }

  const handleSubdeptClick = (deptId: string, subdeptId: string) => {
    setActiveDept(deptId)
    setActiveSubdept(prev => ({ ...prev, [deptId]: subdeptId }))
  }

  const handleClassClick = (deptId: string, subdeptId: string, classId: string) => {
    const subdeptKey = `${deptId}-${subdeptId}`
    setActiveDept(deptId)
    setActiveSubdept(prev => ({ ...prev, [deptId]: subdeptId }))
    setActiveClass(prev => ({ ...prev, [subdeptKey]: classId }))
  }

  const handleSubclassClick = (deptId: string, subdeptId: string, classId: string, subclassId: string) => {
    const subdeptKey = `${deptId}-${subdeptId}`
    const classKey = `${subdeptKey}-${classId}`
    setActiveDept(deptId)
    setActiveSubdept(prev => ({ ...prev, [deptId]: subdeptId }))
    setActiveClass(prev => ({ ...prev, [subdeptKey]: classId }))
    setActiveSubclass(prev => ({ ...prev, [classKey]: subclassId }))
  }

  // Toggle expanded state for collapsible items
  const handleToggleExpand = (key: string) => {
    setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteContext, setDeleteContext] = useState<{ type: string, index: number } | null>(null)
  const [editingContext, setEditingContext] = useState<EditingContext | null>(null)
  const [newQuestions, setNewQuestions] = useState<{
    title: string,
    content: string,
    type: 'general' | 'process' | 'warning' | 'tip',
    isImportant: boolean,
    isVisible: boolean,
    category: string
  }[]>([{
    title: '',
    content: '',
    type: 'general',
    isImportant: false,
    isVisible: true,
    category: ''
  }])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Edit states
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({
    title: '',
    content: '',
    type: 'general' as 'general' | 'process' | 'warning' | 'tip',
    isImportant: false,
    isVisible: true,
    category: ''
  })

  const [isReady, setIsReady] = useState(false)

  // Initialize component
  useEffect(() => {
    if (departments.length === 0 || isReady) return

    const initialDept = departments[0]?.id || ''
    setActiveDept(initialDept)

    const initialSubdept = departments[0]?.tm_subdepartments?.[0]
    if (initialSubdept) {
      const subdeptId = initialSubdept.id.toString()
      setActiveSubdept(prev => ({ ...prev, [initialDept]: subdeptId }))

      const initialClass = initialSubdept.classes?.[0]
      if (initialClass) {
        const subdeptKey = `${initialDept}-${subdeptId}`
        // Use class ID instead of name
        setActiveClass(prev => ({ ...prev, [subdeptKey]: initialClass.id.toString() }))

        const initialSubclass = initialClass.subClasses?.[0]
        if (initialSubclass) {
          const classKey = `${subdeptKey}-${initialClass.id}`
          setActiveSubclass(prev => ({ ...prev, [classKey]: initialSubclass.id.toString() }))
        }
      }
    }

    setIsReady(true)
  }, [departments, isReady])

  // Update departments state when prop changes
  useEffect(() => {
    setDepartments(initialDepartments)
  }, [initialDepartments])

  const toggleExpanded = (key: string) => {
    setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const openQuestionsDialog = (context: EditingContext) => {
    setEditingContext(context)
    setNewQuestions([{
      title: '',
      content: '',
      type: 'general',
      isImportant: false,
      isVisible: true,
      category: ''
    }])
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingContext(null)
    setNewQuestions([{
      title: '',
      content: '',
      type: 'general',
      isImportant: false,
      isVisible: true,
      category: ''
    }])
  }

  const handleDeleteClick = (type: string, index: number) => {
    setDeleteContext({ type, index })
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteContext || !editingContext) return

    try {
      setIsSubmitting(true)
      const { type, index } = deleteContext

      // Get current questions
      const currentQuestions = getCurrentQuestionsForContext(editingContext)
      if (!currentQuestions) return

      const updatedQuestions = currentQuestions.filter((_, i) => i !== index)
      await saveQuestionsForContext(editingContext, updatedQuestions)

      await refreshDepartments()

      toast({
        title: "Success",
        description: "Question deleted successfully",
        variant: "default"
      })

      setIsDeleteDialogOpen(false)
      setDeleteContext(null)

    } catch (error) {
      console.error('Error deleting question:', error)
      toast({
        title: "Error",
        description: "Failed to delete question. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Helper function to get current questions for a context
  const getCurrentQuestionsForContext = (context: EditingContext): ApiQuestion[] | null => {
    const dept = departments.find(d => d.id === context.departmentId)
    if (!dept) return null

    const subdept = dept.tm_subdepartments?.find(s => s.id.toString() === context.subdepartmentId)
    if (!subdept) return null

    if (context.type === 'subdepartment') {
      return subdept.upload_questions || []
    } else if (context.type === 'class') {
      const targetClass = subdept.classes?.find(c => c.id.toString() === context.classId)
      return targetClass?.questions || []
    } else if (context.type === 'subclass') {
      const targetClass = subdept.classes?.find(c => c.id.toString() === context.classId)
      const targetSubclass = targetClass?.subClasses?.find(sc => sc.id.toString() === context.subclassId)
      return targetSubclass?.questions || []
    }

    return null
  }

  const saveQuestionsForContext = async (context: EditingContext, questions: ApiQuestion[]) => {
    let classId = '';
    let questionType = '';

    if (context.type === 'subdepartment') {
      classId = context.subdepartmentId;
      questionType = 'subdepartment';
    } else if (context.type === 'class') {
      classId = `${context.subdepartmentId}_${context.classId}`;
      questionType = 'class';
    } else if (context.type === 'subclass') {
      classId = `${context.subdepartmentId}_${context.classId}_${context.subclassId}`;
      questionType = 'subclass';
    }

    const { error } = await supabase
      .from('tm_class_requirements')
      .upsert({
        class_id: classId,
        type: questionType,
        job_specific_questions: questions, // Changed from 'questions' to 'job_specific_questions'
        updated_at: new Date().toISOString(),
        is_mandatory: true
      }, {
        onConflict: 'class_id,type'
      });

    if (error) throw error;
  }
  const refreshDepartments = async () => {
    try {
      // Fixed query - removed the incorrect join syntax
      const { data: departmentsData, error } = await supabase
        .from('tm_departments')
        .select('*, tm_subdepartments(*)')
        .order('order', { ascending: true })

      if (error) throw error

      // Fetch all questions from the API structure
      const { data: questions, error: questionError } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .order('id')

      if (questionError) throw questionError

      console.log('Fetched departments:', departmentsData)
      console.log('Fetched questions:', questions)

      // Process departments and their questions according to API structure
      const processedDepartments = departmentsData.map(dept => {
        const subdepartments = (dept.tm_subdepartments || []).map(subdept => {
          // Process classes from JSONB column
          const classes = (subdept.classes || []).map(cls => {
            const classId = `${subdept.id}_${cls.id}`

            // Find class questions from API
            const classQuestionsRecord = questions?.find(question =>
              question.class_id === classId && question.type === 'class'
            )

            console.log(`Looking for class questions with ID: ${classId}`, classQuestionsRecord)

            const classQuestions = classQuestionsRecord?.job_specific_questions?.map((g: any, idx: number) => ({
              id: g.id?.toString() || generateQuestionId(idx, classQuestionsRecord.job_specific_questions),
              title: g.title || '',
              content: g.content || '',
              type: g.type || 'general',
              order: g.order || idx,
              isVisible: g.isVisible !== false,
              isImportant: g.isImportant || false,
              category: g.category || ''
            })) || []

            // Process subclasses from JSONB
            const subClasses = (cls.subClasses || []).map(subCls => {
              const subClassId = `${classId}_${subCls.id}`

              // Find subclass questions from API
              const subClassQuestionsRecord = questions?.find(question =>
                question.class_id === subClassId && question.type === 'subclass'
              )

              const subClassQuestions = subClassQuestionsRecord?.job_specific_questions?.map((g: any, idx: number) => ({
                id: g.id?.toString() || generateQuestionId(idx, subClassQuestionsRecord.job_specific_questions),
                title: g.title || '',
                content: g.content || '',
                type: g.type || 'general',
                order: g.order || idx,
                isVisible: g.isVisible !== false,
                isImportant: g.isImportant || false,
                category: g.category || ''
              })) || []

              return {
                ...subCls,
                parentClassId: classId,
                questions: subClassQuestions
              }
            })

            return {
              ...cls,
              questions: classQuestions,
              subClasses
            }
          })

          // Process subdepartment questions
          const subdeptQuestionsRecord = questions?.find(question =>
            question.class_id === subdept.id.toString() && question.type === 'subdepartment'
          )

          console.log(`Looking for subdept questions with ID: ${subdept.id.toString()}`, subdeptQuestionsRecord)

          const uploadQuestions = subdeptQuestionsRecord?.job_specific_questions?.map((g: any, idx: number) => ({
            id: g.id?.toString() || generateQuestionId(idx, subdeptQuestionsRecord.job_specific_questions),
            title: g.title || '',
            content: g.content || '',
            type: g.type || 'general',
            order: g.order || idx,
            isVisible: g.isVisible !== false,
            isImportant: g.isImportant || false,
            category: g.category || ''
          })) || []

          return {
            ...subdept,
            classes,
            upload_questions: uploadQuestions
          }
        })

        return {
          ...dept,
          tm_subdepartments: subdepartments,
          subdepartments: subdepartments // For backward compatibility
        }
      })

      console.log('Processed departments:', processedDepartments)
      setDepartments(processedDepartments)
    } catch (error) {
      console.error('Error refreshing departments:', error)
      toast({
        title: "Error",
        description: "Failed to refresh departments. Please try again.",
        variant: "destructive"
      })
    }
  }

  // Call refreshDepartments on mount
  useEffect(() => {
    refreshDepartments()
  }, [])

  const addNewQuestion = () => {
    setNewQuestions([...newQuestions, {
      title: '',
      content: '',
      type: 'general',
      isImportant: false,
      isVisible: true,
      category: ''
    }])
  }

  const removeNewQuestion = (index: number) => {
    if (newQuestions.length > 1) {
      setNewQuestions(newQuestions.filter((_, i) => i !== index))
    }
  }

  const handleNewQuestionChange = (index: number, field: keyof typeof newQuestions[0], value: any) => {
    const updated = [...newQuestions]
    updated[index] = { ...updated[index], [field]: value }
    setNewQuestions(updated)
  }

  const handleAddMultipleQuestions = async () => {
    if (!editingContext) return

    const validQuestions = newQuestions.filter(question => question.title.trim() !== '')
    if (validQuestions.length === 0) {
      handleCloseDialog()
      return
    }

    try {
      setIsSubmitting(true)

      // Get existing questions based on context
      let classId = '';
      let existingQuestions: any[] = [];
      let questionType = '';

      if (editingContext.type === 'subdepartment') {
        classId = editingContext.subdepartmentId;
        questionType = 'subdepartment';
      } else if (editingContext.type === 'class') {
        classId = `${editingContext.subdepartmentId}_${editingContext.classId}`;
        questionType = 'class';
      } else if (editingContext.type === 'subclass') {
        classId = `${editingContext.subdepartmentId}_${editingContext.classId}_${editingContext.subclassId}`;
        questionType = 'subclass';
      }

      // Get existing questions from tm_class_requirements
      const { data: existingGuides } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('class_id', classId)
        .eq('type', questionType)
        .single();

      existingQuestions = existingGuides?.questions || [];

      // Prepare new questions with proper IDs and order
      const newQuestionsWithIds = validQuestions.map((question, index) => {
        const newId = generateQuestionId(index, existingQuestions);
        return {
          id: newId,
          title: question.title.trim(),
          content: question.content.trim() || '',
          type: question.type,
          order: existingQuestions.length + index,
          isVisible: question.isVisible,
          isImportant: question.isImportant,
          category: question.category.trim() || ''
        };
      });

      // Combine existing and new questions
      const updatedQuestions = [...existingQuestions, ...newQuestionsWithIds];

      // Inside handleAddMultipleQuestions, update the upsert operation:
      const { error } = await supabase
        .from('tm_class_requirements')
        .upsert({
          class_id: classId,
          type: questionType,
          job_specific_questions: updatedQuestions, // Changed from 'questions' to 'job_specific_questions'
          updated_at: new Date().toISOString(),
          is_mandatory: true
        }, {
          onConflict: 'class_id,type',
          returning: 'minimal'
        });

      if (error) throw error;

      await refreshDepartments()

      toast({
        title: "Success",
        description: `Added ${validQuestions.length} question${validQuestions.length > 1 ? 's' : ''} successfully`,
        variant: "default"
      })

      handleCloseDialog()

    } catch (error) {
      console.error('Error adding questions:', error)
      toast({
        title: "Error",
        description: "Failed to add questions. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderQuestions = (questions: QuestionTableEntry[] | null | undefined, context: EditingContext) => {
    // Ensure questions is always an array
    const safeQuestions = questions || [];

    console.log('Rendering questions:', safeQuestions, 'for context:', context)

    const handleEdit = (index: number) => {
      setEditingIndex(index)
      setEditForm({
        title: safeQuestions[index].title,
        content: safeQuestions[index].content || '',
        type: safeQuestions[index].type || 'general',
        isImportant: safeQuestions[index].isImportant !== false,
        isVisible: safeQuestions[index].isVisible !== false,
        category: safeQuestions[index].category || ''
      })
    }

    const handleSaveEdit = async () => {
      if (editingIndex === null || !editingContext) return

      try {
        const updatedQuestions = [...safeQuestions]
        updatedQuestions[editingIndex] = {
          ...updatedQuestions[editingIndex],
          title: editForm.title.trim(),
          content: editForm.content.trim(),
          type: editForm.type,
          isImportant: editForm.isImportant,
          isVisible: editForm.isVisible,
          category: editForm.category.trim()
        }

        await saveQuestionsForContext(context, updatedQuestions)
        await refreshDepartments()
        setEditingIndex(null)

        toast({
          title: "Success",
          description: "Question updated successfully",
          variant: "default"
        })

      } catch (error) {
        console.error('Error updating question:', error)
        toast({
          title: "Error",
          description: "Failed to update question. Please try again.",
          variant: "destructive"
        })
      }
    }

    const handleMove = async (index: number, direction: 'up' | 'down') => {
      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= safeQuestions.length) return

      try {
        const updatedQuestions = [...safeQuestions]
          ;[updatedQuestions[index], updatedQuestions[newIndex]] =
            [updatedQuestions[newIndex], updatedQuestions[index]]

        // Update order values
        updatedQuestions.forEach((question, i) => {
          question.order = i
        })

        await saveQuestionsForContext(context, updatedQuestions)
        await refreshDepartments()

      } catch (error) {
        console.error('Error moving question:', error)
        toast({
          title: "Error",
          description: "Failed to move question. Please try again.",
          variant: "destructive"
        })
      }
    }

    const getTypeIcon = (type: string) => {
      switch (type) {
        case 'warning':
          return <AlertTriangle className="h-4 w-4 text-yellow-500" />
        case 'process':
          return <FileText className="h-4 w-4 text-blue-500" />
        case 'tip':
          return <Info className="h-4 w-4 text-green-500" />
        default:
          return <BookOpen className="h-4 w-4 text-gray-500" />
      }
    }

    const getTypeBadgeVariant = (type: string) => {
      switch (type) {
        case 'warning':
          return 'destructive'
        case 'process':
          return 'default'
        case 'tip':
          return 'secondary'
        default:
          return 'outline'
      }
    }

    return (
      <div className="relative h-[calc(80vh-200px)] border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Content</TableHead>
              <TableHead className="w-20">Type</TableHead>
              <TableHead className="w-24">Category</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead className="w-56">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {safeQuestions.length > 0 ? (
              safeQuestions.map((question, idx) => (
                <TableRow key={question.id || question.tempId || idx} className="group hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs">
                      {idx + 1}
                    </span>
                  </TableCell>
                  <TableCell>
                    {editingIndex === idx ? (
                      <Input
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        className="h-9"
                        autoFocus
                      />
                    ) : (
                      <div className="flex items-center space-x-2">
                        {getTypeIcon(question.type)}
                        <span className="font-medium">{question.title}</span>
                        {question.isImportant && (
                          <AlertTriangle className="h-3 w-3 text-red-500" />
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingIndex === idx ? (
                      <Textarea
                        value={editForm.content}
                        onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                        className="min-h-[60px]"
                        placeholder="Question content"
                      />
                    ) : (
                      <div className="max-w-xs">
                        <p className={cn(
                          "text-sm line-clamp-3",
                          !question.content ? 'text-gray-400 italic' : ''
                        )}>
                          {question.content || 'No content'}
                        </p>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingIndex === idx ? (
                      <select
                        value={editForm.type}
                        onChange={(e) => setEditForm({ ...editForm, type: e.target.value as any })}
                        className="h-9 px-2 border rounded"
                      >
                        <option value="general">General</option>
                        <option value="process">Process</option>
                        <option value="warning">Warning</option>
                        <option value="tip">Tip</option>
                      </select>
                    ) : (
                      <Badge variant={getTypeBadgeVariant(question.type)}>
                        {question.type}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingIndex === idx ? (
                      <Input
                        value={editForm.category}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                        className="h-9"
                        placeholder="Category"
                      />
                    ) : (
                      <span className={cn(
                        "text-xs px-2 py-1 rounded-full",
                        question.category
                          ? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                          : "text-gray-400 italic"
                      )}>
                        {question.category || 'No category'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingIndex === idx ? (
                      <div className="flex flex-col space-y-1">
                        <label className="flex items-center space-x-1">
                          <Checkbox
                            checked={editForm.isImportant}
                            onCheckedChange={(checked) => setEditForm({ ...editForm, isImportant: Boolean(checked) })}
                          />
                          <span className="text-xs">Important</span>
                        </label>
                        <label className="flex items-center space-x-1">
                          <Checkbox
                            checked={editForm.isVisible}
                            onCheckedChange={(checked) => setEditForm({ ...editForm, isVisible: Boolean(checked) })}
                          />
                          <span className="text-xs">Visible</span>
                        </label>
                      </div>
                    ) : (
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center space-x-1">
                          {question.isImportant ? (
                            <AlertTriangle className="h-3 w-3 text-red-500" />
                          ) : (
                            <div className="h-3 w-3" />
                          )}
                          <span className="text-xs">{question.isImportant ? 'Important' : 'Normal'}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          {question.isVisible ? (
                            <Eye className="h-3 w-3 text-green-500" />
                          ) : (
                            <EyeOff className="h-3 w-3 text-gray-400" />
                          )}
                          <span className="text-xs">{question.isVisible ? 'Visible' : 'Hidden'}</span>
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-1">
                      {editingIndex === idx ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-green-600"
                            onClick={handleSaveEdit}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => setEditingIndex(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-blue-600"
                            onClick={() => handleEdit(idx)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleMove(idx, 'up')}
                            disabled={idx === 0}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleMove(idx, 'down')}
                            disabled={idx === safeQuestions.length - 1}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500"
                            onClick={() => handleDeleteClick(context.type, idx)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                  <div className="flex flex-col items-center space-y-2">
                    <BookOpen className="h-8 w-8 text-gray-400" />
                    <p>No questions added yet</p>
                    <p className="text-xs text-gray-400">Click the button above to add questions</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    )
  }

  // Main content area with sidebar and questions
  const renderSidebarView = () => {
    return (
      <div className="flex h-[calc(100vh-200px)] border rounded-lg overflow-hidden">
        {/* Department Sidebar */}
        <DepartmentSidebar
          departments={departments}
          activeDept={activeDept}
          activeSubdept={activeSubdept[activeDept] || ''}
          onDeptClick={handleDeptClick}
          onSubdeptClick={handleSubdeptClick}
          onClassClick={handleClassClick}
          onSubclassClick={handleSubclassClick}
          onToggleExpand={handleToggleExpand}
          expandedItems={expandedItems}
        />

        {/* Main Content */}
        <div className="flex-1 p-6 bg-white dark:bg-gray-900">
          {renderMainContent()}
        </div>
      </div>

    )
  }

  const renderMainContent = () => {
    const currentDept = departments.find(d => d.id === activeDept)
    if (!currentDept) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500">
          <div className="text-center">
            <BookOpen className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium">Select a department</p>
            <p className="text-sm">Choose a department from the sidebar to view its questions</p>
          </div>
        </div>
      )
    }

    const currentSubdeptId = activeSubdept[currentDept.id]
    const currentSubdept = currentDept.tm_subdepartments?.find(s => s.id.toString() === currentSubdeptId)

    if (!currentSubdept) {
      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{currentDept.name}</h2>
            {currentDept.description && (
              <p className="text-gray-600 dark:text-gray-400">{currentDept.description}</p>
            )}
          </div>
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="text-center">
              <BookOpen className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium">Select a subdepartment</p>
              <p className="text-sm">Choose a subdepartment to view and manage questions</p>
            </div>
          </div>
        </div>
      )
    }

    const activeClassKey = `${currentDept.id}-${currentSubdept.id}`
    const currentClassId = activeClass[activeClassKey]
    const currentClass = currentSubdept.classes?.find(c => c.id.toString() === currentClassId)

    const activeSubclassKey = `${activeClassKey}-${currentClassId}`
    const currentSubclassId = activeSubclass[activeSubclassKey]
    const currentSubclass = currentClass?.subClasses?.find(sc => sc.id.toString() === currentSubclassId)

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b pb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{currentDept.name}</h2>
          <h3 className="text-lg text-gray-600 dark:text-gray-400">{currentSubdept.name}</h3>
          {currentClass && (
            <div className="flex items-center space-x-2 mt-2">
              <Badge variant="outline">{currentClass.name}</Badge>
              {currentSubclass && (
                <>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                  <Badge variant="outline">{currentSubclass.name}</Badge>
                </>
              )}
            </div>
          )}
        </div>

        {/* Content based on current selection */}
        {currentSubclass ? (
          // Show subclass questions
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-medium flex items-center space-x-2">
                <BookOpen className="h-5 w-5 text-orange-600" />
                <span>Sub-class Questions: {currentSubclass.name}</span>
              </h4>
              <Button
                onClick={() => openQuestionsDialog({
                  type: 'subclass',
                  departmentId: currentDept.id,
                  subdepartmentId: currentSubdept.id,
                  classId: currentClass?.id.toString(),
                  subclassId: currentSubclass.id.toString()
                })}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Questions
              </Button>
            </div>
            {renderQuestions(currentSubclass.questions, {
              type: 'subclass',
              departmentId: currentDept.id,
              subdepartmentId: currentSubdept.id,
              classId: currentClass?.id.toString(),
              subclassId: currentSubclass.id.toString()
            })}
          </div>
        ) : currentClass ? (
          // Show class questions
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-medium flex items-center space-x-2">
                <BookOpen className="h-5 w-5 text-blue-600" />
                <span>Class Questions: {currentClass.name}</span>
              </h4>
              <Button
                onClick={() => openQuestionsDialog({
                  type: 'class',
                  departmentId: currentDept.id,
                  subdepartmentId: currentSubdept.id,
                  classId: currentClass.id.toString()
                })}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Questions
              </Button>
            </div>
            {renderQuestions(currentClass.questions, {
              type: 'class',
              departmentId: currentDept.id,
              subdepartmentId: currentSubdept.id,
              classId: currentClass.id.toString()
            })}
          </div>
        ) : (
          // Show subdepartment questions
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-medium flex items-center space-x-2">
                <BookOpen className="h-5 w-5 text-green-600" />
                <span>Subdepartment Questions</span>
              </h4>
              <Button
                onClick={() => openQuestionsDialog({
                  type: 'subdepartment',
                  departmentId: currentDept.id,
                  subdepartmentId: currentSubdept.id
                })}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Questions
              </Button>
            </div>
            {renderQuestions(currentSubdept.upload_questions, {
              type: 'subdepartment',
              departmentId: currentDept.id,
              subdepartmentId: currentSubdept.id
            })}
          </div>
        )}
      </div>
    )
  }

  if (!departments || departments.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <BookOpen className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p className="text-lg font-medium text-gray-600">No departments found</p>
          <p className="text-sm text-gray-500">Create departments first to manage questions</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto py-6">
      <div className="flex flex-col space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Job Specific Questions</h1>
        </div>
        {renderSidebarView()}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Question</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this question? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Questions Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Add Multiple Questions</DialogTitle>
            <DialogDescription>
              Add multiple questions to {editingContext?.type === 'subdepartment' ? 'subdepartment' :
                editingContext?.type === 'class' ? 'class' : 'sub-class'}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              {newQuestions.map((question, idx) => (
                <Card key={idx} className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-l-4 border-l-purple-500">
                  <div className="space-y-4">
                    {/* Title and Remove Button */}
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold flex items-center">
                        <BookOpen className="h-4 w-4 mr-2" />
                        Question {idx + 1}
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500"
                        onClick={() => removeNewQuestion(idx)}
                        disabled={newQuestions.length <= 1}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Title Input */}
                    <div className="space-y-2">
                      <Label htmlFor={`title-${idx}`}>
                        Title *
                      </Label>
                      <Input
                        id={`title-${idx}`}
                        value={question.title}
                        onChange={(e) => handleNewQuestionChange(idx, 'title', e.target.value)}
                        placeholder="Enter question title"
                        className="font-medium"
                      />
                    </div>

                    {/* Content Textarea */}
                    <div className="space-y-2">
                      <Label htmlFor={`content-${idx}`}>
                        Content
                      </Label>
                      <Textarea
                        id={`content-${idx}`}
                        value={question.content}
                        onChange={(e) => handleNewQuestionChange(idx, 'content', e.target.value)}
                        placeholder="Enter detailed question content..."
                        className="min-h-[100px]"
                      />
                    </div>

                    {/* Type and Category Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`type-${idx}`}>
                          Type
                        </Label>
                        <select
                          id={`type-${idx}`}
                          value={question.type}
                          onChange={(e) => handleNewQuestionChange(idx, 'type', e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                        >
                          <option value="general">📋 General</option>
                          <option value="process">⚙️ Process</option>
                          <option value="warning">⚠️ Warning</option>
                          <option value="tip">💡 Tip</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`category-${idx}`}>
                          Category
                        </Label>
                        <Input
                          id={`category-${idx}`}
                          value={question.category}
                          onChange={(e) => handleNewQuestionChange(idx, 'category', e.target.value)}
                          placeholder="e.g., Documentation, Process, Safety"
                        />
                      </div>
                    </div>

                    {/* Checkboxes for properties */}
                    <div className="flex items-center space-x-6">
                      <label className="flex items-center space-x-2">
                        <Checkbox
                          checked={question.isImportant}
                          onCheckedChange={(checked) => handleNewQuestionChange(idx, 'isImportant', Boolean(checked))}
                        />
                        <span className="text-sm flex items-center">
                          <AlertTriangle className="h-3 w-3 mr-1 text-red-500" />
                          Mark as Important
                        </span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <Checkbox
                          checked={question.isVisible}
                          onCheckedChange={(checked) => handleNewQuestionChange(idx, 'isVisible', Boolean(checked))}
                        />
                        <span className="text-sm flex items-center">
                          <Eye className="h-3 w-3 mr-1 text-green-500" />
                          Visible to Users
                        </span>
                      </label>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>

          <div className="pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addNewQuestion}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Another Question
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleAddMultipleQuestions}
              disabled={!newQuestions.some(question => question.title.trim() !== '') || isSubmitting}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin -ml-1 mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Adding...
                </>
              ) : (
                `Add ${newQuestions.filter(question => question.title.trim() !== '').length} Questions`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}