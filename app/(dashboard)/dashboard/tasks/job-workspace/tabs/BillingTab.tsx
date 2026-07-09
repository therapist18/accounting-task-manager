// @ts-nocheck
"use client"

import React, { useState, useMemo } from "react"
import { CreditCard, Plus, Loader2, DollarSign, Calendar, FileText, CheckCircle2, AlertCircle, Clock, Trash2, Edit2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase/client"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface BillingTabProps {
  task: any
  onRefresh?: () => void
}

const STATUS_BADGES: Record<string, string> = {
  paid: "bg-green-50 text-green-700 border-green-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  overdue: "bg-red-50 text-red-705 border-red-200",
  draft: "bg-slate-100 text-slate-600 border-slate-200",
}

export function BillingTab({ task, onRefresh }: BillingTabProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Form State
  const [invNum, setInvNum] = useState("")
  const [desc, setDesc] = useState("")
  const [amt, setAmt] = useState("")
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [status, setStatus] = useState("pending")

  const billingItems = useMemo(() => {
    return task?.registry_metadata?.billing || []
  }, [task])

  const stats = useMemo(() => {
    let total = 0
    let paid = 0
    billingItems.forEach((item: any) => {
      const val = Number(item.amount) || 0
      total += val
      if (item.status === 'paid') paid += val
    })
    return {
      total,
      paid,
      balance: total - paid
    }
  }, [billingItems])

  const handleAddInvoice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invNum.trim() || !amt.trim() || isNaN(Number(amt))) {
      toast.error("Please provide a valid invoice number and amount")
      return
    }

    setSaving(true)
    const toastId = toast.loading("Creating invoice...")

    try {
      const currentBilling = task?.registry_metadata?.billing || []
      const newItem = {
        id: Math.random().toString(36).substr(2, 9),
        invoiceNumber: invNum,
        description: desc,
        amount: Number(amt),
        date: date,
        status: status
      }

      const updatedMetadata = {
        ...(task?.registry_metadata || {}),
        billing: [...currentBilling, newItem]
      }

      const { error } = await supabase
        .from('tm_tasks')
        .update({
          registry_metadata: updatedMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id)

      if (error) throw error

      toast.success("Invoice created successfully", { id: toastId })
      setIsOpen(false)
      setInvNum("")
      setDesc("")
      setAmt("")
      setStatus("pending")
      onRefresh?.()
    } catch (error) {
      console.error("Error creating invoice:", error)
      toast.error("Failed to create invoice", { id: toastId })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteInvoice = async (itemId: string) => {
    const toastId = toast.loading("Deleting invoice...")

    try {
      const currentBilling = task?.registry_metadata?.billing || []
      const updatedBilling = currentBilling.filter((b: any) => b.id !== itemId)

      const updatedMetadata = {
        ...(task?.registry_metadata || {}),
        billing: updatedBilling
      }

      const { error } = await supabase
        .from('tm_tasks')
        .update({
          registry_metadata: updatedMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id)

      if (error) throw error

      toast.success("Invoice deleted successfully", { id: toastId })
      onRefresh?.()
    } catch (error) {
      console.error("Error deleting invoice:", error)
      toast.error("Failed to delete invoice", { id: toastId })
    }
  }

  const handleUpdateStatus = async (itemId: string, newStatus: string) => {
    const toastId = toast.loading("Updating invoice status...")

    try {
      const currentBilling = task?.registry_metadata?.billing || []
      const updatedBilling = currentBilling.map((b: any) => 
        b.id === itemId ? { ...b, status: newStatus } : b
      )

      const updatedMetadata = {
        ...(task?.registry_metadata || {}),
        billing: updatedBilling
      }

      const { error } = await supabase
        .from('tm_tasks')
        .update({
          registry_metadata: updatedMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id)

      if (error) throw error

      toast.success("Invoice status updated", { id: toastId })
      onRefresh?.()
    } catch (error) {
      console.error("Error updating invoice status:", error)
      toast.error("Failed to update status", { id: toastId })
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-white shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-800">Billing & Invoices</h3>
          <span className="text-xs text-muted-foreground">{task.applicant_name}</span>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="h-7 text-[10px] gap-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" /> Add Invoice
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPI Grid */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Billed</span>
                <span className="text-xl font-bold text-slate-800 mt-1 block">${stats.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <DollarSign className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Paid</span>
                <span className="text-xl font-bold text-green-600 mt-1 block">${stats.paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="p-2 bg-green-50 rounded-lg text-green-655">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Balance Due</span>
                <span className="text-xl font-bold text-amber-600 mt-1 block">${stats.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                <Clock className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Invoice Table */}
        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
          {billingItems.length === 0 ? (
            <div className="text-center p-12 bg-white rounded-lg">
              <CreditCard className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-655">No billing records found</p>
              <p className="text-xs text-slate-400 mt-0.5">Click "Add Invoice" above to generate a billing item.</p>
            </div>
          ) : (
            <div className="overflow-x-auto relative">
              <Table className="border-collapse w-full">
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-[10px] font-bold uppercase text-slate-500 py-3 pl-4 border-r border-b">Invoice #</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-slate-500 py-3 border-r border-b">Date</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-slate-500 py-3 border-r border-b">Description</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-slate-500 py-3 text-right border-r border-b">Amount</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-slate-500 py-3 text-center border-r border-b">Status</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-slate-500 py-3 text-center border-b">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billingItems.map((item: any) => (
                    <TableRow key={item.id} className="hover:bg-slate-50/50">
                      <TableCell className="text-xs font-bold text-slate-800 py-3 pl-4 border-r border-b border-slate-100">{item.invoiceNumber}</TableCell>
                      <TableCell className="text-xs text-slate-500 py-3 border-r border-b border-slate-100">
                        {new Date(item.date).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' })}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 py-3 border-r border-b border-slate-100 font-medium truncate max-w-[200px]" title={item.description}>{item.description || "-"}</TableCell>
                      <TableCell className="text-xs font-bold text-slate-800 text-right py-3 border-r border-b border-slate-100">
                        ${item.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="py-3 text-center border-r border-b border-slate-100">
                        <div className="flex flex-col items-center gap-1">
                          <Badge className={cn("text-[9px] uppercase font-bold px-2 py-0.5 border shadow-sm", STATUS_BADGES[item.status] || "bg-slate-50 text-slate-500 border-slate-200")}>
                            {item.status}
                          </Badge>
                          {item.autoGenerated && (
                            <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-wide">Auto-generated</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-center border-b border-slate-100">
                        <div className="flex items-center justify-center gap-1.5">
                          {item.status !== 'paid' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUpdateStatus(item.id, 'paid')}
                              className="h-6 text-[9px] px-2 font-bold border-green-200 text-green-700 bg-white hover:bg-green-50 shadow-sm"
                            >
                              Mark Paid
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUpdateStatus(item.id, 'pending')}
                              className="h-6 text-[9px] px-2 font-bold border-amber-200 text-amber-700 bg-white hover:bg-amber-50 shadow-sm"
                            >
                              Mark Pending
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteInvoice(item.id)}
                            className="h-6 w-6 p-0 text-slate-400 hover:text-red-650 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      {/* Invoice Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600" /> Create New Invoice
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Enter the billing and price details for the job below.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddInvoice} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Invoice Number *</label>
              <Input
                value={invNum}
                onChange={(e) => setInvNum(e.target.value)}
                placeholder="INV-XXXX"
                className="h-9 text-sm"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Amount ($) *</label>
                <Input
                  value={amt}
                  onChange={(e) => setAmt(e.target.value)}
                  placeholder="0.00"
                  type="number"
                  step="0.01"
                  className="h-9 text-sm"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Billing Date</label>
                <Input
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  type="date"
                  className="h-9 text-sm text-slate-700"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Pending" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Description / Notes</label>
              <Input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Professional services fee..."
                className="h-9 text-sm"
              />
            </div>

            <DialogFooter className="pt-2 border-t mt-4 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen(false)} disabled={saving} className="h-8 font-semibold">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving} className="h-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Generate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
