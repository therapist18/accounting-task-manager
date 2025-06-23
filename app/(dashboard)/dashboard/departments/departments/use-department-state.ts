import { useState } from 'react';

type ClassRequirement = {
  name: string;
  description: string | null;
};

type SubdepartmentClass = {
  name: string;
  description: string | null;
  requirements: ClassRequirement[];
};

type Subdepartment = {
  id: number;
  name: string;
  description: string | null;
  classes?: SubdepartmentClass[];
  upload_requirements?: ClassRequirement[];
};

type Department = {
  id: string;
  name: string;
  description: string;
  tm_subdepartments?: Subdepartment[];
};

export const useDepartmentState = (initialDepartments: Department[] = []) => {
  const [departments, setDepartments] = useState<Department[]>(initialDepartments);
  const [activeDept, setActiveDept] = useState('');
  const [activeSubdept, setActiveSubdept] = useState<Record<string, string>>({});
  const [activeClass, setActiveClass] = useState<Record<string, string>>({});
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteContext, setDeleteContext] = useState<{
    type: 'subdepartment' | 'class';
    index: number;
  } | null>(null);
  const [editingContext, setEditingContext] = useState<{
    type: 'subdepartment' | 'class';
    departmentId: string;
    subdepartmentId?: string;
    classId?: string;
  } | null>(null);
  const [newRequirements, setNewRequirements] = useState<Array<{ name: string; description: string }>>([{ name: '', description: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string }>({ name: '', description: '' });
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedSubdept, setSelectedSubdept] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [viewMode, setViewMode] = useState<'tabs' | 'sidebar'>('tabs');
  const [isReady, setIsReady] = useState(false);

  return {
    departments,
    setDepartments,
    activeDept,
    setActiveDept,
    activeSubdept,
    setActiveSubdept,
    activeClass,
    setActiveClass,
    isDialogOpen,
    setIsDialogOpen,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    deleteContext,
    setDeleteContext,
    editingContext,
    setEditingContext,
    newRequirements,
    setNewRequirements,
    isSubmitting,
    setIsSubmitting,
    editingIndex,
    setEditingIndex,
    editForm,
    setEditForm,
    selectedDept,
    setSelectedDept,
    selectedSubdept,
    setSelectedSubdept,
    selectedClass,
    setSelectedClass,
    viewMode,
    setViewMode,
    isReady,
    setIsReady,
  };
};
