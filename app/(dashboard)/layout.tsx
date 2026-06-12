import type React from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Navbar } from "../../components/navbar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/toaster"
import { canAccessPath } from "@/lib/auth/access-controls"
import { getServerAppSession } from "@/lib/auth/session"
import AppSidebar from "@/components/sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerAppSession()
  if (!session) redirect("/login")

  const headerStore = await headers()
  const pathname = headerStore.get("x-pathname") ?? "/dashboard"
  const allowed = await canAccessPath(session.user, pathname)
  if (!allowed) redirect(pathname === "/dashboard" ? "/login" : "/dashboard")

  return (
    <SidebarProvider>
      {/* Change bg-background to a slightly muted color (e.g., bg-slate-50 or bg-zinc-950) */}
      <div className="flex h-screen w-screen overflow-hidden dark:bg-zinc-950">
        <AppSidebar />
        <SidebarInset className="flex flex-col w-full bg-transparent overflow-hidden">
          <Navbar />
          {/* Add margin and rounded corners to create the 'card' effect */}
          <main className="flex-1 relative overflow-y-auto m-2 mt-0 bg-white dark:bg-zinc-900">
            {children}
          </main>
        </SidebarInset>
      </div>
      <Toaster />
    </SidebarProvider>
  )
}
