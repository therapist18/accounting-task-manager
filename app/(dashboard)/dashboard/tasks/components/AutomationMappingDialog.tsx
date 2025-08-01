// @ts-nocheck
"use client"

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Zap, User, Database, ArrowRight } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import supabase from '@/lib/supabase/client';

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
  // Add task object to extract subdepartment info if needed
  task?: any;
  // Add individual ID for data fetching
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
  // Updated to handle new structure
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
  
  // Extract individual ID from task object or use passed individualId
  const getIndividualId = () => {
    if (individualId) return individualId;
    if (task?.individual_id) return task.individual_id.toString();
    if (task?.principal_member) return task.principal_member.toString();
    return '';
  };
  
  const [currentIndividualId, setCurrentIndividualId] = useState(getIndividualId());
  
  // Enhanced getRequirementId function with better subdepartment handling
  const getRequirementId = () => {
    console.log('Constructing requirement ID with:', { 
      subDeptId, 
      classId, 
      isSubclass, 
      subclassId,
      taskId,
      task
    });
    
    // First try to get subDeptId from the passed parameter
    let effectiveSubDeptId = subDeptId;
    
    // If no subDeptId is provided, try to extract it from the task object
    if (!effectiveSubDeptId && task) {
      if (task.subdepartment?.id) {
        effectiveSubDeptId = task.subdepartment.id.toString();
        console.log('Extracted subDeptId from task.subdepartment.id:', effectiveSubDeptId);
      } else if (task.subdepartment_id) {
        effectiveSubDeptId = task.subdepartment_id.toString();
        console.log('Extracted subDeptId from task.subdepartment_id:', effectiveSubDeptId);
      } else if (task.sub_dept_id) {
        effectiveSubDeptId = task.sub_dept_id.toString();
        console.log('Extracted subDeptId from task.sub_dept_id:', effectiveSubDeptId);
      }
    }
    
    // If still no subDeptId, log warning and try to use classId alone
    if (!effectiveSubDeptId) {
      console.warn('No subDeptId could be determined from parameters or task object. Available task keys:', task ? Object.keys(task) : 'No task provided');
      
      // For subclass requirements, we need both subDeptId and subclassId
      if (isSubclass && subclassId) {
        console.error('Cannot construct subclass ID without subDeptId');
        return classId; // Fallback to just classId
      }
      
      // Fallback to just classId for regular class requirements
      console.log('Falling back to classId only:', classId);
      return classId;
    }
    
    // Construct the ID based on the type
    if (isSubclass && subclassId) {
      const id = `${effectiveSubDeptId}_${classId}_${subclassId}`;
      console.log('Constructed subclass ID:', id);
      return id;
    }
    
    // For regular class requirements
    const id = `${effectiveSubDeptId}_${classId}`;
    console.log('Constructed class ID:', id);
    return id;
  };

  const fetchSourceData = async (individualId: string) => {
    if (!individualId || !jobFields || Object.keys(jobFields).length === 0) {
      console.log('No individual ID or job fields available for data fetching');
      return;
    }

    setIsLoadingData(true);
    try {
      const sourceDataMap: Record<string, SourceData> = {};
      
      // Get all unique sources from job fields
      const allSources = Object.values(jobFields).flatMap(field => field.sources || []);
      const uniqueTables = [...new Set(allSources.map(source => source.table))];
      
      console.log('Fetching data from tables:', uniqueTables, 'for individual ID:', individualId);
      
      // Fetch data from each table
      for (const table of uniqueTables) {
        try {
          // Special handling for acc_portal_directors_documents table
          const queryField = table === 'acc_portal_directors_documents' ? 'director_id' : 'id';
          
          console.log(`Querying ${table} with ${queryField} = ${individualId}`);
          
          const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq(queryField, individualId)
            .single();
            
          if (error) {
            console.warn(`No data found in table ${table} for ${queryField} ${individualId}:`, error);
            sourceDataMap[table] = {};
          } else {
            sourceDataMap[table] = data || {};
            console.log(`Fetched data from ${table}:`, data);
          }
        } catch (err) {
          console.warn(`Error fetching from ${table}:`, err);
          sourceDataMap[table] = {};
        }
      }
      
      setSourceData(sourceDataMap);
    } catch (error) {
      console.error('Error fetching source data:', error);
      toast({
        title: 'Warning',
        description: 'Could not fetch all source data',
        variant: 'destructive',
      });
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
        console.log('Fetching requirement with ID:', requirementId);
        
        // Use Supabase client to fetch the requirement
        const { data: requirement, error: requirementError } = await supabase
          .from('tm_class_requirements')
          .select('*')
          .eq('class_id', requirementId)
          .maybeSingle();
          
        console.log('Supabase query result:', { 
          requirement, 
          error: requirementError
        });
          
        if (requirementError) {
          console.error('Failed to fetch class requirements:', requirementError);
          throw new Error(`Failed to fetch class requirements: ${requirementError.message}`);
        }
        
        if (!requirement) {
          console.error('No requirement found with ID:', requirementId);
          
          // Try alternative search strategies
          console.log('Trying alternative search strategies...');
          
          // Strategy 1: Search by just the classId
          const { data: fallbackReq, error: fallbackError } = await supabase
            .from('tm_class_requirements')
            .select('*')
            .eq('class_id', classId)
            .maybeSingle();
          
          if (fallbackReq && !fallbackError) {
            console.log('Found requirement using classId fallback:', fallbackReq);
            const webDataItems = fallbackReq.webData || [];
            setWebData(webDataItems);
            
            // Fetch job fields using the new masterFieldIds structure
            const allMasterFieldIds = webDataItems
              .flatMap((item: WebDataItem) => item.masterFieldIds || [])
              .filter(Boolean);

            if (allMasterFieldIds.length > 0) {
              const { data: fields, error: fieldsError } = await supabase
                .from('tm_job_fields')
                .select('*')
                .in('id', allMasterFieldIds);
                
              if (fieldsError) {
                console.error('Error fetching job fields:', fieldsError);
                throw new Error('Failed to fetch job fields');
              }
              
              if (fields && fields.length > 0) {
                const fieldsMap = fields.reduce((acc: Record<string, JobField>, field: JobField) => {
                  acc[field.id.toString()] = field;
                  return acc;
                }, {});
                setJobFields(fieldsMap);
              }
            }
            return; // Exit successfully
          }
          
          // If all strategies fail, throw error
          throw new Error(`No requirement found for ID: ${requirementId}. Also tried classId: ${classId}`);
        }

        const webDataItems = requirement.webData;
        
        if (!webDataItems || !Array.isArray(webDataItems)) {
          console.log('No webdata found for requirement:', requirement);
          throw new Error('No webdata found for this requirement');
        }

        setWebData(webDataItems);

        // Fetch all job fields for the masterFieldIds (now an array)
        const allMasterFieldIds = webDataItems
          .flatMap((item: WebDataItem) => item.masterFieldIds || [])
          .filter(Boolean);

        console.log('All master field IDs to fetch:', allMasterFieldIds);

        if (allMasterFieldIds.length > 0) {
          const { data: fields, error: fieldsError } = await supabase
            .from('tm_job_fields')
            .select('*')
            .in('id', allMasterFieldIds);
            
          if (fieldsError) {
            console.error('Error fetching job fields:', fieldsError);
            throw new Error('Failed to fetch job fields');
          }
          
          if (fields && fields.length > 0) {
            const fieldsMap = fields.reduce((acc: Record<string, JobField>, field: JobField) => {
              acc[field.id.toString()] = field;
              return acc;
            }, {});
            setJobFields(fieldsMap);
            console.log('Loaded job fields:', fieldsMap);
          }
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

  // Fetch source data when individual ID changes
  useEffect(() => {
    if (currentIndividualId && Object.keys(jobFields).length > 0) {
      fetchSourceData(currentIndividualId);
    }
  }, [currentIndividualId, jobFields]);

  const handleRunAutomation = async () => {
    if (!automationId || !taskId) {
      toast({
        title: 'Error',
        description: 'Missing required information to start automation',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsAutomationRunning(true);
      
      const response = await fetch(`/api/automations/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          automationId,
          taskId,
          stageId: requirementId,
          individualId: currentIndividualId
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to start automation');
      }

      const result = await response.json();
      
      toast({
        title: 'Success',
        description: result.message || 'Automation started successfully',
        variant: 'default',
      });

    } catch (error) {
      console.error('Error triggering automation:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start automation',
        variant: 'destructive',
      });
    } finally {
      setIsAutomationRunning(false);
    }
  };

  const getSourceInfo = (masterFieldIds: string[]) => {
    if (!masterFieldIds || masterFieldIds.length === 0) {
      return { sources: [], hasData: false };
    }
    
    const sources = masterFieldIds.map(fieldId => {
      const field = jobFields[fieldId];
      if (!field || !field.sources || field.sources.length === 0) {
        return null;
      }
      
      const source = field.sources[0]; // Get the highest priority source
      
      // Determine the query field based on table name
      const queryField = source.table === 'acc_portal_directors_document' ? 'director_id' : 'id';
      
      return {
        fieldId,
        fieldLabel: field.label,
        source: `${source.table}.${source.path}`,
        table: source.table,
        path: source.path,
        sourceType: source.source_type,
        queryField // Add this to show what field is used for querying
      };
    }).filter(Boolean);
    
    return { sources, hasData: sources.length > 0 };
  };

  const getSourceValue = (table: string, path: string) => {
    const tableData = sourceData[table];
    if (!tableData) return 'No data';
    
    // Handle nested paths like 'contact_details->>"email.primary"'
    if (path.includes('->>')) {
      const [jsonColumn, jsonPath] = path.split('->>');
      const cleanJsonPath = jsonPath.replace(/['"]/g, ''); // Remove quotes
      
      const jsonData = tableData[jsonColumn];
      if (typeof jsonData === 'object' && jsonData !== null) {
        // Handle nested object paths like "email.primary"
        const pathParts = cleanJsonPath.split('.');
        let value = jsonData;
        for (const part of pathParts) {
          value = value?.[part];
        }
        return value || 'No data';
      }
    }
    
    // Handle simple column paths
    return tableData[path] || 'No data';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Automation Mapping & Data Preview</DialogTitle>
          <DialogDescription>
            View the data mapping for this requirement and preview actual data
          </DialogDescription>
        </DialogHeader>
        
        {/* Individual ID Input */}
        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-md">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <Label htmlFor="individualId">Individual ID:</Label>
          </div>
          <Input
            id="individualId"
            value={currentIndividualId}
            onChange={(e) => setCurrentIndividualId(e.target.value)}
            placeholder="Enter individual ID to preview data"
            className="max-w-sm"
          />
          {task?.individual_id && (
            <div className="text-xs text-gray-500">
              From task: {task.individual_id} ({task.applicant_name || 'Unknown'})
            </div>
          )}
          {isLoadingData && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
        
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Loading mapping data...</span>
          </div>
        ) : error ? (
          <div className="text-red-500 p-4 bg-red-50 rounded-md">
            {error}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border rounded-md">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      WebData Field
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Variable
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Master Fields & Sources
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Current Data
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {webData.map((item) => {
                    const { sources, hasData } = getSourceInfo(item.masterFieldIds || []);
                    
                    return (
                      <tr key={item.id} className={!hasData ? 'bg-yellow-50' : ''}>
                        <td className="px-4 py-4 text-sm font-medium text-gray-900">
                          <div>
                            <div className="font-medium">
                              {item.efnsDisplayName || item.name}
                              {item.isRequired && (
                                <span className="ml-1 text-red-500">*</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              Type: {item.fieldType || item.type}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500 font-mono">
                          <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                            {item.variableName}
                          </code>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500">
                          {hasData ? (
                            <div className="space-y-2">
                              {sources.map((sourceInfo, idx) => (
                                <div key={idx} className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">
                                      {sourceInfo.fieldLabel}
                                    </Badge>
                                    <ArrowRight className="h-3 w-3 text-gray-400" />
                                    <code className="text-xs bg-blue-50 px-1 py-0.5 rounded">
                                      {sourceInfo.source}
                                    </code>
                                    <Badge variant="secondary" className="text-xs">
                                      {sourceInfo.sourceType}
                                    </Badge>
                                  </div>
                                  {sourceInfo.queryField !== 'id' && (
                                    <div className="text-xs text-gray-400 ml-2">
                                      Query: WHERE {sourceInfo.queryField} = {currentIndividualId}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-yellow-600 text-xs">
                              No master fields linked
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500">
                          {currentIndividualId ? (
                            hasData ? (
                              <div className="space-y-1">
                                {sources.map((sourceInfo, idx) => (
                                  <div key={idx} className="flex items-center gap-2">
                                    <Database className="h-3 w-3 text-blue-500" />
                                    <span className="font-mono text-xs bg-green-50 px-2 py-1 rounded">
                                      {getSourceValue(sourceInfo.table, sourceInfo.path)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">No mapping</span>
                            )
                          ) : (
                            <span className="text-gray-400 text-xs">Enter individual ID</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {webData.length === 0 && (
              <div className="text-center p-8 text-gray-500">
                <Database className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No webData fields found for this requirement</p>
              </div>
            )}
          </div>
        )}
        
        <div className="flex justify-between items-center mt-4">
          <div>
            {automationId && (
              <Button 
                onClick={handleRunAutomation}
                disabled={isAutomationRunning || !currentIndividualId}
                variant="default"
                className="gap-2 bg-amber-500 hover:bg-amber-600"
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