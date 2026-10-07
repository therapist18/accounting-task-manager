import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CheckCircle, FileText, Users, Sparkles, LayoutDashboard, ArrowRight, UserPlus, FileUp, ClipboardList, Building2, Inbox } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { createServerSupabaseClient } from "@/lib/supabase"
import ImmigrationStatusCard from "@/components/immigration-status-card"

const quickLinks = [
  { label: "CV Generator", href: "/dashboard/cv-generator", icon: FileText, desc: "Generate professional CVs" },
  { label: "Employment Contracts", href: "/dashboard/employment-contracts", icon: FileText, desc: "Generate contracts" },
  { label: "New Individual", href: "/dashboard/individuals", icon: UserPlus, desc: "Add a new registry entry" },
  { label: "Create Task", href: "/dashboard/tasks", icon: ClipboardList, desc: "Assign a new task" },
  { label: "Task Basket", href: "/dashboard/task-basket", icon: Inbox, desc: "Companies past a deadline" },
  { label: "Upload File", href: "/dashboard/letters", icon: FileUp, desc: "Import documents" },
  { label: "Departments", href: "/dashboard/departments", icon: Building2, desc: "Manage departments" },
]

async function getOpenTaskBasketCount(): Promise<number> {
  try {
    const supabase = createServerSupabaseClient()
    const { count, error } = await supabase
      .from("task_basket_items")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
    if (error) throw error
    return count || 0
  } catch (error) {
    console.error("Failed to load open task basket count:", error)
    return 0
  }
}

export default async function DashboardPage() {
  const openTaskBasketCount = await getOpenTaskBasketCount()

  return (
    <div className="p-6 h-full overflow-y-auto bg-[#FAFAFC]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-custom-blue flex items-center justify-center">
            <LayoutDashboard className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-xs text-slate-500">Overview of your workspace</p>
          </div>
        </div>
        <Link href="/dashboard/cv-generator">
          <Button className="bg-custom-blue hover:bg-[#2d5a94] text-white font-semibold shadow-sm">
            <Sparkles className="mr-2 h-4 w-4 text-yellow-300 fill-yellow-300" />
            CV Generator
          </Button>
        </Link>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-6 gap-3 mb-6">
        {quickLinks.map((link) => {
          const Icon = link.icon
          return (
            <Link key={link.href} href={link.href}>
              <Card className="border border-slate-200 shadow-sm rounded-lg hover:border-custom-blue/30 hover:shadow-md transition-all cursor-pointer group bg-white">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-custom-blue transition-colors">
                    <Icon className="h-4 w-4 text-custom-blue group-hover:text-white transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{link.label}</p>
                    <p className="text-[10px] text-slate-400 truncate">{link.desc}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-custom-blue transition-colors shrink-0" />
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-slate-100 h-9 p-0.5 rounded-lg">
          <TabsTrigger value="overview" className="text-xs font-semibold py-1.5 px-4 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">Overview</TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs font-semibold py-1.5 px-4 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 m-0">
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border border-slate-200 shadow-sm rounded-lg bg-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-4">
                <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Tasks</CardTitle>
                <FileText className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-3xl font-black text-slate-900">127</div>
                <p className="text-[11px] text-emerald-600 font-medium mt-0.5">+5 from yesterday</p>
              </CardContent>
            </Card>
            <Card className="border border-slate-200 shadow-sm rounded-lg bg-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-4">
                <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Completed</CardTitle>
                <CheckCircle className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-3xl font-black text-slate-900">89</div>
                <p className="text-[11px] text-emerald-600 font-medium mt-0.5">+2 from yesterday</p>
              </CardContent>
            </Card>
            <Link href="/dashboard/task-basket">
              <Card className="border border-slate-200 shadow-sm rounded-lg bg-white hover:border-custom-blue/30 hover:shadow-md transition-all cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-4">
                  <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Task Basket (Open)</CardTitle>
                  <Inbox className="h-4 w-4 text-slate-400" />
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="text-3xl font-black text-slate-900">{openTaskBasketCount}</div>
                  <p className="text-[11px] text-amber-600 font-medium mt-0.5">Companies past a deadline</p>
                </CardContent>
              </Card>
            </Link>
            <Card className="border border-slate-200 shadow-sm rounded-lg bg-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-4">
                <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Users</CardTitle>
                <Users className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-3xl font-black text-slate-900">12</div>
                <p className="text-[11px] text-emerald-600 font-medium mt-0.5">+1 from last week</p>
              </CardContent>
            </Card>
          </div>

          <ImmigrationStatusCard />

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4 border border-slate-200 shadow-sm rounded-lg bg-white">
              <CardHeader className="px-4 pt-4 pb-0">
                <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Tasks</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-3">
                <div className="space-y-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Tax Filing for ABC Corp</p>
                        <p className="text-xs text-slate-400">KRA &bull; Tax Returns</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
                        <span className="text-xs font-medium text-slate-500">In Progress</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="col-span-3 border border-slate-200 shadow-sm rounded-lg bg-white">
              <CardHeader className="px-4 pt-4 pb-0">
                <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Department Overview</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-3">
                <div className="space-y-3">
                  {[
                    { name: "KRA", tasks: 45, pct: "45%" },
                    { name: "Immigration", tasks: 32, pct: "32%" },
                    { name: "NTSA", tasks: 18, pct: "18%" },
                    { name: "eCitizen", tasks: 24, pct: "24%" },
                  ].map((dept) => (
                    <div key={dept.name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-700">{dept.name}</p>
                        <p className="text-xs text-slate-400">{dept.tasks} tasks</p>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-custom-blue" style={{ width: dept.pct }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4 m-0">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4 border border-slate-200 shadow-sm rounded-lg bg-white">
              <CardHeader className="px-4 pt-4 pb-0">
                <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Task Completion Rate</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-3">
                <div className="h-[300px] flex items-center justify-center">
                  <p className="text-sm text-slate-400">Analytics charts will be displayed here</p>
                </div>
              </CardContent>
            </Card>
            <Card className="col-span-3 border border-slate-200 shadow-sm rounded-lg bg-white">
              <CardHeader className="px-4 pt-4 pb-0">
                <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Task Distribution</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-3">
                <div className="h-[300px] flex items-center justify-center">
                  <p className="text-sm text-slate-400">Distribution charts will be displayed here</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
