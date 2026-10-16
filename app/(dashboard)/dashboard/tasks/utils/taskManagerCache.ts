"use client"

import { createSessionResource, createSessionResourceFamily } from "@/lib/sessionCache"
import { fetchDepartments } from "../../departments/departments/database"
import { fetchCompanies, fetchStages, fetchTasks, fetchUploadedDocumentsForTasks } from "./taskManagerData"

/**
 * Session-wide caches for the tasks screen (see lib/sessionCache.ts).
 *
 * They outlive DepartmentTasksManager, so coming back to the tasks page shows
 * the last data immediately instead of a spinner; it then refreshes behind it.
 */

// Reference data: changes rarely, so reuse it for a while before refetching.
export const departmentsResource = createSessionResource(() => fetchDepartments(), { staleMs: 10 * 60_000 })
export const companiesResource = createSessionResource(() => fetchCompanies(), { staleMs: 10 * 60_000 })

export interface DepartmentTasksSnapshot {
  tasks: Awaited<ReturnType<typeof fetchTasks>>
  stages: any[]
  individualDocsMap: Awaited<ReturnType<typeof fetchUploadedDocumentsForTasks>>["individualDocsMap"]
  companyDocsMap: Awaited<ReturnType<typeof fetchUploadedDocumentsForTasks>>["companyDocsMap"]
}

/**
 * Tasks for one department. Tasks change constantly (other staff, realtime
 * events, local edits that only touch component state), so the cache is never
 * trusted on its own: it is shown instantly and revalidated on every visit. The
 * short staleMs only collapses the duplicate load React's dev mode triggers.
 */
export const tasksByDepartment = createSessionResourceFamily<string, DepartmentTasksSnapshot>(
  async (departmentId) => {
    const [companies, departments] = await Promise.all([companiesResource.load(), departmentsResource.load()])
    const [tasks, stages] = await Promise.all([
      fetchTasks(departmentId, undefined, companies as any),
      // Same rows; the two modules just declare their own Department type.
      fetchStages(departmentId, departments as any),
    ])
    const { individualDocsMap, companyDocsMap } = await fetchUploadedDocumentsForTasks(tasks)
    return { tasks, stages, individualDocsMap, companyDocsMap }
  },
  { staleMs: 5_000 }
)
