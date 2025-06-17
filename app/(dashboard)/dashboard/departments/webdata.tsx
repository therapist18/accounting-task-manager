'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { Pencil, Trash2, Plus } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import supabase from "@/lib/supabase/client"

type WebData = {
  id?: string
  name: string
  description: string
  url: string
  department_id: string
  created_at?: string
  updated_at?: string
}

interface WebDataProps {
  departments: Array<{
    id: string
    name: string
    description: string
  }>
}

export default function WebData({ departments }: WebDataProps) {
  const [activeDept, setActiveDept] = useState(departments[0]?.id || '')
  const [webData, setWebData] = useState<WebData[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [formData, setFormData] = useState<Omit<WebData, 'id' | 'created_at' | 'updated_at'>>({ 
    name: '',
    description: '',
    url: '',
    department_id: ''
  })
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    if (activeDept) {
      fetchWebData()
    }
  }, [activeDept])

  const fetchWebData = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('web_data')
        .select('*')
        .eq('department_id', activeDept)
        .order('name')

      if (error) throw error
      
      setWebData(data || [])
    } catch (error) {
      console.error('Error fetching web data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      if (editingId) {
        const { error } = await supabase
          .from('web_data')
          .update({
            ...formData,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingId)
          
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('web_data')
          .insert([{
            ...formData,
            department_id: activeDept
          }])
          
        if (error) throw error
      }
      
      setIsDialogOpen(false)
      setFormData({ name: '', description: '', url: '', department_id: '' })
      setEditingId(null)
      fetchWebData()
    } catch (error) {
      console.error('Error saving web data:', error)
    }
  }

  const handleEdit = (item: WebData) => {
    setFormData({
      name: item.name,
      description: item.description,
      url: item.url,
      department_id: item.department_id
    })
    setEditingId(item.id || null)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this web data?')) return
    
    try {
      const { error } = await supabase
        .from('web_data')
        .delete()
        .eq('id', id)
        
      if (error) throw error
      
      fetchWebData()
    } catch (error) {
      console.error('Error deleting web data:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Web Data</h2>
        <Button onClick={() => {
          setFormData({ name: '', description: '', url: '', department_id: activeDept })
          setEditingId(null)
          setIsDialogOpen(true)
        }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Web Data
        </Button>
      </div>

      <Tabs value={activeDept} onValueChange={setActiveDept}>
        <TabsList>
          {departments.map((dept) => (
            <TabsTrigger key={dept.id} value={dept.id}>
              {dept.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {departments.map((dept) => (
          <TabsContent key={dept.id} value={dept.id} className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : webData.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                No web data found for {dept.name}.
              </div>
            ) : (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {webData.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>
                          <a 
                            href={item.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {item.url}
                          </a>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.description || 'No description'}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(item)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => item.id && handleDelete(item.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit' : 'Add New'} Web Data</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update the web data details' : 'Add new web data for the selected department'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Enter name"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="url">URL</Label>
                <Input
                  id="url"
                  name="url"
                  type="url"
                  value={formData.url}
                  onChange={handleInputChange}
                  placeholder="https://example.com"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Enter description (optional)"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingId ? 'Update' : 'Add'} Web Data
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
