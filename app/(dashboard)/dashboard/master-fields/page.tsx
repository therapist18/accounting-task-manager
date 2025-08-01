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
import { EditFieldDialog } from "./components/dialogs/edit-field-dialog"
import { DeleteFieldDialog } from "./components/dialogs/delete-field-dialog"
import { LinkSourcesDialog } from "./components/dialogs/link-sources-dialog"
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
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950/90 text-slate-900 dark:text-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
              Job Fields Management
            </h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              Manage job application fields and their data sources.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button onClick={handleExportToExcel} variant="outline" className="bg-white dark:bg-slate-800">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button onClick={() => openDialog("add")} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="mr-2 h-4 w-4" />
              Add Field
            </Button>
          </div>
        </div>

        <Card className="border-none shadow-lg bg-white dark:bg-slate-900/70">
          <CardHeader className="p-6 border-b border-slate-200 dark:border-slate-800">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <CardTitle className="text-xl text-slate-700 dark:text-slate-200">Fields Overview</CardTitle>
              <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 w-full sm:w-auto">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search by key or label..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full sm:w-64 bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 focus-visible:ring-blue-500"
                  />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-full sm:w-[160px] bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 focus:ring-blue-500">
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
                  <SelectTrigger className="w-full sm:w-[160px] bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 focus:ring-blue-500">
                    <SelectValue placeholder="Filter by required" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="required">Required</SelectItem>
                    <SelectItem value="optional">Optional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                  <TableRow className="border-slate-200 dark:border-slate-800">
                    <TableHead className="py-4 px-6 text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700">#</TableHead>
                    <TableHead className="py-4 px-6 text-slate-600 dark:text-slate-400">Field Key</TableHead>
                    <TableHead className="py-4 px-6 text-slate-600 dark:text-slate-400">Label</TableHead>
                    <TableHead className="py-4 px-6 text-slate-600 dark:text-slate-400">Type</TableHead>
                    <TableHead className="py-4 px-6 text-slate-600 dark:text-slate-400">Required</TableHead>
                    <TableHead className="py-4 px-6 text-slate-600 dark:text-slate-400">Sources</TableHead>
                    <TableHead className="py-4 px-6 text-slate-600 dark:text-slate-400">Last Updated</TableHead>
                    <TableHead className="py-4 px-6 text-right text-slate-600 dark:text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedFields.length > 0 ? (
                    paginatedFields.map((field, index) => (
                      <TableRow
                        key={field.id}
                        className="border-b-slate-200 dark:border-b-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/50"
                      >
                        <TableCell className="p-6 font-medium text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700">
                          {(currentPage - 1) * itemsPerPage + index + 1}
                        </TableCell>
                        <TableCell className="p-6 font-mono text-sm text-blue-600 dark:text-blue-400">
                          {field.field_key}
                        </TableCell>
                        <TableCell className="p-6 font-medium text-slate-800 dark:text-slate-200">
                          {field.label}
                        </TableCell>
                        <TableCell className="p-6">
                          <Badge
                            variant="secondary"
                            className="capitalize bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
                          >
                            {field.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-6">
                          <Badge
                            variant={field.is_required ? "default" : "outline"}
                            className={
                              field.is_required
                                ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
                                : "text-slate-500"
                            }
                          >
                            {field.is_required ? "Required" : "Optional"}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-6">
                          <Badge
                            variant="outline"
                            className="border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                          >
                            {field.sources?.length || 0} sources
                          </Badge>
                        </TableCell>
                        <TableCell className="p-6 text-slate-500 dark:text-slate-400">
                          {new Date(field.updated_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="p-6 text-right">
                          <div className="flex items-center justify-end space-x-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                              onClick={() => openDialog("edit", field)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDialog("linkSources", field)}
                              className={
                                field.sources?.length
                                  ? "text-blue-600 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-400 dark:hover:bg-blue-900"
                                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                              }
                            >
                              <LinkIcon className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50"
                              onClick={() => openDialog("delete", field)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-slate-500 dark:text-slate-400">
                        No fields found. Try adjusting your search or filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-800">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="bg-white dark:bg-slate-800"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="bg-white dark:bg-slate-800"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialogs will inherit the theme through shadcn's styling */}
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
    </div>
  )
}