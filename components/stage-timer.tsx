"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, AlertTriangle, CheckCircle, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { StageAutomation } from "@/lib/stage-automation"

interface StageTimerProps {
  stageName: string
  estimatedMinutes: number
  startedAt: string
  isOverdue?: boolean
  onCompleteStage?: () => void
  onNextStage?: () => void
  canTransition?: boolean
  autoCalculated?: boolean // New prop to indicate if timing is auto-calculated
}

export function StageTimer({
  stageName,
  estimatedMinutes,
  startedAt,
  isOverdue = false,
  onCompleteStage,
  onNextStage,
  canTransition = true,
  autoCalculated = true,
}: StageTimerProps) {
  const [timing, setTiming] = useState({
    remainingMs: 0,
    isOverdue: false,
    actualDuration: 0,
  })

  useEffect(() => {
    const updateTiming = () => {
      const newTiming = StageAutomation.calculateTimeRemaining(startedAt, estimatedMinutes)
      setTiming(newTiming)
    }

    updateTiming()
    const interval = setInterval(updateTiming, 1000)

    return () => clearInterval(interval)
  }, [startedAt, estimatedMinutes])

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000)
    const days = Math.floor(totalSeconds / (24 * 3600))
    const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`
    } else {
      return `${minutes}m ${seconds}s`
    }
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24

    if (days > 0) {
      return `${days}d ${remainingHours}h ${mins}m`
    } else if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins}m`
  }

  const getStatusColor = () => {
    if (timing.isOverdue || isOverdue) return "destructive"
    if (timing.remainingMs < estimatedMinutes * 60 * 1000 * 0.2) return "warning" // 20% remaining
    return "default"
  }

  const getStatusIcon = () => {
    if (timing.isOverdue || isOverdue) return <AlertTriangle className="h-4 w-4" />
    return <Clock className="h-4 w-4" />
  }

  const progressPercentage = timing.isOverdue
    ? 100
    : Math.max(0, 100 - (timing.remainingMs / (estimatedMinutes * 60 * 1000)) * 100)

  return (
    <Card className={cn("w-full", (timing.isOverdue || isOverdue) && "border-destructive")}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{stageName}</CardTitle>
          <div className="flex items-center gap-2">
            {autoCalculated && (
              <Badge variant="outline" className="text-xs">
                Auto-timed
              </Badge>
            )}
            <Badge variant={getStatusColor()} className="flex items-center gap-1">
              {getStatusIcon()}
              {timing.isOverdue || isOverdue ? "Overdue" : "Active"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-lg font-mono font-bold">
              {timing.isOverdue ? "00:00:00" : formatTime(timing.remainingMs)}
            </div>
            <p className="text-xs text-muted-foreground">{timing.isOverdue ? "Time exceeded" : "Time remaining"}</p>
          </div>
          <div>
            <div className="text-lg font-mono font-bold">{formatDuration(timing.actualDuration)}</div>
            <p className="text-xs text-muted-foreground">Actual time</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>Est: {formatDuration(estimatedMinutes)}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className={cn(
                "h-2 rounded-full transition-all duration-1000",
                timing.isOverdue || isOverdue
                  ? "bg-destructive"
                  : timing.remainingMs < estimatedMinutes * 60 * 1000 * 0.2
                    ? "bg-warning"
                    : "bg-primary",
              )}
              style={{ width: `${Math.min(100, progressPercentage)}%` }}
            />
          </div>
        </div>

        {canTransition && (
          <div className="flex gap-2">
            <Button onClick={onCompleteStage} variant="outline" className="flex-1">
              <CheckCircle className="h-4 w-4 mr-2" />
              Complete Stage
            </Button>
            <Button onClick={onNextStage} className="flex-1">
              <ArrowRight className="h-4 w-4 mr-2" />
              Next Stage
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
