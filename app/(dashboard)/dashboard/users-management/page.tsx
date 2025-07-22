import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UsersPage from "./users/page";
import OfficersPage from "./officers/page";

export default function UsersManagementPage() {
    return (
       <Tabs defaultValue="users">
        <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="officers">Officers</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
            <UsersPage />
        </TabsContent>
        <TabsContent value="officers">
            <OfficersPage />
        </TabsContent>
       </Tabs>
    );
}