// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, stageId, finalDocumentId, outcome, metadata } = body;

    if (!taskId || !stageId) {
      return NextResponse.json(
        { error: 'Missing required fields: taskId, stageId' },
        { status: 400 }
      );
    }

    // Task stages to workflow outcomes mapping
    const TASK_STAGE_WORKFLOW_MAPPING = {
      'enquiry': 'task_initiated',
      'in_progress': 'task_in_progress',
      'writeup_completed': 'task_completed',
      'endorsed': 'task_endorsed',
      'cancelled': 'task_cancelled'
    };

    // User-friendly outcome labels
    const WORKFLOW_OUTCOME_LABELS = {
      'task_completed': 'Document Write-up Completed',
      'task_endorsed': 'Task Endorsed',
      'task_cancelled': 'Task Cancelled',
      'task_initiated': 'Task Initiated',
      'task_in_progress': 'Task In Progress'
    };

    // 1. Get the task details to find the original document
    const { data: task, error: taskError } = await supabase
      .from('tm_tasks')
      .select(`
        id,
        individual_id,
        source_document_id,
        linked_document_type_id,
        job_description
      `)
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      console.error('Failed to fetch task for workflow update:', taskError);
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    // 2. Determine the workflow action and outcome
    let workflowAction = TASK_STAGE_WORKFLOW_MAPPING[stageId] || 'task_updated';
    let workflowOutcome = outcome || WORKFLOW_OUTCOME_LABELS[workflowAction] || 'Task Updated';

    // Handle task status changes (not stage completion)
    if (metadata?.taskStatusChange) {
      // For status changes, use the task status directly
      workflowAction = stageId; // stageId contains the task status for status changes
      workflowOutcome = outcome || WORKFLOW_OUTCOME_LABELS[workflowAction] || `Task ${stageId}`;
    }

    // 3. Create workflow log entry using registry's table structure
    const workflowLog = {
      individual_id: task.individual_id,
      document_type_id: task.linked_document_type_id,
      action_type: 'resolution', // Use registry's action_type field
      holds: [],
      comments: [],
      reminders: [],
      tasks: [],
      resolutions: [{
        outcome: workflowAction,
        note: workflowOutcome,
        effective_date: new Date().toISOString().split('T')[0], // Format as YYYY-MM-DD
        replacement_uploaded_doc_id: finalDocumentId,
        replacement_document_type_id: task.linked_document_type_id,
        created_at: new Date().toISOString(),
        dismissed: false,
        metadata: {
          taskId: taskId,
          stageId: stageId,
          completionDate: new Date().toISOString(),
          finalDocumentId: finalDocumentId,
          jobDescription: task.job_description,
          taskStatusChange: metadata?.taskStatusChange || false,
          previousStatus: metadata?.previousStatus,
          reason: metadata?.reason
        }
      }],
      created_by: 'system',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error: logError } = await supabase
      .from('document_workflow_logs')
      .insert(workflowLog);

    if (logError) {
      console.error('Failed to create workflow log:', logError);
      return NextResponse.json(
        { error: 'Failed to create workflow log' },
        { status: 500 }
      );
    }

    // 4. Update document status if this is a completion
    if (stageId === 'writeup_completed' && finalDocumentId) {
      const { error: docUpdateError } = await supabase
        .from('acc_portal_directors_documents')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', finalDocumentId);

      if (docUpdateError) {
        console.error('Failed to update document status:', docUpdateError);
        // Don't fail the whole operation, just log it
      }
    }

    console.log('Workflow update successful:', {
      taskId,
      stageId,
      workflowAction,
      workflowOutcome,
      finalDocumentId
    });

    return NextResponse.json({
      success: true,
      data: {
        workflowLog,
        action: workflowAction,
        outcome: workflowOutcome
      }
    });

  } catch (error) {
    console.error('Error in workflow update API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
