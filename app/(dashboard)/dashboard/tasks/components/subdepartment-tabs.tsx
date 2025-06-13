// @ts-nocheck
"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getSubdepartments } from "@/lib/supabase/db"
import { useEffect, useState } from "react"
import { Subdepartment } from "@/lib/types"
import { ClassTabs } from "./class-tabs"

export function SubdepartmentTabs({ departmentId }: { departmentId: string }) {
  const [subdepartments, setSubdepartments] = useState<Subdepartment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadSubdepartments = async () => {
      try {
        const data = await getSubdepartments(departmentId)
        setSubdepartments(data)
      } catch (err) {
        console.error('Error loading subdepartments:', err)
        setError('Failed to load subdepartments')
      } finally {
        setLoading(false)
      }
    }

    loadSubdepartments()
  }, [departmentId])

  if (loading) return <div>Loading subdepartments...</div>
  if (error) return <div className="text-destructive">{error}</div>
  if (subdepartments.length === 0) return <div>No subdepartments found</div>

  return (
    <Tabs defaultValue={subdepartments[0]?.id} className="w-full">
      <TabsList className="w-full justify-start overflow-x-auto">
        {subdepartments.map((subdept) => (
          <TabsTrigger key={subdept.id} value={subdept.id}>
            {subdept.name}
          </TabsTrigger>
        ))}
      </TabsList>
      
      {subdepartments.map((subdept) => (
        <TabsContent key={subdept.id} value={subdept.id} className="mt-4">
          <ClassTabs subdepartment={subdept} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
