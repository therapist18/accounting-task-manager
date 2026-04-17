"use client"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { NotificationCenter } from "@/components/notification-center"
import { Button } from "@/components/ui/button"
import { Search, Settings, Menu, LayoutDashboard } from "lucide-react"
import { Input } from "@/components/ui/input"

export function Navbar() {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 bg-white dark:bg-slate-900 border-b-2 border-blue-100 dark:border-white/10 px-4 shadow-md">
      <div className="flex flex-1 items-center gap-2">
        <div className="relative flex-1 max-w-md group">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-100 to-transparent dark:from-blue-900/20 dark:to-transparent rounded-lg blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-hover:text-blue-500 transition-colors duration-200" />
          <Input
            placeholder="Search tasks, clients, or departments..."
            className="relative pl-10 bg-white dark:bg-slate-800 border-2 border-blue-100 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/50 transition-all duration-200 rounded-lg"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <NotificationCenter />
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full blur-sm opacity-20"></div>
          <Button variant="ghost" size="sm" className="relative text-gray-600 dark:text-white/60 hover:bg-blue-100 dark:hover:bg-white/10 transition-all duration-200 hover:scale-105 hover:shadow-lg">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  )
}
