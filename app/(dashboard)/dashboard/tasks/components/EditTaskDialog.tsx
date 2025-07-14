// @ts-nocheck
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"

interface EditTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: any
  departments: any[]
  onTaskUpdate: (updatedTask: any) => void
}

export function EditTaskDialog({ 
  open, 
  onOpenChange, 
  task, 
  departments,
  onTaskUpdate 
}: EditTaskDialogProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    job_description: '',
    applicant_name: '',
    company_name: '',
    principal_member_name: '',
    renewal_status: '',
    account_used: '',
    applied_by: '',
    batch: '',
    website: '',
    r_number: '',
    department_id: '',
    subdepartment_id: '',
    class_id: '',
    subclass_id: ''
  })

  // Initialize form data when task changes
  useEffect(() => {
    if (task) {
      setFormData({
        job_description: task.job_description || '',
        applicant_name: task.applicant_name || '',
        company_name: task.company_name || '',
        principal_member_name: task.principal_member_name || '',
        renewal_status: task.renewal_status || '',
        account_used: task.account_used || '',
        applied_by: task.applied_by || '',
        batch: task.batch || '',
        website: task.website || '',
        r_number: task.r_number || '',
        department_id: task.department_id?.toString() || '',
        subdepartment_id: task.subdepartment_id?.toString() || '',
        class_id: task.class_id || '',
        subclass_id: task.subclass_id || ''
      })
    }
  }, [task])

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!task) return

    setLoading(true)
    try {
      const updateData = {
        ...formData,
        department_id: formData.department_id ? parseInt(formData.department_id) : null,
        subdepartment_id: formData.subdepartment_id ? parseInt(formData.subdepartment_id) : null,
        updated_at: new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('tm_tasks')
        .update(updateData)
        .eq('id', task.id)
        .select('*')
        .single()

      if (error) throw error

      toast({
        title: "Success",
        description: "Task updated successfully",
      })

      onTaskUpdate(data)
    } catch (error) {
      console.error('Error updating task:', error)
      toast({
        title: "Error",
        description: "Failed to update task",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const selectedDepartment = departments.find(d => d.id.toString() === formData.department_id)
  const availableSubdepartments = selectedDepartment?.tm_subdepartments || []
  
  const selectedSubdepartment = availableSubdepartments.find(s => s.id.toString() === formData.subdepartment_id)
  const availableClasses = selectedSubdepartment?.classes || []

  const selectedClass = availableClasses.find(c => c.id === formData.class_id || c.name === formData.class_id)
  const availableSubclasses = selectedClass?.subClasses || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>
            Update task details and assignment information
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="job_description">Job Description *</Label>
              <Textarea
                id="job_description"
                value={formData.job_description}
                onChange={(e) => handleInputChange('job_description', e.target.value)}
                placeholder="Enter job description"
                required
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="applicant_name">Applicant Name *</Label>
              <Input
                id="applicant_name"
                value={formData.applicant_name}
                onChange={(e) => handleInputChange('applicant_name', e.target.value)}
                placeholder="Enter applicant name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => handleInputChange('company_name', e.target.value)}
                placeholder="Enter company name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="principal_member_name">Principal Member Name</Label>
              <Input
                id="principal_member_name"
                value={formData.principal_member_name}
                onChange={(e) => handleInputChange('principal_member_name', e.target.value)}
                placeholder="Enter principal member name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="renewal_status">Renewal Status</Label>
              <Select
                value={formData.renewal_status}
                onValueChange={(value) => handleInputChange('renewal_status', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select renewal status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="New">New</SelectItem>
                  <SelectItem value="Renewal">Renewal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                value={formData.website}
                onChange={(e) => handleInputChange('website', e.target.value)}
                placeholder="Enter website URL"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="r_number">R Number</Label>
              <Input
                id="r_number"
                value={formData.r_number}
                onChange={(e) => handleInputChange('r_number', e.target.value)}
                placeholder="Enter R number"
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
              <Label htmlFor="applied_by">Applied By</Label>
              <Input
                id="applied_by"
                value={formData.applied_by}
                onChange={(e) => handleInputChange('applied_by', e.target.value)}
                placeholder="Enter who applied"
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
          </div>

          <div className="space-y-4">
            <h4 className="font-medium">Department Assignment</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="department_id">Department</Label>
                <Select
                  value={formData.department_id}
                  onValueChange={(value) => {
                    handleInputChange('department_id', value)
                    handleInputChange('subdepartment_id', '')
                    handleInputChange('class_id', '')
                    handleInputChange('subclass_id', '')
                  }}
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
                <Label htmlFor="subdepartment_id">Subdepartment</Label>
                <Select
                  value={formData.subdepartment_id}
                  onValueChange={(value) => {
                    handleInputChange('subdepartment_id', value)
                    handleInputChange('class_id', '')
                    handleInputChange('subclass_id', '')
                  }}
                  disabled={!formData.department_id}
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
                <Label htmlFor="class_id">Class</Label>
                <Select
                  value={formData.class_id}
                  onValueChange={(value) => {
                    handleInputChange('class_id', value)
                    handleInputChange('subclass_id', '')
                  }}
                  disabled={!formData.subdepartment_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select class" />
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

              <div className="space-y-2">
                <Label htmlFor="subclass_id">Subclass</Label>
                <Select
                  value={formData.subclass_id}
                  onValueChange={(value) => handleInputChange('subclass_id', value)}
                  disabled={!formData.class_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subclass" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSubclasses.map((subcls) => (
                      <SelectItem key={subcls.id} value={subcls.id}>
                        {subcls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}