// @ts-nocheck
"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Save, X, Building, Workflow, Layers, BoxSelect, Shield, User, UserCheck } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"

interface EditTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: any
  departments: any[] // This should be the full department structure with subdepts, classes, etc.
  users: any[] // All users with roles like 'user', 'admin'
  officers: any[] // All users with the 'officer' role
  onTaskUpdate: (task: any) => void
}

export function EditTaskDialog({
  open,
  onOpenChange,
  task,
  departments,
  users,
  officers,
  onTaskUpdate
}: EditTaskDialogProps) {
  const [formData, setFormData] = useState({
    applicant_name: '',
    job_description: '',
    status: '',
    renewal_status: '',
    nationality: '',
    age: '',
    department_id: '',
    subdepartment_id: '',
    class_id: '',
    subclass_id: '',
    task_manager_id: '',
    officer_id: '',
    task_assistant_id: ''
  })
  const [loading, setLoading] = useState(false)

  // Refs to prevent cascading effects on initial load
  const isInitialLoad = useRef(true);

  // State for dropdown options
  const [availableSubdepartments, setAvailableSubdepartments] = useState([])
  const [availableClasses, setAvailableClasses] = useState([])
  const [availableSubclasses, setAvailableSubclasses] = useState([])
  const [availableOfficers, setAvailableOfficers] = useState([])
  const [availableManagers, setAvailableManagers] = useState([])
  const [availableAssistants, setAvailableAssistants] = useState([])

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

  // Helper functions to get current active staff from history arrays
  const getCurrentOfficer = (officerHistory) => {
    if (!officerHistory || !Array.isArray(officerHistory)) return null;
    return officerHistory.find(officer => !officer.end_date) || null;
  };

  const getCurrentManager = (managerHistory) => {
    if (!managerHistory || !Array.isArray(managerHistory)) return null;
    return managerHistory.find(manager => !manager.end_date) || null;
  };

  const getCurrentAssistants = (assistantHistory) => {
    if (!assistantHistory || !Array.isArray(assistantHistory)) return [];
    return assistantHistory.filter(assistant => !assistant.end_date);
  };
  
  /**
   * Finds active staff for a given subdepartment.
   * FIXED: Uses 'id' field instead of 'user_id' to match departments code structure
   * ENHANCED: Better handling when history fields are missing
   */
  const findActiveStaffForSubdept = (subdept, allUsers, allOfficers) => {
      console.log('🔍 findActiveStaffForSubdept called with:');
      console.log('Subdept:', subdept);
      console.log('AllUsers count:', allUsers?.length || 0);
      console.log('AllOfficers count:', allOfficers?.length || 0);

      if (!subdept || !allUsers || !allOfficers) {
          console.log('❌ Missing required data for staff filtering');
          return { officers: [], managers: [], assistants: [] };
      }

      // Check if history fields exist
      const hasOfficerHistory = subdept.officer_history && Array.isArray(subdept.officer_history);
      const hasManagerHistory = subdept.manager_history && Array.isArray(subdept.manager_history);
      const hasAssistantHistory = subdept.assistant_history && Array.isArray(subdept.assistant_history);

      console.log('History fields present:', {
        officer_history: hasOfficerHistory,
        manager_history: hasManagerHistory,
        assistant_history: hasAssistantHistory
      });

      if (!hasOfficerHistory && !hasManagerHistory && !hasAssistantHistory) {
          console.log('⚠️ No history fields found - using fallback to all available staff');
          return {
              officers: allOfficers,
              managers: allUsers.filter(u => u.role === 'user' || u.role === 'admin'),
              assistants: allUsers.filter(u => u.role === 'user')
          };
      }

      // Helper to get active user IDs from a history array.
      const getActiveUserIds = (historyArray) => {
          if (!historyArray || !Array.isArray(historyArray)) return [];
          return historyArray
              .filter(item => item && !item.end_date) // Active if no end date
              .map(item => item.id) // FIXED: Use 'id' instead of 'user_id'
              .filter(Boolean); // Remove null/undefined IDs
      };

      const activeOfficerIds = getActiveUserIds(subdept.officer_history);
      const activeManagerIds = getActiveUserIds(subdept.manager_history);
      const activeAssistantIds = getActiveUserIds(subdept.assistant_history);
      
      console.log('Active staff IDs found:', {
        officers: activeOfficerIds,
        managers: activeManagerIds,
        assistants: activeAssistantIds
      });
      
      const hasSpecificAssignments = activeOfficerIds.length > 0 || activeManagerIds.length > 0 || activeAssistantIds.length > 0;

      if (!hasSpecificAssignments) {
          console.log(`⚠️ No specific staff assignments for subdept "${subdept.name}". Using fallback roles.`);
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
      
      console.log(`✅ Found filtered staff for subdept "${subdept.name}":`, staff);
      return staff;
  };

  // EFFECT 1: Main population effect when the dialog opens or task data changes.
  useEffect(() => {
    if (open && task && departments.length > 0) {
      isInitialLoad.current = true; // Mark the start of an initial load
      console.log('=== DIALOG OPENING ===');
      console.log('Task data:', task);
      console.log('Departments data:', departments);
      console.log('Users available:', users?.length || 0);
      console.log('Officers available:', officers?.length || 0);

      const initialFormData = {
        applicant_name: task.applicant_name || '',
        job_description: task.job_description || '',
        status: task.status || '',
        renewal_status: task.renewal_status || '',
        nationality: task.nationality || '',
        age: task.age || '',
        department_id: task.department_id?.toString() || '',
        subdepartment_id: task.subdepartment_id?.toString() || '',
        class_id: task.class_id?.toString() || '',
        subclass_id: task.subclass_id?.toString() || '',
        task_manager_id: task.task_manager_id || '',
        officer_id: task.officer_id || '',
        task_assistant_id: task.task_assistant_id || ''
      };
      setFormData(initialFormData);

      // Populate dropdowns based on initial data
      const dept = departments.find(d => d.id?.toString() === initialFormData.department_id);
      console.log('Found department:', dept);
      
      if (dept) {
        console.log('Available subdepartments:', dept.tm_subdepartments);
        setAvailableSubdepartments(dept.tm_subdepartments || []);

        const subdept = dept.tm_subdepartments?.find(s => s.id?.toString() === initialFormData.subdepartment_id);
        console.log('Found subdepartment:', subdept);
        
        if (subdept) {
          setAvailableClasses(subdept.classes || []);

          const classItem = subdept.classes?.find(c => c.id?.toString() === initialFormData.class_id);
          if (classItem) {
            setAvailableSubclasses(classItem.subClasses || []);
          }

          // Check if subdepartment has history fields
          console.log('Subdepartment officer_history:', subdept.officer_history);
          console.log('Subdepartment manager_history:', subdept.manager_history);
          console.log('Subdepartment assistant_history:', subdept.assistant_history);

          // Populate staff lists if users/officers are available
          if (users && officers && users.length > 0 && officers.length > 0) {
            console.log('Calling findActiveStaffForSubdept...');
            const activeStaff = findActiveStaffForSubdept(subdept, users, officers);
            console.log('Active staff result:', activeStaff);
            
            setAvailableOfficers(activeStaff.officers);
            setAvailableManagers(activeStaff.managers);
            setAvailableAssistants(activeStaff.assistants);
          } else {
            console.log('❌ Cannot populate staff - missing users or officers data');
            console.log('Users:', users?.length, 'Officers:', officers?.length);
          }
        } else {
          console.log('❌ Subdepartment not found in department');
        }
      } else {
        console.log('❌ Department not found');
      }
      
      // After all state is set, allow subsequent effects to run as "changes"
      // Use a microtask to ensure this runs after the current render cycle
      Promise.resolve().then(() => {
        isInitialLoad.current = false;
        console.log('=== INITIAL LOAD COMPLETE ===');
      });
    }
  }, [open, task, departments, users, officers]); // Reruns when core data loads

  // EFFECT 2: Handle Department changes
  useEffect(() => {
    if (isInitialLoad.current || !formData.department_id) return;

    console.log('Department changed by user:', formData.department_id);
    const dept = departments.find(d => d.id.toString() === formData.department_id);
    setAvailableSubdepartments(dept?.tm_subdepartments || []);
    
    // Reset all dependent fields
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
    
    console.log('🔄 Subdepartment changed by user:', formData.subdepartment_id);
    const dept = departments.find(d => d.id.toString() === formData.department_id);
    console.log('Department found:', dept);
    
    const subdept = dept?.tm_subdepartments?.find(s => s.id.toString() === formData.subdepartment_id);
    console.log('Subdepartment found:', subdept);
    
    if (subdept) {
      setAvailableClasses(subdept.classes || []);
      
      if (users && officers && users.length > 0 && officers.length > 0) {
        console.log('🔍 Finding active staff for changed subdepartment...');
        const activeStaff = findActiveStaffForSubdept(subdept, users, officers);
        console.log('Staff filtering result:', activeStaff);
        
        setAvailableOfficers(activeStaff.officers);
        setAvailableManagers(activeStaff.managers);
        setAvailableAssistants(activeStaff.assistants);
      } else {
        console.log('❌ Cannot populate staff on change - missing users or officers');
        // Fallback to empty arrays
        setAvailableOfficers([]);
        setAvailableManagers([]);
        setAvailableAssistants([]);
      }
    }
    
    // Reset dependent fields
    handleInputChange('class_id', '');
    handleInputChange('officer_id', '');
    handleInputChange('task_manager_id', '');
    handleInputChange('task_assistant_id', '');
    setAvailableSubclasses([]);
  }, [formData.subdepartment_id]);

  // EFFECT 4: Handle Class changes
  useEffect(() => {
    if (isInitialLoad.current || !formData.class_id) return;
    
    console.log('Class changed by user:', formData.class_id);
    const cls = availableClasses.find(c => c.id.toString() === formData.class_id);
    setAvailableSubclasses(cls?.subClasses || []);
    
    // Reset subclass
    handleInputChange('subclass_id', '');
  }, [formData.class_id]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    setLoading(true);
    try {
      const updateData = {
        applicant_name: formData.applicant_name.trim(),
        job_description: formData.job_description.trim(),
        status: formData.status,
        renewal_status: formData.renewal_status || null,
        nationality: formData.nationality.trim() || null,
        age: formData.age ? parseInt(formData.age, 10) : null,
        department_id: formData.department_id ? parseInt(formData.department_id, 10) : null,
        subdepartment_id: formData.subdepartment_id ? parseInt(formData.subdepartment_id, 10) : null,
        class_id: formData.class_id ? parseInt(formData.class_id, 10) : null,
        subclass_id: formData.subclass_id ? parseInt(formData.subclass_id, 10) : null,
        // FIXED: Properly handle staff assignments - store the user IDs directly
        task_manager_id: formData.task_manager_id && formData.task_manager_id !== 'none' ? formData.task_manager_id : null,
        officer_id: formData.officer_id && formData.officer_id !== 'none' ? formData.officer_id : null,
        task_assistant_id: formData.task_assistant_id && formData.task_assistant_id !== 'none' ? formData.task_assistant_id : null,
        updated_at: new Date().toISOString()
      };
      
      if (!updateData.applicant_name || !updateData.job_description) {
        toast({ title: "Validation Error", description: "Applicant Name and Job Description are required.", variant: "destructive" });
        setLoading(false);
        return;
      }

      console.log('Saving task with staff assignments:', {
        officer_id: updateData.officer_id,
        task_manager_id: updateData.task_manager_id,
        task_assistant_id: updateData.task_assistant_id
      });

      const { data, error } = await supabase.from('tm_tasks').update(updateData).eq('id', task.id).select().single();
      
      if (error) throw error;
      
      onTaskUpdate(data);
      toast({ title: "Success", description: "Task updated successfully." });
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating task:', error);
      toast({ title: "Error", description: `Failed to update task: ${error.message}`, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (!task) return null

  const classInfo = findClassInfo(formData.department_id, formData.subdepartment_id, formData.class_id, formData.subclass_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>Update task details for {task.applicant_name || 'this task'} (ID: {task.id})</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Information */}
          <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
            <h3 className="text-lg font-semibold text-slate-900">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="applicant_name">Applicant Name *</Label>
                <Input id="applicant_name" value={formData.applicant_name} onChange={(e) => handleInputChange('applicant_name', e.target.value)} placeholder="Enter applicant name" />
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
                <Textarea id="job_description" value={formData.job_description} onChange={(e) => handleInputChange('job_description', e.target.value)} placeholder="Enter job description" rows={3} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nationality">Nationality</Label>
                <Input id="nationality" value={formData.nationality} onChange={(e) => handleInputChange('nationality', e.target.value)} placeholder="Enter nationality" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input id="age" type="number" value={formData.age} onChange={(e) => handleInputChange('age', e.target.value)} placeholder="Enter age" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="renewal_status">Renewal Status</Label>
                <Select value={formData.renewal_status} onValueChange={(value) => handleInputChange('renewal_status', value)}>
                  <SelectTrigger><SelectValue placeholder="Select renewal status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first_time">First Time</SelectItem>
                    <SelectItem value="renewal">Renewal</SelectItem>
                    <SelectItem value="extension">Extension</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Department Hierarchy */}
          <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
            <h3 className="text-lg font-semibold text-slate-900">Department & Classification</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="department" className="flex items-center">
                  <Building className="w-4 h-4 mr-2" />Department
                  {classInfo.departmentName && <span className="ml-2 px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded">{classInfo.departmentName}</span>}
                </Label>
                <Select value={formData.department_id} onValueChange={(value) => handleInputChange('department_id', value)}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>{departments.map((dept) => <SelectItem key={dept.id} value={dept.id.toString()}>{dept.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="subdepartment" className="flex items-center">
                  <Workflow className="w-4 h-4 mr-2" />Subdepartment
                  {classInfo.subdepartmentName && <span className="ml-2 px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-800 rounded">{classInfo.subdepartmentName}</span>}
                </Label>
                <Select value={formData.subdepartment_id} onValueChange={(value) => handleInputChange('subdepartment_id', value)} disabled={!formData.department_id}>
                  <SelectTrigger><SelectValue placeholder="Select subdepartment" /></SelectTrigger>
                  <SelectContent>{availableSubdepartments.map((subdept) => <SelectItem key={subdept.id} value={subdept.id.toString()}>{subdept.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="class" className="flex items-center">
                  <Layers className="w-4 h-4 mr-2" />Class
                  {classInfo.className && <span className="ml-2 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">{classInfo.className}</span>}
                </Label>
                <Select value={formData.class_id} onValueChange={(value) => handleInputChange('class_id', value)} disabled={!formData.subdepartment_id}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>{availableClasses.map((cls) => <SelectItem key={cls.id} value={cls.id.toString()}>{cls.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="subclass" className="flex items-center">
                  <BoxSelect className="w-4 h-4 mr-2" />Subclass
                  {classInfo.subclassName && <span className="ml-2 px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">{classInfo.subclassName}</span>}
                </Label>
                <Select value={formData.subclass_id} onValueChange={(value) => handleInputChange('subclass_id', value)} disabled={!formData.class_id}>
                  <SelectTrigger><SelectValue placeholder="Select subclass" /></SelectTrigger>
                  <SelectContent>{availableSubclasses.map((subcls) => <SelectItem key={subcls.id} value={subcls.id.toString()}>{subcls.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Staff Assignment */}
          <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
            <h3 className="text-lg font-semibold text-slate-900">Staff Assignment</h3>
            <p className="text-sm text-slate-600">Staff are filtered by the selected subdepartment based on current active assignments. Select a subdepartment to see available staff.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="officer" className="flex items-center">
                  <Shield className="w-4 h-4 mr-2" />Officer
                  <span className="ml-2 text-xs text-slate-500">({availableOfficers.length} available)</span>
                </Label>
                <Select value={formData.officer_id} onValueChange={(value) => handleInputChange('officer_id', value)} disabled={!formData.subdepartment_id}>
                  <SelectTrigger><SelectValue placeholder="Select officer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Officer</SelectItem>
                    {availableOfficers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name || user.email}
                        <span className="ml-2 text-xs text-gray-500">({user.role})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.subdepartment_id && availableOfficers.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No officers assigned to this subdepartment. Using fallback: all officers available.</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="task_manager" className="flex items-center">
                  <User className="w-4 h-4 mr-2" />Task Manager
                  <span className="ml-2 text-xs text-slate-500">({availableManagers.length} available)</span>
                </Label>
                <Select value={formData.task_manager_id} onValueChange={(value) => handleInputChange('task_manager_id', value)} disabled={!formData.subdepartment_id}>
                  <SelectTrigger><SelectValue placeholder="Select task manager" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Task Manager</SelectItem>
                    {availableManagers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name || user.email}
                        <span className="ml-2 text-xs text-gray-500">({user.role})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.subdepartment_id && availableManagers.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No managers assigned to this subdepartment. Using fallback: all users/admins available.</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="task_assistant" className="flex items-center">
                  <UserCheck className="w-4 h-4 mr-2" />Task Assistant
                  <span className="ml-2 text-xs text-slate-500">({availableAssistants.length} available)</span>
                </Label>
                <Select value={formData.task_assistant_id} onValueChange={(value) => handleInputChange('task_assistant_id', value)} disabled={!formData.subdepartment_id}>
                  <SelectTrigger><SelectValue placeholder="Select task assistant" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Task Assistant</SelectItem>
                    {availableAssistants.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name || user.email}
                        <span className="ml-2 text-xs text-gray-500">({user.role})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.subdepartment_id && availableAssistants.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No assistants assigned to this subdepartment. Using fallback: all users available.</p>
                )}
              </div>
            </div>
            
            {/* Debug info - remove in production */}
            {formData.subdepartment_id && (
              <div className="mt-4 p-3 bg-gray-100 rounded text-xs space-y-2">
                <p><strong>🔧 Debug Info:</strong></p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p><strong>Selected IDs:</strong></p>
                    <p>Officer: {formData.officer_id || 'none'}</p>
                    <p>Manager: {formData.task_manager_id || 'none'}</p>
                    <p>Assistant: {formData.task_assistant_id || 'none'}</p>
                  </div>
                  <div>
                    <p><strong>Available Staff:</strong></p>
                    <p>Officers: {availableOfficers.length}</p>
                    <p>Managers: {availableManagers.length}</p>
                    <p>Assistants: {availableAssistants.length}</p>
                  </div>
                </div>
                <div>
                  <p><strong>Current Subdepartment:</strong></p>
                  <p>ID: {formData.subdepartment_id}</p>
                  {(() => {
                    const dept = departments.find(d => d.id?.toString() === formData.department_id);
                    const subdept = dept?.tm_subdepartments?.find(s => s.id?.toString() === formData.subdepartment_id);
                    return (
                      <div>
                        <p>Name: {subdept?.name || 'Not found'}</p>
                        <p>Has officer_history: {subdept?.officer_history ? 'Yes' : 'No'}</p>
                        <p>Has manager_history: {subdept?.manager_history ? 'Yes' : 'No'}</p>
                        <p>Has assistant_history: {subdept?.assistant_history ? 'Yes' : 'No'}</p>
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <p><strong>Total Available:</strong></p>
                  <p>All Users: {users?.length || 0}</p>
                  <p>All Officers: {officers?.length || 0}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            <X className="h-4 w-4 mr-2" />Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}