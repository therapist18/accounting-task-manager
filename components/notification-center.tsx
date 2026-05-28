"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bell, CheckCircle, AlertTriangle, Info, X, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

interface Notification {
  id: string
  title: string
  message: string
  type: "info" | "warning" | "success" | "error"
  isRead: boolean
  relatedTaskId?: string
  createdAt: string
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/bcl-diary/notifications")
      if (!res.ok) return
      const json = await res.json()
      setNotifications(json.notifications ?? [])
    } catch {
      // silently fail — don't break the navbar
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on mount
  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  // Refresh when panel opens
  useEffect(() => { if (open) fetchNotifications() }, [open, fetchNotifications])

  const unreadCount = notifications.filter(n => !n.isRead).length

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
  }

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
  }

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const getIcon = (type: string) => {
    switch (type) {
      case "success": return <CheckCircle className="h-4 w-4 text-green-600" />
      case "warning": return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case "error":   return <AlertTriangle className="h-4 w-4 text-red-600" />
      default:        return <Info className="h-4 w-4 text-blue-600" />
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    if (diffInHours < 1) return "Just now"
    if (diffInHours < 24) return `${diffInHours}h ago`
    return `${Math.floor(diffInHours / 24)}d ago`
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Notifications</CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={fetchNotifications}
                  disabled={loading}
                  title="Refresh"
                >
                  <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
                </Button>
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={markAllAsRead}>
                    Mark all read
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-80">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-slate-400">
                  <Bell className="h-6 w-6 mb-2 opacity-30" />
                  <p className="text-xs">{loading ? "Loading…" : "No notifications"}</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {notifications.map(notification => (
                    <div
                      key={notification.id}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors",
                        !notification.isRead && "bg-blue-50/40",
                      )}
                      onClick={() => markAsRead(notification.id)}
                    >
                      <div className="flex-shrink-0 mt-0.5">{getIcon(notification.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-xs font-semibold text-slate-800 leading-snug">{notification.title}</p>
                          <button
                            className="flex-shrink-0 text-slate-300 hover:text-red-500 transition-colors mt-0.5"
                            onClick={e => { e.stopPropagation(); removeNotification(notification.id) }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 leading-snug line-clamp-2">{notification.message}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{formatTime(notification.createdAt)}</p>
                      </div>
                      {!notification.isRead && (
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  )
}
