// @ts-nocheck
"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase/client"
import { AutomationDialog } from "./components/AutomationDialog"
import { Loader2, Edit, Trash2, Download, Plus, Search } from "lucide-react"
import { format } from "date-fns"
import { toast } from "@/hooks/use-toast"

export default function AutomationPage() {
  const [isAutomationDialogOpen, setIsAutomationDialogOpen] = useState(false)
  const [currentAutomation, setCurrentAutomation] = useState<any>(null)
  const [automations, setAutomations] = useState<any[]>([])
  const [filteredAutomations, setFilteredAutomations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchAutomations()
  }, [])

  useEffect(() => {
    const filtered = automations.filter(automation => 
      automation.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      automation.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      automation.category?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    setFilteredAutomations(filtered)
  }, [searchTerm, automations])

  const fetchAutomations = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('tm_automations')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setAutomations(data || [])
      setFilteredAutomations(data || [])
    } catch (error) {
      console.error('Error fetching automations:', error)
      toast({
        title: "Error",
        description: "Failed to load automations.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveAutomation = async (automationData: any) => {
    try {
      setLoading(true)
      
      if (currentAutomation?.id) {
        // Update existing automation
        const { error } = await supabase
          .from('tm_automations')
          .update({
            ...automationData,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentAutomation.id)
        
        if (error) throw error
        toast({
          title: "Success",
          description: "Automation updated successfully",
        })
      } else {
        // Create new automation
        const { error } = await supabase
          .from('tm_automations')
          .insert([{
            ...automationData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
        
        if (error) throw error
        toast({
          title: "Success",
          description: "Automation created successfully",
        })
      }
      
      await fetchAutomations()
      setFilteredAutomations(automations.filter(automation => 
        automation.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        automation.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        automation.category?.toLowerCase().includes(searchTerm.toLowerCase())
      ))
      setIsAutomationDialogOpen(false)
      setCurrentAutomation(null)
    } catch (error) {
      console.error('Error saving automation:', error)
      toast({
        title: "Error",
        description: "Failed to save automation. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleEditAutomation = (automation: any) => {
    setCurrentAutomation(automation)
    setIsAutomationDialogOpen(true)
  }

  const handleDeleteAutomation = async (id: string) => {
    if (!confirm('Are you sure you want to delete this automation? This action cannot be undone.')) return
    
    try {
      setLoading(true)
      const { error } = await supabase
        .from('tm_automations')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      
      toast({
        title: "Success",
        description: "Automation deleted successfully",
      })
      
      await fetchAutomations()
      setFilteredAutomations(automations.filter(automation => 
        automation.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        automation.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        automation.category?.toLowerCase().includes(searchTerm.toLowerCase())
      ))
    } catch (error) {
      console.error('Error deleting automation:', error)
      toast({
        title: "Error",
        description: "Failed to delete automation. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleExportAutomations = async () => {
    try {
      setExporting(true)
      const { data, error } = await supabase
        .from('tm_automations')
        .select('*')
      
      if (error) throw error
      
      // Convert to CSV
      const headers = Object.keys(data[0] || {}).join(',')
      const rows = data.map(item => 
        Object.values(item).map(field => 
          typeof field === 'string' ? `"${field.replace(/"/g, '""')}"` : field
        ).join(',')
      )
      
      const csvContent = [headers, ...rows].join('\n')
      
      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `automations-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      toast({
        title: "Success",
        description: "Automations exported successfully",
      })
    } catch (error) {
      console.error('Error exporting automations:', error)
      toast({
        title: "Error",
        description: "Failed to export automations. Please try again.",
        variant: "destructive",
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Automation Center</h2>
          <p className="text-muted-foreground">
            Manage your workflow automations and integrations
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleExportAutomations}
            disabled={exporting || automations.length === 0}
          >
            {exporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export
              </>
            )}
          </Button>
          <Button 
            onClick={() => {
              setCurrentAutomation(null)
              setIsAutomationDialogOpen(true)
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Automation
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Automation Rules</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search automations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredAutomations.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <p className="text-muted-foreground">
                {searchTerm ? 'No automations found matching your search' : 'No automations found'}
              </p>
              <p className="text-sm text-muted-foreground">
                {searchTerm ? 'Try adjusting your search terms' : 'Get started by creating your first automation'}
              </p>
              <Button 
                className="mt-4"
                onClick={() => setIsAutomationDialogOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Automation
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="border-r bg-blue-500 text-white">#</TableHead>
                    <TableHead className="border-r bg-blue-500 text-white">Name</TableHead>
                    <TableHead className="border-r bg-blue-500 text-white">Category</TableHead>
                    <TableHead className="border-r bg-blue-500 text-white">Status</TableHead>
                    <TableHead className="border-r bg-blue-500 text-white">Last Updated</TableHead>
                    <TableHead className="text-right bg-blue-500 text-white">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAutomations.map((automation, index) => (
                    <TableRow key={automation.id}>
                      <TableCell className="font-medium border-r">
                        {index + 1}
                      </TableCell>
                      <TableCell className="font-medium border-r">
                        <div className="flex flex-col">
                          <span>{automation.name}</span>
                          {automation.description && (
                            <span className="text-sm text-muted-foreground line-clamp-1">
                              {automation.description}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="border-r">
                        <Badge variant="outline">
                          {automation.category || 'general'}
                        </Badge>
                      </TableCell>
                      <TableCell className="border-r">
                        <Badge variant={automation.is_active ? 'default' : 'secondary'}>
                          {automation.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="border-r">
                        {automation.updated_at 
                          ? format(new Date(automation.updated_at), 'PPpp')
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right border-r">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditAutomation(automation)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAutomation(automation.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AutomationDialog
        isOpen={isAutomationDialogOpen}
        onOpenChange={(open) => {
          setIsAutomationDialogOpen(open)
          if (!open) setCurrentAutomation(null)
        }}
        onSave={handleSaveAutomation}
        initialData={currentAutomation}
      />
    </div>
  )
}
