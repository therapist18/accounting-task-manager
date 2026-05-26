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
  ChevronLeft,
  ChevronDown,
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
  X,
  BookOpen,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { AuthUser } from "@/lib/auth/types"

const navItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { title: "Email Inbox", href: "/dashboard/emails", icon: Mail, permission: "emails.view" },
  {
    title: "Task Management",
    icon: CheckSquare,
    items: [
      { title: "Tasks Requirements", href: "/dashboard/tasks-requirements", permission: "tasks_requirements.view" },
      { title: "Tasks Tracking", href: "/dashboard/tasks", permission: "tasks.view" },
      { title: "Reports Dashboard", href: "/dashboard/reports", permission: "reports.view" },
    ],
  },
  {
    title: "Administration",
    icon: Users,
    items: [{ title: "Users", href: "/dashboard/users-management", permission: "users.view" }],
  },
  {
    title: "Settings",
    icon: Settings2,
    items: [
      { title: "Departments", href: "/dashboard/departments/departments", permission: "settings.departments.view" },
      { title: "Stages", href: "/dashboard/departments/stages", permission: "settings.stages.view" },
      { title: "Rates", href: "/dashboard/departments/rates", permission: "settings.rates.view" },
      { title: "Upload Requirements", href: "/dashboard/departments/upload-requirements", permission: "settings.upload_requirements.view" },
      { title: "Guidelines", href: "/dashboard/departments/guidelines", permission: "settings.guidelines.view" },
      { title: "Documents + Fields", href: "/dashboard/departments/documents+fields", permission: "settings.documents_fields.view" },
      { title: "Automations", href: "/dashboard/departments/automation", permission: "settings.automations.view" },
      { title: "User Access", href: "/dashboard/settings/access-controls", permission: "settings.access_controls.view" }
    ],
  },
  { title: "Templates", href: "/dashboard/templates", icon: FileText, permission: "templates.view" },
  { title: "Master Fields", href: "/dashboard/master-fields", icon: Database, permission: "master_fields.view" },
  {
    title: "Letters",
    icon: Mail,
    items: [
      { title: "Letter Generation", href: "/dashboard/letters", permission: "letters.view" },
      { title: "Letterheads", href: "/dashboard/letters/letterheads", permission: "letterheads.view" },
    ],
  },
  { title: "Diary", href: "/dashboard/diary", icon: Calendar, permission: "diary.view" },
  {
    title: "BCL Task Diary",
    icon: BookOpen,
    items: [
      { title: "My Workspace", href: "/dashboard/bcl-task-diary", permission: "bcl_task_diary.view" },
      { title: "Recurring Templates", href: "/dashboard/bcl-task-diary/settings", permission: "bcl_task_diary.settings.view" },
      { title: "Admin Dashboard", href: "/dashboard/bcl-task-diary/admin", permission: "bcl_task_diary.admin.view" },
    ],
  },
  { title: "Applications", href: "/dashboard/applications", icon: AppWindow, permission: "applications.view" },
  { title: "Reports", href: "/dashboard/reports", icon: BarChart3, permission: "reports.view" },
]

function hasPermission(user, permission) {
  if (!permission) return true
  if (user?.isSuperAdmin) return true
  return Array.isArray(user?.permissions) && user.permissions.includes(permission)
}

function filterNavItems(items, user) {
  return items
    .map((item) => {
      if (item.items) {
        const visibleChildren = item.items.filter((sub) => hasPermission(user, sub.permission))
        return visibleChildren.length > 0 ? { ...item, items: visibleChildren } : null
      }
      return hasPermission(user, item.permission) ? item : null
    })
    .filter(Boolean)
}

function useCurrentUser() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch("/api/auth/session")
        const json = await response.json()
        if (json?.authenticated && json?.user) setUser(json.user)
        else window.location.replace("/login")
      } catch (error) { console.error(error) } finally { setLoading(false) }
    }
    fetchUser()
  }, [])
  return { user, loading }
}

export function AppSidebar() {
  const pathname = usePathname()
  const { user, loading } = useCurrentUser()
  const [isDark, setIsDark] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openItems, setOpenItems] = useState<string[]>([])
  const visibleNavItems = filterNavItems(navItems, user)

  useEffect(() => {
    const stored = localStorage.getItem("theme")
    if (stored === "dark") {
      setIsDark(true)
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

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 z-50 h-screen bg-blue-50 dark:bg-slate-900 flex flex-col transition-all duration-300 ease-in-out',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          isCollapsed ? 'lg:w-20' : 'lg:w-64',
          'w-64'
        )}
      >
        {/* Mobile Close Button */}
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden absolute top-4 right-4 p-2 rounded-lg hover:bg-blue-100 dark:hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5 text-slate-600 dark:text-white/60" />
        </button>

        {/* Desktop Collapse/Expand Toggle Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            "hidden lg:flex absolute top-4 p-2 rounded-lg transition-all duration-300 ease-in-out z-50 bg-white border-blue-100 border",
            isCollapsed
              ? "right-[-12px] bg-blue-100 hover:bg-blue-200 dark:bg-white/10 dark:hover:bg-white/20 shadow-lg border-2 border-blue-200 dark:border-white/20"
              : "right-4 hover:bg-blue-100 dark:hover:bg-white/10"
          )}
        >
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5 text-blue-700 dark:text-blue-300" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-blue-700 dark:text-blue-300" />
          )}
        </button>

        {/* Logo/Branding Section */}
        <div className={cn(
          "p-6 border-b border-blue-100 dark:border-white/10",
          isCollapsed ? "lg:p-4 lg:flex lg:justify-center" : ""
        )}>
          <Link href="/dashboard" className={cn(
            "flex items-center gap-3 group",
            isCollapsed && "lg:justify-center"
          )}>
            <div className="w-10 h-10 rounded-lg bg-white shadow-lg flex items-center justify-center group-hover:shadow-xl transition-shadow overflow-hidden animate-pulse-slow shrink-0">
              <img src="/BCL logo.png" alt="BCL Logo" className="w-full h-full object-contain p-1" />
            </div>
            {!isCollapsed && (
              <div className="flex-1 lg:block hidden">
                <h2 className="font-bold text-sm text-blue-700 dark:text-blue-300">BCL Task</h2>
                <p className="text-sm text-slate-500 dark:text-white/45">Manager</p>
              </div>
            )}
          </Link>
        </div>

        {/* Navigation Items */}
        <nav className={cn(
          "flex-1 px-3 py-6 space-y-2 overflow-y-auto",
          isCollapsed && "lg:px-2 lg:space-y-4"
        )}>
          {visibleNavItems.map((item, index) => {
            const hasChildren = !!item.items
            const isActiveParent = hasChildren && item.items.some(sub => pathname === sub.href)
            const isActiveStandalone = pathname === item.href

            // Case 1: Collapsed Sidebar + Sub-items - Render as DropdownMenu flyout
            if (isCollapsed && hasChildren) {
              return (
                <div key={item.title}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-3 rounded-lg font-medium text-sm transition-all duration-200 hover:scale-105',
                          isActiveParent
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 shadow-lg'
                            : 'text-gray-600 dark:text-white/60 hover:bg-blue-100 dark:hover:bg-white/10',
                          isCollapsed && 'lg:justify-center lg:px-3'
                        )}
                        title={item.title}
                      >
                        {item.icon && <item.icon className="w-5 h-5" />}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="w-56 rounded-xl border border-slate-200 bg-white shadow-xl">
                      <DropdownMenuLabel className="px-3 py-2 font-semibold text-slate-700">{item.title}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {item.items.map((sub) => (
                        <DropdownMenuItem key={sub.title} asChild>
                          <Link
                            href={sub.href}
                            className={cn(
                              "w-full cursor-pointer px-3 py-2 rounded-lg transition-colors",
                              pathname === sub.href
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 font-semibold"
                                : "text-slate-700 dark:text-white/60 hover:bg-blue-100 dark:hover:bg-white/10"
                            )}
                          >
                            {sub.title}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            }

            // Case 2: Expanded Sidebar + Sub-items - Render as collapsible
            if (!isCollapsed && hasChildren) {
              const isOpen = openItems.includes(item.title)
              return (
                <div key={item.title}>
                  <button
                    onClick={() => setOpenItems(prev => prev.includes(item.title) ? prev.filter(i => i !== item.title) : [...prev, item.title])}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 hover:scale-105',
                      isActiveParent
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 shadow-lg'
                        : 'text-gray-600 dark:text-white/60 hover:bg-blue-100 dark:hover:bg-white/10'
                    )}
                  >
                    {item.icon && <item.icon className="w-5 h-5" />}
                    <span className="flex-1 text-left">{item.title}</span>
                    <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="ml-6 mt-2 space-y-1">
                      {item.items.map((sub) => (
                        <Link
                          key={sub.title}
                          href={sub.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={cn(
                            'block px-4 py-2 rounded-lg text-sm transition-all duration-200 hover:scale-105',
                            pathname === sub.href
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 font-semibold'
                              : 'text-slate-700 dark:text-white/80 hover:bg-blue-100 dark:hover:bg-white/10'
                          )}
                        >
                          {sub.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            // Case 3: Standalone items
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 hover:scale-105',
                  isActiveStandalone
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 shadow-lg'
                    : 'text-gray-600 dark:text-white/60 hover:bg-blue-100 dark:hover:bg-white/10',
                  isCollapsed && 'lg:justify-center lg:px-3'
                )}
                title={isCollapsed ? item.title : undefined}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {item.icon && <item.icon className="w-5 h-5" />}
                {!isCollapsed && <span>{item.title}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Footer Section */}
        <div className={cn(
          "p-4 border-t border-blue-100 dark:border-white/10",
          isCollapsed && "lg:p-2"
        )}>
          {!isCollapsed && (
            <div className="space-y-3">
              {/* Theme Toggle */}
              <button
                onClick={toggleDark}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 dark:text-white/60 hover:bg-blue-100 dark:hover:bg-white/10 transition-colors"
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                <span className="text-sm">{isDark ? "Light Mode" : "Dark Mode"}</span>
              </button>

              {/* User Profile */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 dark:text-white/60 hover:bg-blue-100 dark:hover:bg-white/10 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-700 dark:text-blue-300 font-semibold text-sm">
                      {userInitials}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium truncate">{user?.displayName || "User"}</p>
                      <p className="text-xs text-slate-500 dark:text-white/45 truncate">{user?.role?.replace(/_/g, " ") || ""}</p>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-xl border border-slate-200 bg-white shadow-xl">
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/settings/access-controls" className="w-full cursor-pointer flex items-center gap-3 px-4 py-3">
                      <Settings className="w-4 h-4" /> Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      setIsSigningOut(true)
                      try {
                        await fetch("/api/auth/logout", { method: "POST" })
                        window.location.replace("/login")
                      } catch (error) {
                        setIsSigningOut(false)
                        console.error("Logout failed:", error)
                      }
                    }}
                    className="text-red-600 cursor-pointer flex items-center gap-3 px-4 py-3 hover:bg-red-50"
                  >
                    <LogOut className="w-4 h-4" /> Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Collapsed footer - just theme toggle and user dropdown */}
          {isCollapsed && (
            <div className="flex flex-col gap-2 items-center">
              <button
                onClick={toggleDark}
                className="p-2 rounded-lg text-gray-600 dark:text-white/60 hover:bg-blue-100 dark:hover:bg-white/10 transition-colors"
                title={isDark ? "Light Mode" : "Dark Mode"}
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-700 dark:text-blue-300 font-semibold text-sm hover:bg-blue-200 dark:hover:bg-blue-500/30 transition-colors"
                    title={user?.displayName || "User"}
                  >
                    {userInitials}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" side="right" className="w-56 rounded-xl border border-slate-200 bg-white shadow-xl">
                  <DropdownMenuLabel className="px-3 py-2">
                    <p className="font-semibold text-slate-900">{user?.displayName || "User"}</p>
                    <p className="text-xs text-slate-500 dark:text-white/45">{user?.role?.replace(/_/g, " ") || ""}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/settings/access-controls" className="w-full cursor-pointer flex items-center gap-3 px-4 py-3">
                      <Settings className="w-4 h-4" /> Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      setIsSigningOut(true)
                      try {
                        await fetch("/api/auth/logout", { method: "POST" })
                        window.location.replace("/login")
                      } catch (error) {
                        setIsSigningOut(false)
                        console.error("Logout failed:", error)
                      }
                    }}
                    className="text-red-600 cursor-pointer flex items-center gap-3 px-4 py-3 hover:bg-red-50"
                  >
                    <LogOut className="w-4 h-4" /> Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
