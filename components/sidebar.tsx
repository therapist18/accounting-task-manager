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

      <Sidebar collapsible="icon" className="transition-all duration-300">

        {/* ─── Brand ─── */}
        <SidebarHeader className={cn("h-24 px-2 transition-all", isCollapsed ? "justify-center" : "px-4")}>
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex aspect-square size-16 items-center justify-center rounded-xl text-white shadow-lg shrink-0 overflow-hidden">
              <img src="/BCL logo.png" alt="BCL Logo" className="h-10 w-10 object-contain" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col gap-0.25 leading-none">
                <span className="font-bold text-2xl text-slate-900 dark:text-white">BCL Task</span>
                <span className="text-[14px] font-bold uppercase tracking-widest text-blue-500">Manager</span>
              </div>
            )}
          </Link>
        </SidebarHeader>

        {/* ─── Navigation ─── */}
        <SidebarContent className="py-4">
          <SidebarGroup>
            <SidebarMenu className="gap-1.5">
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
                            className="min-h-[44px] h-auto py-2.5 px-3"
                          >
                            {item.icon && <item.icon className="size-4 shrink-0 opacity-70" />}
                          </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start" sideOffset={12} className="w-56 rounded-xl border border-slate-200 p-2 shadow-xl">
                          <DropdownMenuLabel className="text-[12px] uppercase font-bold text-slate-400 px-3 py-2 tracking-widest">
                            {item.title}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {item.items.map((sub) => (
                            <DropdownMenuItem key={sub.title} asChild className="rounded-lg">
                              <Link href={sub.href} className={cn("w-full cursor-pointer px-3 py-2", pathname === sub.href && "bg-white text-blue-700 font-semibold border-l-2 border-l-blue-600")}>
                                {sub.title}
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
                          <SidebarMenuButton isActive={isActiveParent} className="min-h-[44px] h-auto py-2.5 px-3">
                            {item.icon && <item.icon className="size-4 shrink-0 opacity-70" />}
                            <span className="font-medium text-sm ml-1 flex-1">{item.title}</span>
                            <ChevronRight className="ml-auto size-3.5 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 opacity-40" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub className="ml-4 pl-3 border-l border-slate-200 dark:border-white/10 mt-1 mb-2 space-y-1">
                            {item.items.map((sub) => (
                              <SidebarMenuSubItem key={sub.title}>
                                <SidebarMenuSubButton asChild isActive={pathname === sub.href} className="min-h-[34px] h-auto py-2 px-3 text-[13px]">
                                  <Link href={sub.href} className={cn("w-full", pathname === sub.href && "bg-white text-blue-700 font-semibold border-l-2 border-l-blue-600")}><span>{sub.title}</span></Link>
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
                    <SidebarMenuButton asChild isActive={isActiveStandalone} tooltip={item.title} className="min-h-[44px] h-auto py-2.5 px-3">
                      <Link href={item.href} className={cn("w-full", isActiveStandalone && "bg-white text-blue-700 font-semibold border-l-2 border-l-blue-600")}>
                        {item.icon && <item.icon className="size-4 shrink-0 opacity-70" />}
                        {!isCollapsed && <span className="font-medium text-sm ml-1">{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        {/* ─── Footer ─── */}
        <div className={cn("p-4 border-t flex gap-3 transition-all duration-300 bg-slate-50/50 dark:bg-transparent", isCollapsed ? "flex-col items-center py-6" : "px-6 py-4 flex-row items-center")}>
          <button onClick={toggleDark} className={cn("flex items-center justify-center rounded-xl w-10 h-10 shrink-0 transition-all", isDark ? "bg-slate-800 text-yellow-400" : "bg-white text-blue-600 border border-slate-200 shadow-sm")}>
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {!isCollapsed && <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex-1">{isDark ? "Light Mode" : "Dark Mode"}</span>}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className={cn("relative h-10 w-10 rounded-xl font-bold text-xs p-0 shrink-0", isDark ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-slate-900 text-white hover:bg-slate-800")}>
                {userInitials}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isCollapsed ? "center" : "end"} side={isCollapsed ? "right" : "top"} sideOffset={12} className="z-50 w-64 rounded-2xl border border-slate-200 p-2 shadow-xl">
              {user && (
                <>
                  <DropdownMenuLabel className="px-2 py-2 font-normal">
                    <div className="flex items-start gap-3 rounded-xl bg-slate-50 dark:bg-slate-900 px-3 py-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">{userInitials}</div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{user.displayName}</p>
                        <p className="text-[10px] uppercase font-bold text-blue-500 mt-1">{user.role.replace(/_/g, " ")}</p>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem asChild className="rounded-lg"><Link href="/settings" className="w-full cursor-pointer flex items-center gap-2 px-3 py-2"><Settings className="size-4" /> Settings</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={async () => {
                setIsSigningOut(true)
                try {
                  await fetch("/api/auth/logout", { method: "POST" })
                  window.location.replace("/login")
                } catch (error) {
                  setIsSigningOut(false)
                  console.error("Logout failed:", error)
                }
              }} className="rounded-lg text-red-600 cursor-pointer flex items-center gap-2 px-3 py-2"><LogOut className="size-4" /> Sign Out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SidebarRail />
      </Sidebar>
    </>
  )
}