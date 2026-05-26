import type React from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Navbar } from "../../components/navbar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"
import { canAccessPath } from "@/lib/auth/access-controls"
import { getServerAppSession } from "@/lib/auth/session"

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
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col w-full">
          <Navbar />
          <main className="flex-1 relative overflow-y-auto p-4 md:p-6">
            {children}
          </main>
        </SidebarInset>
      </div>
      <Toaster />
    </SidebarProvider>
  )
}
