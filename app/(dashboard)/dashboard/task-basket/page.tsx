"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Inbox } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/lib/hooks/use-toast"
import {
  getTaskBasketItems,
  TaskBasketItem,
  TaskBasketModule,
  TaskBasketStatus,
  TASK_BASKET_MODULE_LABELS,
} from "@/lib/supabase/taskBasket"
import TaskBasketTable from "./components/TaskBasketTable"

function currentCycleMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export default function TaskBasketPage() {
  const [items, setItems] = useState<TaskBasketItem[]>([])
  const [loading, setLoading] = useState(true)
  const [moduleFilter, setModuleFilter] = useState<TaskBasketModule | "all">("all")
  const [statusFilter, setStatusFilter] = useState<TaskBasketStatus | "all">("open")
  const [cycleMonth, setCycleMonth] = useState(currentCycleMonth())
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getTaskBasketItems({ module: moduleFilter, status: statusFilter, cycleMonth })
      setItems(data)
    } catch (error: any) {
      toast({ title: "Failed to load task basket", description: error.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [moduleFilter, statusFilter, cycleMonth, toast])

  useEffect(() => {
    load()
  }, [load])

  const openCount = useMemo(() => items.filter((i) => i.status === "open").length, [items])

  return (
    <div className="p-6 h-full overflow-y-auto bg-[#FAFAFC]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-custom-blue flex items-center justify-center">
            <Inbox className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Task Basket</h1>
            <p className="text-xs text-slate-500">
              Companies past a compliance deadline — Reception's shared open list ({openCount} open)
            </p>
          </div>
        </div>
      </div>

      <Card className="border border-slate-200 shadow-sm rounded-lg bg-white mb-4">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Select value={moduleFilter} onValueChange={(v) => setModuleFilter(v as TaskBasketModule | "all")}>
            <SelectTrigger className="w-[220px] h-9 text-xs">
              <SelectValue placeholder="Module" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {Object.entries(TASK_BASKET_MODULE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskBasketStatus | "all")}>
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>

          <input
            type="month"
            value={cycleMonth}
            onChange={(e) => setCycleMonth(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-xs shadow-sm"
          />
        </CardContent>
      </Card>

      <Card className="border border-slate-200 shadow-sm rounded-lg bg-white">
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading...</div>
          ) : (
            <TaskBasketTable
              items={items}
              onItemResolved={(id) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "resolved" } : i)))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
