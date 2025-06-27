// @ts-nocheck
"use client"

import { useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { supabase } from "@/lib/supabase/client"
import WebData from "./webdata"
import Rates from "./rates/page"
import Stages from "./stages/page"
import Payments from "./payments"
import Departments from "./departments/page"
import DepartmentGuidelines from "./department-guidelines/page"
import UploadRequirements from "./upload-requirements/page"

type Department = {
  id: string
  name: string
  description: string
  tm_subdepartments?: Array<{
    id: number
    name: string
    description: string | null
    upload_requirements?: Array<{
      name: string
      description: string | null
    }>
    rates?: Array<{
      name: string
      description: string | null
    }>
    webdata?: Array<{
      name: string
      description: string | null
    }>
    classes?: Array<{
      name: string
      description: string | null
      requirements: Array<{
        name: string
        description: string | null
      }>
    }>
  }>
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('tm_departments')
          .select(`
            *,
            tm_subdepartments (
              *,
              classes,
              rates,
              webdata
            )
          `)
          .order('name')

        if (error) throw error
        setDepartments(data || [])
      } catch (err) {
        console.error('Error fetching departments:', err)
        setError('Failed to load departments. Please try again.')
      } finally {
        setLoading(false)
      }
    }


    fetchDepartments()
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading departments...</div>
  }

  if (error) {
    return <div className="text-red-500 p-8">{error}</div>
  }

  return (
    <Tabs defaultValue="departments">
      <TabsList>
        <TabsTrigger value="departments" >Departments</TabsTrigger>
        <TabsTrigger value="stages">Stages</TabsTrigger>
        <TabsTrigger value="rates">Rates</TabsTrigger>
        <TabsTrigger value="requirements">GOVT Upload Req</TabsTrigger>
        {/* <TabsTrigger value="webdata">Web Data</TabsTrigger>   */}
        <TabsTrigger value="guidelines">Guidelines</TabsTrigger>
        <TabsTrigger value="payments">Payments</TabsTrigger>
      </TabsList>
      <TabsContent value="departments" className="h-screen">
        <Departments />
      </TabsContent>
      <TabsContent value="stages" className="h-screen">
        <Stages />
      </TabsContent>
      <TabsContent value="requirements" className="h-screen">
        <UploadRequirements departments={departments} />
      </TabsContent>
      {/* <TabsContent value="webdata">
        <WebData departments={departments} />
      </TabsContent> */}
      <TabsContent value="rates" className="h-screen">
        <Rates departments={departments} />
      </TabsContent>
      <TabsContent value="payments" className="h-screen">
        <Payments departments={departments} />
      </TabsContent>
      <TabsContent value="guidelines" className="h-screen">
        <DepartmentGuidelines departments={departments} />
      </TabsContent>
    </Tabs>
  )
}