import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import DepartmentRates from "./department-rates"
import MPesaRates from "./mpesa-rates"

export default function RatesPage() {
  return (
    <div>
      <Tabs>
        <TabsList>
          <TabsTrigger value="department-rates">Department Rates</TabsTrigger>
          <TabsTrigger value="mpesa-rates">MPesa Rates</TabsTrigger>
        </TabsList>
        <TabsContent value="department-rates">
          <DepartmentRates />
        </TabsContent>
        <TabsContent value="mpesa-rates">
          <MPesaRates />
        </TabsContent>
      </Tabs>
    </div>
  )
}