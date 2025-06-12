"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Clock, AlertTriangle, Circle } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"

interface StageTimelineProps {
  timeline: Array<{
    stage: {
      id: string
      name: string
      timeEstimate: number
      followUpWith: string
      processType: string
    }
    estimatedStartDate: Date
    estimatedEndDate: Date
    status: "pending" | "active" | "completed" | "overdue"
  }>
}

export function StageTimeline({ timeline }: StageTimelineProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "active":
        return <Clock className="h-4 w-4 text-blue-600" />
      case "overdue":
        return <AlertTriangle className="h-4 w-4 text-red-600" />
      default:
        return <Circle className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 border-green-300"
      case "active":
        return "bg-blue-100 border-blue-300"
      case "overdue":
        return "bg-red-100 border-red-300"
      default:
        return "bg-gray-50 border-gray-200"
    }
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24

    if (days > 0) {
      return `${days}d ${remainingHours}h`
    } else if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins}m`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Stage Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {timeline.map((item, index) => (
            <div key={item.stage.id} className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                {getStatusIcon(item.status)}
                {index < timeline.length - 1 && <div className="w-px h-8 bg-border mt-2" />}
              </div>
              <div className={cn("flex-1 p-3 rounded-lg border", getStatusColor(item.status))}>
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium">{item.stage.name}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {format(item.estimatedStartDate, "MMM dd, HH:mm")} -{" "}
                      {format(item.estimatedEndDate, "MMM dd, HH:mm")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline">{formatDuration(item.stage.timeEstimate)}</Badge>
                    <Badge variant="secondary" className="text-xs">
                      {item.stage.processType}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <span>Follow up: {item.stage.followUpWith}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
