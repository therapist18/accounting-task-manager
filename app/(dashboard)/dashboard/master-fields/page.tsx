// @ts-nocheck
"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Search, Download, Edit, Trash2, ListFilter, Calculator } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import type { JobField } from "../types/database"
import { FieldDialog } from "./components/dialogs/field-dialog"
import { DeleteFieldDialog } from "./components/dialogs/delete-field-dialog"
import { toast } from "@/lib/hooks/use-toast"
import { exportToExcel } from "./components/lib/excel-export"

export default function JobFieldsPage() {
  const [fields, setFields] = useState<JobField[]>([])
  const [filteredFields, setFilteredFields] = useState<JobField[]>([])
  const [loading, setLoading] = useState(true)

  // Filter States
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [requiredFilter, setRequiredFilter] = useState<string>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [scopeFilter, setScopeFilter] = useState<string>("all")
  const [categories, setCategories] = useState<string[]>([])

  const [selectedField, setSelectedField] = useState<JobField | null>(null)
  const [dialogStates, setDialogStates] = useState({
    add: false,
    edit: false,
    delete: false,
  })
  const [allFields, setAllFields] = useState<JobField[]>([])

  // Sorting state
  const [sortConfig, setSortConfig] = useState<{ key: keyof JobField; direction: 'asc' | 'desc' } | null>({
    key: 'created_at',
    direction: 'desc'
  })

  // 1. Fetch Data
  useEffect(() => {
    fetchFields()
  }, [])

  // 2. Filter Trigger
  useEffect(() => {
    filterFields()
  }, [fields, searchTerm, typeFilter, requiredFilter, categoryFilter, scopeFilter])

  const fetchFields = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase.from("tm_job_fields").select("*").order("created_at", { ascending: false })

      if (error) throw error
      setFields(data || [])
      setAllFields(data || [])

      // Extract Unique Categories for the Filter Dropdown
      // We only want non-null, non-empty categories
      const uniqueCats = Array.from(new Set(
        (data || [])
          .map((f: any) => f.category)
          .filter((c) => c && typeof c === 'string' && c.trim().length > 0)
      )) as string[]

      setCategories(uniqueCats.sort())
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
    let filtered = [...fields]

    // Search Filter
    if (searchTerm) {
      filtered = filtered.filter(
        (field) =>
          field.field_key.toLowerCase().includes(searchTerm.toLowerCase()) ||
          field.label.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    // Type Filter
    if (typeFilter !== "all") {
      filtered = filtered.filter((field) => field.type === typeFilter)
    }

    // Required Filter
    if (requiredFilter !== "all") {
      const isRequired = requiredFilter === "required"
      filtered = filtered.filter((field) => field.is_required === isRequired)
    }

    // Category Filter (Logic Fixed)
    if (categoryFilter !== "all") {
      filtered = filtered.filter((field) => field.category === categoryFilter)
    }

    // Scope Filter
    if (scopeFilter !== "all") {
      filtered = filtered.filter((field) => (field.field_scope || "general") === scopeFilter)
    }

    setFilteredFields(filtered)
  }

  const handleDeleteField = async (fieldId: string) => {
    try {
      const { error } = await supabase.from("tm_job_fields").delete().eq("id", fieldId)
      if (error) throw error

      setFields(fields.filter((field) => field.id !== fieldId))
      toast({ title: "Success", description: "Field deleted successfully" })
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete field", variant: "destructive" })
    }
  }

  const handleExportToExcel = async () => {
    try {
      await exportToExcel(fields)
      toast({ title: "Success", description: "Fields exported to Excel successfully" })
    } catch (error) {
      toast({ title: "Error", description: "Failed to export fields", variant: "destructive" })
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

  // Sorting Logic
  const sortedFields = React.useMemo(() => {
    const sortableItems = [...filteredFields]
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key]
        let bValue = b[sortConfig.key]

        // Handle category specific sorting (treat null as "")
        if (sortConfig.key === 'category') {
          aValue = aValue || ""
          bValue = bValue || ""
        }

        // Handle undefined or null values
        if (aValue === undefined || aValue === null) return sortConfig.direction === 'asc' ? -1 : 1
        if (bValue === undefined || bValue === null) return sortConfig.direction === 'asc' ? 1 : -1

        // Convert dates to timestamps for comparison
        if (sortConfig.key === 'created_at' || sortConfig.key === 'updated_at') {
          aValue = new Date(aValue).getTime()
          bValue = new Date(bValue).getTime()
        }

        // Compare values
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }
    return sortableItems
  }, [filteredFields, sortConfig])

  const requestSort = (key: keyof JobField) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig?.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const getSortIndicator = (key: keyof JobField) => {
    if (sortConfig?.key !== key) return null
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950/90 text-slate-900 dark:text-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto space-y-8">
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

                {/* CATEGORY FILTER */}
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-[180px] bg-slate-50 border-slate-300">
                    <ListFilter className="w-4 h-4 mr-2 text-slate-500" />
                    <SelectValue placeholder="All Sections" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

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

                <Select value={scopeFilter} onValueChange={setScopeFilter}>
                  <SelectTrigger className="w-full sm:w-[160px] bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 focus:ring-blue-500">
                    <SelectValue placeholder="Filter by scope" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Scopes</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="immigration">Immigration</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[calc(100vh-300px)]">
              <Table className="relative">
                <TableHeader className="bg-blue-500 dark:bg-blue-800 sticky top-0 z-10">
                  <TableRow className="border-slate-200 dark:border-slate-800">
                    <TableHead className="py-4 px-6 text-white border-r w-16">#</TableHead>
                    <TableHead
                      className="py-4 px-6 text-white border-r cursor-pointer hover:bg-blue-600 transition-colors"
                      onClick={() => requestSort('field_key')}
                    >
                      Field Key{getSortIndicator('field_key')}
                    </TableHead>
                    <TableHead
                      className="py-4 px-6 text-white border-r cursor-pointer hover:bg-blue-600 transition-colors"
                      onClick={() => requestSort('label')}
                    >
                      Label{getSortIndicator('label')}
                    </TableHead>
                    <TableHead
                      className="py-4 px-6 text-white border-r cursor-pointer hover:bg-blue-600 transition-colors"
                      onClick={() => requestSort('type')}
                    >
                      Type{getSortIndicator('type')}
                    </TableHead>
                    <TableHead
                      className="py-4 px-6 text-white border-r cursor-pointer hover:bg-blue-600 transition-colors"
                      onClick={() => requestSort('category')}
                    >
                      Section{getSortIndicator('category')}
                    </TableHead>
                    <TableHead
                      className="py-4 px-6 text-white border-r cursor-pointer hover:bg-blue-600 transition-colors"
                      onClick={() => requestSort('is_required')}
                    >
                      Required{getSortIndicator('is_required')}
                    </TableHead>
                    <TableHead
                      className="py-4 px-6 text-white border-r cursor-pointer hover:bg-blue-600 transition-colors"
                      onClick={() => requestSort('field_scope')}
                    >
                      Scope{getSortIndicator('field_scope')}
                    </TableHead>
                    <TableHead className="py-4 px-6 text-white border-r">
                      Sources
                    </TableHead>
                    <TableHead
                      className="py-4 px-6 text-white border-r cursor-pointer hover:bg-blue-600 transition-colors"
                      onClick={() => requestSort('updated_at')}
                    >
                      Last Updated{getSortIndicator('updated_at')}
                    </TableHead>
                    <TableHead className="py-4 px-6 text-right text-white border-r w-40">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedFields.length > 0 ? (
                    sortedFields.map((field, index) => (
                      <TableRow
                        key={field.id}
                        className="border-b-slate-200 dark:border-b-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/50"
                      >
                        <TableCell className="p-6 font-medium border-r">
                          {index + 1}
                        </TableCell>
                        <TableCell className="p-6 font-mono text-sm border-r">
                          {field.field_key}
                        </TableCell>
                        <TableCell className="p-6 font-medium border-r">
                          {field.label}
                        </TableCell>
                        <TableCell className="p-6 border-r">
                          <Badge
                            variant="secondary"
                            className="capitalize bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 border-r"
                          >
                            {field.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-6 border-r">
                          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                            {field.category || "General"}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-6 border-r">
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
                        <TableCell className="p-6 border-r">
                          <Badge
                            variant={field.field_scope === 'immigration' ? "default" : "outline"}
                            className={
                              field.field_scope === 'immigration'
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200"
                                : "text-slate-500"
                            }
                          >
                            {field.field_scope === 'immigration' ? "Immigration" : "General"}
                          </Badge>
                        </TableCell>

                        <TableCell className="p-6 border-r">
                          {field.is_computed ? (
                            <Badge
                              variant="secondary"
                              className="bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 border-purple-200"
                            >
                              <Calculator className="w-3 h-3 mr-1" />
                              Computed
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                            >
                              {field.sources?.length || 0} sources
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="p-6 border-r">
                          {new Date(field.updated_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="p-6 text-right border-r">
                          <div className="flex items-center justify-end space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                              onClick={() => openDialog("edit", field)}
                            >
                              <Edit className="h-4 w-4 mr-1" /> Edit
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
                      <TableCell colSpan={10} className="h-24 text-center text-slate-500 dark:text-slate-400">
                        No fields found. Try adjusting your search or filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

          </CardContent>
        </Card>

        {/* Dialogs - Using unified FieldDialog for both add and edit */}
        <FieldDialog
          open={dialogStates.add}
          onOpenChange={() => closeDialog("add")}
          onSuccess={fetchFields}
          availableFields={allFields}
          mode="add"
        />
        <FieldDialog
          open={dialogStates.edit}
          onOpenChange={() => closeDialog("edit")}
          field={selectedField}
          onSuccess={fetchFields}
          availableFields={allFields}
          mode="edit"
        />
        <DeleteFieldDialog
          open={dialogStates.delete}
          onOpenChange={() => closeDialog("delete")}
          field={selectedField}
          onConfirm={handleDeleteField}
        />
      </div>
    </div>
  )
}