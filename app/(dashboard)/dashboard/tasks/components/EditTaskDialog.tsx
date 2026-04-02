// @ts-nocheck
"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Loader2, Save, X, Building, Workflow, Layers, BoxSelect,
  Shield, User, UserCheck, Calendar, FileText, Users, Hash,
  Check, UserCog, Briefcase, Clock, Building2, AlertCircle
} from "lucide-react"
import { toast } from "@/lib/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"

interface EditTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: any
  departments: any[]
  users: any[]
  officers: any[]
  stages: any[]
  onTaskUpdate: (task: any) => void
}

export function EditTaskDialog({
  open,
  onOpenChange,
  task,
  departments,
  users,
  officers,
  stages,
  onTaskUpdate
}: EditTaskDialogProps) {
  // --- State Management ---
  const [formData, setFormData] = useState({
    // Basic Information
    applicant_name: '',
    job_description: '',
    status: '',
    renewal_status: '',

    // Department Hierarchy
    department_id: '',
    subdepartment_id: '',
    class_id: '',
    subclass_id: '',

    // Staff Assignment
    task_manager_id: '',
    officer_id: '',
    task_assistant_id: '',

    // Case Details
    r_number: '',
    principal_member_name: '',
    applicant_type: '',
    principal_member: false,
    account_used: '',
    batch: '',
    applied_by: '',
    understudy: '',
    company_id: '',

    // Dates
    date_initiated: '',
    created_at: '',
    updated_at: ''
  })

  const [loading, setLoading] = useState(false)
  const [companies, setCompanies] = useState([])
  const isInitialLoad = useRef(true);

  // State for dropdown options
  const [availableSubdepartments, setAvailableSubdepartments] = useState([])
  const [availableClasses, setAvailableClasses] = useState([])
  const [availableSubclasses, setAvailableSubclasses] = useState([])
  const [availableOfficers, setAvailableOfficers] = useState([])
  const [availableManagers, setAvailableManagers] = useState([])
  const [availableAssistants, setAvailableAssistants] = useState([])

  // Stage management state
  const [taskStages, setTaskStages] = useState<Record<string, any>>({});
  const [availableStages, setAvailableStages] = useState<any[]>([]);

  // --- Initial Data Loading ---
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const { data, error } = await supabase
          .from('acc_portal_company_duplicate')
          .select('id, company_name')
          .order('company_name');

        if (error) throw error;
        setCompanies(data || []);
      } catch (error) {
        console.error('Error fetching companies:', error);
      }
    };

    if (open) {
      fetchCompanies();
    }
  }, [open]);

  // --- Helpers ---
  const formatDateForInput = (dateString: string): string => {
    if (!dateString) return '';
    try {
      if (dateString.includes('/')) {
        const [day, month, year] = dateString.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  const convertDateToDbFormat = (dateString: string): string => {
    if (!dateString) return '';
    try {
      if (dateString.includes('/')) {
        const [day, month, year] = dateString.split('/');
        const date = new Date(`${year}-${month}-${day}`);
        if (isNaN(date.getTime())) return '';
        return dateString;
      }
      const [year, month, day] = dateString.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (isNaN(date.getTime())) return '';
      return [day.padStart(2, '0'), month.padStart(2, '0'), year].join('/');
    } catch {
      return '';
    }
  };

  const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) return null;
    try {
      const today = new Date();
      const birthDate = new Date(dateOfBirth);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    } catch {
      return null;
    }
  };

  const findClassInfo = (deptId, subdeptId, classId, subclassId) => {
    if (!departments || departments.length === 0 || !deptId) return {};
    const dept = departments.find(d => d.id?.toString() === deptId?.toString());
    const subdept = dept?.tm_subdepartments?.find(s => s.id?.toString() === subdeptId?.toString());
    const classItem = subdept?.classes?.find(c => c.id?.toString() === classId?.toString());
    const subclassItem = classItem?.subClasses?.find(sc => sc.id?.toString() === subclassId?.toString());
    return {
      departmentName: dept?.name || '',
      subdepartmentName: subdept?.name || '',
      className: classItem?.name || '',
      subclassName: subclassItem?.name || ''
    };
  };

  const findActiveStaffForSubdept = (subdept, allUsers, allOfficers) => {
    if (!subdept || !allUsers || !allOfficers) {
      return { officers: [], managers: [], assistants: [] };
    }
    const hasOfficerHistory = subdept.officer_history && Array.isArray(subdept.officer_history);
    const hasManagerHistory = subdept.manager_history && Array.isArray(subdept.manager_history);
    const hasAssistantHistory = subdept.assistant_history && Array.isArray(subdept.assistant_history);

    if (!hasOfficerHistory && !hasManagerHistory && !hasAssistantHistory) {
      return {
        officers: allOfficers,
        managers: allUsers.filter(u => u.role === 'user' || u.role === 'admin'),
        assistants: allUsers.filter(u => u.role === 'user')
      };
    }

    const getActiveUserIds = (historyArray) => {
      if (!historyArray || !Array.isArray(historyArray)) return [];
      return historyArray.filter(item => item && !item.end_date).map(item => item.id).filter(Boolean);
    };

    const activeOfficerIds = getActiveUserIds(subdept.officer_history);
    const activeManagerIds = getActiveUserIds(subdept.manager_history);
    const activeAssistantIds = getActiveUserIds(subdept.assistant_history);

    const hasSpecificAssignments = activeOfficerIds.length > 0 || activeManagerIds.length > 0 || activeAssistantIds.length > 0;

    if (!hasSpecificAssignments) {
      return {
        officers: allOfficers,
        managers: allUsers.filter(u => u.role === 'user' || u.role === 'admin'),
        assistants: allUsers.filter(u => u.role === 'user')
      };
    }
    return {
      officers: allOfficers.filter(o => activeOfficerIds.includes(o.id)),
      managers: allUsers.filter(u => activeManagerIds.includes(u.id)),
      assistants: allUsers.filter(u => activeAssistantIds.includes(u.id)),
    };
  };

  const getAvailableStagesForTask = (departmentId, subdepartmentId) => {
    if (!stages || !stages.length || !departmentId) return [];
    return stages.sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
  };

  // --- Effects ---

  // Main population
  useEffect(() => {
    if (open && task && departments.length > 0) {
      isInitialLoad.current = true;
      const initialFormData = {
        applicant_name: task.applicant_name || '',
        job_description: task.job_description || '',
        status: task.status || '',
        renewal_status: task.renewal_status || '',
        department_id: task.department_id?.toString() || '',
        subdepartment_id: task.subdepartment_id?.toString() || '',
        class_id: task.class_id?.toString() || '',
        subclass_id: task.subclass_id?.toString() || '',
        task_manager_id: task.task_manager_id?.toString() || '',
        officer_id: task.officer_id?.toString() || '',
        task_assistant_id: task.task_assistant_id?.toString() || '',
        r_number: task.r_number || '',
        principal_member_name: task.principal_member_name || '',
        applicant_type: task.applicant_type || '',
        principal_member: task.principal_member || false,
        account_used: task.account_used || '',
        batch: task.batch || '',
        applied_by: task.applied_by || '',
        understudy: task.understudy || '',
        company_id: task.company_id?.toString() || '',
        date_initiated: formatDateForInput(task.date_initiated),
        created_at: formatDateForInput(task.created_at),
        updated_at: formatDateForInput(task.updated_at)
      };

      setFormData(initialFormData);
      setTaskStages(task.stages || {});
      setAvailableStages(getAvailableStagesForTask(initialFormData.department_id, initialFormData.subdepartment_id));

      const dept = departments.find(d => d.id?.toString() === initialFormData.department_id);
      if (dept) {
        setAvailableSubdepartments(dept.tm_subdepartments || []);
        const subdept = dept.tm_subdepartments?.find(s => s.id?.toString() === initialFormData.subdepartment_id);
        if (subdept) {
          setAvailableClasses(subdept.classes || []);
          const classItem = subdept.classes?.find(c => c.id?.toString() === initialFormData.class_id);
          if (classItem) setAvailableSubclasses(classItem.subClasses || []);
          if (users && officers) {
            const activeStaff = findActiveStaffForSubdept(subdept, users, officers);
            setAvailableOfficers(activeStaff.officers);
            setAvailableManagers(activeStaff.managers);
            setAvailableAssistants(activeStaff.assistants);
          }
        }
      }
      Promise.resolve().then(() => { isInitialLoad.current = false; });
    }
  }, [open, task, departments, users, officers, stages]);

  // Hierarchy Changes
  useEffect(() => {
    if (isInitialLoad.current || !formData.department_id) return;
    const dept = departments.find(d => d.id.toString() === formData.department_id);
    setAvailableSubdepartments(dept?.tm_subdepartments || []);
    setAvailableStages(getAvailableStagesForTask(formData.department_id, formData.subdepartment_id));
    handleInputChange('subdepartment_id', '');
    setAvailableClasses([]);
    setAvailableSubclasses([]);
    setAvailableOfficers([]);
    setAvailableManagers([]);
    setAvailableAssistants([]);
  }, [formData.department_id]);

  useEffect(() => {
    if (isInitialLoad.current || !formData.subdepartment_id) return;
    const dept = departments.find(d => d.id.toString() === formData.department_id);
    const subdept = dept?.tm_subdepartments?.find(s => s.id.toString() === formData.subdepartment_id);
    if (subdept) {
      setAvailableClasses(subdept.classes || []);
      setAvailableStages(getAvailableStagesForTask(formData.department_id, formData.subdepartment_id));
      if (users && officers) {
        const activeStaff = findActiveStaffForSubdept(subdept, users, officers);
        setAvailableOfficers(activeStaff.officers);
        setAvailableManagers(activeStaff.managers);
        setAvailableAssistants(activeStaff.assistants);
      }
    }
    handleInputChange('class_id', '');
    handleInputChange('officer_id', '');
    handleInputChange('task_manager_id', '');
    handleInputChange('task_assistant_id', '');
    setAvailableSubclasses([]);
  }, [formData.subdepartment_id]);

  useEffect(() => {
    if (isInitialLoad.current || !formData.class_id) return;
    const cls = availableClasses.find(c => c.id.toString() === formData.class_id);
    setAvailableSubclasses(cls?.subClasses || []);
    handleInputChange('subclass_id', '');
  }, [formData.class_id]);

  // --- Handlers ---
  const handleInputChange = (field, value) => {
    if (field === 'task_manager_id') {
      setFormData(prev => ({
        ...prev,
        [field]: value,
        ...(value && prev.task_assistant_id && { task_assistant_id: '' })
      }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleStageDateChange = (stageId: string, dateValue: string) => {
    setTaskStages(prev => {
      if (!dateValue) {
        const { [stageId]: _, ...rest } = prev;
        return rest;
      }
      const formattedDate = convertDateToDbFormat(dateValue);
      return {
        ...prev,
        [stageId]: {
          ...prev[stageId],
          date: formattedDate,
          status: 'completed',
          completedAt: new Date().toISOString()
        }
      };
    });
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const jobLevel = {
        level: formData.subclass_id ? 4 : formData.class_id ? 3 : formData.subdepartment_id ? 2 : formData.department_id ? 1 : null,
        class_id: formData.class_id ? parseInt(formData.class_id, 10) : null,
        subclass_id: formData.subclass_id ? parseInt(formData.subclass_id, 10) : null,
        department_id: formData.department_id ? parseInt(formData.department_id, 10) : null,
        subdepartment_id: formData.subdepartment_id ? parseInt(formData.subdepartment_id, 10) : null
      };

      const officer = officers.find(o => o.id.toString() === formData.officer_id);
      const taskManager = users.find(u => u.id.toString() === formData.task_manager_id);
      const taskAssistant = users.find(u => u.id.toString() === formData.task_assistant_id);

      const staffData = {
        officer: officer ? { id: officer.id, name: officer.name, email: officer.email } : null,
        task_manager: taskManager ? { id: taskManager.id, name: taskManager.name, email: taskManager.email } : null,
        task_assistant: taskAssistant ? { id: taskAssistant.id, name: taskAssistant.name, email: taskAssistant.email } : null
      };

      const updateData = {
        applicant_name: formData.applicant_name.trim(),
        job_description: formData.job_description.trim(),
        renewal_status: formData.renewal_status || null,
        department_id: formData.department_id ? parseInt(formData.department_id, 10) : null,
        subdepartment_id: formData.subdepartment_id ? parseInt(formData.subdepartment_id, 10) : null,
        class_id: formData.class_id ? parseInt(formData.class_id, 10) : null,
        subclass_id: formData.subclass_id ? parseInt(formData.subclass_id, 10) : null,
        job_level: jobLevel,
        task_manager_id: formData.task_manager_id && formData.task_manager_id !== 'none' ? parseInt(formData.task_manager_id, 10) : null,
        officer_id: formData.officer_id && formData.officer_id !== 'none' ? parseInt(formData.officer_id, 10) : null,
        task_assistant_id: formData.task_assistant_id && formData.task_assistant_id !== 'none' ? parseInt(formData.task_assistant_id, 10) : null,
        principal_member_name: formData.principal_member_name.trim() || null,
        applicant_type: formData.applicant_type || null,
        principal_member: formData.principal_member,
        account_used: formData.account_used.trim() || null,
        batch: formData.batch.trim() || null,
        applied_by: formData.applied_by.trim() || null,
        understudy: formData.understudy.trim() || null,
        company_id: formData.company_id && formData.company_id !== 'none' ? parseInt(formData.company_id, 10) : null,
        status: formData.status,
        date_initiated: convertDateToDbFormat(formData.date_initiated),
        stages: taskStages,
        updated_at: new Date().toISOString()
      };

      if (!updateData.applicant_name || !updateData.job_description) {
        toast({ title: "Validation Error", description: "Applicant Name and Job Description are required.", variant: "destructive" });
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.from('tm_tasks').update(updateData).eq('id', task.id).select().single();
      if (error) throw error;
      onTaskUpdate({ ...data, staff: staffData });
      toast({ title: "Success", description: "Task updated successfully.", variant: "default", className: "bg-green-500 text-white border-none" });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating task:', error);
      toast({ title: "Error", description: `Failed to update task: ${error.message}`, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!task) return null;

  const classInfo = findClassInfo(formData.department_id, formData.subdepartment_id, formData.class_id, formData.subclass_id);
  const calculatedAge = calculateAge(formData.date_of_birth);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto border border-gray-200/50 shadow-lg">
        <DialogHeader className="border-b border-gray-200/50 pb-4 bg-white/50">
          <DialogTitle className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            Edit Task <span className="text-sm font-normal text-gray-500">#{task.id}</span>
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Modify details, hierarchy, staff assignments and stage progress.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">

          {/* LEFT COLUMN: IDENTIFICATION & CONTEXT */}
          <div className="lg:col-span-1 space-y-6">

            {/* Applicant Details */}
            <Card>
              <CardHeader className="pb-3 bg-blue-50/50">
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                  <User className="h-4 w-4" /> Applicant Information
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="applicant_name">Full Name *</Label>
                  <Input id="applicant_name" value={formData.applicant_name} onChange={(e) => handleInputChange('applicant_name', e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={formData.applicant_type} onValueChange={(v) => handleInputChange('applicant_type', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="principal">Principal</SelectItem>
                        <SelectItem value="dependant">Dependant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center space-x-2 pt-2">
                  <input type="checkbox" id="principal_member" checked={formData.principal_member} onChange={(e) => handleInputChange('principal_member', e.target.checked)} className="rounded border-gray-300 text-blue-600" />
                  <Label htmlFor="principal_member" className="font-normal">Is Principal Member?</Label>
                </div>
              </CardContent>
            </Card>

            {/* Case Details */}
            <Card>
              <CardHeader className="pb-3 bg-blue-50/50">
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                  <Briefcase className="h-4 w-4" /> Case Details
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Select value={formData.company_id} onValueChange={(v) => handleInputChange('company_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Company</SelectItem>
                      {companies.map((c: any) => <SelectItem key={c.id} value={c.id.toString()}>{c.company_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Understudy</Label>
                  <Input value={formData.understudy} onChange={(e) => handleInputChange('understudy', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Principal Member Name</Label>
                  <Input value={formData.principal_member_name} onChange={(e) => handleInputChange('principal_member_name', e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Account Used</Label>
                    <Input value={formData.account_used} onChange={(e) => handleInputChange('account_used', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Applied By</Label>
                    <Input value={formData.applied_by} onChange={(e) => handleInputChange('applied_by', e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader className="pb-3 bg-blue-50/50">
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                  <Clock className="h-4 w-4" /> Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Date Initiated</Label>
                  <Input type="date" value={formData.date_initiated} onChange={(e) => handleInputChange('date_initiated', e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500">Created At</Label>
                    <Input type="date" value={formData.created_at} disabled className="bg-gray-50 text-xs" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500">Last Updated</Label>
                    <Input type="date" value={formData.updated_at} disabled className="bg-gray-50 text-xs" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN: TASK & EXECUTION */}
          <div className="lg:col-span-2 space-y-6">

            {/* Task Overview */}
            <Card>
              <CardHeader className="pb-3 bg-blue-50/50">
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                  <FileText className="h-4 w-4" /> Task Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={formData.status} onValueChange={(v) => handleInputChange('status', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="enquiry">Enquiry</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="on_hold">On Hold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Renewal Type</Label>
                    <Select value={formData.renewal_status} onValueChange={(v) => handleInputChange('renewal_status', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="renewal">Renewal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Job Description *</Label>
                  <Textarea value={formData.job_description} onChange={(e) => handleInputChange('job_description', e.target.value)} className="min-h-[80px]" />
                </div>
              </CardContent>
            </Card>

            {/* Department Hierarchy */}
            <Card>
              <CardHeader className="pb-3 bg-blue-50/50">
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                  <Shield className="h-4 w-4" /> Department & Classification
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Department</Label>
                    <Select value={formData.department_id} onValueChange={(v) => handleInputChange('department_id', v)}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{departments.map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Subdepartment</Label>
                    <Select value={formData.subdepartment_id} onValueChange={(v) => handleInputChange('subdepartment_id', v)} disabled={!formData.department_id}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{availableSubdepartments.map((s: any) => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Class</Label>
                    <Select value={formData.class_id} onValueChange={(v) => handleInputChange('class_id', v)} disabled={!availableClasses.length}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{availableClasses.map((c: any) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Subclass</Label>
                    <Select value={formData.subclass_id} onValueChange={(v) => handleInputChange('subclass_id', v)} disabled={!availableSubclasses.length}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{availableSubclasses.map((s: any) => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Staff Assignment */}
            <Card>
              <CardHeader className="pb-3 bg-blue-50/50">
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                  <UserCheck className="h-4 w-4" /> Staff Assignment
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Officer ({availableOfficers.length})</Label>
                    <Select value={formData.officer_id} onValueChange={v => handleInputChange('officer_id', v)} disabled={!formData.subdepartment_id}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Select Officer" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Officer</SelectItem>
                        {availableOfficers.map((o: any) => <SelectItem key={o.id} value={o.id.toString()}>{o.name || o.email}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Manager ({availableManagers.length})</Label>
                    <Select value={formData.task_manager_id} onValueChange={v => handleInputChange('task_manager_id', v)} disabled={!formData.subdepartment_id}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Select Manager" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Manager</SelectItem>
                        {availableManagers.map((m: any) => <SelectItem key={m.id} value={m.id.toString()}>{m.name || m.email}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Assistant ({availableAssistants.length})</Label>
                    <Select value={formData.task_assistant_id} onValueChange={v => handleInputChange('task_assistant_id', v)} disabled={!formData.task_manager_id}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Select Assistant" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Assistant</SelectItem>
                        {availableAssistants.map((a: any) => <SelectItem key={a.id} value={a.id.toString()}>{a.name || a.email}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stage Management */}
            <Card>
              <CardHeader className="pb-3 bg-blue-50/50">
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                  <Workflow className="h-4 w-4" /> Stage Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {availableStages.length === 0 ? (
                  <div className="text-center text-gray-500 py-4">
                    <Calendar className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">Select a department to view stages.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                    {availableStages.map((stage) => {
                      const stageData = taskStages[stage.id] || {};
                      const isCompleted = stageData.status === 'completed' || stageData.date;
                      const inputDateValue = stageData.date ? formatDateForInput(stageData.date) : '';

                      return (
                        <div key={stage.id} className="flex items-center justify-between p-3 border rounded-md bg-white text-sm">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isCompleted ? 'bg-green-500' : 'bg-gray-200'}`} />
                            <div className="truncate">
                              <span className="font-medium text-gray-700">{stage.name}</span>
                              {stageData.date && <span className="ml-2 text-xs text-green-600">({stageData.date})</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {stage.requires_upload === false ? (
                              <>
                                <Input
                                  type="date"
                                  value={inputDateValue}
                                  onChange={(e) => handleStageDateChange(stage.id, e.target.value)}
                                  className="h-7 w-32 text-xs p-1"
                                />
                                {inputDateValue && (
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleStageDateChange(stage.id, '')}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                )}
                              </>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-gray-500 font-normal">Docs Required</Badge>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {availableStages.length > 0 && (
                  <div className="mt-3 text-xs text-gray-500 flex gap-4 border-t pt-2">
                    <span>Total: <b>{availableStages.length}</b></span>
                    <span className="text-green-600">Completed: <b>{Object.keys(taskStages).length}</b></span>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>

        <DialogFooter className="mt-6 border-t pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  )
}