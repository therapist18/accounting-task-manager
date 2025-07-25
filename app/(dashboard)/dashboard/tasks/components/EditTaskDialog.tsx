// @ts-nocheck
"use client"

import { useState, useEffect } from "react"
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
  users: any[] // All users with roles like 'task_manager', 'task_assistant', 'admin'
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

  // State for dropdown options
  const [availableSubdepartments, setAvailableSubdepartments] = useState([])
  const [availableClasses, setAvailableClasses] = useState([])
  const [availableSubclasses, setAvailableSubclasses] = useState([])
  const [availableOfficers, setAvailableOfficers] = useState([])
  const [availableManagers, setAvailableManagers] = useState([])
  const [availableAssistants, setAvailableAssistants] = useState([])
  const [classInfo, setClassInfo] = useState({ className: '', subclassName: '' })

  // Log initial props
  useEffect(() => {
    console.log('EditTaskDialog mounted with props:', {
      open,
      task,
      departments: departments?.length,
      users: users?.length,
      officers: officers?.length
    });
  }, []);

  // Helper function to find class and subclass names by ID with detailed logging
  const findClassAndSubclassNames = (deptId, subdeptId, classId, subclassId) => {
    console.log('Finding class and subclass names:', { deptId, subdeptId, classId, subclassId });
    
    if (!deptId || !subdeptId) {
      console.log('Missing department or subdepartment ID');
      return { className: '', subclassName: '' };
    }
    
    // Find the department
    const dept = departments.find(d => d.id.toString() === deptId.toString());
    if (!dept) {
      console.log('Department not found:', deptId);
      return { className: '', subclassName: '' };
    }
    
    // Find the subdepartment
    const subdept = dept.tm_subdepartments?.find(s => s.id.toString() === subdeptId.toString());
    if (!subdept) {
      console.log('Subdepartment not found:', subdeptId, 'in department:', deptId);
      return { className: '', subclassName: '' };
    }
    
    let className = '';
    let subclassName = '';
    
    // Find the class if classId is provided
    if (classId) {
      const classItem = subdept.classes?.find(c => c.id.toString() === classId.toString());
      
      if (classItem) {
        className = classItem.name || '';
        console.log('Found class:', { id: classId, name: className });
        
        // Find the subclass if subclassId is provided
        if (subclassId && classItem.subClasses) {
          const subclassItem = classItem.subClasses.find(sc => sc.id.toString() === subclassId.toString());
          if (subclassItem) {
            subclassName = subclassItem.name || '';
            console.log('Found subclass:', { id: subclassId, name: subclassName });
          } else {
            console.log('Subclass not found:', subclassId, 'in class:', classId);
          }
        }
      } else {
        console.log('Class not found:', classId, 'in subdepartment:', subdeptId);
      }
    }
    
    console.log('Returning names:', { className, subclassName });
    return { className, subclassName };
  };

  // Update class info when departments or task changes
  useEffect(() => {
    if (task && departments.length > 0) {
      const { className, subclassName } = findClassAndSubclassNames(
        task.department_id?.toString(),
        task.subdepartment_id?.toString(),
        task.class_id?.toString(),
        task.subclass_id?.toString()
      );
      setClassInfo({ className, subclassName });
    }
  }, [task, departments]);

  // Reset and pre-populate form and dropdowns when task changes or dialog opens
  useEffect(() => {
    if (task && open) {
      const initialData = {
        applicant_name: task.applicant_name || '',
        job_description: task.job_description || '',
        status: task.status || '',
        renewal_status: task.renewal_status || '',
        nationality: task.nationality || '',
        age: task.age?.toString() || '',
        department_id: task.department_id?.toString() || '',
        subdepartment_id: task.subdepartment_id?.toString() || '',
        class_id: task.class_id?.toString() || '',
        subclass_id: task.subclass_id?.toString() || '',
        task_manager_id: task.task_manager_id?.toString() || '',
        officer_id: task.officer_id?.toString() || '',
        task_assistant_id: task.task_assistant_id?.toString() || ''
      };
      // Find class and subclass names
      const { className, subclassName } = findClassAndSubclassNames(
        initialData.department_id,
        initialData.subdepartment_id,
        initialData.class_id,
        initialData.subclass_id
      );
      
      setClassInfo({ className, subclassName });
      setFormData(initialData);

      // Pre-populate dependent dropdowns based on the task's current data
      console.log('Pre-populating form with task data:', {
        task,
        initialData,
        hasDepartments: !!departments?.length,
        hasUsers: !!users?.length,
        hasOfficers: !!officers?.length
      });

      if (initialData.department_id) {
        const selectedDept = departments.find(d => d.id.toString() === initialData.department_id);
        // console.log('Selected department:', {
        //   selectedDept,
        //   hasSubdepartments: !!selectedDept?.tm_subdepartments?.length,
        //   subdepartments: selectedDept?.tm_subdepartments
        // });
        if (selectedDept) {
          setAvailableSubdepartments(selectedDept.tm_subdepartments || []);

          if (initialData.subdepartment_id) {
            const selectedSubdept = selectedDept.tm_subdepartments.find(s => s.id.toString() === initialData.subdepartment_id);
            if (selectedSubdept) {
              setAvailableClasses(selectedSubdept.classes || []);

              if (initialData.class_id) {
                const selectedClass = selectedSubdept.classes.find(c => c.id.toString() === initialData.class_id);
                if (selectedClass) {
                  setAvailableSubclasses(selectedClass.subClasses || []);
                }
              }
            }
          }
        }
      }
    } else {
      // Clear dropdowns when dialog closes
      setAvailableSubdepartments([]);
      setAvailableClasses([]);
      setAvailableSubclasses([]);
      setAvailableOfficers([]);
      setAvailableManagers([]);
      setAvailableAssistants([]);
    }
  }, [task, open, departments]);

  // Update subdepartments when department changes
  useEffect(() => {
    // console.log('Department changed:', {
    //   department_id: formData.department_id,
    //   departments: departments?.map(d => ({ id: d.id, name: d.name }))
    // });
    if (formData.department_id) {
      const dept = departments.find(d => d.id.toString() === formData.department_id);
      setAvailableSubdepartments(dept?.tm_subdepartments || []);
      // Reset dependent fields only if the change is from user interaction (not initial load)
      if (formData.subdepartment_id) {
        setFormData(prev => ({ ...prev, subdepartment_id: '', class_id: '', subclass_id: '', officer_id: '', task_manager_id: '', task_assistant_id: '' }));
      }
    }
  }, [formData.department_id]);

  // Update class info when class or subclass changes
  useEffect(() => {
    const { className, subclassName } = findClassAndSubclassNames(
      formData.department_id,
      formData.subdepartment_id,
      formData.class_id,
      formData.subclass_id
    );
    setClassInfo({ className, subclassName });
  }, [formData.department_id, formData.subdepartment_id, formData.class_id, formData.subclass_id]);

  // Update classes and available staff when subdepartment changes
  useEffect(() => {
    // console.log('Subdepartment changed:', {
    //   department_id: formData.department_id,
    //   subdepartment_id: formData.subdepartment_id,
    //   departments: departments?.map(d => ({
    //     id: d.id,
    //     name: d.name,
    //     hasSubdepartments: !!d.tm_subdepartments?.length
    //   }))
    // });

    // if (!formData.subdepartment_id) {
    //   console.log('No subdepartment selected, clearing related fields');
    // }
    setAvailableClasses([]);
    setAvailableOfficers([]);
    setAvailableManagers([]);
    setAvailableAssistants([]);

    if (formData.subdepartment_id) {
      const dept = departments.find(d => d.id.toString() === formData.department_id);
      const subdept = dept?.tm_subdepartments?.find(s => s.id.toString() === formData.subdepartment_id);

      if (subdept) {
        setAvailableClasses(subdept.classes || []);

        // Helper to find active users from assignment arrays
        const findActiveUsers = (assignments, sourceList, role) => {
          // console.log(`Finding active ${role}:`, { assignments, sourceList });
          if (!assignments || !Array.isArray(assignments) || !sourceList || !Array.isArray(sourceList)) {
            // console.log(`No valid assignments or sourceList for ${role}`);
            return [];
          }
          const activeAssignmentIds = assignments
            .filter(a => a && !a.end_date) // Active if no end date
            .map(a => a.id)
            .filter(Boolean); // Remove any undefined/null IDs
          
          const result = sourceList.filter(u => u && u.id && activeAssignmentIds.includes(u.id));
          // console.log(`Active ${role} result:`, result);
          return result;
        };

        setAvailableOfficers(findActiveUsers(subdept.officers, officers, 'officers'));
        setAvailableManagers(findActiveUsers(subdept.taskManagers, users, 'managers'));
        setAvailableAssistants(findActiveUsers(subdept.taskAssistants, users, 'assistants'));
        
        // console.log('Subdepartment details:', {
        //   subdept: {
        //     id: subdept.id,
        //     name: subdept.name,
        //     officers: subdept.officers,
        //     taskManagers: subdept.taskManagers,
        //     taskAssistants: subdept.taskAssistants,
        //     classes: subdept.classes?.map(c => ({ id: c.id, name: c.name }))
        //   },
        //   availableOfficers: availableOfficers.length,
        //   availableManagers: availableManagers.length,
        //   availableAssistants: availableAssistants.length
        // });
      }

      // Reset dependent fields
      if (formData.class_id) {
        setFormData(prev => ({ ...prev, class_id: '', subclass_id: '' }));
      }
    }
  }, [formData.subdepartment_id, departments, users, officers]);


  // Update subclasses when class changes
  useEffect(() => {
    if (formData.class_id) {
      const dept = departments.find(d => d.id.toString() === formData.department_id)
      const subdept = dept?.tm_subdepartments?.find(s => s.id.toString() === formData.subdepartment_id)
      const cls = subdept?.classes?.find(c => c.id.toString() === formData.class_id)
      setAvailableSubclasses(cls?.subClasses || [])

      if (formData.subclass_id) {
        setFormData(prev => ({ ...prev, subclass_id: '' }))
      }
    }
  }, [formData.class_id]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    // console.log('Saving task with data:', {
    //   taskId: task?.id,
    //   formData,
    //   availableOfficers,
    //   availableManagers,
    //   availableAssistants
    // });
    
    if (!task) {
      console.error('No task provided for saving');
      return;
    }
    
    try {
      setLoading(true)
      const updateData = {
        applicant_name: formData.applicant_name.trim(),
        job_description: formData.job_description.trim(),
        status: formData.status,
        renewal_status: formData.renewal_status || null,
        nationality: formData.nationality.trim() || null,
        age: formData.age ? parseInt(formData.age) : null,
        department_id: formData.department_id ? parseInt(formData.department_id) : null,
        subdepartment_id: formData.subdepartment_id ? parseInt(formData.subdepartment_id) : null,
        class_id: formData.class_id ? parseInt(formData.class_id) : null,
        subclass_id: formData.subclass_id ? parseInt(formData.subclass_id) : null,
        task_manager_id: formData.task_manager_id && formData.task_manager_id !== 'none' ? formData.task_manager_id : null,
        officer_id: formData.officer_id && formData.officer_id !== 'none' ? formData.officer_id : null,
        task_assistant_id: formData.task_assistant_id && formData.task_assistant_id !== 'none' ? formData.task_assistant_id : null,
        updated_at: new Date().toISOString()
      }
      if (!updateData.applicant_name || !updateData.job_description) {
        toast({ title: "Validation Error", description: "Applicant Name and Job Description are required.", variant: "destructive" })
        setLoading(false);
        return
      }
      console.log('Updating task with data:', updateData);
      const { data, error } = await supabase.from('tm_tasks').update(updateData).eq('id', task.id).select().single()
      if (error) {
        console.error('Error updating task:', error);
        throw error;
      }
      console.log('Task update successful:', data);
      onTaskUpdate(data)
      toast({ title: "Success", description: "Task updated successfully." })
      onOpenChange(false)
    } catch (error) {
      console.error('Error updating task:', error)
      toast({ title: "Error", description: `Failed to update task: ${error.message}`, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  if (!task) return null

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
              {/* ... other fields like applicant name, status, etc. are the same */}
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
              <div className="space-y-2">
                <Label htmlFor="job_description">Job Description *</Label>
                <Textarea id="job_description" value={formData.job_description} onChange={(e) => handleInputChange('job_description', e.target.value)} placeholder="Enter job description" rows={3} />
              </div>
            </div>
          </div>

          {/* Department Hierarchy */}
          <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
            <h3 className="text-lg font-semibold text-slate-900">Department & Classification</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="department" className="flex items-center"><Building className="w-4 h-4 mr-2" />Department</Label>
                <Select 
                  value={formData.department_id} 
                  onValueChange={(value) => handleInputChange('department_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
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
              <div className="space-y-2">
                <Label htmlFor="subdepartment" className="flex items-center">
                  <Workflow className="w-4 h-4 mr-2" />Subdepartment
                </Label>
                <Select 
                  value={formData.subdepartment_id} 
                  onValueChange={(value) => handleInputChange('subdepartment_id', value)} 
                  disabled={!availableSubdepartments.length}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subdepartment" />
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
              <div className="space-y-2">
                <div className="space-y-2">
                  <Label htmlFor="class" className="flex items-center">
                    <Layers className="w-4 h-4 mr-2" />Class
                  </Label>
                  <Select 
                    value={formData.class_id} 
                    onValueChange={(value) => handleInputChange('class_id', value)} 
                    disabled={!availableClasses.length}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={formData.class_id ? classInfo.className || 'Select class' : 'Select class'} />
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="subclass" className="flex items-center">
                  <BoxSelect className="w-4 h-4 mr-2" />Subclass
                </Label>
                <Select 
                  value={formData.subclass_id} 
                  onValueChange={(value) => handleInputChange('subclass_id', value)} 
                  disabled={!availableSubclasses.length}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subclass" />
                  </SelectTrigger>
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

          {/* Staff Assignment */}
          <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
            <h3 className="text-lg font-semibold text-slate-900">Staff Assignment</h3>
            <p className="text-sm text-slate-600">
              {formData.subdepartment_id 
                ? `Assigned staff for ${departments
                    .find(d => d.id.toString() === formData.department_id)?.name || 'selected department'}
                    ${availableSubdepartments.find(s => s.id.toString() === formData.subdepartment_id)?.name 
                      ? ` > ${availableSubdepartments.find(s => s.id.toString() === formData.subdepartment_id)?.name}` 
                      : ''}`
                : 'Select a subdepartment to see available staff.'
              }
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Officer Assignment */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="officer" className="flex items-center">
                    <Shield className="w-4 h-4 mr-2" />Officer
                    {formData.officer_id && (
                      <span className="text-xs text-muted-foreground">
                        {availableOfficers.find(u => u.id.toString() === formData.officer_id)?.name || ''}
                      </span>
                    )}
                  </Label>
                </div>
                <Select 
                  value={formData.officer_id} 
                  onValueChange={(value) => handleInputChange('officer_id', value)} 
                  disabled={!formData.subdepartment_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select officer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No Officer</SelectItem>
                    {officers
                      .filter(officer => officer.role === 'officer')
                      .map((officer) => (
                        <SelectItem key={officer.id} value={officer.id.toString()}>
                          {officer.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {formData.subdepartment_id && availableOfficers.length === 0 && (
                  <p className="text-xs text-amber-600">No active officers for this subdepartment</p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="task_manager" className="flex items-center">
                    <User className="w-4 h-4 mr-2" />Task Manager
                    {formData.task_manager_id && (
                      <span className="text-xs text-muted-foreground">
                        {users.find(u => u.id.toString() === formData.task_manager_id)?.name || ''}
                      </span>
                    )}
                  </Label>
                </div>
                <Select 
                  value={formData.task_manager_id} 
                  onValueChange={(value) => handleInputChange('task_manager_id', value)} 
                  disabled={!formData.subdepartment_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select task manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No Task Manager</SelectItem>
                    {users
                      .filter(user => user.role === 'manager' || user.role === 'admin')
                      .map((user) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {formData.subdepartment_id && users.filter(u => u.role === 'manager' || u.role === 'admin').length === 0 && (
                  <p className="text-xs text-amber-600">No active managers available</p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="task_assistant" className="flex items-center">
                    <UserCheck className="w-4 h-4 mr-2" />Task Assistant
                    {formData.task_assistant_id && (
                      <span className="text-xs text-muted-foreground">
                        {users.find(u => u.id.toString() === formData.task_assistant_id)?.name || ''}
                      </span>
                    )}
                  </Label>
                </div>
                <Select 
                  value={formData.task_assistant_id} 
                  onValueChange={(value) => handleInputChange('task_assistant_id', value)} 
                  disabled={!formData.subdepartment_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select task assistant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No Task Assistant</SelectItem>
                    {users
                      .filter(user => user.role === 'assistant')
                      .map((user) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {formData.subdepartment_id && users.filter(u => u.role === 'assistant').length === 0 && (
                  <p className="text-xs text-amber-600">No active assistants available</p>
                )}
              </div>
            </div>
            {!formData.subdepartment_id && (
              <p className="text-sm text-center text-slate-500 pt-2">Please select a subdepartment to assign staff.</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}><X className="h-4 w-4 mr-2" />Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (<Loader2 className="h-4 w-4 mr-2 animate-spin" />) : (<Save className="h-4 w-4 mr-2" />)}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}