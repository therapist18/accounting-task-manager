"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Stages from "./stages"
import Departments from "./departments"

export default function DepartmentsPage() {
    return (
        <Tabs defaultValue="departments">
            <TabsList>
                <TabsTrigger value="departments">Departments</TabsTrigger>
                <TabsTrigger value="stages">Stages</TabsTrigger>
            </TabsList>
            <TabsContent value="departments">
                <Departments />
            </TabsContent>
            <TabsContent value="stages">
                <Stages />
            </TabsContent>
        </Tabs>
    )
}