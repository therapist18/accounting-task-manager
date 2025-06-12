import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BarChart3, TrendingUp, Clock, CheckCircle } from "lucide-react"

export default function ReportsPage() {
  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Reports & Analytics</h2>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Tasks This Month</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">127</div>
                <p className="text-xs text-muted-foreground">+12% from last month</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">89%</div>
                <p className="text-xs text-muted-foreground">+5% from last month</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg. Processing Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">3.2 days</div>
                <p className="text-xs text-muted-foreground">-0.5 days from last month</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Client Satisfaction</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">4.8/5</div>
                <p className="text-xs text-muted-foreground">+0.2 from last month</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Task Status Distribution</CardTitle>
              <CardDescription>Current status of all tasks in the system</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Count</TableHead>
                    <TableHead>Percentage</TableHead>
                    <TableHead>Trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Completed</TableCell>
                    <TableCell>89</TableCell>
                    <TableCell>70%</TableCell>
                    <TableCell className="text-green-600">+5%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Confirmed</TableCell>
                    <TableCell>24</TableCell>
                    <TableCell>19%</TableCell>
                    <TableCell className="text-blue-600">+2%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Registered</TableCell>
                    <TableCell>10</TableCell>
                    <TableCell>8%</TableCell>
                    <TableCell className="text-yellow-600">-1%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Cancelled</TableCell>
                    <TableCell>4</TableCell>
                    <TableCell>3%</TableCell>
                    <TableCell className="text-red-600">-1%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Performance</CardTitle>
              <CardDescription>Task completion metrics by user</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Tasks Completed</TableHead>
                    <TableHead>Avg. Time</TableHead>
                    <TableHead>Success Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">John Doe</TableCell>
                    <TableCell>45</TableCell>
                    <TableCell>2.8 days</TableCell>
                    <TableCell>95%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Jane Smith</TableCell>
                    <TableCell>38</TableCell>
                    <TableCell>3.1 days</TableCell>
                    <TableCell>92%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Mike Johnson</TableCell>
                    <TableCell>32</TableCell>
                    <TableCell>3.5 days</TableCell>
                    <TableCell>88%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Department Performance</CardTitle>
              <CardDescription>Task metrics by department</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead>Active Tasks</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Avg. Processing Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">KRA</TableCell>
                    <TableCell>45</TableCell>
                    <TableCell>156</TableCell>
                    <TableCell>3.2 days</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Immigration</TableCell>
                    <TableCell>32</TableCell>
                    <TableCell>89</TableCell>
                    <TableCell>8.5 days</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">NTSA</TableCell>
                    <TableCell>18</TableCell>
                    <TableCell>67</TableCell>
                    <TableCell>2.1 days</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">eCitizen</TableCell>
                    <TableCell>24</TableCell>
                    <TableCell>45</TableCell>
                    <TableCell>1.8 days</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
