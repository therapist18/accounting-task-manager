"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { NotificationCenter } from "@/components/notification-center"
import { DownloadDesktopAppButton } from "@/components/download-desktop-app-button"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, Settings, Menu, LayoutDashboard, LogOut, User } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { AuthUser } from "@/lib/auth/types"
import { clearSessionCache } from "@/lib/sessionCache"

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

export function Navbar() {
  const { user, loading } = useCurrentUser()
  const [isSigningOut, setIsSigningOut] = useState(false)

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
    // data-titlebar-*: in the desktop app this header doubles as the window's title
    // bar - it drags the window and leaves room for the min/max/close buttons.
    <header
      data-titlebar-drag
      data-titlebar-inset
      className="flex h-16 shrink-0 items-center gap-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-white/10 px-4 shadow-sm"
    >
      <SidebarTrigger className="md:hidden text-slate-600 dark:text-white/80 hover:bg-slate-100 dark:hover:bg-white/10" />
      <div className="flex flex-1 items-center gap-2">
        <div className="relative flex-1 max-w-md group">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-100 to-transparent dark:from-blue-900/20 dark:to-transparent rounded-lg blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-hover:text-blue-500 transition-colors duration-200" />
          <Input
            placeholder="Search tasks, clients, or departments..."
            className="relative pl-10 bg-white dark:bg-slate-800 border border-blue-100 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/50 transition-all duration-200 rounded-lg"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <DownloadDesktopAppButton />
        <NotificationCenter />

        {/* User Profile Dropdown */}
        {!loading && user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 p-2 rounded-lg hover:bg-blue-100 dark:hover:bg-white/10 transition-all duration-200">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm shadow-md">
                  {userInitials}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user.displayName || "User"}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.role?.replace(/_/g, " ") || ""}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl border border-slate-200 bg-white shadow-xl">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user.displayName || "User"}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user.email || ""}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings/access-controls" className="cursor-pointer flex items-center gap-3 px-4 py-3">
                  <Settings className="w-4 h-4" /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  setIsSigningOut(true)
                  try {
                    await fetch("/api/auth/logout", { method: "POST" })
                    clearSessionCache()
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
        )}

        {/* Loading state */}
        {loading && (
          <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse"></div>
        )}
      </div>

      {/* Sign out overlay */}
      {isSigningOut && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 backdrop-blur-sm">
          <div className="flex min-w-[280px] items-center gap-3 rounded-2xl border border-white/20 bg-white px-5 py-4 shadow-2xl text-slate-900 font-semibold">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            Signing you out securely...
          </div>
        </div>
      )}
    </header>
  )
}
