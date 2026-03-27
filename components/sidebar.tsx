// @ts-nocheck
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import {
  BarChart3,
  Calendar,
  CheckSquare,
  ChevronRight,
  Command,
  Database,
  FileText,
  LayoutDashboard,
  Loader2,
  LogOut,
  Mail,
  AppWindow,
  Moon,
  Settings,
  Sun,
  Settings2,
  Users,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar
} from "@/components/ui/sidebar"
import type { AuthUser } from "@/lib/auth/types"

const navItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    title: "Task Management",
    icon: CheckSquare,
    items: [
      { title: "Tasks Requirements", href: "/dashboard/tasks-requirements" },
      { title: "Tasks Tracking", href: "/dashboard/tasks" },
      { title: "Reports Dashboard", href: "/dashboard/reports" },
    ],
  },
  {
    title: "Administration",
    icon: Users,
    items: [{ title: "Users", href: "/dashboard/users-management" }],
  },
  {
    title: "Settings",
    icon: Settings2,
    items: [
      { title: "Departments", href: "/dashboard/departments/departments" },
      { title: "Stages", href: "/dashboard/departments/stages" },
      { title: "Rates", href: "/dashboard/departments/rates" },
      { title: "Webdata", href: "/dashboard/departments/webdata" },
      { title: "GOVT Upload Req", href: "/dashboard/departments/upload-requirements" },
      { title: "Guidelines", href: "/dashboard/departments/guidelines" },
      { title: "Job Specific Questions", href: "/dashboard/departments/job-specific-questions" },
      { title: "Documents + Fields", href: "/dashboard/departments/documents+fields" },
      { title: "Automations", href: "/dashboard/departments/automation" }
    ],
  },
  { title: "Templates", href: "/dashboard/templates", icon: FileText },
  { title: "Master Fields", href: "/dashboard/master-fields", icon: Database },
  {
    title: "Letters",
    icon: Mail,
    items: [
      { title: "Letter Generation", href: "/dashboard/letters" },
      { title: "Letterheads", href: "/dashboard/letters/letterheads" },
    ],
  },
  { title: "Diary", href: "/dashboard/diary", icon: Calendar },
  { title: "Applications", href: "/dashboard/applications", icon: AppWindow },
  { title: "Reports", href: "/dashboard/reports", icon: BarChart3 },
]

function useCurrentUser() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch("/api/auth/session")
        const json = await response.json()
        if (json?.authenticated && json?.user) setUser(json.user)
      } catch (error) { console.error(error) } finally { setLoading(false) }
    }
    fetchUser()
  }, [])
  return { user, loading }
}

export function AppSidebar() {
  const pathname = usePathname()
  const { user, loading } = useCurrentUser()
  const { state } = useSidebar()
  const [isDark, setIsDark] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const isCollapsed = state === "collapsed"

  useEffect(() => {
    const stored = localStorage.getItem("theme")
    if (stored === "dark") {
      setIsDark(true)
      document.documentElement.classList.add("dark")
    }
  }, [])

  const toggleDark = () => {
    setIsDark((prev) => {
      const next = !prev
      if (next) {
        document.documentElement.classList.add("dark")
        localStorage.setItem("theme", "dark")
      } else {
        document.documentElement.classList.remove("dark")
        localStorage.setItem("theme", "light")
      }
      return next
    })
  }

  const userInitials = user
    ? (
      (user.firstName?.[0] && user.lastName?.[0])
        ? (user.firstName[0] + user.lastName[0]).toUpperCase()
        : (user.displayName === "Super Admin"
          ? "SA"
          : (user.displayName?.slice(0, 2) ?? "U").toUpperCase())
    )
    : "U"

  return (
    <>
      {isSigningOut && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 backdrop-blur-sm">
          <div className="flex min-w-[280px] items-center gap-3 rounded-2xl border border-white/20 bg-white px-5 py-4 shadow-2xl text-slate-900 font-semibold">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            Signing you out securely...
          </div>
        </div>
      )}

      <Sidebar collapsible="icon" className="transition-all duration-300 border-r border-slate-200/60 dark:border-slate-800">

        {/* ─── Brand ─── */}
        <SidebarHeader className={cn("h-28 px-3 transition-all border-b border-slate-200/60 dark:border-slate-700", isCollapsed ? "justify-center" : "px-6")}>
          <Link href="/dashboard" className="flex items-center gap-4 group">
            <div className="flex aspect-square size-16 items-center justify-center rounded-2xl text-white shadow-xl shrink-0 overflow-hidden transition-all duration-300">
              <img src="/BCL logo.png" alt="BCL Logo" className="h-10 w-10 object-contain filter drop-shadow-sm" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col gap-1 leading-none">
                <span className="font-bold text-2xl text-slate-900 dark:text-white tracking-tight">BCL Task</span>
                <span className="text-[13px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Manager</span>
              </div>
            )}
          </Link>
        </SidebarHeader>

        {/* ─── Navigation ─── */}
        <SidebarContent className="py-6 bg-slate-50/50 dark:bg-slate-900/50">
          <SidebarGroup>
            <SidebarMenu className="gap-2">
              {navItems.map((item) => {
                const hasChildren = !!item.items
                const isActiveParent = hasChildren && item.items.some(sub => pathname === sub.href)
                const isActiveStandalone = pathname === item.href

                // ─── Case 1: Collapsed Sidebar + Sub-items ───
                // Render as a DropdownMenu flyout
                if (isCollapsed && hasChildren) {
                  return (
                    <SidebarMenuItem key={item.title}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuButton
                            tooltip={item.title}
                            isActive={isActiveParent}
                            className="min-h-[48px] h-auto py-3 px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                          >
                            {item.icon && <item.icon className="size-4.5 shrink-0 opacity-80" />}
                          </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start" sideOffset={16} className="w-64 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-3 shadow-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl">
                          <DropdownMenuLabel className="text-base uppercase font-bold text-slate-500 dark:text-slate-400 px-2 py-3 tracking-wider border-b border-slate-100 dark:border-slate-800">
                            {item.title}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator className="my-2" />
                          {item.items.map((sub) => (
                            <DropdownMenuItem key={sub.title} asChild className="rounded-xl my-1">
                              <Link href={sub.href} className={cn("w-full cursor-pointer px-2 py-3 rounded-xl transition-all duration-200 hover:bg-blue-50 dark:hover:bg-blue-900/20", pathname === sub.href && "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 text-blue-700 dark:text-blue-300 font-semibold border-l-4 border-l-blue-600 shadow-sm")}>
                                <span>{sub.title}</span>
                              </Link>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  )
                }

                // ─── Case 2: Expanded Sidebar + Sub-items ───
                // Render as a Collapsible accordion
                if (!isCollapsed && hasChildren) {
                  return (
                    <Collapsible key={item.title} asChild defaultOpen={isActiveParent} className="group/collapsible">
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton isActive={isActiveParent} className="min-h-[48px] h-auto py-3 px-4 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                            {item.icon && <item.icon className="size-4.5 shrink-0 opacity-80" />}
                            <span className="font-semibold text-sm ml-3 flex-1">{item.title}</span>
                            <ChevronRight className="ml-auto size-4 transition-transform duration-300 group-data-[state=open]/collapsible:rotate-90 opacity-60" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub className="ml-6 pl-4 border-l-2 border-slate-200 dark:border-slate-700 mt-2 mb-3 space-y-1">
                            {item.items.map((sub) => (
                              <SidebarMenuSubItem key={sub.title}>
                                <SidebarMenuSubButton asChild isActive={pathname === sub.href} className="min-h-[40px] h-auto py-2.5 px-2 text-base rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200">
                                  <Link href={sub.href} className={cn("w-full", pathname === sub.href && "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 text-blue-700 dark:text-blue-300 font-semibold border-l-3 border-l-blue-600 shadow-sm")}><span>{sub.title}</span></Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  )
                }

                // ─── Case 3: Standalone items (Expanded or Collapsed) ───
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActiveStandalone} tooltip={item.title} className="min-h-[48px] h-auto py-3 px-4 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                      <Link href={item.href} className={cn("w-full", isActiveStandalone && "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 text-blue-700 dark:text-blue-300 font-semibold border-l-4 border-l-blue-600 shadow-sm")}>
                        {item.icon && <item.icon className="size-4.5 shrink-0 opacity-80" />}
                        {!isCollapsed && <span className="font-semibold text-sm ml-3">{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        {/* ─── Footer ─── */}
        <div className={cn("p-4 border-t border-slate-200/60 dark:border-slate-700 flex gap-3 transition-all duration-300 dark:from-slate-800 dark:to-slate-900/50", isCollapsed ? "flex-col items-center py-6" : "px-6 py-5 flex-row items-center")}>
          <button onClick={toggleDark} className={cn("flex items-center justify-center rounded-2xl w-12 h-12 shrink-0 transition-all duration-300 shadow-md hover:shadow-lg border border-slate-200/60 dark:border-slate-700", isDark ? "bg-gradient-to-br from-slate-800 to-slate-900 text-yellow-400 hover:from-slate-700 hover:to-slate-800" : "bg-gradient-to-br from-white to-slate-50 text-blue-600 hover:from-slate-50 hover:to-white")}>
            {isDark ? <Sun className="h-5.5 w-5.5" /> : <Moon className="h-5.5 w-5.5" />}
          </button>

          {!isCollapsed && <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex-1">{isDark ? "Light Mode" : "Dark Mode"}</span>}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className={cn("relative h-12 w-12 rounded-2xl font-bold text-sm p-0 shrink-0 transition-all duration-300 shadow-md hover:shadow-lg border border-slate-200/60 dark:border-slate-700", isDark ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white hover:from-blue-500 hover:to-blue-600" : "bg-gradient-to-br from-slate-900 to-slate-800 text-white hover:from-slate-800 hover:to-slate-900")}>
                {userInitials}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isCollapsed ? "center" : "end"} side={isCollapsed ? "right" : "top"} sideOffset={16} className="z-50 w-72 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-3 shadow-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl">
              {user && (
                <>
                  <DropdownMenuLabel className="px-2 py-2 font-normal">
                    <div className="flex items-start gap-4 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 px-4 py-4 border border-slate-200/60 dark:border-slate-700">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-sm font-bold text-white shadow-lg">{userInitials}</div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{user.displayName}</p>
                        <p className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 mt-1.5 tracking-wide">{user.role.replace(/_/g, " ")}</p>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="my-3" />
                </>
              )}
              <DropdownMenuItem asChild className="rounded-xl my-1 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200"><Link href="/settings" className="w-full cursor-pointer flex items-center gap-3 px-4 py-3"><Settings className="size-4.5" /> Settings</Link></DropdownMenuItem>
              <DropdownMenuSeparator className="my-2" />
              <DropdownMenuItem onClick={async () => {
                setIsSigningOut(true)
                try {
                  await fetch("/api/auth/logout", { method: "POST" })
                  window.location.replace("/login")
                } catch (error) {
                  setIsSigningOut(false)
                  console.error("Logout failed:", error)
                }
              }} className="rounded-xl my-1 text-red-600 dark:text-red-400 cursor-pointer flex items-center gap-3 px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200"><LogOut className="size-4.5" /> Sign Out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SidebarRail />
      </Sidebar>
    </>
  )
}