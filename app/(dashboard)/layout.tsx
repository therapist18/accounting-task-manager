import type React from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { NavbarWrapper } from "../../components/navbar-wrapper"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/toaster"
import { canAccessPath } from "@/lib/auth/access-controls"
import { getServerAppSession } from "@/lib/auth/session"
import AppSidebar from "@/components/sidebar"
import TaskBasketNotifier from "@/components/task-basket-notifier"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headerStore = await headers()
  const pathname = headerStore.get("x-pathname") ?? "/dashboard"
  const search = headerStore.get("x-search") ?? ""

  const isPublicCvGenerator = pathname.startsWith("/dashboard/cv-generator")
  const hideNavbar = pathname.includes("/documents+fields")
  const session = await getServerAppSession()

  // Bypasses auth checks if it's the client portal (portal=true is in query parameters or there is no session at all)
  const isClientPortal = isPublicCvGenerator && (search.includes("portal=true") || !session)

  if (!isClientPortal) {
    if (!session) redirect("/login")
    const allowed = await canAccessPath(session.user, pathname)
    if (!allowed) redirect(pathname === "/dashboard" ? "/login" : "/dashboard")
  }

  if (isClientPortal) {
    return (
      <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-zinc-950">
        <main className="flex-1 relative dark:bg-zinc-900 bg-slate-50 overflow-hidden">
          {children}
        </main>
        <Toaster />
      </div>
    )
  }

  // Only people who can open the Task Basket are told about it filling up.
  const canSeeTaskBasket = !!session && (await canAccessPath(session.user, "/dashboard/task-basket"))

  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden dark:bg-zinc-950">
        <AppSidebar />
        <SidebarInset className="flex flex-col w-full min-w-0 bg-transparent overflow-hidden">
          {!hideNavbar && <NavbarWrapper />}
          {/* Add margin and rounded corners to create the 'card' effect */}
          <main className="flex-1 relative dark:bg-zinc-900">
            {children}
          </main>
        </SidebarInset>
      </div>
      <Toaster />
      {canSeeTaskBasket && session && <TaskBasketNotifier userId={String(session.user.id)} />}
    </SidebarProvider>
  )
}
