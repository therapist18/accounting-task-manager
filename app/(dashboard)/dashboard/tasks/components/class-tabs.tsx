// @ts-nocheck
"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Subdepartment } from "@/lib/types"
import { TaskStages } from "./task-stages"
import { UploadRequirements } from "./upload-requirements"

type ClassType = {
  name: string
  description: string | null
  requirements: Array<{
    name: string
    description: string | null
    is_required: boolean
  }>
}

export function ClassTabs({ subdepartment }: { subdepartment: Subdepartment }) {
  const classes = (subdepartment as any)?.classes || []
  
  if (classes.length === 0) {
    return <div>No classes found for this subdepartment</div>
  }

  return (
    <Tabs defaultValue="stages" className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="stages">Stages</TabsTrigger>
        <TabsTrigger value="upload">Upload Requirements</TabsTrigger>
      </TabsList>
      
      <TabsContent value="stages" className="mt-4">
        <TaskStages subdepartment={subdepartment} />
      </TabsContent>
      
      <TabsContent value="upload" className="mt-4">
        <UploadRequirements subdepartment={subdepartment} />
      </TabsContent>
    </Tabs>
  )
}
