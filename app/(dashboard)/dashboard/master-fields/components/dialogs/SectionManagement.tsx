// @ts-nocheck
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Edit, Trash2, GripVertical } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import type { FieldSection } from "../types/database"

export function SectionManagement() {
  const [sections, setSections] = useState<FieldSection[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const [editingSection, setEditingSection] = useState<FieldSection | null>(null)
  const [formData, setFormData] = useState({
    section_key: "",
    title: "",
    description: "",
    order_index: 0,
    fields: []
  })
  const [loading, setLoading] = useState(false)

  const fetchSections = async () => {
    const { data: sectionsData, error: sectionsError } = await supabase
      .from('tm_field_sections')
      .select('*')
      .order('order_index')

    if (!sectionsError && sectionsData) {
      setSections(sectionsData.map(section => ({
        ...section,
        fields: section.fields || []
      })) || [])
    }
  }

  useEffect(() => {
    fetchSections()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (editingSection) {
        const { error } = await supabase
          .from('tm_field_sections')
          .update({
            ...formData,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingSection.id)

        if (error) throw error
        toast({ title: "Success", description: "Section updated successfully" })
      } else {
        const { error } = await supabase
          .from('tm_field_sections')
          .insert([formData])

        if (error) throw error
        toast({ title: "Success", description: "Section created successfully" })
      }

      setShowDialog(false)
      setEditingSection(null)
      resetForm()
      fetchSections()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save section",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      section_key: "",
      title: "",
      description: "",
      order_index: 0
    })
  }

  const openEditDialog = (section: FieldSection) => {
    setEditingSection(section)
    setFormData({
      section_key: section.section_key,
      title: section.title,
      description: section.description || "",
      order_index: section.order_index
    })
    setShowDialog(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Field Sections</h2>
          <p className="text-gray-600">Manage form sections and their organization</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Section
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Section Key</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections.map((section) => (
                <TableRow key={section.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-gray-400" />
                      {section.order_index}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{section.section_key}</TableCell>
                  <TableCell className="font-medium">{section.title}</TableCell>
                  <TableCell className="text-sm text-gray-600 max-w-xs truncate">
                    {section.description}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-xs rounded-full ${section.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                      }`}>
                      {section.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(section)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingSection ? 'Edit Section' : 'Add Section'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="section_key">Section Key</Label>
              <Input
                id="section_key"
                value={formData.section_key}
                onChange={(e) => setFormData(prev => ({ ...prev, section_key: e.target.value }))}
                placeholder="e.g., contactInformation, personalDetails"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Contact Information, Personal Details"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description for this section"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order_index">Order Index</Label>
              <Input
                id="order_index"
                type="number"
                value={formData.order_index}
                onChange={(e) => setFormData(prev => ({ ...prev, order_index: parseInt(e.target.value) || 0 }))}
                placeholder="0"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : editingSection ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}