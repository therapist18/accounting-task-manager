//@ts-nocheck
"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import DepartmentTasksManager from "./DepartmentTasksManager"
import TasksPage from "./TasksPage"
import { useState } from "react";
import { Department } from "../departments/departments/database";
import { Task } from "@/lib/types";

export default function Page(){
    const [tasks, setTasks] = useState<Task[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    return (
    <Tabs defaultValue="overall">
      <TabsList> 
      <TabsTrigger value="overall">OverallView</TabsTrigger>
        <TabsTrigger value="department">Department-Wise</TabsTrigger>
      </TabsList>
      <TabsContent value="overall">
        <DepartmentTasksManager />
      </TabsContent>
      <TabsContent value="department">
        <TasksPage />
      </TabsContent>
    </Tabs>
    )
}