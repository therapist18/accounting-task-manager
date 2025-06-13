// @ts-nocheck
"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getDepartments } from "@/lib/supabase/db"
import { useEffect, useState } from "react"
import { Department } from "@/lib/types"
import { SubdepartmentTabs } from "./subdepartment-tabs"

export function DepartmentTabs() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const data = await getDepartments()
        setDepartments(data)
      } catch (err) {
        console.error('Error loading departments:', err)
        setError('Failed to load departments')
      } finally {
        setLoading(false)
      }
    }

    loadDepartments()
  }, [])

  if (loading) return <div>Loading departments...</div>
  if (error) return <div className="text-destructive">{error}</div>
  if (departments.length === 0) return <div>No departments found</div>

  return (
    <Tabs defaultValue={departments[0]?.id} className="w-full">
      <TabsList className="w-full justify-start overflow-x-auto">
        {departments.map((dept) => (
          <TabsTrigger key={dept.id} value={dept.id}>
            {dept.name}
          </TabsTrigger>
        ))}
      </TabsList>
      
      {departments.map((dept) => (
        <TabsContent key={dept.id} value={dept.id} className="mt-4">
          <SubdepartmentTabs departmentId={dept.id} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
