"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2 } from "lucide-react"
import type { JobField, JobFieldSource } from "../types/database"
import supabase from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"

interface LinkSourcesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  field: JobField | null
  onSuccess: () => void
}

export function LinkSourcesDialog({ open, onOpenChange, field, onSuccess }: LinkSourcesDialogProps) {
  const [sources, setSources] = useState<JobFieldSource[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (field) {
      setSources(field.sources || [])
    }
  }, [field])

  const addSource = () => {
    setSources((prev) => [
      ...prev,
      {
        source_type: "profile",
        table: "",
        path: "",
        priority: prev.length + 1,
      },
    ])
  }

  const updateSource = (index: number, updates: Partial<JobFieldSource>) => {
    setSources((prev) => prev.map((source, i) => (i === index ? { ...source, ...updates } : source)))
  }

  const removeSource = (index: number) => {
    setSources((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!field) return

    setLoading(true)

    try {
      const { error } = await supabase
        .from("tm_job_fields")
        .update({
          sources,
          updated_at: new Date().toISOString(),
        })
        .eq("id", field.id)

      if (error) throw error

      toast({
        title: "Success",
        description: "Sources updated successfully",
      })

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update sources",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  if (!field) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link Data Sources</DialogTitle>
          <DialogDescription>
            Configure data sources for field: <strong>{field.label}</strong>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            {sources.map((source, index) => (
              <Card key={index}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      Source {index + 1}
                      <Badge variant="outline" className="ml-2 capitalize">
                        {source.source_type}
                      </Badge>
                    </CardTitle>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeSource(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Source Type</Label>
                      <Select
                        value={source.source_type}
                        onValueChange={(value: any) => updateSource(index, { source_type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="profile">Profile</SelectItem>
                          <SelectItem value="document">Document</SelectItem>
                          <SelectItem value="company">Company</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Input
                        type="number"
                        value={source.priority}
                        onChange={(e) => updateSource(index, { priority: Number.parseInt(e.target.value) || 1 })}
                        min="1"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Table</Label>
                    <Input
                      value={source.table}
                      onChange={(e) => updateSource(index, { table: e.target.value })}
                      placeholder="e.g., user_profiles, documents"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Path</Label>
                    <Input
                      value={source.path}
                      onChange={(e) => updateSource(index, { path: e.target.value })}
                      placeholder="e.g., personal_info.first_name, metadata.title"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button type="button" variant="outline" onClick={addSource} className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            Add Source
          </Button>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Sources"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
