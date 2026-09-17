// @ts-nocheck

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
      .from('tm_tasks')
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
        { event: 'UPDATE', schema: 'public', table: 'tm_tasks' },
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
