//@ts-nocheck
"use client"

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnhancedAddFieldDialog } from "./components/dialogs/EnhancedAddFieldDialog";
import { SectionManagement } from "./components/dialogs/SectionManagement";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Plus, 
  Minus,
  Edit, 
  Trash2, 
  Link, 
  Download, 
  Search, 
  Filter,
  ChevronLeft,
  ChevronRight,
  X,
  Save,
  AlertCircle,
  ChevronDown,
  ChevronRight as ChevronRightCollapse,
  FolderOpen,
  Folder,
  Settings
} from "lucide-react";
import { toast } from '@/hooks/use-toast';
import supabase from '@/lib/supabase/client';
import * as XLSX from 'xlsx';

interface FieldSection {
  id: number;
  section_key: string;
  title: string;
  description?: string;
  order_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type FieldType = 'text' | 'date' | 'number' | 'select' | 'email' | 'password';
type FieldEntityType = 'company' | 'individual';

interface JobField {
  id: number;
  field_key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  is_required: boolean;
  show_in_table: boolean;
  show_in_dialog: boolean;
  table_header?: string;
  col_span: number;
  callback?: string;
  data_source?: any;
  depends_on?: string;
  has_dependent: boolean;
  static_options?: string;
  sources?: FieldSource[];
  options?: string[];
  section_id?: number;
  order_index: number;
  entity_type: FieldEntityType;
  created_at: string;
  updated_at: string;
  // Relations
  section?: FieldSection;
}

interface FieldSource {
  source_type: 'profile' | 'document' | 'company';
  table: string;
  path: string;
  priority: number;
}

interface FormData {
  field_key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select' | 'email' | 'password';
  placeholder?: string;
  is_required: boolean;
  show_in_table: boolean;
  show_in_dialog: boolean;
  table_header?: string;
  col_span: number;
  callback?: string;
  section_id?: number;
  order_index: number;
  options: string[];
  sources: FieldSource[];
}

interface SectionWithFields {
  section: FieldSection | null;
  fields: JobField[];
  isExpanded: boolean;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'password', label: 'Password' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Select' }
];

const SOURCE_TYPES = [
  { value: 'profile', label: 'Profile' },
  { value: 'document', label: 'Document' },
  { value: 'company', label: 'Company' }
];

export default function JobFieldsManagement() {
  // State management
  const [fields, setFields] = useState<JobField[]>([]);
  const [sections, setSections] = useState<FieldSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [requiredFilter, setRequiredFilter] = useState<string>('all');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [viewMode, setViewMode] = useState<'fields' | 'sections' | 'grouped'>('grouped');
  const [entityFilter, setEntityFilter] = useState<'all' | 'company' | 'individual'>('all');
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  // Fetch sections and fields
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch sections with fields
      const { data: sectionsData, error: sectionsError } = await supabase
        .from('tm_field_sections')
        .select('*')
        .order('order_index');

      if (sectionsError) throw sectionsError;
      setSections(sectionsData?.map(section => ({
        ...section,
        fields: section.fields || []
      })) || []);

      // Expand all sections by default
      if (sectionsData) {
        setExpandedSections(new Set(sectionsData.map(s => s.id)));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch on component mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSourcesDialog, setShowSourcesDialog] = useState(false);

  // Form states
  const [formData, setFormData] = useState<FormData>({
    field_key: '',
    label: '',
    type: 'text',
    placeholder: '',
    is_required: false,
    show_in_table: true,
    show_in_dialog: true,
    table_header: '',
    col_span: 1,
    callback: '',
    section_id: undefined,
    order_index: 0,
    options: [],
    sources: []
  });
  const [editingField, setEditingField] = useState<JobField | null>(null);
  const [deletingField, setDeleteingField] = useState<JobField | null>(null);
  const [sourcesField, setSourcesField] = useState<JobField | null>(null);
  const [newOption, setNewOption] = useState('');

  // Group fields by sections
  const groupedFields = useMemo(() => {
    const groups: SectionWithFields[] = [];
    
    // Add sections with their fields
    sections.forEach(section => {
      const fieldsArray = Array.isArray(section.fields) ? section.fields : [];
      const filteredFields = fieldsArray.filter(field => {
        if (entityFilter === 'all') return true;
        return field.entity_type === entityFilter;
      });

      if (filteredFields.length > 0 || viewMode === 'grouped') {
        groups.push({
          section,
          fields: filteredFields.sort((a, b) => a.order_index - b.order_index),
          isExpanded: expandedSections.has(section.id)
        });
      }
    });

    return groups;
  }, [fields, sections, expandedSections, viewMode]);

  // Filtered fields for flat view
  const filteredFields = useMemo(() => {
    return fields.filter(field => {
      const matchesSearch = field.field_key.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           field.label.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || field.type === typeFilter;
      const matchesRequired = requiredFilter === 'all' || 
                             (requiredFilter === 'required' && field.is_required) ||
                             (requiredFilter === 'optional' && !field.is_required);
      const matchesSection = sectionFilter === 'all' || 
                            (sectionFilter === 'ungrouped' && !field.section_id) ||
                            field.section_id?.toString() === sectionFilter;
      
      return matchesSearch && matchesType && matchesRequired && matchesSection;
    });
  }, [fields, searchQuery, typeFilter, requiredFilter, sectionFilter]);

  const paginatedFields = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredFields.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredFields, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredFields.length / itemsPerPage);

  // Toggle section expansion
  const toggleSection = (sectionId: number) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  // Expand/Collapse all sections
  const toggleAllSections = (expand: boolean) => {
    if (expand) {
      const allIds = new Set([0, ...sections.map(s => s.id)]); // Include 0 for ungrouped
      setExpandedSections(allIds);
    } else {
      setExpandedSections(new Set());
    }
  };

  // API Functions (keeping existing ones and adding new ones)
  const addField = async () => {
    try {
      const fieldData = {
        field_key: formData.field_key,
        label: formData.label,
        type: formData.type,
        placeholder: formData.placeholder || `Enter ${formData.label}`,
        is_required: formData.is_required,
        show_in_table: formData.show_in_table,
        show_in_dialog: formData.show_in_dialog,
        table_header: formData.table_header || formData.label,
        col_span: formData.col_span,
        callback: formData.callback,
        section_id: formData.section_id,
        order_index: formData.order_index,
        sources: formData.sources.length > 0 ? formData.sources : null,
        options: formData.type === 'select' && formData.options.length > 0 ? formData.options : null,
      };

      const { error } = await supabase
        .from('tm_job_fields')
        .insert([fieldData]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Field added successfully",
      });
      
      setShowAddDialog(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast({
        title: "Error",
        description: error.message || "Failed to add field",
        variant: "destructive",
      });
    }
  };

  const updateField = async () => {
    if (!editingField) return;

    try {
      const fieldData = {
        field_key: formData.field_key,
        label: formData.label,
        type: formData.type,
        placeholder: formData.placeholder,
        is_required: formData.is_required,
        show_in_table: formData.show_in_table,
        show_in_dialog: formData.show_in_dialog,
        table_header: formData.table_header,
        col_span: formData.col_span,
        callback: formData.callback,
        section_id: formData.section_id,
        order_index: formData.order_index,
        sources: formData.sources.length > 0 ? formData.sources : null,
        options: formData.type === 'select' && formData.options.length > 0 ? formData.options : null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('tm_job_fields')
        .update(fieldData)
        .eq('id', editingField.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Field updated successfully",
      });
      
      setShowEditDialog(false);
      resetForm();
      setEditingField(null);
      fetchData();
    } catch (error) {
      toast({
        title: "Error",
        description: error.message || "Failed to update field",
        variant: "destructive",
      });
    }
  };

  const deleteField = async () => {
    if (!deletingField) return;

    try {
      const { error } = await supabase
        .from('tm_job_fields')
        .delete()
        .eq('id', deletingField.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Field deleted successfully",
      });
      
      setShowDeleteDialog(false);
      setDeleteingField(null);
      fetchData();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete field",
        variant: "destructive",
      });
    }
  };

  const exportToExcel = async () => {
    try {
      const exportData = fields.map(field => ({
        'Section': field.section?.title || 'Ungrouped',
        'Field Key': field.field_key,
        'Label': field.label,
        'Type': field.type,
        'Required': field.is_required ? 'Yes' : 'No',
        'Show in Table': field.show_in_table ? 'Yes' : 'No',
        'Show in Dialog': field.show_in_dialog ? 'Yes' : 'No',
        'Column Span': field.col_span,
        'Sources Count': field.sources?.length || 0,
        'Options': field.options?.join(', ') || '',
        'Order': field.order_index,
        'Created': new Date(field.created_at).toLocaleDateString(),
        'Updated': new Date(field.updated_at).toLocaleDateString(),
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Master Fields');
      
      XLSX.writeFile(workbook, `master-fields-${new Date().toISOString().split('T')[0]}.xlsx`);
      
      toast({
        title: "Success",
        description: "Fields exported to Excel successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export fields",
        variant: "destructive",
      });
    }
  };

  // Helper functions
  const resetForm = () => {
    setFormData({
      field_key: '',
      label: '',
      type: 'text',
      placeholder: '',
      is_required: false,
      show_in_table: true,
      show_in_dialog: true,
      table_header: '',
      col_span: 1,
      callback: '',
      section_id: undefined,
      order_index: 0,
      options: [],
      sources: []
    });
    setNewOption('');
  };

  const handleAddOption = () => {
    if (newOption.trim() && !formData.options.includes(newOption.trim())) {
      setFormData(prev => ({
        ...prev,
        options: [...prev.options, newOption.trim()]
      }));
      setNewOption('');
    }
  };

  const handleRemoveOption = (option: string) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.filter(opt => opt !== option)
    }));
  };

  const handleAddSource = () => {
    setFormData(prev => ({
      ...prev,
      sources: [...prev.sources, {
        source_type: 'profile',
        table: '',
        path: '',
        priority: prev.sources.length + 1
      }]
    }));
  };

  const handleRemoveSource = (index: number) => {
    setFormData(prev => ({
      ...prev,
      sources: prev.sources.filter((_, i) => i !== index)
    }));
  };

  const handleSourceChange = (index: number, field: keyof FieldSource, value: any) => {
    setFormData(prev => {
      const updatedSources = [...prev.sources];
      updatedSources[index] = { ...updatedSources[index], [field]: value };
      
      return {
        ...prev,
        sources: updatedSources
      };
    });
  };

  const openEditDialog = (field: JobField) => {
    setEditingField(field);
    
    setFormData({
      field_key: field.field_key,
      label: field.label,
      type: field.type,
      placeholder: field.placeholder || '',
      is_required: field.is_required,
      show_in_table: field.show_in_table,
      show_in_dialog: field.show_in_dialog,
      table_header: field.table_header || '',
      col_span: field.col_span,
      callback: field.callback || '',
      section_id: field.section_id,
      order_index: field.order_index,
      options: field.options || [],
      sources: field.sources || []
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (field: JobField) => {
    setDeleteingField(field);
    setShowDeleteDialog(true);
  };

  const openSourcesDialog = (field: JobField) => {
    setSourcesField(field);
    
    setFormData({
      field_key: field.field_key,
      label: field.label,
      type: field.type,
      placeholder: field.placeholder || '',
      is_required: field.is_required,
      show_in_table: field.show_in_table,
      show_in_dialog: field.show_in_dialog,
      table_header: field.table_header || '',
      col_span: field.col_span,
      callback: field.callback || '',
      section_id: field.section_id,
      order_index: field.order_index,
      options: field.options || [],
      sources: field.sources || []
    });
    setShowSourcesDialog(true);
  };

  const updateFieldSources = async () => {
    if (!sourcesField) return;

    try {
      const { error } = await supabase
        .from('tm_job_fields')
        .update({ 
          sources: formData.sources.length > 0 ? formData.sources : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', sourcesField.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Sources updated successfully",
      });
      
      setShowSourcesDialog(false);
      setSourcesField(null);
      resetForm();
      fetchData();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update sources",
        variant: "destructive",
      });
    }
  };

  // Render grouped fields view
  const renderGroupedView = () => {
    const allExpanded = expandedSections.size === sections.length + 1; // +1 for ungrouped

    return (
      <div className="space-y-4">
        {/* Expand/Collapse All Controls */}
        <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
          <span className="text-sm font-medium text-gray-700">
            {groupedFields.length} section(s) • {fields.length} field(s)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleAllSections(true)}
              disabled={allExpanded}
              className="flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />
              Expand All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleAllSections(false)}
              disabled={expandedSections.size === 0}
              className="flex items-center gap-1"
            >
              <Minus className="h-3 w-3" />
              Collapse All
            </Button>
          </div>
        </div>

        {groupedFields.map((group, groupIndex) => {
          const sectionId = group.section?.id || 0;
          const isExpanded = group.isExpanded;
          
          return (
            <Card key={sectionId} className="overflow-hidden">
              <CardHeader 
                className="pb-3 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleSection(sectionId)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-1 h-6 w-6"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRightCollapse className="h-4 w-4" />
                      )}
                    </Button>
                    <div className="flex items-center gap-2">
                      {group.section ? (
                        <FolderOpen className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Folder className="h-4 w-4 text-gray-500" />
                      )}
                      <div>
                        <CardTitle className="text-lg">
                          {group.section?.title || 'Ungrouped Fields'}
                        </CardTitle>
                        {group.section?.description && (
                          <p className="text-sm text-gray-600 mt-1">
                            {group.section.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {group.fields.length} field{group.fields.length !== 1 ? 's' : ''}
                    </Badge>
                    {group.section && (
                      <Badge variant={group.section.is_active ? "default" : "secondary"}>
                        {group.section.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              {isExpanded && (
                <CardContent className="pt-0">
                  {group.fields.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p>No fields in this section</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2"
                        onClick={() => setShowAddDialog(true)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add First Field
                      </Button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Field Key</TableHead>
                            <TableHead>Label</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Required</TableHead>
                            <TableHead>Display</TableHead>
                            <TableHead>Sources</TableHead>
                            <TableHead>Order</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.fields.map((field) => (
                            <TableRow key={field.id}>
                              <TableCell className="font-mono text-sm">{field.field_key}</TableCell>
                              <TableCell className="font-medium">{field.label}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">
                                  {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {field.is_required ? '✓' : '✗'}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  {field.show_in_table && (
                                    <Badge variant="outline" className="text-xs">T</Badge>
                                  )}
                                  {field.show_in_dialog && (
                                    <Badge variant="outline" className="text-xs">D</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={field.sources?.length ? "default" : "outline"}>
                                  {field.sources?.length || 0}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {field.order_index}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditDialog(field)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openSourcesDialog(field)}
                                  >
                                    <Link className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openDeleteDialog(field)}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    );
  };

  // Render flat fields view
  const renderFieldsView = () => {
    // Filter fields by entity type
    const filteredFieldsByEntity = fields.filter(field => {
      if (entityFilter === 'all') return true;
      return field.entity_type === entityFilter;
    });
    return (
      <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Section</TableHead>
                <TableHead>Field Key</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Display</TableHead>
                <TableHead>Sources</TableHead>
                <TableHead>Order</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredFieldsByEntity.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                    {filteredFields.length === 0 && fields.length > 0 
                      ? "No fields match your filters" 
                      : "No fields found. Add your first field to get started."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredFieldsByEntity.map((field) => (
                  <TableRow key={field.id}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {field.section?.title || 'Ungrouped'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{field.field_key}</TableCell>
                    <TableCell className="font-medium">{field.label}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {field.is_required ? '✓' : '✗'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {field.show_in_table && (
                          <Badge variant="outline" className="text-xs">T</Badge>
                        )}
                        {field.show_in_dialog && (
                          <Badge variant="outline" className="text-xs">D</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={field.sources?.length ? "default" : "outline"}>
                        {field.sources?.length || 0}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {field.order_index}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(field)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openSourcesDialog(field)}
                        >
                          <Link className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeleteDialog(field)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
    );
  }

  return (
    <div className="mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Master Fields Management</h1>
          <p className="text-gray-600 mt-1">Manage application form fields, sections and their data sources</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={exportToExcel} variant="outline" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export to Excel
          </Button>
          <Button onClick={() => setShowAddDialog(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Field
          </Button>
        </div>
      </div>

      {/* View Mode Tabs */}
      <Tabs value={viewMode} onValueChange={(value: any) => setViewMode(value)} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
            {/* <TabsTrigger value="grouped" className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Grouped by Sections
            </TabsTrigger> */}
          <TabsTrigger value="fields" className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            All Fields
          </TabsTrigger>
          <TabsTrigger value="individual" className="flex items-center gap-2">
            <Folder className="h-4 w-4" />
            Individual Fields
          </TabsTrigger>
          <TabsTrigger value="company" className="flex items-center gap-2">
            <Folder className="h-4 w-4" />
            Company Fields
          </TabsTrigger>
          <TabsTrigger value="sections" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Manage Sections
          </TabsTrigger>
        </TabsList>

        <TabsContent value="grouped" className="space-y-4">
          {/* Entity Type Filter for grouped view */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <Select value={entityFilter} onValueChange={setEntityFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="All Entities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Entities</SelectItem>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="company">Company</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
          {/* Filters for grouped view */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search fields..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {FIELD_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={requiredFilter} onValueChange={setRequiredFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="All Fields" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Fields</SelectItem>
                    <SelectItem value="required">Required</SelectItem>
                    <SelectItem value="optional">Optional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading sections and fields...</p>
              </CardContent>
            </Card>
          ) : (
            renderGroupedView()
          )}
        </TabsContent>

        <TabsContent value="fields" className="space-y-4">
          {/* Filters for flat view */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search fields..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={sectionFilter} onValueChange={setSectionFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="All Sections" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    <SelectItem value="ungrouped">Ungrouped</SelectItem>
                    {sections.map(section => (
                      <SelectItem key={section.id} value={section.id.toString()}>
                        {section.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {FIELD_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={requiredFilter} onValueChange={setRequiredFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="All Fields" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Fields</SelectItem>
                    <SelectItem value="required">Required</SelectItem>
                    <SelectItem value="optional">Optional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {renderFieldsView()}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredFields.length)} of {filteredFields.length} fields
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="sections">
          <SectionManagement onSectionChange={fetchData} />
        </TabsContent>
      </Tabs>

      {/* Add Field Dialog */}
      <EnhancedAddFieldDialog
        open={openAddField}
        onOpenChange={setOpenAddField}
        onSuccess={fetchData}
        sections={sections}
      />

      {/* Edit Field Dialog */}
      {editingField && (
        <EnhancedAddFieldDialog
          open={openEditField}
          onOpenChange={setOpenEditField}
          onSuccess={fetchData}
          sections={sections}
          initialData={editingField}
        />
      )}

      {/* Edit Field Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Field</DialogTitle>
            <DialogDescription>
              Update the field configuration and settings.
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="display">Display</TabsTrigger>
              <TabsTrigger value="behavior">Behavior</TabsTrigger>
              <TabsTrigger value="sources">Data Sources</TabsTrigger>
            </TabsList>
            
            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="field_key">Field Key *</Label>
                  <Input
                    id="field_key"
                    value={formData.field_key}
                    onChange={(e) => setFormData(prev => ({ ...prev, field_key: e.target.value }))}
                    placeholder="e.g., first_name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="label">Label *</Label>
                  <Input
                    id="label"
                    value={formData.label}
                    onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
                    placeholder="e.g., First Name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Field Type *</Label>
                  <Select value={formData.type} onValueChange={(value: any) => setFormData(prev => ({ ...prev, type: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Section</Label>
                  <Select
                    value={formData.section_id?.toString() || ''}
                    onValueChange={(value) => setFormData(prev => ({ 
                      ...prev, 
                      section_id: value ? parseInt(value) : undefined 
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No Section (Ungrouped)</SelectItem>
                      {sections.map(section => (
                        <SelectItem key={section.id} value={section.id.toString()}>
                          {section.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="placeholder">Placeholder</Label>
                <Input
                  id="placeholder"
                  value={formData.placeholder}
                  onChange={(e) => setFormData(prev => ({ ...prev, placeholder: e.target.value }))}
                  placeholder="Enter placeholder text"
                />
              </div>

              {formData.type === 'select' && (
                <div className="space-y-2">
                  <Label>Options</Label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={newOption}
                        onChange={(e) => setNewOption(e.target.value)}
                        placeholder="Add option..."
                        onKeyPress={(e) => e.key === 'Enter' && handleAddOption()}
                      />
                      <Button type="button" onClick={handleAddOption} size="sm">
                        Add
                      </Button>
                    </div>
                    {formData.options.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {formData.options.map((option, index) => (
                          <Badge key={index} variant="secondary" className="flex items-center gap-1">
                            {option}
                            <X
                              className="h-3 w-3 cursor-pointer"
                              onClick={() => handleRemoveOption(option)}
                            />
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="display" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="table_header">Table Header</Label>
                  <Input
                    id="table_header"
                    value={formData.table_header}
                    onChange={(e) => setFormData(prev => ({ ...prev, table_header: e.target.value }))}
                    placeholder="Header text for table display"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="col_span">Column Span</Label>
                  <Select
                    value={formData.col_span?.toString()}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, col_span: parseInt(value) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Column</SelectItem>
                      <SelectItem value="2">2 Columns</SelectItem>
                      <SelectItem value="3">3 Columns</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.show_in_table}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_in_table: checked }))}
                  />
                  <Label>Show in Table</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.show_in_dialog}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_in_dialog: checked }))}
                  />
                  <Label>Show in Dialog</Label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="behavior" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="order_index">Order Index</Label>
                  <Input
                    id="order_index"
                    type="number"
                    value={formData.order_index}
                    onChange={(e) => setFormData(prev => ({ ...prev, order_index: parseInt(e.target.value) || 0 }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="callback">Callback Function</Label>
                  <Input
                    id="callback"
                    value={formData.callback}
                    onChange={(e) => setFormData(prev => ({ ...prev, callback: e.target.value }))}
                    placeholder="e.g., updateFullPostalAddress"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={formData.is_required}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_required: checked }))}
                />
                <Label>Required Field</Label>
              </div>
            </TabsContent>

            <TabsContent value="sources" className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-base font-medium">Data Sources</Label>
                  <Button type="button" onClick={handleAddSource} size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Source
                  </Button>
                </div>
                
                {formData.sources.length === 0 ? (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <div className="text-gray-400 mb-2">
                      <Link className="h-8 w-8 mx-auto" />
                    </div>
                    <p className="text-gray-500 text-sm">
                      No data sources configured. Add a source to automatically populate this field.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formData.sources.map((source, index) => (
                      <div key={index} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              Priority {source.priority}
                            </Badge>
                            <Badge variant={
                              source.source_type === 'profile' ? 'default' :
                              source.source_type === 'document' ? 'secondary' : 'outline'
                            }>
                              {SOURCE_TYPES.find(t => t.value === source.source_type)?.label}
                            </Badge>
                          </div>
                          <Button
                            type="button"
                            onClick={() => handleRemoveSource(index)}
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs font-medium text-gray-700">Source Type</Label>
                            <Select
                              value={source.source_type}
                              onValueChange={(value: any) => handleSourceChange(index, 'source_type', value)}
                            >
                              <SelectTrigger className="h-9 mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SOURCE_TYPES.map(type => (
                                  <SelectItem key={type.value} value={type.value}>
                                    {type.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs font-medium text-gray-700">Priority</Label>
                            <Input
                              type="number"
                              value={source.priority}
                              onChange={(e) => handleSourceChange(index, 'priority', parseInt(e.target.value) || 1)}
                              className="h-9 mt-1"
                              min="1"
                              max="100"
                            />
                          </div>
                        </div>
                        
                        <div className="mt-3">
                          <Label className="text-xs font-medium text-gray-700">Table</Label>
                          <Input
                            value={source.table}
                            onChange={(e) => handleSourceChange(index, 'table', e.target.value)}
                            placeholder="e.g., user_profiles, documents, companies"
                            className="h-9 mt-1"
                          />
                        </div>
                        
                        <div className="mt-3">
                          <Label className="text-xs font-medium text-gray-700">JSON Path</Label>
                          <Input
                            value={source.path}
                            onChange={(e) => handleSourceChange(index, 'path', e.target.value)}
                            placeholder="e.g., personal_info.first_name, contact.email"
                            className="h-9 mt-1 font-mono text-sm"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Use dot notation for nested JSON fields
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
 
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowEditDialog(false);
              setEditingField(null);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button
              onClick={updateField}
              disabled={!formData.field_key || !formData.label}
            >
              Update Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
 
      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Confirm Delete
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the field "{deletingField?.label}"? 
              This action cannot be undone and may affect existing applications.
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDeleteDialog(false);
              setDeleteingField(null);
            }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteField}>
              Delete Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
 
      {/* Link Sources Dialog */}
      <Dialog open={showSourcesDialog} onOpenChange={setShowSourcesDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link className="h-5 w-5" />
              Manage Data Sources
            </DialogTitle>
            <DialogDescription>
              Configure data sources for "{sourcesField?.label}" field. Sources are checked in priority order.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="bg-blue-100 rounded-full p-1">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                </div>
                <div className="text-sm">
                  <p className="font-medium text-blue-800">Field Information</p>
                  <p className="text-blue-700 mt-1">
                    <span className="font-mono bg-white px-2 py-1 rounded text-xs">
                      {sourcesField?.field_key}
                    </span> - {sourcesField?.type} field
                    {sourcesField?.section && (
                      <span className="ml-2">
                        in <Badge variant="outline" className="text-xs">{sourcesField.section.title}</Badge>
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
 
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-base font-medium">Data Sources</Label>
                <Button type="button" onClick={handleAddSource} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Source
                </Button>
              </div>
              
              {formData.sources.length === 0 ? (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <div className="text-gray-400 mb-2">
                    <Link className="h-8 w-8 mx-auto" />
                  </div>
                  <p className="text-gray-500 text-sm">
                    No data sources configured. Add a source to automatically populate this field.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.sources
                    .sort((a, b) => a.priority - b.priority)
                    .map((source, index) => (
                    <div key={index} className="border rounded-lg p-4 bg-gray-50">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            Priority {source.priority}
                          </Badge>
                          <Badge variant={
                            source.source_type === 'profile' ? 'default' :
                            source.source_type === 'document' ? 'secondary' : 'outline'
                          }>
                            {SOURCE_TYPES.find(t => t.value === source.source_type)?.label}
                          </Badge>
                        </div>
                        <Button
                          type="button"
                          onClick={() => handleRemoveSource(index)}
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs font-medium text-gray-700">Source Type</Label>
                          <Select
                            value={source.source_type}
                            onValueChange={(value: any) => handleSourceChange(index, 'source_type', value)}
                          >
                            <SelectTrigger className="h-9 mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SOURCE_TYPES.map(type => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs font-medium text-gray-700">Priority</Label>
                          <Input
                            type="number"
                            value={source.priority}
                            onChange={(e) => handleSourceChange(index, 'priority', parseInt(e.target.value) || 1)}
                            className="h-9 mt-1"
                            min="1"
                            max="100"
                          />
                        </div>
                      </div>
                      
                      <div className="mt-3">
                        <Label className="text-xs font-medium text-gray-700">Table</Label>
                        <Input
                          value={source.table}
                          onChange={(e) => handleSourceChange(index, 'table', e.target.value)}
                          placeholder="e.g., user_profiles, documents, companies"
                          className="h-9 mt-1"
                        />
                      </div>
                      
                      <div className="mt-3">
                        <Label className="text-xs font-medium text-gray-700">JSON Path</Label>
                        <Input
                          value={source.path}
                          onChange={(e) => handleSourceChange(index, 'path', e.target.value)}
                          placeholder="e.g., personal_info.first_name, contact.email"
                          className="h-9 mt-1 font-mono text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Use dot notation for nested JSON fields
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
 
          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => {
              setShowSourcesDialog(false);
              setSourcesField(null);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={updateFieldSources} className="flex items-center gap-2">
              <Save className="h-4 w-4" />
              Save Sources
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}