import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Save, Trash } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
      </div>

      <Tabs defaultValue="stages" className="space-y-4">
        <TabsList>
          <TabsTrigger value="stages">Stage Configuration</TabsTrigger>
          <TabsTrigger value="general">General Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="stages" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Stage Configuration</CardTitle>
              <CardDescription>Configure task stages for each subdepartment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="department">Department</Label>
                  <Select>
                    <SelectTrigger id="department">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kra">KRA</SelectItem>
                      <SelectItem value="immigration">Immigration</SelectItem>
                      <SelectItem value="ntsa">NTSA</SelectItem>
                      <SelectItem value="ecitizen">eCitizen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="subdepartment">Subdepartment</Label>
                  <Select>
                    <SelectTrigger id="subdepartment">
                      <SelectValue placeholder="Select subdepartment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tax-returns">Tax Returns</SelectItem>
                      <SelectItem value="pin-registration">PIN Registration</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Stages</h3>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Stage
                  </Button>
                </div>

                {/* Stage 1 */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between">
                      <CardTitle className="text-base">Stage 1: Pre-Verification</CardTitle>
                      <Button variant="ghost" size="sm">
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="stage-name-1">Stage Name</Label>
                        <Input id="stage-name-1" defaultValue="Pre-Verification" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label htmlFor="days-1">Days</Label>
                          <Input id="days-1" type="number" defaultValue="1" />
                        </div>
                        <div>
                          <Label htmlFor="hours-1">Hours</Label>
                          <Input id="hours-1" type="number" defaultValue="0" />
                        </div>
                        <div>
                          <Label htmlFor="minutes-1">Minutes</Label>
                          <Input id="minutes-1" type="number" defaultValue="0" />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="follow-up-1">Follow Up With</Label>
                        <Select>
                          <SelectTrigger id="follow-up-1">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bcl">BCL</SelectItem>
                            <SelectItem value="officer">Officer</SelectItem>
                            <SelectItem value="client">Client</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="process-type-1">Process Type</Label>
                        <Select>
                          <SelectTrigger id="process-type-1">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="online">Online</SelectItem>
                            <SelectItem value="manual">Manual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="requires-upload-1" />
                        <Label htmlFor="requires-upload-1">Requires Upload</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="template-required-1" />
                        <Label htmlFor="template-required-1">Template Required</Label>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="auto-message-1">Auto Message</Label>
                      <Input id="auto-message-1" placeholder="Message to send automatically at this stage" />
                    </div>
                  </CardContent>
                </Card>

                {/* Stage 2 */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between">
                      <CardTitle className="text-base">Stage 2: Document Submission</CardTitle>
                      <Button variant="ghost" size="sm">
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="stage-name-2">Stage Name</Label>
                        <Input id="stage-name-2" defaultValue="Document Submission" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label htmlFor="days-2">Days</Label>
                          <Input id="days-2" type="number" defaultValue="2" />
                        </div>
                        <div>
                          <Label htmlFor="hours-2">Hours</Label>
                          <Input id="hours-2" type="number" defaultValue="0" />
                        </div>
                        <div>
                          <Label htmlFor="minutes-2">Minutes</Label>
                          <Input id="minutes-2" type="number" defaultValue="0" />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="follow-up-2">Follow Up With</Label>
                        <Select>
                          <SelectTrigger id="follow-up-2">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bcl">BCL</SelectItem>
                            <SelectItem value="officer">Officer</SelectItem>
                            <SelectItem value="client">Client</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="process-type-2">Process Type</Label>
                        <Select>
                          <SelectTrigger id="process-type-2">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="online">Online</SelectItem>
                            <SelectItem value="manual">Manual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="requires-upload-2" checked />
                        <Label htmlFor="requires-upload-2">Requires Upload</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="template-required-2" />
                        <Label htmlFor="template-required-2">Template Required</Label>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="auto-message-2">Auto Message</Label>
                      <Input
                        id="auto-message-2"
                        placeholder="Message to send automatically at this stage"
                        defaultValue="Please upload all required documents for processing."
                      />
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <Button>
                    <Save className="h-4 w-4 mr-2" />
                    Save Configuration
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Configure general application settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="company-name">Company Name</Label>
                  <Input id="company-name" defaultValue="BCL Task Manager" />
                </div>
                <div>
                  <Label htmlFor="email">Contact Email</Label>
                  <Input id="email" type="email" defaultValue="contact@example.com" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button>
                  <Save className="h-4 w-4 mr-2" />
                  Save Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
