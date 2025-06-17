// webdata.tsx
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { Pencil, Trash2, Plus } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import supabase from "@/lib/supabase/client"

type WebData = {
  id: string
  name: string
  description: string
  url: string
}

interface WebDataProps {
  departments: Array<{
    id: string
    name: string
    description: string
    subdepartments: Array<{
      id: number
      name: string
      webdata?: WebData[]
    }>
  }>
}

export default function WebData({ departments: initialDepartments }: WebDataProps) {
  const [departments, setDepartments] = useState(initialDepartments)
  const [activeDept, setActiveDept] = useState(initialDepartments[0]?.id || '')
  const [activeSubdept, setActiveSubdept] = useState<number | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState<Omit<WebData, 'id'>>({ 
    name: '',
    description: '',
    url: ''
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const { toast } = useToast()

  const currentDept = departments.find(d => d.id === activeDept)
  const currentSubdept = currentDept?.subdepartments?.find(sd => sd.id === activeSubdept)

  useEffect(() => {
    if (currentDept?.subdepartments?.length) {
      setActiveSubdept(currentDept.subdepartments[0].id)
    }
  }, [activeDept, currentDept])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentSubdept) return

    try {
      setIsLoading(true)
      const updatedWebdata = currentSubdept.webdata ? [...currentSubdept.webdata] : []
      
      if (editingId) {
        const index = updatedWebdata.findIndex(item => item.id === editingId)
        if (index !== -1) {
          updatedWebdata[index] = { ...formData, id: editingId }
        }
      } else {
        updatedWebdata.push({ ...formData, id: crypto.randomUUID() })
      }

      const { error } = await supabase
        .from('tm_subdepartments')
        .update({ 
          webdata: updatedWebdata,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentSubdept.id)

      if (error) throw error

      // Update local state
      setDepartments(prev => prev.map(dept => {
        if (dept.id !== activeDept) return dept
        return {
          ...dept,
          subdepartments: dept.subdepartments.map(sd => {
            if (sd.id !== currentSubdept.id) return sd
            return { ...sd, webdata: updatedWebdata }
          })
        }
      }))

      setIsDialogOpen(false)
      setFormData({ name: '', description: '', url: '' })
      setEditingId(null)
      
      toast({
        title: "Success",
        description: `Web data ${editingId ? 'updated' : 'added'} successfully.`,
      })
    } catch (error) {
      console.error('Error saving web data:', error)
      toast({
        title: "Error",
        description: `Failed to ${editingId ? 'update' : 'add'} web data.`,
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = (item: WebData) => {
    setFormData({
      name: item.name,
      description: item.description,
      url: item.url
    })
    setEditingId(item.id)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!currentSubdept || !confirm('Are you sure you want to delete this web data?')) return

    try {
  // webdata.tsx (continued)
  const updatedWebdata = (currentSubdept.webdata || []).filter(item => item.id !== id)

  const { error } = await supabase
    .from('tm_subdepartments')
    .update({ 
      webdata: updatedWebdata,
      updated_at: new Date().toISOString()
    })
    .eq('id', currentSubdept.id)

  if (error) throw error

  // Update local state
  setDepartments(prev => prev.map(dept => {
    if (dept.id !== activeDept) return dept
    return {
      ...dept,
      subdepartments: dept.subdepartments.map(sd => {
        if (sd.id !== currentSubdept.id) return sd
        return { ...sd, webdata: updatedWebdata }
      })
    }
  }))

  toast({
    title: "Success",
    description: "Web data deleted successfully.",
  })
} catch (error) {
  console.error('Error deleting web data:', error)
  toast({
    title: "Error",
    description: "Failed to delete web data.",
    variant: "destructive"
  })
}
}

return (
<div className="space-y-6">
  <div className="flex justify-between items-center">
    <h2 className="text-2xl font-bold tracking-tight">Web Data</h2>
    <Button onClick={() => {
      setFormData({ name: '', description: '', url: '' })
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
        {dept.subdepartments?.length ? (
          <Tabs value={String(activeSubdept)} onValueChange={(value) => setActiveSubdept(Number(value))}>
            <TabsList>
              {dept.subdepartments.map((subdept) => (
                <TabsTrigger key={subdept.id} value={String(subdept.id)}>
                  {subdept.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {dept.subdepartments.map((subdept) => (
              <TabsContent key={subdept.id} value={String(subdept.id)} className="space-y-4">
                {isLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                  </div>
                ) : !subdept.webdata?.length ? (
                  <div className="text-center p-8 text-muted-foreground">
                    No web data found for {subdept.name}.
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
                        {subdept.webdata.map((item) => (
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
                                  onClick={() => handleDelete(item.id)}
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
        ) : (
          <div className="text-center p-8 text-muted-foreground">
            No subdepartments found for {dept.name}.
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
          {editingId ? 'Update the web data details' : 'Add new web data for the selected subdepartment'}
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
              placeholder="[https://example.com](https://example.com)"
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
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : (editingId ? 'Update' : 'Add')} Web Data
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</div>
)
}