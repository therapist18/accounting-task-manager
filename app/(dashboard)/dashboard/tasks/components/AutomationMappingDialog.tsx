// @ts-nocheck
"use client"

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Zap, User, Database } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from '@/hooks/use-toast';
import supabase from '@/lib/supabase/client';

// NOTE: Prop interfaces and other type definitions are kept from the original for functionality.
interface AutomationMappingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  requirementId: string;
  taskId?: string;
  automationId?: string;
  isSubclass?: boolean;
  subDeptId?: string;
  subclassId?: string;
  task?: any;
  individualId?: string;
}

interface WebDataItem {
  id: string;
  name: string;
  type: string;
  order: number;
  isVisible: boolean;
  isRequired: boolean;
  description: string;
  variableName: string;
  efnsDisplayName: string;
  fieldType: string;
  masterFieldIds: string[];
  arrayItems?: any[];
}

interface JobFieldSource {
  path: string;
  table: string;
  priority: number;
  source_type: string;
}

interface JobField {
  id: number;
  field_key: string;
  label: string;
  type: string;
  is_required: boolean;
  sources: JobFieldSource[];
  options: any;
  created_at: string;
  updated_at: string;
  section_id: string | null;
  order_index: number;
  placeholder: string | null;
  show_in_table: boolean;
  show_in_dialog: boolean;
  table_header: string | null;
  class_name: string | null;
  col_span: number;
  callback: any;
  data_source: any;
  depends_on: any;
  has_dependent: boolean;
  static_options: any;
}

interface SourceData {
  [key: string]: any;
}

export const AutomationMappingDialog = ({
  isOpen,
  onClose,
  classId,
  requirementId,
  taskId,
  automationId,
  isSubclass = false,
  subDeptId = '',
  subclassId = '',
  task,
  individualId
}: AutomationMappingDialogProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAutomationRunning, setIsAutomationRunning] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webData, setWebData] = useState<WebDataItem[]>([]);
  const [jobFields, setJobFields] = useState<Record<string, JobField>>({});
  const [sourceData, setSourceData] = useState<Record<string, SourceData>>({});
  const [editingCell, setEditingCell] = useState<{rowIndex: number, sourceIndex: number, table: string, path: string} | null>(null);
  const [editValue, setEditValue] = useState('');

  const getIndividualId = () => {
    if (individualId) return individualId;
    if (task?.individual_id) return task.individual_id.toString();
    if (task?.principal_member) return task.principal_member.toString();
    return '';
  };

  const [currentIndividualId, setCurrentIndividualId] = useState(getIndividualId());

  const getRequirementId = () => {
    let effectiveSubDeptId = subDeptId;
    if (!effectiveSubDeptId && task) {
      if (task.subdepartment?.id) effectiveSubDeptId = task.subdepartment.id.toString();
      else if (task.subdepartment_id) effectiveSubDeptId = task.subdepartment_id.toString();
      else if (task.sub_dept_id) effectiveSubDeptId = task.sub_dept_id.toString();
    }

    if (!effectiveSubDeptId) {
      if (isSubclass && subclassId) return classId;
      return classId;
    }

    if (isSubclass && subclassId) return `${effectiveSubDeptId}_${classId}_${subclassId}`;
    return `${effectiveSubDeptId}_${classId}`;
  };

  const getNestedValue = (obj: any, path: string): any => {
    if (!obj) return undefined;
    if (path.includes('->>')) {
      const [jsonColumn, jsonPath] = path.split('->>').map(s => s.trim().replace(/['"]/g, ''));
      const jsonData = obj[jsonColumn];
      if (typeof jsonData === 'object' && jsonData !== null) {
        return jsonPath.split('.').reduce((acc, key) =>
          acc && typeof acc === 'object' ? acc[key] : undefined, jsonData);
      }
      return undefined;
    }
    return path.split('.').reduce((acc, key) =>
      acc && typeof acc === 'object' ? acc[key] : undefined, obj);
  };

  const fetchSourceData = async (individualId: string) => {
    if (!individualId || !jobFields || Object.keys(jobFields).length === 0) return;

    setIsLoadingData(true);
    try {
      const sourceDataMap: Record<string, any> = {};
      const allSources = Object.values(jobFields).flatMap(field => field.sources || []);
      const uniqueTables = [...new Set(allSources.map(source => source.table))];

      for (const table of uniqueTables) {
        try {
          const queryField = table === 'acc_portal_directors_documents' ? 'director_id' : 'id';
          const { data, error } = await supabase.from(table).select('*').eq(queryField, individualId).maybeSingle();
          if (error) {
            const { data: multipleData, error: multipleError } = await supabase.from(table).select('*').eq(queryField, individualId);
            if (multipleError) sourceDataMap[table] = {};
            else sourceDataMap[table] = multipleData || [];
          } else {
            sourceDataMap[table] = data || {};
          }
        } catch (err) {
          sourceDataMap[table] = {};
        }
      }
      setSourceData(sourceDataMap);
    } catch (error) {
      console.error('Error fetching source data:', error);
      toast({ title: 'Warning', description: 'Could not fetch all source data', variant: 'destructive' });
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const requirementId = getRequirementId();

        const { data: requirement, error: requirementError } = await supabase
          .from('tm_class_requirements').select('*').eq('class_id', requirementId).maybeSingle();

        if (requirementError || !requirement) {
          const { data: fallbackReq, error: fallbackError } = await supabase
            .from('tm_class_requirements').select('*').eq('class_id', classId).maybeSingle();

          if (fallbackReq && !fallbackError) {
            const webDataItems = fallbackReq.webData || [];
            setWebData(webDataItems);
            const allMasterFieldIds = webDataItems.flatMap((item: WebDataItem) => item.masterFieldIds || []).filter(Boolean);
            if (allMasterFieldIds.length > 0) {
              const { data: fields, error: fieldsError } = await supabase.from('tm_job_fields').select('*').in('id', allMasterFieldIds);
              if (fieldsError) throw new Error('Failed to fetch job fields');
              if (fields) setJobFields(fields.reduce((acc, field) => ({ ...acc, [field.id.toString()]: field }), {}));
            }
            return;
          }
          throw new Error(`No requirement found for ID: ${requirementId}`);
        }

        const webDataItems = requirement.webData || [];
        setWebData(webDataItems);

        const allMasterFieldIds = webDataItems.flatMap((item: WebDataItem) => item.masterFieldIds || []).filter(Boolean);
        if (allMasterFieldIds.length > 0) {
          const { data: fields, error: fieldsError } = await supabase.from('tm_job_fields').select('*').in('id', allMasterFieldIds);
          if (fieldsError) throw new Error('Failed to fetch job fields');
          if (fields) setJobFields(fields.reduce((acc, field) => ({ ...acc, [field.id.toString()]: field }), {}));
        }
      } catch (error) {
        console.error('Error fetching mapping data:', error);
        setError('Failed to load mapping data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [isOpen, classId, requirementId, task]);

  useEffect(() => {
    if (currentIndividualId && Object.keys(jobFields).length > 0) {
      fetchSourceData(currentIndividualId);
    }
  }, [currentIndividualId, jobFields]);

  const handleRunAutomation = async () => {
    if (!automationId || !taskId) {
      toast({ title: 'Error', description: 'Missing required information to start automation', variant: 'destructive' });
      return;
    }
    try {
      setIsAutomationRunning(true);
      const response = await fetch(`/api/automations/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automationId, taskId, stageId: requirementId, individualId: currentIndividualId }),
      });
      if (!response.ok) throw new Error((await response.json()).message || 'Failed to start automation');
      toast({ title: 'Success', description: (await response.json()).message || 'Automation started successfully', variant: 'default' });
    } catch (error) {
      console.error('Error triggering automation:', error);
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to start automation', variant: 'destructive' });
    } finally {
      setIsAutomationRunning(false);
    }
  };

  const getSourceInfo = (masterFieldIds: string[]) => {
    if (!masterFieldIds || masterFieldIds.length === 0) return { sources: [], hasData: false };
    const sources = masterFieldIds.map(fieldId => {
      const field = jobFields[fieldId];
      if (!field || !field.sources || field.sources.length === 0) return null;
      const source = field.sources[0];
      return {
        fieldLabel: field.label,
        source: `${source.table}.${source.path}`,
        table: source.table,
        path: source.path,
      };
    }).filter(Boolean);
    return { sources, hasData: sources.length > 0 };
  };

  const getSourceValue = (table: string, path: string) => {
    const tableData = sourceData[table];
    if (!tableData) return <span className="text-red-600">Missing</span>;
    if (Array.isArray(tableData)) {
      if (tableData.length === 0) return <span className="text-red-600">Missing</span>;
      for (const row of tableData) {
        const value = getNestedValue(row, path);
        if (value !== undefined && value !== null) return String(value);
      }
      return <span className="text-red-600">Missing</span>;
    }
    const value = getNestedValue(tableData, path);
    return value !== undefined && value !== null ? String(value) : <span className="text-red-600">Missing</span>;
  };

  const startEditing = (rowIndex: number, sourceIndex: number, table: string, path: string, currentValue: string) => {
    setEditingCell({ rowIndex, sourceIndex, table, path });
    setEditValue(currentValue === 'Missing' ? '' : currentValue);
  };

  const stopEditing = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const saveEdit = async () => {
    if (!editingCell || !currentIndividualId) return;
    
    const { table, path } = editingCell;
    setIsLoadingData(true);
    
    try {
      let updateData = {};
      const pathParts = path.split('.');
      
      // Handle nested paths
      if (pathParts.length > 1) {
        let current = {};
        let temp = current;
        for (let i = 0; i < pathParts.length - 1; i++) {
          temp[pathParts[i]] = {};
          temp = temp[pathParts[i]];
        }
        temp[pathParts[pathParts.length - 1]] = editValue;
        updateData = current;
      } else {
        updateData = { [path]: editValue };
      }

      // Get the primary key field name based on table
      const queryField = table === 'acc_portal_directors_documents' ? 'director_id' : 'id';
      
      // First, try to update existing record
      const { data: existingData, error: fetchError } = await supabase
        .from(table)
        .select('*')
        .eq(queryField, currentIndividualId)
        .maybeSingle();

      if (fetchError && !existingData) {
        // If no record exists, create a new one
        const { error: insertError } = await supabase
          .from(table)
          .upsert({
            [queryField]: currentIndividualId,
            ...updateData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        
        if (insertError) throw insertError;
      } else {
        // Update existing record
        const { error: updateError } = await supabase
          .from(table)
          .update({
            ...updateData,
            updated_at: new Date().toISOString()
          })
          .eq(queryField, currentIndividualId);
        
        if (updateError) throw updateError;
      }

      // Refresh the data
      await fetchSourceData(currentIndividualId);
      toast({
        title: 'Success',
        description: 'Field updated successfully',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error updating field:', error);
      toast({
        title: 'Error',
        description: 'Failed to update field',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingData(false);
      stopEditing();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEdit();
    } else if (e.key === 'Escape') {
      stopEditing();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Automation Mapping & Data Preview</DialogTitle>
          <DialogDescription>
            View the data mapping for this requirement and preview source data for a specific individual.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 py-2 border-b">
          <Label htmlFor="individualId" className="whitespace-nowrap flex items-center gap-2">
            <User className="h-4 w-4 text-gray-500" />
            Individual ID:
          </Label>
          <Input
            id="individualId"
            value={currentIndividualId}
            onChange={(e) => setCurrentIndividualId(e.target.value)}
            placeholder="Enter individual ID to preview data"
            className="max-w-sm"
          />
          {isLoadingData && <Loader2 className="h-4 w-4 animate-spin" />}
          {task?.individual_id && (
            <div className="text-xs text-gray-500 hidden sm:block">
              (From task: {task.individual_id} - {task.applicant_name || 'Unknown'})
            </div>
          )}
        </div>

        <div className="flex-grow overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-8 h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading mapping data...</span>
            </div>
          ) : error ? (
            <div className="text-red-600 p-4 bg-red-50 rounded-md h-full flex items-center justify-center">
              {error}
            </div>
          ) : (
            <div className="space-y-4">
              {webData.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader className="bg-blue-500">
                      <TableRow>
                        <TableHead className="w-[50px] border-r text-white">
                          #
                        </TableHead>
                        <TableHead className="w-1/4 border-r text-white">
                          WebData Field
                        </TableHead>
                        <TableHead className="w-1/4 border-r text-white">
                          Source
                        </TableHead>
                        <TableHead className="w-1/4 text-white">
                          Current Data
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {webData.map((item, index) => {
                        const { sources, hasData } = getSourceInfo(item.masterFieldIds || []);

                        return (
                          <TableRow key={item.id}>
                            <TableCell className="align-top border-r w-[50px] ">{index + 1}</TableCell>
                            <TableCell className="align-top border-r ">
                              <div className="text-sm font-medium text-gray-900">
                                {item.efnsDisplayName || item.name}
                                {item.isRequired && <span className="ml-1 text-red-500">*</span>}
                              </div>
                              <div className="text-xs text-gray-500 font-mono mt-1">
                                {item.variableName}
                              </div>
                            </TableCell>
                            <TableCell className="align-top border-r">
                              {hasData ? (
                                <div className="space-y-2">
                                  {sources.map((sourceInfo, idx) => (
                                    <div key={idx} className="font-mono text-xs">
                                      <span className="font-semibold text-gray-800">{sourceInfo.fieldLabel}</span>
                                      <span className="text-gray-400 mx-1">→</span>
                                      <span>{sourceInfo.source}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">
                                  No source linked
                                </span>
                              )}
                            </TableCell>
                            <TableCell 
                              className="align-top border-r cursor-pointer hover:bg-gray-50"
                              onClick={() => {
                                if (currentIndividualId && hasData) {
                                  const sourceInfo = sources[0]; // For simplicity, edit the first source
                                  const currentValue = getSourceValue(sourceInfo.table, sourceInfo.path);
                                  startEditing(index, 0, sourceInfo.table, sourceInfo.path, currentValue);
                                }
                              }}
                            >
                              {editingCell?.rowIndex === index ? (
                                <div className="flex items-center space-x-2">
                                  <Input
                                    autoFocus
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    onBlur={saveEdit}
                                    className="h-8 text-sm"
                                  />
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      saveEdit();
                                    }}
                                  >
                                    Save
                                  </Button>
                                </div>
                              ) : currentIndividualId ? (
                                hasData ? (
                                  <div className="space-y-2 text-sm">
                                    {sources.map((sourceInfo, idx) => {
                                      const isEditing = editingCell?.rowIndex === index && editingCell?.sourceIndex === idx;
                                      return (
                                        <div 
                                          key={idx} 
                                          className={`p-1 rounded ${isEditing ? 'ring-1 ring-blue-500' : 'hover:bg-gray-100'}`}
                                        >
                                          {getSourceValue(sourceInfo.table, sourceInfo.path)}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400">No mapping</span>
                                )
                              ) : (
                                <span className="text-xs text-gray-400">Enter ID</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center p-8 text-gray-500 h-full flex flex-col items-center justify-center">
                  <Database className="h-10 w-10 mb-2 text-gray-300" />
                  <p>No web data fields found for this requirement.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t mt-auto">
          <div>
            {automationId && (
              <Button
                onClick={handleRunAutomation}
                disabled={isAutomationRunning || !currentIndividualId || isLoadingData}
                variant="default"
                className="gap-2"
              >
                {isAutomationRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Start Automation
              </Button>
            )}
          </div>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};