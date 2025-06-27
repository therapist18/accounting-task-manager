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
import { AddFieldDialog } from "./components/dialogs/add-field-dialog";
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
  AlertCircle
} from "lucide-react";
import { toast } from '@/hooks/use-toast';
import supabase from '@/lib/supabase/client';
import * as XLSX from 'xlsx';

interface JobField {
  id: number;
  field_key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select';
  is_required: boolean;
  sources?: FieldSource[];
  options?: string[];
  created_at: string;
  updated_at: string;
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
  type: 'text' | 'date' | 'number' | 'select';
  is_required: boolean;
  options: string[];
  sources: FieldSource[];
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
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
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [requiredFilter, setRequiredFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Fetch job fields from the database
  const fetchJobFields = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tm_job_fields')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setFields(data || []);
    } catch (error) {
      console.error('Error fetching job fields:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch job fields',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch on component mount
  useEffect(() => {
    fetchJobFields();
  }, [fetchJobFields]);

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
    is_required: false,
    options: [],
    sources: []
  });
  const [editingField, setEditingField] = useState<JobField | null>(null);
  const [deletingField, setDeleteingField] = useState<JobField | null>(null);
  const [sourcesField, setSourcesField] = useState<JobField | null>(null);
  const [newOption, setNewOption] = useState('');

  // State for tables and fields
  const [tables, setTables] = useState<Array<{name: string, label: string}>>([]);
  const [fieldsForTable, setFieldsForTable] = useState<Array<{name: string, type: string}>>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string>('');

  // Computed values
  const filteredFields = useMemo(() => {
    return fields.filter(field => {
      const matchesSearch = field.field_key.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           field.label.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || field.type === typeFilter;
      const matchesRequired = requiredFilter === 'all' || 
                             (requiredFilter === 'required' && field.is_required) ||
                             (requiredFilter === 'optional' && !field.is_required);
      
      return matchesSearch && matchesType && matchesRequired;
    });
  }, [fields, searchQuery, typeFilter, requiredFilter]);

  const paginatedFields = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredFields.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredFields, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredFields.length / itemsPerPage);

  // API Functions
  const fetchFields = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tm_job_fields')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setFields(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch job fields",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addField = async () => {
    try {
      const fieldData = {
        field_key: formData.field_key,
        label: formData.label,
        type: formData.type,
        is_required: formData.is_required,
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
      fetchFields();
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
        is_required: formData.is_required,
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
      fetchFields();
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
      fetchFields();
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
        'Field Key': field.field_key,
        'Label': field.label,
        'Type': field.type,
        'Required': field.is_required ? 'Yes' : 'No',
        'Sources Count': field.sources?.length || 0,
        'Options': field.options?.join(', ') || '',
        'Created': new Date(field.created_at).toLocaleDateString(),
        'Updated': new Date(field.updated_at).toLocaleDateString(),
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Job Fields');
      
      XLSX.writeFile(workbook, `job-fields-${new Date().toISOString().split('T')[0]}.xlsx`);
      
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
      is_required: false,
      options: [],
      sources: []
    });
    setNewOption('');
    setSelectedTable('');
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
    setFormData(prev => {
      // Reset selected table when adding a new source
      setSelectedTable('');
      return {
        ...prev,
        sources: [...prev.sources, {
          source_type: 'profile',
          table: '',
          path: '',
          priority: prev.sources.length + 1
        }]
      };
    });
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
      
      // If table is changed, update the selected table
      if (field === 'table') {
        setSelectedTable(value);
      }
      
      return {
        ...prev,
        sources: updatedSources
      };
    });
  };

  const openEditDialog = (field: JobField) => {
    setEditingField(field);
    const fieldSources = field.sources || [];
    
    // Set the selected table if there are sources
    if (fieldSources.length > 0) {
      setSelectedTable(fieldSources[0].table);
    } else {
      setSelectedTable('');
    }
    
    setFormData({
      field_key: field.field_key,
      label: field.label,
      type: field.type,
      is_required: field.is_required,
      options: field.options || [],
      sources: fieldSources
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (field: JobField) => {
    setDeleteingField(field);
    setShowDeleteDialog(true);
  };

  const openSourcesDialog = (field: JobField) => {
    setSourcesField(field);
    const fieldSources = field.sources || [];
    
    // Set the selected table if there are sources
    if (fieldSources.length > 0) {
      setSelectedTable(fieldSources[0].table);
    } else {
      setSelectedTable('');
    }
    
    setFormData({
      field_key: field.field_key,
      label: field.label,
      type: field.type,
      is_required: field.is_required,
      options: field.options || [],
      sources: fieldSources
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
      fetchFields();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update sources",
        variant: "destructive",
      });
    }
  };

  // Fetch available tables
  const fetchTables = useCallback(async () => {
    try {
      setLoadingTables(true);
      const { data, error } = await supabase.rpc('get_all_tables');
      
      if (error) throw error;
      
      const formattedTables = data
        .filter((table: { table_name: string }) => 
          table.table_name && 
          !table.table_name.startsWith('pg_') && 
          !table.table_name.startsWith('sql_')
        )
        .map((table: { table_name: string }) => ({
          name: table.table_name,
          label: table.table_name
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
        }))
        .sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label));
      
      setTables(formattedTables);
    } catch (error) {
      console.error('Error fetching tables:', error);
      toast({
        title: "Error",
        description: "Failed to fetch database tables",
        variant: "destructive",
      });
    } finally {
      setLoadingTables(false);
    }
  }, []);

  // Fetch fields for selected table
  const fetchTableFields = useCallback(async (tableName: string) => {
    if (!tableName) {
      setFieldsForTable([]);
      return;
    }
    
    try {
      setLoadingFields(true);
      const { data, error } = await supabase.rpc('get_table_columns', {
        input_table_name: tableName
      });
      
      if (error) throw error;
      
      const formattedFields = data.map((col: { column_name: string; data_type: string }) => ({
        name: col.column_name,
        type: col.data_type
      }));
      
      setFieldsForTable(formattedFields);
    } catch (error) {
      console.error('Error fetching table fields:', error);
      toast({
        title: "Error",
        description: `Failed to fetch fields for table ${tableName}`,
        variant: "destructive",
      });
    } finally {
      setLoadingFields(false);
    }
  }, []);

  // Effects
  useEffect(() => {
    fetchFields();
    fetchTables();
  }, [fetchTables]);

  // Update fields when selected table changes
  useEffect(() => {
    if (selectedTable) {
      fetchTableFields(selectedTable);
    } else {
      setFieldsForTable([]);
    }
  }, [selectedTable, fetchTableFields]);

  return (
    <div className="mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Job Fields Management</h1>
          <p className="text-gray-600 mt-1">Manage application form fields and their data sources</p>
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

      {/* Filters */}
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

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field Key</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Sources</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : paginatedFields.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      {filteredFields.length === 0 && fields.length > 0 
                        ? "No fields match your filters" 
                        : "No fields found. Add your first field to get started."}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedFields.map((field) => (
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
                        <Badge variant={field.sources?.length ? "default" : "outline"}>
                          {field.sources?.length || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {new Date(field.updated_at).toLocaleDateString()}
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

      {/* Add Field Dialog */}
      <AddFieldDialog 
        open={showAddDialog} 
        onOpenChange={setShowAddDialog} 
        onSuccess={fetchJobFields} 
      />

      {/* Edit Field Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Field</DialogTitle>
            <DialogDescription>
              Update the field configuration.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
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
                <Label>Type *</Label>
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
                <Label>Required</Label>
                <div className="flex items-center space-x-2 pt-2">
                  <Switch
                    checked={formData.is_required}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_required: checked }))}
                  />
                  <Label className="text-sm text-gray-600">
                    {formData.is_required ? 'Required' : 'Optional'}
                  </Label>
                </div>
              </div>
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
 
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Data Sources</Label>
                <Button type="button" onClick={handleAddSource} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Source
                </Button>
              </div>
              {formData.sources.map((source, index) => (
                <div key={index} className="border rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-medium">Source {index + 1}</h4>
                    <Button
                      type="button"
                      onClick={() => handleRemoveSource(index)}
                      size="sm"
                      variant="ghost"
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Source Type</Label>
                      <Select
                        value={source.source_type}
                        onValueChange={(value: any) => handleSourceChange(index, 'source_type', value)}
                      >
                        <SelectTrigger className="h-8">
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
                      <Label className="text-xs">Priority</Label>
                      <Input
                        type="number"
                        value={source.priority}
                        onChange={(e) => handleSourceChange(index, 'priority', parseInt(e.target.value) || 1)}
                        className="h-8"
                        min="1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Table</Label>
                    <Input
                      value={source.table}
                      onChange={(e) => handleSourceChange(index, 'table', e.target.value)}
                      placeholder="e.g., profiles"
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Path</Label>
                    <Input
                      value={source.path}
                      onChange={(e) => handleSourceChange(index, 'path', e.target.value)}
                      placeholder="e.g., personal_info.first_name"
                      className="h-8"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
 
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