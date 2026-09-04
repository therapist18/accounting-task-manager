"use client"

import { usePathname } from "next/navigation"
import { Navbar } from "./navbar"
import { SidebarTrigger } from "@/components/ui/sidebar"

const HIDDEN_PATHS = [
  "/dashboard/tasks",
  "/dashboard/employment-contracts",
  "/dashboard/consultancy-contracts",
  "/dashboard/summary-reports",
  "/dashboard/company-profiles",
  "/dashboard/letters",
  "/dashboard/passport-endorsement",
]

export function NavbarWrapper() {
  const pathname = usePathname()
  const showNavbar = !HIDDEN_PATHS.some((p) => pathname.startsWith(p))

  if (showNavbar) {
    return <Navbar />
  }

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-4 md:hidden">
      <SidebarTrigger className="text-slate-600 dark:text-white/80 hover:bg-slate-100 dark:hover:bg-white/10" />
    </div>
  )
}
