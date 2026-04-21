//@ts-nocheck
"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import DepartmentTasksManager from "./DepartmentTasksManager"
import TasksPage from "./TasksPage"
import { useCallback, useState } from "react";
import { Department } from "../departments/departments/database";
import { Task } from "@/lib/types";
import supabase from "@/lib/supabase/client";
import { toast } from "@/lib/hooks/use-toast";

export default function Page() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleStageStatusSave = useCallback(async (stageId: string, taskId: string, date: string, stages?: any[]) => {
    try {
      // 1. Get current task stages (Lightweight fetch)
      const { data: currentTask, error: fetchError } = await supabase
        .from('tm_tasks')
        .select('stages, status')
        .eq('id', taskId)
        .single()

      if (fetchError) throw fetchError

      // 2. Determine the new status based on stage ID
      let newStatus = 'completed';
      let taskStatusUpdate = {};

      if (stageId === 'caefd742-5de5-4341-a3bb-81d7b9dd2b73') {
        newStatus = 'endorsed';
        taskStatusUpdate = { status: 'endorsed' };
      } else if (stageId === '072b9710-45df-4a05-ba65-01b4ef29d61d') {
        newStatus = 'write_up_completed';
        taskStatusUpdate = { status: 'write_up_completed' };
      } else if (stageId === 'a19b270e-6d1e-4e6d-b2bc-f21db72cde08') {
        taskStatusUpdate = { status: 'in_progress' };
      }

      // 3. Prepare Update Payload
      const existingStages = currentTask?.stages || {}
      const timestamp = new Date().toISOString()

      // Get the stage configuration to copy officer_ids
      const stageConfig = stages?.find((s: any) => s.id === stageId)
      const stageOfficerIds = stageConfig?.officer_ids || []

      const updatedStages = {
        ...existingStages,
        [stageId]: {
          ...existingStages[stageId],
          date: date, // Using the passed date string directly
          status: newStatus,
          completedAt: timestamp,
          updatedAt: timestamp,
          officer_ids: existingStages[stageId]?.officer_ids || stageOfficerIds
        }
      }

      // 4. Execute Update
      const { error: updateError } = await supabase
        .from('tm_tasks')
        .update({
          ...taskStatusUpdate,
          stages: updatedStages,
          updated_at: timestamp
        })
        .eq('id', taskId)

      if (updateError) throw updateError

      toast({
        title: "Success",
        description: `Stage marked as ${newStatus.replace('_', ' ')}`,
      })

      return Promise.resolve()
    } catch (error: any) {
      console.error('Error saving stage status:', error)

      toast({
        title: "Error",
        description: "Failed to update stage status",
        variant: "destructive"
      })

      throw error
    }
  }, [])

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