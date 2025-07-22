//@ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Users, Briefcase, History, Pencil, UserX, UserCheck } from "lucide-react"
import { TaskAssignmentDialog } from "@/components/task-assignment-dialog"
import { OfficersTable, type Officer } from "./officers-table"
import { UsersTable } from "./users-table"
import { fetchDepartments } from '../departments/departments/database'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"


export default function UsersPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [departments, setDepartments] = useState<Array<{
    id: string
    name: string
    subdepartments: Array<{
      id: string
      name: string
      taskManagerId?: string
      taskAssistantId?: string
    }>
  }>>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const refreshData = async () => {
    setRefreshKey(prev => prev + 1)
  }

  useEffect(() => {
    async function loadDepartments() {
      setIsLoading(true)
      try {
        const depts = await fetchDepartments()
        setDepartments(depts)
      } catch (error) {
        console.error('Failed to load departments:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadDepartments()
  }, [])



  if (isLoading) {
    return <div>Loading...</div>
  }

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-2" />
            Users
          </TabsTrigger>
          <TabsTrigger value="officers">
            <Briefcase className="h-4 w-4 mr-2" />
            Officers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <UsersTable
            users={[]}
            refreshKey={refreshKey}
          />
        </TabsContent>

        <TabsContent value="officers" className="space-y-4">
          <OfficersTable
            officers={[]}
            departments={departments}
            refreshKey={refreshKey}
          />
        </TabsContent>
      </Tabs>


    </div>
  )
}