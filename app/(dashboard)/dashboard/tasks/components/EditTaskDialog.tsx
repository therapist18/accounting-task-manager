// @ts-nocheck
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Save, X } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"

interface EditTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: any
  departments: any[]
  tmUsers: Map<number, any>
  onTaskUpdate: (task: any) => void
}

export function EditTaskDialog({
  open,
  onOpenChange,
  task,
  departments,
  tmUsers,
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
  const [availableSubdepartments, setAvailableSubdepartments] = useState([])
  const [availableClasses, setAvailableClasses] = useState([])
  const [availableSubclasses, setAvailableSubclasses] = useState([])

  // Convert tm_users Map to array for easier filtering
  const tmUsersArray = Array.from(tmUsers.values())

  // Get users by role and department/subdepartment
  const getUsersByRole = (role: string, departmentId?: string, subdepartmentId?: string) => {
    console.log(`📋 Getting users by role: ${role}`, {
      departmentId,
      subdepartmentId,
      totalUsers: tmUsersArray.length,
      availableUsers: tmUsersArray.map(u => ({ id: u.id, role: u.role, department_id: u.department_id, subdepartment_id: u.subdepartment_id }))
    });

    return tmUsersArray.filter(user => {
      // Basic role check
      const roleMatch = user.role === role || user.role === 'admin';
      
      if (!roleMatch) return false;

      // For officers: they are assigned to entire departments (not subdepartments)
      if (role === 'officer') {
        return !departmentId || user.department_id?.toString() === departmentId;
      }

      // For managers and assistants: they are specific to subdepartments
      if (role === 'manager' || role === 'assistant') {
        if (!subdepartmentId) return true; // Show all if no subdepartment selected
        return user.subdepartment_id?.toString() === subdepartmentId;
      }

      return true;
    });
  };

  // Reset form when task changes
  useEffect(() => {
    if (task && open) {
      console.log('🔄 Resetting form with task data:', {
        taskId: task.id,
        applicant_name: task.applicant_name,
        job_description: task.job_description,
        status: task.status,
        renewal_status: task.renewal_status,
        nationality: task.nationality,
        age: task.age,
        department_id: task.department_id,
        subdepartment_id: task.subdepartment_id,
        class_id: task.class_id,
        subclass_id: task.subclass_id,
        task_manager_id: task.task_manager_id,
        officer_id: task.officer_id,
        task_assistant_id: task.task_assistant_id,
        company_id: task.company_id,
        individual_id: task.individual_id,
        created_at: task.created_at,
        updated_at: task.updated_at,
        current_stage_id: task.current_stage_id,
        source_document_id: task.source_document_id,
        stages: task.stages
      });

      setFormData({
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
      })
    }
  }, [task, open])

  // Update subdepartments when department changes
  useEffect(() => {
    if (formData.department_id) {
      const dept = departments.find(d => d.id.toString() === formData.department_id)
      console.log('🏢 Department changed, updating subdepartments:', {
        departmentId: formData.department_id,
        department: dept?.name,
        subdepartments: dept?.tm_subdepartments?.length || 0
      });
      
      setAvailableSubdepartments(dept?.tm_subdepartments || [])
      
      // Reset dependent fields
      setFormData(prev => ({
        ...prev,
        subdepartment_id: '',
        class_id: '',
        subclass_id: ''
      }))
      setAvailableClasses([])
      setAvailableSubclasses([])
    }
  }, [formData.department_id, departments])

  // Update classes when subdepartment changes
  useEffect(() => {
    if (formData.subdepartment_id) {
      const dept = departments.find(d => d.id.toString() === formData.department_id)
      const subdept = dept?.tm_subdepartments?.find(s => s.id.toString() === formData.subdepartment_id)
      console.log('🏛️ Subdepartment changed, updating classes:', {
        subdepartmentId: formData.subdepartment_id,
        subdepartment: subdept?.name,
        classes: subdept?.classes?.length || 0
      });
      
      setAvailableClasses(subdept?.classes || [])
      
      // Reset dependent fields
      setFormData(prev => ({
        ...prev,
        class_id: '',
        subclass_id: ''
      }))
      setAvailableSubclasses([])
    }
  }, [formData.subdepartment_id, formData.department_id, departments])

  // Update subclasses when class changes
  useEffect(() => {
    if (formData.class_id) {
      const dept = departments.find(d => d.id.toString() === formData.department_id)
      const subdept = dept?.tm_subdepartments?.find(s => s.id.toString() === formData.subdepartment_id)
      const cls = subdept?.classes?.find(c => c.id.toString() === formData.class_id)
      console.log('📚 Class changed, updating subclasses:', {
        classId: formData.class_id,
        class: cls?.name,
        subclasses: cls?.subClasses?.length || 0
      });
      
      setAvailableSubclasses(cls?.subClasses || [])
      
      // Reset subclass if it doesn't exist in new class
      setFormData(prev => ({
        ...prev,
        subclass_id: ''
      }))
    }
  }, [formData.class_id, formData.subdepartment_id, formData.department_id, departments])

  const handleInputChange = (field: string, value: string) => {
    console.log(`📝 Field changed: ${field} = ${value}`);
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSave = async () => {
    if (!task) return

    try {
      setLoading(true)

      console.log('💾 Preparing to save task with form data:', formData);

      // Prepare update data
      const updateData = {
        applicant_name: formData.applicant_name.trim(),
        job_description: formData.job_description.trim(),
        status: formData.status,
        renewal_status: formData.renewal_status || null,
        nationality: formData.nationality.trim() || null,
        age: formData.age ? parseInt(formData.age) : null,
        department_id: formData.department_id ? parseInt(formData.department_id) : null,
        subdepartment_id: formData.subdepartment_id ? parseInt(formData.subdepartment_id) : null,
        class_id: formData.class_id || null,
        subclass_id: formData.subclass_id || null,
        task_manager_id: formData.task_manager_id && formData.task_manager_id !== 'none' ? parseInt(formData.task_manager_id) : null,
        officer_id: formData.officer_id && formData.officer_id !== 'none' ? parseInt(formData.officer_id) : null,
        task_assistant_id: formData.task_assistant_id && formData.task_assistant_id !== 'none' ? parseInt(formData.task_assistant_id) : null,
        updated_at: new Date().toISOString()
      }

      console.log('💾 Final update data being sent to database:', updateData);

      // Validate required fields
      if (!updateData.applicant_name) {
        toast({
          title: "Validation Error",
          description: "Applicant name is required.",
          variant: "destructive"
        })
        return
      }

      if (!updateData.job_description) {
        toast({
          title: "Validation Error",
          description: "Job description is required.",
          variant: "destructive"
        })
        return
      }

      // Update task in database
      const { data, error } = await supabase
        .from('tm_tasks')
        .update(updateData)
        .eq('id', task.id)
        .select()
        .single()

      if (error) {
        console.error('💥 Database update error:', error);
        throw error;
      }

      console.log('✅ Task updated successfully in database:', data);

      // Call update callback with updated task
      onTaskUpdate(data)

      toast({
        title: "Success",
        description: "Task updated successfully.",
        variant: "default"
      })

      onOpenChange(false)

    } catch (error) {
      console.error('💥 Error updating task:', error)
      toast({
        title: "Error",
        description: `Failed to update task: ${error.message}`,
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    console.log('❌ Edit dialog cancelled');
    onOpenChange(false)
  }

  if (!task) return null

  // Get filtered users for each role
  const availableOfficers = getUsersByRole('officer', formData.department_id);
  const availableManagers = getUsersByRole('manager', formData.department_id, formData.subdepartment_id);
  const availableAssistants = getUsersByRole('assistant', formData.department_id, formData.subdepartment_id);

  console.log('👥 Available staff by role:', {
    officers: availableOfficers.length,
    managers: availableManagers.length,
    assistants: availableAssistants.length,
    departmentId: formData.department_id,
    subdepartmentId: formData.subdepartment_id
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>
            Update task details for {task.applicant_name || 'this task'} (ID: {task.id})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Information */}
          <div className="space-y-4">
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
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
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
                <Label htmlFor="renewal_status">Renewal Status</Label>
                <Select value={formData.renewal_status} onValueChange={(value) => handleInputChange('renewal_status', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select renewal status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="renewal">Renewal</SelectItem>
                    <SelectItem value="extension">Extension</SelectItem>
                  </SelectContent>
                </Select>
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
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  value={formData.age}
                  onChange={(e) => handleInputChange('age', e.target.value)}
                  placeholder="Enter age"
                  min="1"
                  max="120"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="job_description">Job Description *</Label>
              <Textarea
                id="job_description"
                value={formData.job_description}
                onChange={(e) => handleInputChange('job_description', e.target.value)}
                placeholder="Enter job description"
                rows={3}
              />
            </div>
          </div>

          {/* Department Hierarchy */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Department & Classification</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Select value={formData.department_id} onValueChange={(value) => handleInputChange('department_id', value)}>
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
                <Label htmlFor="subdepartment">Subdepartment</Label>
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
                <Label htmlFor="class">Class</Label>
                <Select 
                  value={formData.class_id} 
                  onValueChange={(value) => handleInputChange('class_id', value)}
                  disabled={!availableClasses.length}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select class" />
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

              <div className="space-y-2">
                <Label htmlFor="subclass">Subclass</Label>
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
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Staff Assignment</h3>
            <p className="text-sm text-slate-600">
              Officers are assigned per department. Managers and Assistants are assigned per subdepartment.
            </p>
            
            <div className="grid grid-cols-1 gap-4">
              {/* Officer - Department Level */}
              <div className="space-y-2">
                <Label htmlFor="officer">Officer (Department Level)</Label>
                <Select value={formData.officer_id} onValueChange={(value) => handleInputChange('officer_id', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select officer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Officer</SelectItem>
                    {availableOfficers.map((user) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.display_name} {user.role === 'admin' && '(Admin)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.department_id && availableOfficers.length === 0 && (
                  <p className="text-xs text-amber-600">No officers found for this department</p>
                )}
              </div>

              {/* Task Manager - Subdepartment Level */}
              <div className="space-y-2">
                <Label htmlFor="task_manager">Task Manager (Subdepartment Level)</Label>
                <Select 
                  value={formData.task_manager_id} 
                  onValueChange={(value) => handleInputChange('task_manager_id', value)}
                  disabled={!formData.subdepartment_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select task manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Task Manager</SelectItem>
                    {availableManagers.map((user) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.display_name} {user.role === 'admin' && '(Admin)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!formData.subdepartment_id && (
                  <p className="text-xs text-slate-500">Select a subdepartment first</p>
                )}
                {formData.subdepartment_id && availableManagers.length === 0 && (
                  <p className="text-xs text-amber-600">No managers found for this subdepartment</p>
                )}
              </div>

              {/* Task Assistant - Subdepartment Level */}
              <div className="space-y-2">
                <Label htmlFor="task_assistant">Task Assistant (Subdepartment Level)</Label>
                <Select 
                  value={formData.task_assistant_id} 
                  onValueChange={(value) => handleInputChange('task_assistant_id', value)}
                  disabled={!formData.subdepartment_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select task assistant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Task Assistant</SelectItem>
                    {availableAssistants.map((user) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.display_name} {user.role === 'admin' && '(Admin)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!formData.subdepartment_id && (
                  <p className="text-xs text-slate-500">Select a subdepartment first</p>
                )}
                {formData.subdepartment_id && availableAssistants.length === 0 && (
                  <p className="text-xs text-amber-600">No assistants found for this subdepartment</p>
                )}
              </div>
            </div>
          </div>

          {/* Debug Information */}
          {process.env.NODE_ENV === 'development' && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-lg font-semibold text-slate-900">Debug Information</h3>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <strong>Task ID:</strong> {task.id}<br />
                  <strong>Individual ID:</strong> {task.individual_id}<br />
                  <strong>Company ID:</strong> {task.company_id}<br />
                  <strong>Current Stage ID:</strong> {task.current_stage_id}<br />
                </div>
                <div>
                  <strong>Available Officers:</strong> {availableOfficers.length}<br />
                  <strong>Available Managers:</strong> {availableManagers.length}<br />
                  <strong>Available Assistants:</strong> {availableAssistants.length}<br />
                  <strong>Total TM Users:</strong> {tmUsersArray.length}<br />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel} disabled={loading}>
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