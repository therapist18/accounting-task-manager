"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Loader2, Trash2, Save } from "lucide-react"
import * as z from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  // State for form actions
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const form = useForm<AutomationFormValues>({
    resolver: zodResolver(automationFormSchema),
    defaultValues: initialData || {
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

  useEffect(() => {
    form.reset(initialData || {
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
  }, [initialData, form])
  
  const handleCreateNew = () => {
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

  const handleSubmit = async (data: AutomationFormValues) => {
    try {
      setIsSaving(true)
      
      // Generate a new ID if this is a new automation
      const automationId = initialData?.id || crypto.randomUUID()
      
      // Prepare the automation data with proper structure
      const automationData = {
        ...data,
        id: automationId,
        // Ensure login credentials are properly structured
        login: data.login ? {
          url: data.login.url,
          email: data.login.email,
          idNumber: data.login.idNumber,
          password: data.login.password
        } : undefined,
        created_at: initialData?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      
      await onSave(automationData)
      
      toast({
        title: "Success",
        description: initialData
          ? "Automation updated successfully"
          : "Automation created successfully",
      })
      
      onOpenChange(false)
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
    if (!initialData?.id) return

    try {
      setIsDeleting(true)
      const { error } = await supabase
        .from("tm_automations")
        .delete()
        .eq("id", initialData.id)

      if (error) throw error

      toast({
        title: "Success",
        description: "Automation deleted successfully",
      })
      onOpenChange(false)
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Automation' : 'Create New Automation'}</DialogTitle>
          <DialogDescription>
            {initialData 
              ? 'Update the automation settings below.'
              : 'Configure a new automation for your workflow.'}
          </DialogDescription>
        </DialogHeader>

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
                  {initialData && (
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
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => onOpenChange(false)} 
                    disabled={isSaving || isDeleting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSaving || isDeleting}>
                    {isSaving ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                    ) : (
                      <><Save className="mr-2 h-4 w-4" /> {initialData ? "Save Changes" : "Create Automation"}</>
                    )}
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}