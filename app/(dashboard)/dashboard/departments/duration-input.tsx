"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type DurationInputProps = {
  days: number
  hours: number
  minutes: number
  onDaysChange: (value: number) => void
  onHoursChange: (value: number) => void
  onMinutesChange: (value: number) => void
  className?: string
}

export function DurationInput({
  days,
  hours,
  minutes,
  onDaysChange,
  onHoursChange,
  onMinutesChange,
  className = '',
}: DurationInputProps) {
  return (
    <div className={`grid grid-cols-3 gap-3 ${className}`}>
      <div>
        <Label htmlFor="days">Days</Label>
        <Input
          id="days"
          type="number"
          min="0"
          value={days}
          onChange={(e) => onDaysChange(Number(e.target.value) || 0)}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="hours">Hours</Label>
        <Input
          id="hours"
          type="number"
          min="0"
          max="23"
          value={hours}
          onChange={(e) => onHoursChange(Math.min(23, Number(e.target.value) || 0))}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="minutes">Minutes</Label>
        <Input
          id="minutes"
          type="number"
          min="0"
          max="59"
          value={minutes}
          onChange={(e) => onMinutesChange(Math.min(59, Number(e.target.value) || 0))}
          className="mt-1"
        />
      </div>
    </div>
  )
}
