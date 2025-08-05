import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Workflow } from "lucide-react"
import AutomationPage from "./automation/page"
export default function SettingsPage() {
  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
      </div>

      <Tabs defaultValue="automation" className="space-y-4">
        <TabsList>
          <TabsTrigger value="automation" className="flex items-center gap-2">
            <Workflow className="h-4 w-4" />
            <span>Automation</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="automation" className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-6">
              <AutomationPage />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
