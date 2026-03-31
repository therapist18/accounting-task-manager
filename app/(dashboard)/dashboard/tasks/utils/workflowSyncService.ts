// @ts-nocheck

// Task stages to workflow outcomes mapping
export const TASK_STAGE_WORKFLOW_MAPPING = {
  'enquiry': 'task_initiated',
  'in_progress': 'task_in_progress',
  'writeup_completed': 'task_completed',
  'endorsed': 'task_endorsed',
  'cancelled': 'task_cancelled',
  'deferred': 'task_deferred',
  'on_hold': 'task_on_hold'
};

// User-friendly outcome labels
export const WORKFLOW_OUTCOME_LABELS = {
  'task_completed': 'Document Write-up Completed',
  'task_endorsed': 'Task Endorsed',
  'task_cancelled': 'Task Cancelled',
  'task_initiated': 'Task Initiated',
  'task_in_progress': 'Task In Progress',
  'task_deferred': 'Task Deferred',
  'task_on_hold': 'Task On Hold'
};

/**
 * Updates document workflow when task stage is completed
 * This bridges gap between DepartmentTasksManager and DocumentWorkflowDialog systems
 * Uses registry's document_workflow_logs table structure
 */
export const updateDocumentWorkflow = async (
  taskId: string,
  stageId: string,
  finalDocumentId?: string,
  outcome?: string
) => {
  try {
    const response = await fetch('/api/workflow/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        taskId,
        stageId,
        finalDocumentId,
        outcome
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Failed to update workflow:', result.error);
      return { success: false, error: result.error };
    }

    console.log('Workflow update successful:', {
      taskId,
      stageId,
      action: result.data.action,
      outcome: result.data.outcome,
      finalDocumentId
    });

    return {
      success: true,
      data: result.data
    };

  } catch (error) {
    console.error('Error in updateDocumentWorkflow:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Updates document workflow when task status changes (delete, cancel, defer, hold, etc.)
 * This handles workflow updates for task management actions beyond stage completion
 */
export const updateWorkflowOnTaskStatusChange = async (
  taskId: string,
  taskStatus: string,
  individualId: string,
  linkedDocumentTypeId?: string,
  reason?: string
) => {
  try {
    // Map task status to workflow action
    let workflowAction = 'task_updated';
    let workflowOutcome = 'Task Status Updated';

    switch (taskStatus) {
      case 'cancelled':
        workflowAction = 'task_cancelled';
        workflowOutcome = 'Task Cancelled';
        break;
      case 'deferred':
        workflowAction = 'task_deferred';
        workflowOutcome = 'Task Deferred';
        break;
      case 'on_hold':
        workflowAction = 'task_on_hold';
        workflowOutcome = 'Task On Hold';
        break;
      case 'completed':
        workflowAction = 'task_completed';
        workflowOutcome = 'Document Write-up Completed';
        break;
      default:
        workflowOutcome = reason || `Task ${taskStatus}`;
        break;
    }

    const response = await fetch('/api/workflow/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        taskId,
        stageId: taskStatus, // Use task status as stageId for status changes
        finalDocumentId: null, // No specific document for status changes
        outcome: workflowOutcome,
        metadata: {
          taskStatusChange: true,
          previousStatus: taskStatus,
          reason: reason || `Task status changed to ${taskStatus}`
        }
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Failed to update workflow on status change:', result.error);
      return { success: false, error: result.error };
    }

    console.log('Workflow status update successful:', {
      taskId,
      taskStatus,
      workflowAction,
      workflowOutcome
    });

    return {
      success: true,
      data: result.data
    };

  } catch (error) {
    console.error('Error in updateWorkflowOnTaskStatusChange:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Gets workflow logs for an individual using registry's table structure
 */
export const getWorkflowLogsForIndividual = async (individualId: number) => {
  try {
    const response = await fetch('/api/workflow/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ individualId })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Failed to fetch workflow logs:', result.error);
      return [];
    }

    return result.data || [];
  } catch (error) {
    console.error('Error fetching workflow logs:', error);
    return [];
  }
};

/**
 * Gets the original document that triggered a task
 */
export const getOriginalDocumentForTask = async (taskId: string) => {
  try {
    const { data: task } = await supabase
      .from('tm_tasks_duplicate')
      .select('linked_document_type_id, individual_id')
      .eq('id', taskId)
      .single();

    if (!task) return null;

    // Get the most recent document of this type for this individual
    const { data: documents } = await supabase
      .from('acc_portal_directors_documents')
      .select('*')
      .eq('director_id', task.individual_id)
      .eq('document_id', task.linked_document_type_id)
      .order('created_at', { ascending: false })
      .limit(1);

    return documents?.[0] || null;
  } catch (error) {
    console.error('Error getting original document:', error);
    return null;
  }
};

/**
 * Sets up realtime subscription for workflow updates
 * Ensures UI updates immediately when workflow changes occur
 */
export const setupWorkflowRealtimeSubscription = (
  individualId: number,
  onWorkflowUpdate: (payload: any) => void
) => {
  try {
    const channel = supabase
      .channel(`workflow_updates:${individualId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'document_workflow_logs' },
        (payload) => {
          console.log('Realtime workflow update received:', payload);
          onWorkflowUpdate(payload);
        }
      )
      .subscribe();

    return channel;
  } catch (error) {
    console.error('Error setting up workflow realtime subscription:', error);
    return null;
  }
};

/**
 * Sets up realtime subscription for task updates
 * Ensures UI updates immediately when task status changes occur
 */
export const setupTaskRealtimeSubscription = (
  onTaskUpdate: (payload: any) => void
) => {
  try {
    const channel = supabase
      .channel('task_updates')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tm_tasks_duplicate' },
        (payload) => {
          console.log('Realtime task update received:', payload);
          onTaskUpdate(payload);
        }
      )
      .subscribe();

    return channel;
  } catch (error) {
    console.error('Error setting up task realtime subscription:', error);
    return null;
  }
};

/**
 * Cleanup function for realtime subscriptions
 */
export const cleanupRealtimeSubscriptions = (...channels: any[]) => {
  channels.forEach(channel => {
    if (channel) {
      supabase.removeChannel(channel);
    }
  });
};

/**
 * Checks if a stage completion should trigger workflow update
 */
export const shouldTriggerWorkflowUpdate = (stageId: string): boolean => {
  // Trigger workflow updates for key stages
  const triggerStages = ['writeup_completed', 'endorsed', 'cancelled'];
  return triggerStages.includes(stageId);
};
