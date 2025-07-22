'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Department, SubDepartment, fetchDepartments } from '@/app/(dashboard)/dashboard/users-management/departments';

export function DepartmentSelect({
  value,
  onChange,
  subDepartmentValue,
  onSubDepartmentChange,
  className = '',
  required = false,
  showSubDepartments = true
}: {
  value: string;
  onChange: (value: string) => void;
  subDepartmentValue?: string;
  onSubDepartmentChange?: (value: string) => void;
  className?: string;
  required?: boolean;
  showSubDepartments?: boolean;
}) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        setLoading(true);
        console.log('Fetching departments...');
        const data = await fetchDepartments();
        console.log('Fetched departments:', data);
        setDepartments(data);
        
        // If we have a value, find the matching department
        if (value) {
          console.log('Looking for department with value:', value);
          const dept = data.find(d => d.id.toString() === value.toString());
          console.log('Found department:', dept);
          if (dept) {
            setSelectedDepartment(dept);
          }
        }
      } catch (err) {
        console.error('Error loading departments:', err);
        setError('Failed to load departments');
      } finally {
        setLoading(false);
      }
    };

    loadDepartments();
  }, [value]);

  const handleDepartmentChange = (deptId: string) => {
    console.log('Department selected:', deptId);
    onChange(deptId);
    
    // Find the selected department, ensuring we handle both string and number IDs
    const dept = departments.find(d => d.id.toString() === deptId.toString()) || null;
    console.log('Found department:', dept);
    setSelectedDepartment(dept);
    
    // Reset subdepartment when department changes
    if (onSubDepartmentChange) {
      console.log('Resetting subdepartment selection');
      onSubDepartmentChange('');
    }
  };

  const handleSubDepartmentChange = (value: string) => {
    console.log('Subdepartment selected:', value);
    if (onSubDepartmentChange && value !== 'none') {
      onSubDepartmentChange(value);
    }
  };

  if (loading) {
    return <div className={`space-y-2 ${className}`}>
      <Label>Department {required && <span className="text-destructive">*</span>}</Label>
      <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
    </div>;
  }

  if (error) {
    return <div className="text-destructive">{error}</div>;
  }

  // Find the selected department to display its name
  const selectedDept = departments.find(dept => {
    // Ensure we're comparing strings to avoid type mismatches
    const deptId = dept?.id?.toString() || '';
    const valueStr = value?.toString() || '';
    return deptId === valueStr;
  });

  // Log for debugging
  console.log('Selected department debug:', {
    currentValue: value,
    valueType: typeof value,
    selectedDept: selectedDept ? { 
      id: selectedDept.id, 
      idType: typeof selectedDept.id,
      name: selectedDept.name 
    } : null,
    availableDepartments: departments.map(d => ({ 
      id: d.id, 
      idType: typeof d.id,
      name: d.name 
    }))
  });

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="space-y-2">
        <Label>Department {required && <span className="text-destructive">*</span>}</Label>
        <Select
          value={value}
          onValueChange={handleDepartmentChange}
          disabled={loading}
          required={required}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a department">
              {selectedDept ? selectedDept.name : value ? 'Loading...' : 'Select a department'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {departments.map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showSubDepartments && onSubDepartmentChange && (
        <div className="space-y-2">
          <Label>Subdepartment</Label>
          <Select
            value={subDepartmentValue || 'none'}
            onValueChange={handleSubDepartmentChange}
            disabled={!selectedDepartment || loading}
          >
            <SelectTrigger>
              <SelectValue placeholder={
                !selectedDepartment 
                  ? 'Select a department first' 
                  : 'Select a subdepartment'
              } />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-muted-foreground">
                {selectedDepartment?.subdepartments?.length ? 'Select a subdepartment' : 'No subdepartments available'}
              </SelectItem>
              {selectedDepartment?.subdepartments?.map((subDept) => (
                <SelectItem key={subDept.id} value={subDept.id}>
                  {subDept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
