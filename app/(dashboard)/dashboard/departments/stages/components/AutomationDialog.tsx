"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/hooks/use-toast"
import { Loader2, Trash2, Save, Plus, Edit } from "lucide-react"
import * as z from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase/client"

// Same Zod schema
const automationFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  webhook_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  webhook_method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
  is_active: z.boolean().default(true),
  category: z
    .enum([
      "general",
      "notifications",
      "integrations",
      "form_automation",
      "workflows",
      "data_sync",
      "custom",
    ])
    .default("general"),
  max_concurrent_runs: z.number().min(1).default(1),
  queue_priority: z.number().default(0),
  async_processing: z.boolean().default(false),
  login: z.object({
    url: z.string().url("Must be a valid URL").optional(),
    email: z.string().email("Must be a valid email"),
    idNumber: z.string().min(1, "ID Number is required"),
    password: z.string().min(1, "Password is required")
  }).optional(),
  trigger_conditions: z.record(z.any()).default({}),
  form_fields: z.array(z.any()).default([]),
})

type AutomationFormValues = z.infer<typeof automationFormSchema>
type Automation = AutomationFormValues & { 
  id: string
  created_at?: string
  updated_at?: string
}

interface AutomationDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSave: (automation: any) => Promise<void>
  initialData?: any
}

export function AutomationDialog({
  isOpen,
  onOpenChange,
  onSave,
  initialData,
}: AutomationDialogProps) {
  // State for tabs and data
  const [activeTab, setActiveTab] = useState(initialData ? "editor" : "existing")
  const [automations, setAutomations] = useState<Automation[]>([])
  const [isLoadingList, setIsLoadingList] = useState(false)
  const [selectedAutomation, setSelectedAutomation] = useState<Automation | null>(initialData || null)

  // State for form actions
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const form = useForm<AutomationFormValues>({
    resolver: zodResolver(automationFormSchema),
    defaultValues: {
      name: "",
      description: "",
      webhook_url: "",
      webhook_method: "POST",
      is_active: true,
      category: "general",
      max_concurrent_runs: 1,
      queue_priority: 0,
      async_processing: false,
    },
  })

  const fetchAutomations = useCallback(async () => {
    setIsLoadingList(true)
    try {
      const { data, error } = await supabase
        .from("tm_automations")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error
      setAutomations(data || [])
    } catch (error) {
      console.error("Error fetching automations:", error)
      toast({
        title: "Error",
        description: "Failed to load existing automations.",
        variant: "destructive",
      })
    } finally {
      setIsLoadingList(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchAutomations()
    }
  }, [isOpen, fetchAutomations])

  useEffect(() => {
    if (selectedAutomation) {
      form.reset(selectedAutomation)
    } else {
      form.reset({
        name: "",
        description: "",
        webhook_url: "",
        webhook_method: "POST",
        is_active: true,
        category: "general",
        max_concurrent_runs: 1,
        queue_priority: 0,
        async_processing: false,
      })
    }
  }, [selectedAutomation, form])
  
  const handleEditClick = (automation: Automation) => {
    setSelectedAutomation(automation)
    setActiveTab("editor")
  }

  const handleCreateNewClick = () => {
    setSelectedAutomation(null)
    setActiveTab("editor")
  }

  const handleSubmit = async (data: AutomationFormValues) => {
    try {
      setIsSaving(true)
      
      // Generate a new ID if this is a new automation
      const automationId = selectedAutomation?.id || crypto.randomUUID()
      
      // Prepare the automation data with proper structure
      const automationData = {
        ...data,
        id: automationId, // Use existing ID or generate a new one
        // Ensure login credentials are properly structured
        login: data.login ? {
          email: data.login.email,
          idNumber: data.login.idNumber,
          password: data.login.password
        } : undefined,
        created_at: selectedAutomation?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      
      await onSave(automationData)
      
      toast({
        title: "Success",
        description: selectedAutomation
          ? "Automation updated successfully"
          : "Automation created successfully",
      })
      
      await fetchAutomations()
      setActiveTab("existing")
      setSelectedAutomation(null)
      form.reset()
    } catch (error) {
      console.error("Error saving automation:", error)
      toast({
        title: "Error",
        description: "Failed to save automation. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedAutomation?.id) return

    try {
      setIsDeleting(true)
      const { error } = await supabase
        .from("tm_automations")
        .delete()
        .eq("id", selectedAutomation.id)

      if (error) throw error

      toast({
        title: "Success",
        description: "Automation deleted successfully",
      })
      await fetchAutomations()
      setActiveTab("existing")
      setSelectedAutomation(null)
    } catch (error) {
      console.error("Error deleting automation:", error)
      toast({
        title: "Error",
        description: "Failed to delete automation. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Automations</DialogTitle>
          <DialogDescription>
            Create, view, and manage your workflow automations.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="editor">Create / Edit</TabsTrigger>
            <TabsTrigger value="existing">Existing Automations</TabsTrigger>
          </TabsList>

          {/* Editor Tab (Create/Edit Form) */}
          <TabsContent value="editor" className="flex-1 flex flex-col overflow-hidden mt-2">
             <Form {...form}>
               <form
                onSubmit={form.handleSubmit(handleSubmit)}
                className="space-y-6 flex-1 flex flex-col"
              >
                <ScrollArea className="flex-1 pr-4 -mr-4">
                  <div className="space-y-4 pb-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Send Email Notification" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe what this automation does..."
                              className="min-h-[80px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="general">General</SelectItem>
                              <SelectItem value="document_processing">Document Processing</SelectItem>
                              <SelectItem value="form_automation">Form Automation</SelectItem>
                              <SelectItem value="notification">Notification</SelectItem>
                              <SelectItem value="integration">Integration</SelectItem>
                              <SelectItem value="workflow">Workflow</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="webhook_url"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Webhook URL</FormLabel>
                            <FormControl>
                              <Input placeholder="https://api.example.com/webhook" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                       <FormField
                        control={form.control}
                        name="webhook_method"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>HTTP Method</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select method" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="POST">POST</SelectItem>
                                <SelectItem value="GET">GET</SelectItem>
                                <SelectItem value="PUT">PUT</SelectItem>
                                <SelectItem value="PATCH">PATCH</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                     <div className="pt-4 border-t">
                      <h4 className="text-sm font-medium mb-4">Form Automation</h4>
                      <FormField
                        control={form.control}
                        name="login.url"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Form URL</FormLabel>
                            <FormControl>
                              <Input placeholder="https://example.com/form" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="mt-4 space-y-4 p-4 bg-gray-50 rounded-lg">
                        <h5 className="text-sm font-medium">Login Credentials</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="login.email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                  <Input placeholder="user@example.com" type="email" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="login.idNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>ID Number</FormLabel>
                                <FormControl>
                                  <Input placeholder="12345678" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="login.password"
                            render={({ field }) => (
                              <FormItem className="md:col-span-2">
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                  <Input type="password" placeholder="••••••••" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="max_concurrent_runs"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Max Concurrent Runs</FormLabel>
                            <FormControl>
                              <Input type="number" min={1} {...field} onChange={(e) => field.onChange(Number(e.target.value))}/>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                       <FormField
                        control={form.control}
                        name="queue_priority"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Queue Priority</FormLabel>
                            <FormControl>
                              <Input type="number" min={0} {...field} onChange={(e) => field.onChange(Number(e.target.value))}/>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                       <FormField
                        control={form.control}
                        name="is_active"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">Active</FormLabel>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </ScrollArea>
                 <DialogFooter className="pt-4 border-t">
                  <div className="flex justify-between w-full">
                    <div>
                      {selectedAutomation && (
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={handleDelete}
                          disabled={isDeleting || isSaving}
                        >
                          {isDeleting ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</>
                          ) : (
                            <><Trash2 className="mr-2 h-4 w-4" /> Delete</>
                          )}
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving || isDeleting}>Cancel</Button>
                      <Button type="submit" disabled={isSaving || isDeleting}>
                        {isSaving ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                        ) : (
                          <><Save className="mr-2 h-4 w-4" /> {selectedAutomation ? "Save Changes" : "Create Automation"}</>
                        )}
                      </Button>
                    </div>
                  </div>
                </DialogFooter>
              </form>
            </Form>
          </TabsContent>

          {/* Existing Automations Tab */}
          <TabsContent value="existing" className="flex-1 flex flex-col overflow-hidden mt-2">
            <div className="flex justify-end mb-4">
              <Button onClick={handleCreateNewClick}>
                <Plus className="mr-2 h-4 w-4" /> Create New Automation
              </Button>
            </div>
             <ScrollArea className="flex-1 pr-2">
              <div className="space-y-3">
                {isLoadingList ? (
                  <div className="flex justify-center items-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : automations.length > 0 ? (
                  automations.map((auto) => (
                    <div
                      key={auto.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex-1 mr-4">
                        <div className="flex items-center gap-3">
                          <p className="font-semibold text-base">{auto.name}</p>
                          <Badge variant={auto.is_active ? "default" : "secondary"}>
                            {auto.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {auto.description || "No description provided."}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleEditClick(auto)}>
                        <Edit className="mr-2 h-4 w-4" /> Edit
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground border-2 border-dashed rounded-lg">
                    <p className="text-lg font-medium">No Automations Found</p>
                    <p className="text-sm">Click "Create New Automation" to get started.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}