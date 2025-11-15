//@ts-nocheck
"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import DepartmentTasksManager from "./DepartmentTasksManager"
import TasksPage from "./TasksPage"
import { useState } from "react";
import { Department } from "../departments/departments/database";
import { Task } from "@/lib/types";
import supabase from "@/lib/supabase/client";

export default function Page() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const handleStageStatusSave = async (stageId: string, taskId: string, date: string) => {
    console.log('handleStageStatusSave called with:', { stageId, taskId, date });
    try {
      // Get current task data
      const { data: currentTask, error: fetchError } = await supabase
        .from('tm_tasks')
        .select('stages')
        .eq('id', taskId)
        .single()

      if (fetchError) throw fetchError

      // Parse existing stages or create new object
      const existingStages = currentTask.stages || {}

      // The date is already in DD/MM/YYYY format, so use it directly
      const formattedDate = date; // No need to re-parse!

      // Update stages object
      const updatedStages = {
        ...existingStages,
        [stageId]: {
          date: formattedDate,
          status: 'completed',
          completedAt: new Date().toISOString()
        }
      }

      // Check if this is confirmation stage
      const confirmationStageId = "a19b270e-6d1e-4e6d-b2bc-f21db72cde08"
      const shouldMoveToProgress = stageId === confirmationStageId

      // Update task with new stages data and potentially new status
      const { error: updateError } = await supabase
        .from('tm_tasks')
        .update({
          stages: updatedStages,
          status: shouldMoveToProgress ? 'in_progress' : undefined,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId)

      if (updateError) throw updateError

      // Refresh tasks after successful update
      const { data: tasksData, error: tasksError } = await supabase
        .from('tm_tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (tasksError) throw tasksError;

      setTasks(tasksData || []);
      return Promise.resolve()
    } catch (error) {
      console.error('Error saving stage status:', error)
      throw error
    }
  }

  return (
    <>
      <DepartmentTasksManager
        handleStageStatusSave={handleStageStatusSave}
      />
      {/* <Tabs defaultValue="overall">
        <div className="flex justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Task Manager</h2>
          </div>
          <TabsList>
            <TabsTrigger value="overall">OverallView</TabsTrigger>
            <TabsTrigger value="department">Department-Wise</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overall">
          <DepartmentTasksManager
            handleStageStatusSave={handleStageStatusSave}
          />
        </TabsContent>
        <TabsContent value="department">
          <TasksPage />
        </TabsContent>
      </Tabs> */}
    </>
  )
}