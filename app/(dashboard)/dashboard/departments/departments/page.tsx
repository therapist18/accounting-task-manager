// @ts-nocheck
"use client"
import React, { useState, useEffect } from "react"
import { fetchDepartments, saveOrderAndDefaultDisplay, saveClassRequirements, updateClassRequirements, saveSubdepartmentRequirements, groupAssignmentsByHierarchy, formatJobLevel, Department, Subdepartment, Class, SubClass, Requirement, SubdepartmentForm, ClassForm, SubClassForm, RequirementForm, DepartmentForm, User, Officer } from "./database"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Loader2, Building, FolderPlus, Edit, Trash2, ChevronDown, ChevronUp, Plus, Minus, Search, BarChart3, Workflow, Layers, Target, User as UserIcon, Shield, Users, History, DownloadCloud, Save, Briefcase } from "lucide-react"
import supabase from "@/lib/supabase/client"
import { toast } from "sonner"
import DepartmentDialog from "./components/DepartmentDialog"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { ENTITY_TYPES } from "@/lib/constants/entity-types"
import { userService, DisplayUser, getOfficerDisplayName } from "@/lib/shared-user-assignment-service"
import { cn } from "@/lib/utils"

const deepClone = (obj: any) => JSON.parse(JSON.stringify(obj))

export const updateNestedState = (state: any, path: (string | number)[], value: any) => {
  const newState = deepClone(state)
  let current = newState
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (current[key] === undefined) {
      const nextKey = path[i + 1];
      current[key] = typeof nextKey === 'number' ? [] : {};
    }
    current = current[key];
  }
  current[path[path.length - 1]] = value;
  return newState;
};

// Role Assignments Display Component for Popover
function RoleAssignmentsDisplay({ officer, departments }: { officer: Officer; departments: Department[] }) {
  if (!officer.roleAssignments || officer.roleAssignments.length === 0) {
    return <div className="text-xs text-slate-500 italic">No specific assignments</div>
  }

  const grouped = groupAssignmentsByHierarchy(officer.roleAssignments)
  const hasAssignments = Object.values(grouped).some(list => list.length > 0)

  if (!hasAssignments) {
    return <div className="text-xs text-slate-500 italic">No specific assignments</div>
  }

  return (
    <div className="space-y-1">
      {grouped.departments.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {grouped.departments.map((assignment, idx) => (
            <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">
              <Building className="h-2.5 w-2.5 mr-1" />{formatJobLevel(assignment, departments)}
            </Badge>
          ))}
        </div>
      )}
      {grouped.subDepartments.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {grouped.subDepartments.map((assignment, idx) => (
            <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0 bg-indigo-50 text-indigo-700 border-indigo-200">
              <Briefcase className="h-2.5 w-2.5 mr-1" />{formatJobLevel(assignment, departments)}
            </Badge>
          ))}
        </div>
      )}
      {grouped.classes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {grouped.classes.map((assignment, idx) => (
            <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0 bg-violet-50 text-violet-700 border-violet-200">
              <Layers className="h-2.5 w-2.5 mr-1" />{formatJobLevel(assignment, departments)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

// User Details Popover 
function UserDetailsPopover({ userId, users, officers = [], role, children, departments = [] }: {
  userId: string,
  users: User[],
  officers?: Officer[],
  departments?: Department[],
  role: 'manager' | 'assistant' | 'officer',
  children: React.ReactNode
}) {
  const officer = role === 'officer' ? officers.find(o => o.id === userId) : null
  const user = role === 'officer'
    ? (officer ? { name: getOfficerDisplayName(officer), email: officer.email } : null)
    : users.find(u => u.id === userId)

  if (!user) return <span className="text-slate-400">{children}</span>

  const roleIcons = {
    manager: <UserIcon className="h-5 w-5" />,
    assistant: <Users className="h-5 w-5" />,
    officer: <Shield className="h-5 w-5" />
  }

  const roleColors = {
    manager: 'bg-emerald-100 text-emerald-700',
    assistant: 'bg-purple-100 text-purple-700',
    officer: 'bg-blue-100 text-blue-700'
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="cursor-pointer hover:opacity-80 transition-opacity inline-block w-full">{children}</div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 shadow-xl border-slate-200" align="start">
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${roleColors[role]}`}>
              {roleIcons[role]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 text-sm truncate">{user.name || 'No name'}</p>
              <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
              <Badge variant="outline" className="mt-1 capitalize text-[9px] font-semibold px-1.5">{role}</Badge>
            </div>
          </div>
          {role === 'officer' && officer && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Role Assignments</p>
              <RoleAssignmentsDisplay officer={officer} departments={departments} />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Enhanced Role Assignment Display Component
function RoleAssignmentDisplay({ userIds, users, officers, departments, role, emptyLabel = 'None assigned' }: any) {
  if (!userIds || userIds.length === 0) {
    return <span className="text-sm text-slate-400 italic">{emptyLabel}</span>;
  }

  const getRoleInfo = (r: string) => {
    switch (r) {
      case 'officer': return { color: 'blue', icon: Shield, label: 'Officer' };
      case 'manager': return { color: 'emerald', icon: UserIcon, label: 'Manager' };
      case 'assistant': return { color: 'purple', icon: Users, label: 'Assistant' };
      default: return { color: 'slate', icon: UserIcon, label: role };
    }
  };

  const getName = (id: string) => {
    if (role === 'officer') {
      const off = officers.find((o: any) => o.id === id);
      return off ? getOfficerDisplayName(off) : 'Unknown';
    }
    const u = users.find((u: any) => u.id === id);
    return u ? (u.displayName || u.name) : 'Unknown';
  };

  const roleInfo = getRoleInfo(role);
  const Icon = roleInfo.icon;

  // If only 1-2 people, show them directly
  if (userIds.length <= 2) {
    return (
      <div className="space-y-1">
        {userIds.map((id: string) => (
          <UserDetailsPopover key={id} userId={id} users={users} officers={officers} departments={departments} role={role}>
            <div className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
              <Icon className={`h-4 w-4 text-${roleInfo.color}-600`} />
              <span className="text-sm font-medium text-slate-700">{getName(id)}</span>
            </div>
          </UserDetailsPopover>
        ))}
      </div>
    );
  }

  // If 3+ people, show summary with popover
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className={`flex items-center gap-2 p-2 rounded-lg bg-${roleInfo.color}-50 hover:bg-${roleInfo.color}-100 transition-colors cursor-pointer border border-${roleInfo.color}-200`}>
          <Icon className={`h-4 w-4 text-${roleInfo.color}-600`} />
          <span className={`text-sm font-semibold text-${roleInfo.color}-700`}>{userIds.length} {roleInfo.label}s</span>
          <span className={`text-xs text-${roleInfo.color}-600`}>({userIds.slice(0, 2).map(getName).join(', ')})</span>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 shadow-xl border-slate-200" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
            <Icon className={`h-5 w-5 text-${roleInfo.color}-600`} />
            <h4 className="font-semibold text-slate-900">{userIds.length} Assigned {roleInfo.label}s</h4>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {userIds.map((id: string) => (
              <UserDetailsPopover key={id} userId={id} users={users} officers={officers} departments={departments} role={role}>
                <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-${roleInfo.color}-100`}>
                    <Icon className={`h-4 w-4 text-${roleInfo.color}-700`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{getName(id)}</p>
                    <p className="text-xs text-slate-500">{roleInfo.label}</p>
                  </div>
                </div>
              </UserDetailsPopover>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Enhanced Entity Display Component
function EntityDisplay({ entityTypes, emptyLabel = 'All Entities' }: { entityTypes?: string[], emptyLabel?: string }) {
  if (!entityTypes || entityTypes.length === 0) {
    return <span className="text-sm text-slate-400 italic">{emptyLabel}</span>;
  }

  const getEntityLabel = (type: string) => {
    return ENTITY_TYPES.find(t => t.value === type)?.label || type;
  };

  // If only 1-2 entities, show them directly
  if (entityTypes.length <= 2) {
    return (
      <div className="flex flex-wrap gap-2 justify-center">
        {entityTypes.map((type, index) => (
          <Badge key={index} variant="outline" className="text-xs px-2 py-1 bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 transition-colors">
            {getEntityLabel(type)}
          </Badge>
        ))}
      </div>
    );
  }

  // If 3+ entities, show summary with popover
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="flex items-center justify-center gap-2 p-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200">
          <Target className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-600">{entityTypes.length} Entities</span>
          <span className="text-xs text-slate-400">({entityTypes.slice(0, 2).map(getEntityLabel).join(', ')})</span>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 shadow-xl border-slate-200" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
            <Target className="h-5 w-5 text-slate-500" />
            <h4 className="font-semibold text-slate-900">{entityTypes.length} Allowed Entity Types</h4>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {entityTypes.map((type, index) => (
              <div key={index} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                  <Target className="h-4 w-4 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{getEntityLabel(type)}</p>
                  <p className="text-xs text-slate-500">Entity Type</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// --- MAIN COMPONENT ---
export default function Departments() {
  const [isAddDepartmentOpen, setIsAddDepartmentOpen] = useState(false)
  const [isStatsOpen, setIsStatsOpen] = useState(false)
  const [editingDepartmentId, setEditingDepartmentId] = useState<string | null>(null);
  const [editingSubdepartmentId, setEditingSubdepartmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [departments, setDepartments] = useState([])
  const [userData, setUserData] = useState<{
    officers: DisplayUser[];
    managers: DisplayUser[];
    assistants: DisplayUser[];
    allUsers: DisplayUser[];
  }>({ officers: [], managers: [], assistants: [], allUsers: [] })
  const [expanded, setExpanded] = useState<{ [key: string]: boolean }>({});
  const [expandedClasses, setExpandedClasses] = useState<{ [key: string]: boolean }>({});
  const [expandedSubClasses, setExpandedSubClasses] = useState<{ [key: string]: boolean }>({});
  const [isOrderChanged, setIsOrderChanged] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [departmentForm, setDepartmentForm] = useState<DepartmentForm>({
    name: '',
    description: '',
    default_display: true,
    subdepartments: [],
    officerId: ''
  })

  // Sticky column widths
  const stickyWidths = {
    index: 'w-[50px] min-w-[50px] max-w-[50px]',
    name: 'w-[280px] min-w-[280px] max-w-[280px]',
  }
  const stickyOffsets = {
    index: '0px',
    name: '50px',
  }

  const toggleAllDepartments = (expand: boolean) => {
    const updates = {};
    filteredDepartments.forEach((dept) => {
      updates[dept.id] = expand;
      (dept.tm_subdepartments || []).forEach((subdept) => {
        const subdeptKey = `subdept-${subdept.id}`;
        updates[subdeptKey] = expand;
        (subdept.classes || []).forEach((cls, clsIndex) => {
          const classId = `class-${subdept.id}-${cls.id || clsIndex}`;
          setExpandedClasses(prev => ({ ...prev, [classId]: expand }));
          (cls.subClasses || []).forEach((subClass, subClassIndex) => {
            const subClassId = `subclass-${subClass.id || subClassIndex}`;
            setExpandedSubClasses(prev => ({ ...prev, [subClassId]: expand }));
          });
        });
      });
    });
    setExpanded(updates);
  };

  const fetchData = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const departmentsData = await fetchDepartments();
      setDepartments(departmentsData);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to sync data. Please try again.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    async function loadInitialData() {
      await fetchData(false);
      try {
        const unifiedUserData = await userService.getAllUserData({ payrollAccess: true }, departments);
        setUserData(unifiedUserData);
      } catch (error) {
        toast.error('Failed to load users');
      }
    }
    loadInitialData();
  }, []);

  const handleReorder = (list: any[], index: number, direction: 'up' | 'down') => {
    const newList = [...list];
    const item = newList[index];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newList.length) return list;
    newList[index] = newList[swapIndex];
    newList[swapIndex] = item;
    newList.forEach((item, idx) => { item.order = idx + 1; });
    setIsOrderChanged(true);
    return newList;
  };

  const handleDepartmentReorder = (index: number, direction: 'up' | 'down') =>
    setDepartments(prev => handleReorder(prev, index, direction));

  const handleSubdepartmentReorder = (deptIndex: number, subdeptIndex: number, direction: 'up' | 'down') => {
    const newSubdepts = handleReorder(departments[deptIndex].tm_subdepartments, subdeptIndex, direction);
    setDepartments(prev => updateNestedState(prev, [deptIndex, 'tm_subdepartments'], newSubdepts));
  };

  const handleSaveOrder = async () => {
    setSavingOrder(true);
    try {
      const cleanDepartments = departments.map(dept => {
        const { officers_history, ...rest } = dept;
        return rest;
      });
      await saveOrderAndDefaultDisplay(cleanDepartments);
      toast.success("Order and display settings saved successfully!");
      setIsOrderChanged(false);
    } catch (error) {
      toast.error("Could not save the settings.");
    } finally {
      setSavingOrder(false);
    }
  };

  const handleToggleDisplay = (level: string, checked: boolean, indices: number[]) => {
    const updated = [...departments];
    const [dIdx, sIdx, cIdx, scIdx] = indices;
    if (level === 'dept') updated[dIdx].default_display = checked;
    else if (level === 'subdept') updated[dIdx].tm_subdepartments[sIdx].default_display = checked;
    else if (level === 'class') updated[dIdx].tm_subdepartments[sIdx].classes[cIdx].default_display = checked;
    else if (level === 'subclass') updated[dIdx].tm_subdepartments[sIdx].classes[cIdx].subClasses[scIdx].default_display = checked;
    setDepartments(updated);
    setIsOrderChanged(true);
  };

  const toggleExpansion = (type: 'dept' | 'class' | 'subclass', id: string) => {
    if (type === 'dept') setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    else if (type === 'class') setExpandedClasses(prev => ({ ...prev, [id]: !prev[id] }));
    else if (type === 'subclass') setExpandedSubClasses(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredDepartments = departments
    .filter(dept =>
      dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (dept.tm_subdepartments || []).some(subdept => subdept.name.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const areAllExpanded = filteredDepartments.length > 0 &&
    filteredDepartments.every(dept => expanded[dept.id]) &&
    filteredDepartments.every(dept => (dept.tm_subdepartments || []).every(subdept => expanded[`subdept-${subdept.id}`]));

  const handleSaveDepartment = async () => {
    setSaving(true);
    try {
      if (editingDepartmentId) await updateExistingDepartment(departmentForm);
      else {
        const newDept = await createNewDepartment(departmentForm);
        setEditingDepartmentId(newDept.id);
      }

      for (const sub of departmentForm.subdepartments) {
        const isNew = !sub.id;
        if (isNew) {
          const { data: existing } = await supabase.from('tm_subdepartments').select('id').ilike('name', sub.name.trim()).eq('department_id', editingDepartmentId).limit(1);
          if (existing?.length > 0) {
            toast.error(`Subdepartment "${sub.name}" exists. Skipping.`);
            continue;
          }
        }

        const payload = {
          name: sub.name.trim(), description: sub.description, department_id: editingDepartmentId,
          default_display: sub.default_display, classes: sub.classes || [],
          officer_history: sub.officer_history || [], manager_history: sub.manager_history || [],
          assistant_history: sub.assistant_history || [], entity_types: sub.entity_types || []
        };

        if (isNew) {
          const { data: newSub } = await supabase.from('tm_subdepartments').insert(payload).select().single();
          if (newSub) await saveClassRequirements(newSub.id, sub.classes);
        } else {
          await supabase.from('tm_subdepartments').update(payload).eq('id', sub.id);
          await updateClassRequirements(sub.id, sub.classes);
        }
      }
      toast.success('Department structure saved successfully!');
      setIsAddDepartmentOpen(false);
      await fetchData();
    } catch (error) {
      toast.error(error.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const createNewDepartment = async (formData: DepartmentForm) => {
    const { officerId, subdepartments, officers_history = [], ...departmentData } = formData;
    const { data: newDept, error: deptError } = await supabase.from('tm_departments').insert([{ ...departmentData, officers_history }]).select('*').single();
    if (deptError) throw deptError;
    if (subdepartments?.length > 0) await createSubdepartmentsForDepartment(newDept.id, subdepartments);
    return newDept;
  };

  const updateExistingDepartment = async (formData: DepartmentForm) => {
    if (!editingDepartmentId) return;
    const { officerId, subdepartments, officers_history = [], ...departmentData } = formData;
    const { data: updatedDept, error: deptError } = await supabase.from('tm_departments').update({ ...departmentData, officers_history }).eq('id', editingDepartmentId).select('*').single();
    if (deptError) throw deptError;
    return updatedDept;
  };

  const createSubdepartmentsForDepartment = async (departmentId, subdepartments) => {
    for (let i = 0; i < subdepartments.length; i++) {
      const subdept = subdepartments[i];
      if (!subdept.name.trim()) continue;
      const { data: newSubdept, error } = await supabase.from('tm_subdepartments').insert({
        name: subdept.name.trim(), description: subdept.description, department_id: departmentId,
        default_display: subdept.default_display, order: i + 1,
        officer_history: subdept.officer_history || [], manager_history: subdept.manager_history || [],
        assistant_history: subdept.assistant_history || []
      }).select().single();
      if (error) continue;
      if (subdept.classes?.length > 0) await saveClassRequirements(newSubdept.id, subdept.classes);
    }
  };

  const handleDeleteDepartment = async (departmentId: string) => {
    if (!confirm('Delete this department and all nested subdepartments?')) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('tm_departments').delete().eq('id', departmentId);
      if (error) throw error;
      toast.success('Department deleted successfully!');
      await fetchData();
    } catch (error) {
      toast.error('Failed to delete department. It might contain data that prevents deletion.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSubdepartment = async (subdepartmentId: string) => {
    if (!confirm('Are you sure you want to delete this subdepartment?')) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('tm_subdepartments').delete().eq('id', subdepartmentId);
      if (error) throw error;
      toast.success('Subdepartment deleted successfully!');
      await fetchData();
    } catch (error) {
      toast.error('Failed to delete subdepartment.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDepartment = () => {
    setEditingDepartmentId(null); setEditingSubdepartmentId(null);
    setDepartmentForm({ name: '', description: '', default_display: true, subdepartments: [], officers_history: [], officerId: '' });
    setIsAddDepartmentOpen(true);
  };

  const handleEditDepartment = (dept) => {
    setEditingDepartmentId(dept.id); setEditingSubdepartmentId(null);
    const associatedOfficerIds = userService.getDepartmentUsers(userData.allUsers, dept.id.toString()).officers.map(o => o.id);
    const mappedSubdepartments = (dept.tm_subdepartments || []).map(sub => ({
      ...sub,
      officer_history: sub.officer_history || [],
      classes: (sub.classes || []).map(cls => ({
        ...cls,
        subClasses: (cls.subClasses || []).map(sc => ({ ...sc, requirements: sc.requirements || [] }))
      }))
    }));

    setDepartmentForm({
      name: dept.name, description: dept.description || '', default_display: dept.default_display ?? true,
      entity_types: dept.entity_types || [], subdepartments: mappedSubdepartments,
      officers_history: associatedOfficerIds.map(id => ({ id, start_date: new Date().toISOString() })), officerId: ''
    });
    setIsAddDepartmentOpen(true);
  };

  const handleAddSubdepartment = (deptId, deptName) => {
    setEditingDepartmentId(deptId); setEditingSubdepartmentId(null);
    setDepartmentForm({
      name: deptName, description: '', default_display: true, officers_history: [], officerId: '',
      subdepartments: [{
        name: '', description: '', classes: [], taskManagerId: '', taskAssistantIds: [],
        default_display: true, entity_types: [], officer_history: [], manager_history: [], assistant_history: [], officerId: ''
      }]
    });
    setIsAddDepartmentOpen(true);
  };

  const handleEditSubdepartment = (subdept: Subdepartment) => {
    const department = departments.find(d => d.tm_subdepartments?.some(sd => sd.id === subdept.id));
    if (!department) return;
    const fullSubdept = department.tm_subdepartments?.find(sd => sd.id === subdept.id);
    if (!fullSubdept) return;

    setDepartmentForm({
      name: department.name, description: department.description || '', default_display: department.default_display || true,
      entity_types: department.entity_types || [], officers_history: [], officerId: '',
      subdepartments: [{ ...fullSubdept, officerId: '', taskManagerId: '', taskAssistantIds: [] }]
    });
    setEditingDepartmentId(department.id); setEditingSubdepartmentId(fullSubdept.id); setIsAddDepartmentOpen(true);
  };

  useEffect(() => {
    if (!isAddDepartmentOpen) {
      setDepartmentForm({ name: '', description: '', default_display: true, subdepartments: [], officers_history: [], officerId: '' });
      setEditingDepartmentId(null); setEditingSubdepartmentId(null);
    }
  }, [isAddDepartmentOpen]);

  const OrderButtons = ({ onReorder, index, listLength, disabled = false }) => (
    <div className="flex flex-col -space-y-1.5 opacity-60 hover:opacity-100 transition-opacity">
      <Button variant="ghost" size="icon" className="h-[14px] w-[20px] text-slate-500 hover:text-slate-800 hover:bg-slate-200 p-0 rounded-sm" disabled={disabled || index === 0} onClick={(e) => { e.stopPropagation(); onReorder(index, 'up'); }}>
        <ChevronUp className="h-3.5 w-3.5" strokeWidth={3} />
      </Button>
      <Button variant="ghost" size="icon" className="h-[14px] w-[20px] text-slate-500 hover:text-slate-800 hover:bg-slate-200 p-0 rounded-sm" disabled={disabled || index === listLength - 1} onClick={(e) => { e.stopPropagation(); onReorder(index, 'down'); }}>
        <ChevronDown className="h-3.5 w-3.5" strokeWidth={3} />
      </Button>
    </div>
  );

  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Departments Structure');
      sheet.columns = [
        { header: 'Index', key: 'index', width: 15 }, { header: 'Name', key: 'name', width: 60 },
        { header: 'Description', key: 'description', width: 40 }, { header: 'Officer', key: 'officer', width: 25 },
        { header: 'Task Manager', key: 'manager', width: 25 }, { header: 'Task Assistants', key: 'assistants', width: 40 },
        { header: 'Default Display', key: 'display', width: 15 }, { header: 'Item Type', key: 'type', width: 15 },
      ];
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

      const getBoolean = (val: boolean) => val ? 'Yes' : 'No';

      filteredDepartments.forEach((dept, dIdx) => {
        const deptRow = sheet.addRow({ index: `${dIdx + 1}`, name: dept.name, description: dept.description || '', type: 'Department', display: getBoolean(dept.default_display) });
        deptRow.font = { bold: true, size: 12 }; deptRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };

        (dept.tm_subdepartments || []).forEach((sub, sIdx) => {
          const subRow = sheet.addRow({ index: `${dIdx + 1}.${sIdx + 1}`, name: `    ${sub.name}`, description: sub.description || '', type: 'Subdepartment', display: getBoolean(sub.default_display) });
          subRow.outlineLevel = 1; subRow.font = { bold: true, color: { argb: 'FF374151' } };

          (sub.classes || []).forEach((cls, cIdx) => {
            const classRow = sheet.addRow({ index: `${dIdx + 1}.${sIdx + 1}.${cIdx + 1}`, name: `        ${cls.name}`, description: cls.description || '', type: 'Class', display: getBoolean(cls.default_display) });
            classRow.outlineLevel = 2; classRow.font = { italic: true, color: { argb: 'FF4B5563' } };

            (cls.subClasses || []).forEach((subCls, scIdx) => {
              const subClassRow = sheet.addRow({ index: `${dIdx + 1}.${sIdx + 1}.${cIdx + 1}.${scIdx + 1}`, name: `            ${subCls.name}`, description: subCls.description || '', type: 'SubClass', display: getBoolean(subCls.default_display) });
              subClassRow.outlineLevel = 3; subClassRow.font = { color: { argb: 'FF6B7280' } };
            });
          });
        });
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Departments_Structure_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success("Excel exported successfully!");
    } catch (error) { toast.error("Failed to export Excel."); }
  };

  return (
    <div className="flex-1 space-y-3 p-4 min-h-screen">
      {/* Header UI */}
      <div className="flex flex-col gap-2.5 bg-white pb-3 border-b border-slate-200">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col">
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight flex items-center gap-2">
              <Building className="h-6 w-6 text-blue-600" />
              Departments & Workflows
            </h3>
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold mt-1">Manage global company department structures and role assignments</p>
          </div>

          <div className="flex items-center gap-2 mb-0.5">
            <Button variant="outline" onClick={() => setIsStatsOpen(true)} size="sm" className="h-8 text-xs text-slate-700 shadow-sm border-slate-200 hover:bg-slate-50">
              <BarChart3 className="mr-1.5 h-3.5 w-3.5 text-blue-500" /> Statistics
            </Button>
            <Button variant="outline" onClick={handleExportExcel} size="sm" className="h-8 text-xs text-green-700 border-green-200 hover:bg-green-50 shadow-sm">
              <DownloadCloud className="mr-1.5 h-3.5 w-3.5 text-green-600" /> Export Excel
            </Button>
            {isOrderChanged && (
              <Button onClick={handleSaveOrder} disabled={savingOrder} size="sm" className="h-8 text-xs shadow-sm bg-amber-500 text-white hover:bg-amber-600">
                {savingOrder ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save Order
              </Button>
            )}
            <Button onClick={handleAddDepartment} size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
              <FolderPlus className="mr-1.5 h-3.5 w-3.5" /> Add Department
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 bg-slate-50 p-1.5 rounded-lg border border-slate-200/60">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative w-full max-w-[400px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input placeholder="Search structures..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-white pl-8 h-8 text-xs border-slate-200 focus-visible:ring-1 focus-visible:ring-slate-400" />
            </div>
            <div className="h-4 w-[1px] bg-slate-300 mx-1" />
            <Button variant="outline" onClick={() => toggleAllDepartments(!areAllExpanded)} size="sm" className="h-8 text-xs bg-white text-slate-700 border-slate-200 hover:bg-slate-50">
              {areAllExpanded ? <ChevronUp className="h-3.5 w-3.5 mr-1.5" /> : <ChevronDown className="h-3.5 w-3.5 mr-1.5" />}
              {areAllExpanded ? 'Collapse All' : 'Expand All'}
            </Button>
          </div>
          <div className="flex items-center gap-4 px-2">
            <div className="text-[11px] text-slate-500 font-medium whitespace-nowrap">Showing <span className="text-slate-900">{filteredDepartments.length}</span> departments</div>
          </div>
        </div>
      </div>

      {/* Table Area */}
      <div className="relative max-h-[72vh] overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm pb-2 scrollbar-thin">
        <Table className="border-collapse min-w-max w-full">
          <TableHeader className="sticky top-0 z-40 bg-white shadow-md">
            {/* Super Headers */}
            <TableRow>
              <TableHead colSpan={3} className="font-bold text-white border-r border-b border-white/20 p-2 sticky z-50 bg-blue-700 uppercase tracking-widest text-center text-[10px] left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Structure Information</TableHead>
              <TableHead colSpan={3} className="font-bold text-white border-r border-b border-white/20 p-2 bg-indigo-600 uppercase tracking-widest text-center text-[10px]">Role Assignments</TableHead>
              <TableHead colSpan={2} className="font-bold text-white border-r border-b border-white/20 p-2 bg-slate-600 uppercase tracking-widest text-center text-[10px]">Entity & Display Settings</TableHead>
              <TableHead className="font-bold text-white border-b border-white/20 p-2 bg-slate-700 uppercase tracking-widest text-center text-[10px] w-[140px]">Actions</TableHead>
            </TableRow>
            {/* Sub Headers */}
            <TableRow className="bg-slate-100">
              <TableHead style={{ left: stickyOffsets.index }} className={`font-bold text-white border-r border-slate-200 p-3 sticky z-50 bg-blue-600 text-center uppercase text-xs ${stickyWidths.index}`}>#</TableHead>
              <TableHead style={{ left: stickyOffsets.name }} className={`font-bold text-white border-r border-slate-200 p-3 sticky z-50 bg-blue-600 uppercase text-xs shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${stickyWidths.name}`}>Component Name</TableHead>
              <TableHead className="font-bold text-slate-700 border-r border-slate-200 p-3 text-center uppercase text-xs bg-slate-100 w-[60px]">Sub</TableHead>
              <TableHead className="font-bold text-indigo-900 border-r border-slate-200 p-3 text-center uppercase text-xs bg-indigo-100/50 w-[180px]">Officers</TableHead>
              <TableHead className="font-bold text-indigo-900 border-r border-slate-200 p-3 text-center uppercase text-xs bg-indigo-100/50 w-[180px]">Task Managers</TableHead>
              <TableHead className="font-bold text-indigo-900 border-r border-slate-200 p-3 text-center uppercase text-xs bg-indigo-100/50 w-[200px]">Task Assistants</TableHead>
              <TableHead className="font-bold text-slate-700 border-r border-slate-200 p-3 text-center uppercase text-xs bg-slate-100 w-[160px]">Allowed Entities</TableHead>
              <TableHead className="font-bold text-slate-700 border-r border-slate-200 p-3 text-center uppercase text-xs bg-slate-100 w-[120px]">Default View</TableHead>
              <TableHead className="font-bold text-slate-700 p-3 text-center uppercase text-xs bg-slate-100 w-[160px]">Manage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && departments.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="h-32 text-center bg-slate-50"><Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto mb-2" /><span className="text-xs text-slate-500 font-medium">Loading Architecture...</span></TableCell></TableRow>
            ) : filteredDepartments.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-400 font-medium text-sm">No records found matching filters.</TableCell></TableRow>
            ) : (
              filteredDepartments.map((dept, deptIndex) => {
                const deptUsers = userService.getDepartmentUsers(userData.allUsers, dept.id.toString());
                const isExpanded = expanded[dept.id];

                return (
                  <React.Fragment key={dept.id}>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-100/60 border-b-2 border-slate-200 transition-colors">
                      <TableCell style={{ left: stickyOffsets.index }} className={`text-center border-r border-slate-200 font-bold text-slate-700 p-3 text-sm sticky z-10 bg-blue-50 ${stickyWidths.index}`}>{deptIndex + 1}</TableCell>
                      <TableCell style={{ left: stickyOffsets.name }} className={`border-r border-slate-200 p-3 font-bold text-blue-900 text-base sticky z-10 bg-blue-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] ${stickyWidths.name}`}>
                        <div className="flex justify-between items-center gap-2">
                          <div className="flex items-center gap-3 truncate">
                            <Building className="h-5 w-5 text-blue-600 flex-shrink-0" />
                            <span className="truncate text-base">{dept.name}</span>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => toggleExpansion('dept', dept.id)} className="h-8 w-8 text-slate-600 hover:bg-slate-100 flex-shrink-0 rounded">
                            {isExpanded ? <Minus className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="border-r border-slate-200 p-3 text-center">
                        <span className="text-sm font-semibold text-slate-600">{(dept.tm_subdepartments || []).length}</span>
                      </TableCell>
                      <TableCell className="border-r border-slate-200 p-3"><RoleAssignmentDisplay userIds={deptUsers.officers.map(u => u.id)} users={userData.allUsers} officers={userData.officers} departments={departments} role="officer" emptyLabel="No Officer" /></TableCell>
                      <TableCell className="border-r border-slate-200 p-3"><RoleAssignmentDisplay userIds={deptUsers.managers.map(u => u.id)} users={userData.allUsers} officers={userData.officers} departments={departments} role="manager" emptyLabel="No Manager" /></TableCell>
                      <TableCell className="border-r border-slate-200 p-3"><div className="text-sm text-slate-400 font-medium text-center italic">—</div></TableCell>
                      <TableCell className="border-r border-slate-200 p-3 text-center">
                        <EntityDisplay entityTypes={dept.entity_types} />
                      </TableCell>
                      <TableCell className="text-center border-r border-slate-200 p-3">
                        <Checkbox className="h-4 w-4 border-slate-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" checked={dept.default_display || false} onCheckedChange={(checked) => handleToggleDisplay('dept', Boolean(checked), [deptIndex])} />
                      </TableCell>
                      <TableCell className="text-right p-3 bg-slate-50">
                        <div className="flex items-center justify-center gap-1.5">
                          <OrderButtons onReorder={handleDepartmentReorder} index={deptIndex} listLength={filteredDepartments.length} disabled={savingOrder} />
                          <div className="w-[1px] h-6 bg-slate-200 mx-2"></div>
                          <Button variant="ghost" size="icon" onClick={() => handleEditDepartment(dept)} className="h-8 w-8 text-slate-600 hover:bg-slate-100 rounded"><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteDepartment(dept.id)} className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50 rounded" onClick={() => handleAddSubdepartment(dept.id, dept.name)} title="Add Subdepartment"><Plus className="h-5 w-5" strokeWidth={3} /></Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {isExpanded && (dept.tm_subdepartments || []).sort((a, b) => (a.order || 0) - (b.order || 0)).map((subdept, subdeptIndex) => {
                      const hasClasses = subdept.classes && subdept.classes.length > 0;
                      const subdeptKey = `subdept-${subdept.id}`;
                      const isSubExpanded = expanded[subdeptKey];
                      const subUsers = userService.getSubdepartmentUsers(userData.allUsers, dept.id.toString(), subdept.id.toString());

                      return (
                        <React.Fragment key={subdept.id}>
                          <TableRow className="bg-slate-50/30 hover:bg-slate-100/50 border-b border-slate-200 transition-colors">
                            <TableCell style={{ left: stickyOffsets.index }} className={`text-center border-r border-slate-200 p-3 text-sm font-semibold text-slate-600 sticky z-10 bg-slate-50/50 ${stickyWidths.index}`}>{deptIndex + 1}.{subdeptIndex + 1}</TableCell>
                            <TableCell style={{ left: stickyOffsets.name }} className={`pl-8 border-r border-slate-200 p-3 sticky z-10 bg-slate-50/50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.03)] ${stickyWidths.name}`}>
                              <div className="flex justify-between items-center gap-2">
                                <div className="flex items-center gap-3 text-sm font-semibold text-slate-700 truncate">
                                  <Workflow className="h-4 w-4 text-slate-600 flex-shrink-0" />
                                  <span className="truncate">{subdept.name}</span>
                                  {hasClasses && <Badge variant="outline" className="text-xs px-2 py-1 bg-white text-slate-600 border-slate-300 ml-2">{subdept.classes.length} classes</Badge>}
                                </div>
                                {hasClasses && (
                                  <Button variant="ghost" size="icon" onClick={() => toggleExpansion('dept', subdeptKey)} className="h-7 w-7 text-slate-500 hover:bg-white flex-shrink-0 rounded">
                                    {isSubExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="border-r border-slate-200 p-3 text-center bg-white/30">
                              <span className="text-sm text-slate-400">—</span>
                            </TableCell>
                            <TableCell className="border-r border-slate-200 p-3 bg-white/30"><RoleAssignmentDisplay userIds={subUsers.officers.map(u => u.id)} users={userData.allUsers} officers={userData.officers} departments={departments} role="officer" emptyLabel="Inherited/None" /></TableCell>
                            <TableCell className="border-r border-slate-200 p-3 bg-white/30"><RoleAssignmentDisplay userIds={subUsers.managers.map(u => u.id)} users={userData.allUsers} officers={userData.officers} departments={departments} role="manager" emptyLabel="No Manager" /></TableCell>
                            <TableCell className="border-r border-slate-200 p-3 bg-white/30"><RoleAssignmentDisplay userIds={subUsers.assistants.map(u => u.id)} users={userData.allUsers} officers={userData.officers} departments={departments} role="assistant" emptyLabel="No Assistants" /></TableCell>
                            <TableCell className="border-r border-slate-200 p-3 text-center bg-white/30">
                              <EntityDisplay entityTypes={subdept.entity_types} />
                            </TableCell>
                            <TableCell className="text-center border-r border-slate-200 p-3 bg-white/30">
                              <Checkbox className="h-4 w-4 border-slate-300 data-[state=checked]:bg-slate-600" checked={subdept.default_display || false} onCheckedChange={(checked) => handleToggleDisplay('subdept', Boolean(checked), [deptIndex, subdeptIndex])} />
                            </TableCell>
                            <TableCell className="p-3 bg-white/30">
                              <div className="flex items-center justify-center gap-2">
                                <OrderButtons onReorder={(idx, dir) => handleSubdepartmentReorder(deptIndex, idx, dir)} index={subdeptIndex} listLength={(dept.tm_subdepartments || []).length} disabled={savingOrder} />
                                <div className="w-[1px] h-6 bg-slate-200 mx-2"></div>
                                <Button variant="ghost" size="icon" onClick={() => handleEditSubdepartment(subdept)} className="h-8 w-8 text-slate-500 hover:bg-white rounded"><Edit className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteSubdepartment(subdept.id)} className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>

                          {isSubExpanded && hasClasses && (subdept.classes || []).sort((a, b) => (a.order || 0) - (b.order || 0)).map((cls, clsIndex) => {
                            const classId = `class-${subdept.id}-${cls.id || clsIndex}`;
                            const hasSubClasses = cls.subClasses && cls.subClasses.length > 0;
                            const isClassExpanded = expandedClasses[classId];

                            return (
                              <React.Fragment key={`${subdept.id}-${cls.id || clsIndex}`}>
                                <TableRow className="bg-white hover:bg-slate-50/50 border-b border-slate-100 transition-colors">
                                  <TableCell style={{ left: stickyOffsets.index }} className={`text-center border-r border-slate-100 p-3 text-sm font-semibold text-slate-400 sticky z-10 bg-white ${stickyWidths.index}`}>{deptIndex + 1}.{subdeptIndex + 1}.{clsIndex + 1}</TableCell>
                                  <TableCell style={{ left: stickyOffsets.name }} className={`pl-16 border-r border-slate-100 p-3 sticky z-10 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)] ${stickyWidths.name}`}>
                                    <div className="flex justify-between items-center gap-2">
                                      <div className="flex items-center gap-3 text-sm font-medium text-slate-500 truncate">
                                        <Layers className="h-4 w-4 text-slate-400 flex-shrink-0" /><span className="truncate">{cls.name}</span>
                                      </div>
                                      {hasSubClasses ? (
                                        <Button variant="ghost" size="icon" onClick={() => toggleExpansion('class', classId)} className="h-7 w-7 text-slate-400 hover:bg-slate-50 flex-shrink-0 rounded">
                                          {isClassExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                        </Button>
                                      ) : <div className="w-7" />}
                                    </div>
                                  </TableCell>
                                  <TableCell className="border-r border-slate-100 p-3 text-center">
                                    <span className="text-sm text-slate-300">—</span>
                                  </TableCell>
                                  <TableCell className="border-r border-slate-100 p-3"><div className="text-sm text-slate-300 font-medium text-center italic">—</div></TableCell>
                                  <TableCell className="border-r border-slate-100 p-3"><div className="text-sm text-slate-300 font-medium text-center italic">—</div></TableCell>
                                  <TableCell className="border-r border-slate-100 p-3"><div className="text-sm text-slate-300 font-medium text-center italic">—</div></TableCell>
                                  <TableCell className="border-r border-slate-100 p-3 text-center">
                                    <EntityDisplay entityTypes={cls.entity_types} emptyLabel="All Entities" />
                                  </TableCell>
                                  <TableCell className="text-center border-r border-slate-100 p-3">
                                    <Checkbox className="h-4 w-4 border-slate-200 data-[state=checked]:bg-slate-500" checked={cls.default_display || false} onCheckedChange={(checked) => handleToggleDisplay('class', Boolean(checked), [deptIndex, subdeptIndex, clsIndex])} />
                                  </TableCell>
                                  <TableCell className="p-1.5" />
                                </TableRow>

                                {isClassExpanded && hasSubClasses && (cls.subClasses || []).sort((a, b) => (a.order || 0) - (b.order || 0)).map((subClass, subClassIndex) => (
                                  <TableRow key={`${cls.id}-${subClass.id || subClassIndex}`} className="bg-slate-50/10 hover:bg-slate-50/30 border-b border-dashed border-slate-100 transition-colors">
                                    <TableCell style={{ left: stickyOffsets.index }} className={`text-center border-r border-slate-50 p-3 text-sm font-medium text-slate-300 sticky z-10 bg-slate-50/10 ${stickyWidths.index}`}>{deptIndex + 1}.{subdeptIndex + 1}.{clsIndex + 1}.{subClassIndex + 1}</TableCell>
                                    <TableCell style={{ left: stickyOffsets.name }} className={`pl-24 border-r border-slate-50 p-3 sticky z-10 bg-slate-50/10 ${stickyWidths.name}`}>
                                      <div className="flex items-center gap-3 text-sm text-slate-400">
                                        <Target className="h-4 w-4 text-slate-300 flex-shrink-0" /><span className="truncate">{subClass.name}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="border-r border-slate-50 p-3 text-center">
                                      <span className="text-sm text-slate-300">—</span>
                                    </TableCell>
                                    <TableCell className="border-r border-slate-50 p-3" />
                                    <TableCell className="border-r border-slate-50 p-3" />
                                    <TableCell className="border-r border-slate-50 p-3" />
                                    <TableCell className="border-r border-slate-50 p-3 text-center">
                                      <EntityDisplay entityTypes={subClass.entity_types} emptyLabel="All Entities" />
                                    </TableCell>
                                    <TableCell className="text-center border-r border-slate-50 p-3">
                                      <Checkbox className="h-4 w-4 border-slate-100 data-[state=checked]:bg-slate-400" checked={subClass.default_display || false} onCheckedChange={(checked) => handleToggleDisplay('subclass', Boolean(checked), [deptIndex, subdeptIndex, clsIndex, subClassIndex])} />
                                    </TableCell>
                                    <TableCell className="p-3" />
                                  </TableRow>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <DepartmentDialog
        open={isAddDepartmentOpen}
        onOpenChange={setIsAddDepartmentOpen}
        onSave={handleSaveDepartment}
        departmentForm={departmentForm}
        setDepartmentForm={setDepartmentForm}
        userData={userData}
        editingDepartmentId={editingDepartmentId}
        editingSubdepartmentId={editingSubdepartmentId}
        isSaving={saving}
      />
    </div>
  )
}