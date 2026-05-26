// @ts-nocheck
"use client"

import { Bell, BellOff, CheckCircle2, Clock, Mail, Smartphone, MessageSquare, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import type { BReminder, BTask, BNotificationChannel } from "../types"

interface RemindersViewProps {
  reminders: BReminder[]
  tasks: BTask[]
}

const CHANNEL_META: Record<BNotificationChannel, { label: string; icon: any; color: string }> = {
  in_app: { label: "In-App", icon: Bell, color: "text-blue-500" },
  push: { label: "Push", icon: Smartphone, color: "text-purple-500" },
  email: { label: "Email", icon: Mail, color: "text-green-500" },
  whatsapp: { label: "WhatsApp", icon: MessageSquare, color: "text-emerald-500" },
}

function timeAgo(isoDate: string) {
  try {
    const d = new Date(isoDate)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const future = diff < 0
    const abs = Math.abs(diff)
    const mins = Math.floor(abs / 60000)
    if (mins < 2) return future ? "just now" : "just now"
    if (mins < 60) return future ? `in ${mins}m` : `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return future ? `in ${hrs}h` : `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return future ? `in ${days}d` : `${days}d ago`
  } catch {
    return isoDate.slice(0, 10)
  }
}

export function RemindersView({ reminders, tasks }: RemindersViewProps) {
  const today = new Date().toISOString().split("T")[0]

  const pending = reminders.filter(r => !r.deliveredAt)
  const delivered = reminders.filter(r => !!r.deliveredAt)

  const ReminderRow = ({ reminder }: { reminder: BReminder }) => {
    const task = tasks.find(t => t.id === reminder.taskId)
    const delivered = !!reminder.deliveredAt
    const isPast = new Date(reminder.remindAt) <= new Date()

    return (
      <div className={cn(
        "flex items-start gap-4 p-4 rounded-xl border transition-all",
        delivered
          ? "bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 opacity-60"
          : isPast
          ? "bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900"
          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
      )}>
        {/* Icon */}
        <div className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
          delivered ? "bg-green-100" : isPast ? "bg-amber-100" : "bg-blue-100"
        )}>
          {delivered
            ? <CheckCircle2 className="w-4 h-4 text-green-600" />
            : isPast
            ? <Zap className="w-4 h-4 text-amber-600" />
            : <Clock className="w-4 h-4 text-blue-600" />
          }
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{reminder.taskTitle}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className={cn(
              "text-xs",
              delivered ? "text-green-600" : isPast ? "text-amber-600 font-semibold" : "text-slate-400"
            )}>
              {delivered
                ? `Delivered ${timeAgo(reminder.deliveredAt!)}`
                : isPast
                ? `Due ${timeAgo(reminder.remindAt)}`
                : `Scheduled ${timeAgo(reminder.remindAt)}`
              }
            </span>
          </div>

          {/* Channels */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {reminder.channels.map(ch => {
              const meta = CHANNEL_META[ch]
              if (!meta) return null
              return (
                <span key={ch} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                  <meta.icon className={cn("w-3 h-3", meta.color)} />
                  {meta.label}
                </span>
              )
            })}
          </div>
        </div>

        {/* Status badge */}
        <div className="shrink-0">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              delivered ? "text-green-600 border-green-200" : isPast ? "text-amber-600 border-amber-200" : "text-blue-600 border-blue-200"
            )}
          >
            {delivered ? "Delivered" : isPast ? "Pending" : "Scheduled"}
          </Badge>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Pending */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-4 h-4 text-amber-500" />
          <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
            Pending Reminders
            {pending.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                {pending.length}
              </span>
            )}
          </h3>
        </div>

        {pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 text-slate-400">
            <CheckCircle2 className="w-8 h-8 mb-2 text-green-400" />
            <p className="text-sm">All caught up — no pending reminders!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map(r => <ReminderRow key={r.id} reminder={r} />)}
          </div>
        )}
      </div>

      {/* Delivered */}
      {delivered.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BellOff className="w-4 h-4 text-slate-400" />
            <h3 className="font-semibold text-sm text-slate-500 dark:text-slate-400">
              Delivered ({delivered.length})
            </h3>
          </div>
          <div className="space-y-2">
            {delivered.slice(0, 5).map(r => <ReminderRow key={r.id} reminder={r} />)}
            {delivered.length > 5 && (
              <p className="text-xs text-center text-slate-400 pt-1">
                +{delivered.length - 5} more delivered reminders
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
