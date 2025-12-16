// @ts-nocheck
"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Save, X, Building, Workflow, Layers, BoxSelect, Shield, User, UserCheck, Calendar, FileText, Users, Hash, Check } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
  const [formData, setFormData] = useState({
    // Basic Information
    applicant_name: '',
    job_description: '',
    status: '',
    renewal_status: '',
    nationality: '',
    date_of_birth: '',
    
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

  // Load companies on component mount
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


  // Format date for display in input field (YYYY-MM-DD)
  const formatDateForInput = (dateString: string): string => {
    if (!dateString) return '';
    
    try {
      // Handle DD/MM/YYYY format
      if (dateString.includes('/')) {
        const [day, month, year] = dateString.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      
      // Handle ISO date
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  // Convert date to DD/MM/YYYY format for database
  const convertDateToDbFormat = (dateString: string): string => {
    if (!dateString) return '';
    
    try {
      // If already in DD/MM/YYYY format, return as is
      if (dateString.includes('/')) {
        const [day, month, year] = dateString.split('/');
        // Validate the date
        const date = new Date(`${year}-${month}-${day}`);
        if (isNaN(date.getTime())) return '';
        return dateString;
      }
      
      // Convert from YYYY-MM-DD to DD/MM/YYYY
      const [year, month, day] = dateString.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      
      if (isNaN(date.getTime())) return '';
      
      return [
        day.padStart(2, '0'),
        month.padStart(2, '0'),
        year
      ].join('/');
    } catch {
      return '';
    }
  };

  // Handle stage date changes
  const handleStageDateChange = (stageId: string, dateValue: string) => {
    setTaskStages(prev => {
      if (!dateValue) {
        // Clear the stage if date is empty
        const { [stageId]: _, ...rest } = prev;
        return rest;
      }
      
      // Format date as DD/MM/YYYY for storage
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

  // Helper function to calculate age from date of birth
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

  // Helper function to find class and subclass names by ID
  const findClassInfo = (deptId, subdeptId, classId, subclassId) => {
    if (!departments || departments.length === 0 || !deptId) return {};

    const dept = departments.find(d => d.id?.toString() === deptId?.toString());
    if (!dept) return {};

    const subdept = dept.tm_subdepartments?.find(s => s.id?.toString() === subdeptId?.toString());
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
      return historyArray
        .filter(item => item && !item.end_date)
        .map(item => item.id)
        .filter(Boolean);
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

  // Function to filter stages based on department and subdepartment
  const getAvailableStagesForTask = (departmentId, subdepartmentId) => {
    if (!stages || !stages.length || !departmentId) return [];
    
    // Filter stages based on your business logic
    return stages.filter(stage => {
      // Add logic here if stages are filtered by department
      return true; 
    }).sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
  };

  // EFFECT 1: Main population effect when the dialog opens or task data changes
  useEffect(() => {
    if (open && task && departments.length > 0) {
      isInitialLoad.current = true;
      
      const initialFormData = {
        // Basic Information
        applicant_name: task.applicant_name || '',
        job_description: task.job_description || '',
        status: task.status || '',
        renewal_status: task.renewal_status || '',
        nationality: task.nationality || '',
        date_of_birth: formatDateForInput(task.date_of_birth),
        
        // Department Hierarchy
        department_id: task.department_id?.toString() || '',
        subdepartment_id: task.subdepartment_id?.toString() || '',
        class_id: task.class_id?.toString() || '',
        subclass_id: task.subclass_id?.toString() || '',
        
        // Staff Assignment
        task_manager_id: task.task_manager_id?.toString() || '',
        officer_id: task.officer_id?.toString() || '',
        task_assistant_id: task.task_assistant_id?.toString() || '',
        
        // Case Details
        r_number: task.r_number || '',
        principal_member_name: task.principal_member_name || '',
        applicant_type: task.applicant_type || '',
        principal_member: task.principal_member || false,
        account_used: task.account_used || '',
        batch: task.batch || '',
        applied_by: task.applied_by || '',
        understudy: task.understudy || '',
        company_id: task.company_id?.toString() || '',
        
        // Dates
        date_initiated: formatDateForInput(task.date_initiated),
        created_at: formatDateForInput(task.created_at),
        updated_at: formatDateForInput(task.updated_at)
      };
      
      setFormData(initialFormData);
      
      // Load task stages
      setTaskStages(task.stages || {});
      
      // Load available stages
      const departmentStages = getAvailableStagesForTask(initialFormData.department_id, initialFormData.subdepartment_id);
      setAvailableStages(departmentStages);

      // Populate dropdowns based on initial data
      const dept = departments.find(d => d.id?.toString() === initialFormData.department_id);
      
      if (dept) {
        setAvailableSubdepartments(dept.tm_subdepartments || []);

        const subdept = dept.tm_subdepartments?.find(s => s.id?.toString() === initialFormData.subdepartment_id);
        
        if (subdept) {
          setAvailableClasses(subdept.classes || []);

          const classItem = subdept.classes?.find(c => c.id?.toString() === initialFormData.class_id);
          if (classItem) {
            setAvailableSubclasses(classItem.subClasses || []);
          }

          if (users && officers && users.length > 0 && officers.length > 0) {
            const activeStaff = findActiveStaffForSubdept(subdept, users, officers);
            setAvailableOfficers(activeStaff.officers);
            setAvailableManagers(activeStaff.managers);
            setAvailableAssistants(activeStaff.assistants);
          }
        }
      }
      
      Promise.resolve().then(() => {
        isInitialLoad.current = false;
      });
    }
  }, [open, task, departments, users, officers, stages]);

  // EFFECT 2: Handle Department changes
  useEffect(() => {
    if (isInitialLoad.current || !formData.department_id) return;

    const dept = departments.find(d => d.id.toString() === formData.department_id);
    setAvailableSubdepartments(dept?.tm_subdepartments || []);
    
    // Update available stages when department changes
    const departmentStages = getAvailableStagesForTask(formData.department_id, formData.subdepartment_id);
    setAvailableStages(departmentStages);
    
    handleInputChange('subdepartment_id', '');
    setAvailableClasses([]);
    setAvailableSubclasses([]);
    setAvailableOfficers([]);
    setAvailableManagers([]);
    setAvailableAssistants([]);
  }, [formData.department_id]);

  // EFFECT 3: Handle Subdepartment changes
  useEffect(() => {
    if (isInitialLoad.current || !formData.subdepartment_id) return;
    
    const dept = departments.find(d => d.id.toString() === formData.department_id);
    const subdept = dept?.tm_subdepartments?.find(s => s.id.toString() === formData.subdepartment_id);
    
    if (subdept) {
      setAvailableClasses(subdept.classes || []);
      
      // Update available stages when subdepartment changes
      const departmentStages = getAvailableStagesForTask(formData.department_id, formData.subdepartment_id);
      setAvailableStages(departmentStages);
      
      if (users && officers && users.length > 0 && officers.length > 0) {
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

  // EFFECT 4: Handle Class changes
  useEffect(() => {
    if (isInitialLoad.current || !formData.class_id) return;
    
    const cls = availableClasses.find(c => c.id.toString() === formData.class_id);
    setAvailableSubclasses(cls?.subClasses || []);
    
    handleInputChange('subclass_id', '');
  }, [formData.class_id]);

  const handleInputChange = (field, value) => {
    if (field === 'task_manager_id') {
      setFormData(prev => ({ 
        ...prev, 
        [field]: value,
        ...(value && prev.task_assistant_id && {
          task_assistant_id: ''
        })
      }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

const handleSave = async () => {
  setLoading(true);
  try {
    // 1. Calculate the job_level JSON object based on current hierarchy selection
    const jobLevel = {
      level: formData.subclass_id ? 4 : 
             formData.class_id ? 3 : 
             formData.subdepartment_id ? 2 : 
             formData.department_id ? 1 : null,
      class_id: formData.class_id ? parseInt(formData.class_id, 10) : null,
      subclass_id: formData.subclass_id ? parseInt(formData.subclass_id, 10) : null,
      department_id: formData.department_id ? parseInt(formData.department_id, 10) : null,
      subdepartment_id: formData.subdepartment_id ? parseInt(formData.subdepartment_id, 10) : null
    };

    // 2. Find the staff members
    const officer = officers.find(o => o.id.toString() === formData.officer_id);
    const taskManager = users.find(u => u.id.toString() === formData.task_manager_id);
    const taskAssistant = users.find(u => u.id.toString() === formData.task_assistant_id);

    // 3. Format staff data
    const staffData = {
      officer: officer ? {
        id: officer.id,
        name: officer.name || officer.full_name || `${officer.first_name} ${officer.last_name}`.trim(),
        email: officer.email
      } : null,
      task_manager: taskManager ? {
        id: taskManager.id,
        name: taskManager.name || taskManager.full_name || `${taskManager.first_name} ${taskManager.last_name}`.trim(),
        email: taskManager.email
      } : null,
      task_assistant: taskAssistant ? {
        id: taskAssistant.id,
        name: taskAssistant.name || taskAssistant.full_name || `${taskAssistant.first_name} ${taskAssistant.last_name}`.trim(),
        email: taskAssistant.email
      } : null
    };

    const updateData = {
      // Basic Information
      applicant_name: formData.applicant_name.trim(),
      job_description: formData.job_description.trim(),
      renewal_status: formData.renewal_status || null,
      
      // Department Hierarchy (Parsed as Integers)
      department_id: formData.department_id ? parseInt(formData.department_id, 10) : null,
      subdepartment_id: formData.subdepartment_id ? parseInt(formData.subdepartment_id, 10) : null,
      class_id: formData.class_id ? parseInt(formData.class_id, 10) : null,
      subclass_id: formData.subclass_id ? parseInt(formData.subclass_id, 10) : null,
      
      // Job Level JSON
      job_level: jobLevel,

      // Staff Assignment (Handle 'none' strings)
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
            updated_at: new Date().toISOString()
    };
    
    if (!updateData.applicant_name || !updateData.job_description) {
      toast({ 
        title: "Validation Error", 
        description: "Applicant Name and Job Description are required.", 
        variant: "destructive" 
      });
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('tm_tasks')
      .update(updateData)
      .eq('id', task.id)
      .select()
      .single();
    
    if (error) throw error;
    
    // Include the staff data in the task update
    const updatedTask = {
      ...data,
      staff: staffData
    };
    
    onTaskUpdate(updatedTask);
    toast({ 
      title: "Success", 
      description: "Task updated successfully.",
      variant: "default"
    });
    onOpenChange(false);
  } catch (error) {
    console.error('Error updating task:', error);
    toast({ 
      title: "Error", 
      description: `Failed to update task: ${error.message}`, 
      variant: "destructive" 
    });
  } finally {
    setLoading(false);
  }
};

  if (!task) return null;

  const classInfo = findClassInfo(formData.department_id, formData.subdepartment_id, formData.class_id, formData.subclass_id);
  const calculatedAge = calculateAge(formData.date_of_birth);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Edit Task
          </DialogTitle>
          <DialogDescription>
            Update task details for {task.applicant_name || 'this task'} (ID: {task.id})
            {calculatedAge !== null && (
              <Badge variant="outline" className="ml-2">
                Age: {calculatedAge}
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="hierarchy">Department</TabsTrigger>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="details">Case Details</TabsTrigger>
            <TabsTrigger value="stages">Stages</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4">
            <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-900">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="applicant_name">Applicant Name *</Label>
                  <Input 
                    id="applicant_name" 
                    value={formData.applicant_name} 
                    onChange={(e) => handleInputChange('applicant_name', e.target.value)} 
                    placeholder="Enter applicant name" 
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
                    <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enquiry">Enquiry</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="job_description">Job Description *</Label>
                  <Textarea 
                    id="job_description" 
                    value={formData.job_description} 
                    onChange={(e) => handleInputChange('job_description', e.target.value)} 
                    placeholder="Enter job description" 
                    rows={3} 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nationality">Nationality</Label>
                  <Input 
                    id="nationality" 
                    value={formData.nationality} 
                    onChange={(e) => handleInputChange('nationality', e.target.value)} 
                    placeholder="Enter nationality" 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date_of_birth" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Date of Birth
                    {calculatedAge !== null && (
                      <Badge variant="secondary" className="text-xs">
                        Age: {calculatedAge}
                      </Badge>
                    )}
                  </Label>
                  <Input 
                    id="date_of_birth" 
                    type="date"
                    value={formData.date_of_birth} 
                    onChange={(e) => handleInputChange('date_of_birth', e.target.value)} 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="renewal_status">Renewal Status</Label>
                  <Select value={formData.renewal_status} onValueChange={(value) => handleInputChange('renewal_status', value)}>
                    <SelectTrigger><SelectValue placeholder="Select renewal status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="renewal">Renewal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="applicant_type">Applicant Type</Label>
                  <Select value={formData.applicant_type} onValueChange={(value) => handleInputChange('applicant_type', value)}>
                    <SelectTrigger><SelectValue placeholder="Select applicant type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="principal">Principal</SelectItem>
                      <SelectItem value="dependant">Dependant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="hierarchy" className="space-y-4">
            <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-900">Department & Classification</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="department" className="flex items-center">
                    <Building className="w-4 h-4 mr-2" />Department
                    {classInfo.departmentName && (
                      <Badge variant="outline" className="ml-2">
                        {classInfo.departmentName}
                      </Badge>
                    )}
                  </Label>
                  <Select value={formData.department_id} onValueChange={(value) => handleInputChange('department_id', value)}>
                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id.toString()}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="subdepartment" className="flex items-center">
                    <Workflow className="w-4 h-4 mr-2" />Subdepartment
                    {classInfo.subdepartmentName && (
                      <Badge variant="outline" className="ml-2">
                        {classInfo.subdepartmentName}
                      </Badge>
                    )}
                  </Label>
                  <Select 
                    value={formData.subdepartment_id} 
                    onValueChange={(value) => handleInputChange('subdepartment_id', value)} 
                    disabled={!formData.department_id}
                  >
                    <SelectTrigger><SelectValue placeholder="Select subdepartment" /></SelectTrigger>
                    <SelectContent>
                      {availableSubdepartments.map((subdept) => (
                        <SelectItem key={subdept.id} value={subdept.id.toString()}>
                          {subdept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="class" className="flex items-center">
                    <Layers className="w-4 h-4 mr-2" />Class
                    {classInfo.className && (
                      <Badge variant="outline" className="ml-2">
                        {classInfo.className}
                      </Badge>
                    )}
                  </Label>
                  <Select 
                    value={formData.class_id} 
                    onValueChange={(value) => handleInputChange('class_id', value)} 
                    disabled={!formData.subdepartment_id}
                  >
                    <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>
                      {availableClasses.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id.toString()}>
                          {cls.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="subclass" className="flex items-center">
                    <BoxSelect className="w-4 h-4 mr-2" />Subclass
                    {classInfo.subclassName && (
                      <Badge variant="outline" className="ml-2">
                        {classInfo.subclassName}
                      </Badge>
                    )}
                  </Label>
                  <Select 
                    value={formData.subclass_id} 
                    onValueChange={(value) => handleInputChange('subclass_id', value)} 
                    disabled={!formData.class_id}
                  >
                    <SelectTrigger><SelectValue placeholder="Select subclass" /></SelectTrigger>
                    <SelectContent>
                      {availableSubclasses.map((subcls) => (
                        <SelectItem key={subcls.id} value={subcls.id.toString()}>
                          {subcls.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="staff" className="space-y-4">
            <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-900">Staff Assignment</h3>
              <p className="text-sm text-slate-600">
                Staff are filtered by the selected subdepartment based on current active assignments.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="officer" className="flex items-center">
                    <Shield className="w-4 h-4 mr-2" />Officer
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {availableOfficers.length} available
                    </Badge>
                  </Label>
                  <Select 
                    value={formData.officer_id} 
                    onValueChange={(value) => handleInputChange('officer_id', value)} 
                    disabled={!formData.subdepartment_id}
                  >
                    <SelectTrigger><SelectValue placeholder="Select officer" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Officer</SelectItem>
                      {availableOfficers.map((user) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.name || user.email}
                          <span className="ml-2 text-xs text-gray-500">({user.role})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="task_manager" className="flex items-center">
                    <User className="w-4 h-4 mr-2" />Task Manager
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {availableManagers.length} available
                    </Badge>
                  </Label>
                  <Select 
                    value={formData.task_manager_id} 
                    onValueChange={(value) => handleInputChange('task_manager_id', value)} 
                    disabled={!formData.subdepartment_id}
                  >
                    <SelectTrigger><SelectValue placeholder="Select task manager" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Task Manager</SelectItem>
                      {availableManagers.map((user) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.name || user.email}
                          <span className="ml-2 text-xs text-gray-500">({user.role})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="task_assistant" className="flex items-center">
                    <UserCheck className="w-4 h-4 mr-2" />Task Assistant
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {availableAssistants.length} available
                    </Badge>
                  </Label>
                  <Select 
                    value={formData.task_assistant_id} 
                    onValueChange={(value) => handleInputChange('task_assistant_id', value)} 
                    disabled={!formData.subdepartment_id}
                  >
                    <SelectTrigger><SelectValue placeholder="Select task assistant" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Task Assistant</SelectItem>
                      {availableAssistants.map((user) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.name || user.email}
                          <span className="ml-2 text-xs text-gray-500">({user.role})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="details" className="space-y-4">
            <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-900">Case Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company_id" className="flex items-center">
                    <Building className="w-4 h-4 mr-2" />
                    Company
                  </Label>
                  <Select 
                    value={formData.company_id} 
                    onValueChange={(value) => handleInputChange('company_id', value)}
                  >
                    <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Company</SelectItem>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id.toString()}>
                          {company.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="r_number" className="flex items-center">
                    <Hash className="w-4 h-4 mr-2" />
                    R Number
                  </Label>
                  <Input 
                    id="r_number" 
                    value={formData.r_number} 
                    onChange={(e) => handleInputChange('r_number', e.target.value)} 
                    placeholder="Enter R number" 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="principal_member_name" className="flex items-center">
                    <Users className="w-4 h-4 mr-2" />
                    Principal Member Name
                  </Label>
                  <Input 
                    id="principal_member_name" 
                    value={formData.principal_member_name} 
                    onChange={(e) => handleInputChange('principal_member_name', e.target.value)} 
                    placeholder="Enter principal member name" 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="account_used">Account Used</Label>
                  <Input 
                    id="account_used" 
                    value={formData.account_used} 
                    onChange={(e) => handleInputChange('account_used', e.target.value)} 
                    placeholder="Enter account used" 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="batch">Batch</Label>
                  <Input 
                    id="batch" 
                    value={formData.batch} 
                    onChange={(e) => handleInputChange('batch', e.target.value)} 
                    placeholder="Enter batch" 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="applied_by">Applied By</Label>
                  <Input 
                    id="applied_by" 
                    value={formData.applied_by} 
                    onChange={(e) => handleInputChange('applied_by', e.target.value)} 
                    placeholder="Enter who applied" 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="understudy">Understudy</Label>
                  <Input 
                    id="understudy" 
                    value={formData.understudy} 
                    onChange={(e) => handleInputChange('understudy', e.target.value)} 
                    placeholder="Enter understudy" 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="principal_member" className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="principal_member"
                      checked={formData.principal_member}
                      onChange={(e) => handleInputChange('principal_member', e.target.checked)}
                      className="rounded"
                    />
                    Principal Member
                  </Label>
                </div>
              </div>
            </div>

            {/* Dates Section */}
            <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Important Dates
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date_initiated">Date Initiated</Label>
                  <Input 
                    id="date_initiated" 
                    type="date"
                    value={formData.date_initiated} 
                    onChange={(e) => handleInputChange('date_initiated', e.target.value)} 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="created_at">Created At</Label>
                  <Input 
                    id="created_at" 
                    type="date"
                    value={formData.created_at} 
                    onChange={(e) => handleInputChange('created_at', e.target.value)}
                    disabled
                    className="bg-gray-100"
                  />
                  <p className="text-xs text-gray-500">Read-only field</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="updated_at">Last Updated</Label>
                  <Input 
                    id="updated_at" 
                    type="date"
                    value={formData.updated_at} 
                    disabled
                    className="bg-gray-100"
                  />
                  <p className="text-xs text-gray-500">Auto-updated on save</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="stages" className="space-y-4">
            <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Stage Management
              </h3>
              <p className="text-sm text-slate-600">
                Manage stage completion dates and status for this task. Date-only stages can be edited here, while document stages require file uploads.
              </p>
              
              {availableStages.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="font-medium">No stages available</p>
                  <p className="text-sm">Stages will appear here once a department and subdepartment are selected.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {availableStages
                    .sort((a, b) => (a.order_num || 0) - (b.order_num || 0))
                    .map((stage) => {
                      const stageData = taskStages[stage.id] || {};
                      const isCompleted = stageData.status === 'completed' || stageData.date;
                      const inputDateValue = stageData.date ? formatDateForInput(stageData.date) : '';
                      
                      return (
                        <div key={stage.id} className="flex items-center justify-between p-4 border rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-3">
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                              isCompleted ? 'bg-green-500' : 'bg-gray-300'
                            }`}>
                              {isCompleted && <Check className="h-2.5 w-2.5 text-white" />}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">{stage.name}</div>
                              <div className="text-sm text-gray-500">
                                Order: {stage.order_num || 0}
                                {stage.requires_upload === false ? (
                                  <span className="ml-2 text-blue-600">• Date Entry</span>
                                ) : (
                                  <span className="ml-2 text-purple-600">• Document Upload</span>
                                )}
                              </div>
                              {stageData.date && (
                                <div className="text-xs text-green-600 mt-1">
                                  Completed: {stageData.date}
                                  {stageData.completedAt && (
                                    <span className="ml-2 text-gray-500">
                                      ({new Date(stageData.completedAt).toLocaleString()})
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            {stage.requires_upload === false ? (
                              // Date-only stage
                              <div className="flex items-center gap-2">
                                <Input
                                  type="date"
                                  value={inputDateValue}
                                  onChange={(e) => handleStageDateChange(stage.id, e.target.value)}
                                  className="w-40"
                                  placeholder="Select date"
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleStageDateChange(stage.id, '')}
                                  disabled={!stageData.date}
                                  className="px-3"
                                >
                                  Clear
                                </Button>
                              </div>
                            ) : (
                              // Document stage
                              <div className="text-sm text-gray-500 px-3 py-2 bg-gray-50 rounded border">
                                Document upload required
                                <div className="text-xs text-gray-400 mt-1">
                                  Use main interface to upload documents
                                </div>
                              </div>
                            )}
                            
                            <Badge variant={isCompleted ? "default" : "secondary"} className="ml-2">
                              {isCompleted ? "Completed" : "Pending"}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Stage Summary */}
              {availableStages.length > 0 && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-medium text-blue-900 mb-2">Stage Summary</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {Object.keys(taskStages).length}
                      </div>
                      <div className="text-gray-600">Completed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">
                        {availableStages.length - Object.keys(taskStages).length}
                      </div>
                      <div className="text-gray-600">Pending</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {availableStages.length}
                      </div>
                      <div className="text-gray-600">Total</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}