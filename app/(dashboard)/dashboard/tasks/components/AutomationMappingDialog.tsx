// Updated AutomationMappingDialog component to handle missing subDeptId
// In AutomationMappingDialog.tsx

"use client"

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, Zap } from 'lucide-react';
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
  masterFieldId: string;
}

interface JobFieldSource {
  path: string;
  table: string;
  priority: number;
  source_type: string;
}

interface JobField {
  id: string;
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
  task
}: AutomationMappingDialogProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAutomationRunning, setIsAutomationRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webData, setWebData] = useState<WebDataItem[]>([]);
  const [jobFields, setJobFields] = useState<Record<string, JobField>>({});
  
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

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const requirementId = getRequirementId();
        console.log('Fetching requirement with ID:', requirementId);
        
        // Log the exact query for debugging
        const query = `SELECT * FROM tm_class_requirements WHERE class_id = '${requirementId}'`;
        console.log('Executing query:', query);
        
        // Use Supabase client to fetch the requirement
        const { data: requirement, error: requirementError } = await supabase
          .from('tm_class_requirements')
          .select('*')
          .eq('class_id', requirementId)
          .maybeSingle();
          
        console.log('Supabase query result:', { 
          requirement, 
          error: requirementError,
          query
        });
          
        if (requirementError) {
          console.error('Failed to fetch class requirements:', requirementError);
          throw new Error(`Failed to fetch class requirements: ${requirementError.message}`);
        }
        
        console.log('Fetched requirement:', requirement);
        
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
            setWebData(fallbackReq.webData || []);
            
            // Continue with job fields fetching...
            const masterFieldIds = (fallbackReq.webData || [])
              .map((item: WebDataItem) => item.masterFieldId)
              .filter(Boolean);

            if (masterFieldIds.length > 0) {
              const { data: fields, error: fieldsError } = await supabase
                .from('tm_job_fields')
                .select('*')
                .in('id', masterFieldIds);
                
              if (fieldsError) {
                console.error('Error fetching job fields:', fieldsError);
                throw new Error('Failed to fetch job fields');
              }
              
              if (fields && fields.length > 0) {
                const fieldsMap = fields.reduce((acc: Record<string, JobField>, field: JobField) => {
                  acc[field.id] = field;
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

        const webData = requirement.webData;
        
        if (!webData || !Array.isArray(webData)) {
          console.log('No webdata found for requirement:', requirement);
          throw new Error('No webdata found for this requirement');
        }

        setWebData(webData);

        // Fetch all job fields for the masterFieldIds
        const masterFieldIds = webData
          .map((item: WebDataItem) => item.masterFieldId)
          .filter(Boolean);

        if (masterFieldIds.length > 0) {
          const { data: fields, error: fieldsError } = await supabase
            .from('tm_job_fields')
            .select('*')
            .in('id', masterFieldIds);
            
          if (fieldsError) {
            console.error('Error fetching job fields:', fieldsError);
            throw new Error('Failed to fetch job fields');
          }
          
          if (fields && fields.length > 0) {
            const fieldsMap = fields.reduce((acc: Record<string, JobField>, field: JobField) => {
              acc[field.id] = field;
              return acc;
            }, {});
            setJobFields(fieldsMap);
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
          stageId: requirementId
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

  const getSourceInfo = (masterFieldId: string) => {
    const field = jobFields[masterFieldId];
    if (!field || !field.sources || field.sources.length === 0) {
      return 'No source mapping found';
    }
    
    const source = field.sources[0]; // Get the highest priority source
    return `${source.table}.${source.path}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Automation Mapping</DialogTitle>
          <DialogDescription>
            View the data mapping for this requirement
          </DialogDescription>
        </DialogHeader>
        
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Field
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Variable Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {webData.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.name}
                        {item.isRequired && (
                          <span className="ml-1 text-red-500">*</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                        {item.variableName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.masterFieldId ? (
                          <div>
                            <div className="font-medium">
                              {jobFields[item.masterFieldId]?.label || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {getSourceInfo(item.masterFieldId)}
                            </div>
                          </div>
                        ) : (
                          'Not mapped'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        <div className="flex justify-between items-center mt-4">
          <div>
            {automationId && (
              <Button 
                onClick={handleRunAutomation}
                disabled={isAutomationRunning}
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