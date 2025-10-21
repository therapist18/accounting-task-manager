// @ts-nocheck
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  Calculator,
  CheckSquare,
  ChevronDown,
  Cog,
  FileText,
  Home,
  LayoutDashboard,
  Users,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

// Updated data structure to support categories and nesting
const navItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    category: "Task Management",
    items: [
      {
        title: "Tasks Requirements",
        href: "/dashboard/tasks-requirements",
        icon: CheckSquare,
      },
      {
        title: "Tasks Tracking",
        href: "/dashboard/tasks",
        icon: CheckSquare,
      },
    ],
  },
  {
    category: "Administration",
    items: [
      {
        title: "Users",
        href: "/dashboard/users-management",
        icon: Users,
      }
    ],
  },
  {
    category: "Settings",
    items: [
      {
        title: "Departments",
        href: "/dashboard/departments/departments",
        icon: LayoutDashboard,
      },
       {
        title: "Stages",
        href: "/dashboard/departments/stages",
        icon: Cog,
      },
       {
        title: "Rates",
        href: "/dashboard/departments/rates",
        icon: Calculator,
      },
       {
        title: "GOVT Upload Req",
        href: "/dashboard/departments/upload-requirements",
        icon: FileText,
      },
       {
        title: "Guidelines",
        href: "/dashboard/departments/guidelines",
        icon: FileText,
      },
       {
        title: "Job Specific Questions",
        href: "/dashboard/departments/job-specific-questions",
        icon: FileText,
      },
       {
        title: "Documents + Fields",
        href: "/dashboard/departments/documents+fields",
        icon: FileText,
      },
    ],
  },
  {
    title: "Master Fields",
    href: "/dashboard/master-fields",
    icon: FileText,
  },
  {
    title: "Diary",
    href: "/dashboard/diary",
    icon: FileText,
  },
  {
    title: "Applications",
    href: "/dashboard/applications",
    icon: FileText,
  },
  {
    title: "Reports",
    href: "/dashboard/reports",
    icon: BarChart3,
  },
]

export function AppSidebar() {
  const pathname = usePathname()
  const [openCategories, setOpenCategories] = useState<string[]>([])

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    )
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <span className="font-bold text-xl">BCL Task Manager</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item, index) =>
                item.category ? (
                  // Render a collapsible category group
                  <SidebarGroup key={index} className="py-2">
                    <SidebarMenuButton
                      onClick={() => toggleCategory(item.category)}
                      className="flex justify-between"
                    >
                      <span>{item.category}</span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${openCategories.includes(item.category)
                            ? "rotate-180"
                            : ""
                          }`}
                      />
                    </SidebarMenuButton>
                    <AnimatePresence initial={false}>
                      {openCategories.includes(item.category) && (
                        <motion.div
                          initial="collapsed"
                          animate="open"
                          exit="collapsed"
                          variants={{
                            open: { opacity: 1, height: "auto" },
                            collapsed: { opacity: 0, height: 0 },
                          }}
                          transition={{ duration: 0.3, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <SidebarGroupContent className="pt-2">
                            {item.items.map((subItem) => (
                              <SidebarMenuItem key={subItem.title}>
                                <SidebarMenuButton
                                  asChild
                                  isActive={pathname === subItem.href}
                                >
                                  <Link href={subItem.href}>
                                    <subItem.icon />
                                    <span>{subItem.title}</span>
                                  </Link>
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            ))}
                          </SidebarGroupContent>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </SidebarGroup>
                ) : (
                  // Render a standalone menu item
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                  <Users className="h-3 w-3" />
                </div>
                <span className="text-lg">Demo User</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}