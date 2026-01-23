// @ts-nocheck
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Search, Download, Edit, Trash2, LinkIcon } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import type { JobField } from "../types/database"
import { AddFieldDialog } from "./components/dialogs/add-field-dialog"
import { EditFieldDialog } from "./components/dialogs/field-dialog"
import { DeleteFieldDialog } from "./components/dialogs/delete-field-dialog"
import { LinkSourcesDialog } from "./components/dialogs/link-sources-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "@/hooks/use-toast"
import { exportToExcel } from "./components/lib/excel-export"

export default function JobFieldsPage() {
  const [fields, setFields] = useState<JobField[]>([])
  const [filteredFields, setFilteredFields] = useState<JobField[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [requiredFilter, setRequiredFilter] = useState<string>("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedField, setSelectedField] = useState<JobField | null>(null)
  const [dialogStates, setDialogStates] = useState({
    add: false,
    edit: false,
    delete: false,
    linkSources: false,
  })

  const itemsPerPage = 10

  useEffect(() => {
    fetchFields()
  }, [])

  useEffect(() => {
    filterFields()
  }, [fields, searchTerm, typeFilter, requiredFilter])

  const fetchFields = async () => {
    try {
      const { data, error } = await supabase.from("tm_job_fields").select("*").order("created_at", { ascending: false })

      if (error) throw error
      setFields(data || [])
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch job fields",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const filterFields = () => {
    let filtered = fields

    if (searchTerm) {
      filtered = filtered.filter(
        (field) =>
          field.field_key.toLowerCase().includes(searchTerm.toLowerCase()) ||
          field.label.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter((field) => field.type === typeFilter)
    }

    if (requiredFilter !== "all") {
      const isRequired = requiredFilter === "required"
      filtered = filtered.filter((field) => field.is_required === isRequired)
    }

    setFilteredFields(filtered)
    setCurrentPage(1)
  }

  const handleDeleteField = async (fieldId: string) => {
    try {
      const { error } = await supabase.from("tm_job_fields").delete().eq("id", fieldId)

      if (error) throw error

      setFields(fields.filter((field) => field.id !== fieldId))
      toast({
        title: "Success",
        description: "Field deleted successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete field",
        variant: "destructive",
      })
    }
  }

  const handleExportToExcel = async () => {
    try {
      await exportToExcel(fields)
      toast({
        title: "Success",
        description: "Fields exported to Excel successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export fields",
        variant: "destructive",
      })
    }
  }

  const openDialog = (type: keyof typeof dialogStates, field?: JobField) => {
    if (field) setSelectedField(field)
    setDialogStates((prev) => ({ ...prev, [type]: true }))
  }

  const closeDialog = (type: keyof typeof dialogStates) => {
    setDialogStates((prev) => ({ ...prev, [type]: false }))
    setSelectedField(null)
  }

  const paginatedFields = filteredFields.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const totalPages = Math.ceil(filteredFields.length / itemsPerPage)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Job Fields Management</h1>
          <p className="text-muted-foreground">Manage job application fields and their data sources</p>
        </div>
        <div className="flex space-x-2">
          <Button onClick={handleExportToExcel} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export to Excel
          </Button>
          <Button onClick={() => openDialog("add")}>
            <Plus className="mr-2 h-4 w-4" />
            Add Field
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fields Overview</CardTitle>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search fields..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="select">Select</SelectItem>
              </SelectContent>
            </Select>
            <Select value={requiredFilter} onValueChange={setRequiredFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by required" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Fields</SelectItem>
                <SelectItem value="required">Required Only</SelectItem>
                <SelectItem value="optional">Optional Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field Key</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Sources</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedFields.map((field) => (
                  <TableRow key={field.id}>
                    <TableCell className="font-mono text-sm">{field.field_key}</TableCell>
                    <TableCell>{field.label}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {field.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Checkbox checked={field.is_required} disabled />
                        <span className="ml-2">{field.is_required ? "Yes" : "No"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{field.sources?.length || 0} sources</Badge>
                    </TableCell>
                    <TableCell>{new Date(field.updated_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => openDialog("edit", field)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openDialog("linkSources", field)}>
                          <LinkIcon className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openDialog("delete", field)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                {Math.min(currentPage * itemsPerPage, filteredFields.length)} of {filteredFields.length} fields
              </p>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AddFieldDialog open={dialogStates.add} onOpenChange={() => closeDialog("add")} onSuccess={fetchFields} />

      <EditFieldDialog
        open={dialogStates.edit}
        onOpenChange={() => closeDialog("edit")}
        field={selectedField}
        onSuccess={fetchFields}
      />

      <DeleteFieldDialog
        open={dialogStates.delete}
        onOpenChange={() => closeDialog("delete")}
        field={selectedField}
        onConfirm={handleDeleteField}
      />

      <LinkSourcesDialog
        open={dialogStates.linkSources}
        onOpenChange={() => closeDialog("linkSources")}
        field={selectedField}
        onSuccess={fetchFields}
      />
    </div>
  )
}
