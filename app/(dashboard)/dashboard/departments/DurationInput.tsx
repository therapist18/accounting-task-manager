// @ts-nocheck
"use client"

import React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface DurationInputProps {
  days: number
  hours: number
  minutes: number
  onDaysChange: (days: number) => void
  onHoursChange: (hours: number) => void
  onMinutesChange: (minutes: number) => void
  className?: string
}

export function DurationInput({
  days,
  hours,
  minutes,
  onDaysChange,
  onHoursChange,
  onMinutesChange,
  className
}: DurationInputProps) {
  return (
    <div className={`grid grid-cols-3 gap-3 ${className}`}>
      <div className="space-y-1">
        <Label className="text-sm">Days</Label>
        <Input
          type="number"
          min="0"
          value={days}
          onChange={(e) => onDaysChange(Math.max(0, parseInt(e.target.value) || 0))}
          className="text-center"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-sm">Hours</Label>
        <Input
          type="number"
          min="0"
          max="23"
          value={hours}
          onChange={(e) => onHoursChange(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
          className="text-center"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-sm">Minutes</Label>
        <Input
          type="number"
          min="0"
          max="59"
          value={minutes}
          onChange={(e) => onMinutesChange(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
          className="text-center"
        />
      </div>
    </div>
  )
}