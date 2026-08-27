// @ts-nocheck
"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/hooks/use-toast";
import { createCourier, updateCourier, setCourierActive, type Courier } from "../utils/database";

const EMPTY_FORM = { name: "", courier_type: "on_demand" as "on_demand" | "company", contact_phone: "" };

export function CourierRegistryDialog({
  open,
  onOpenChange,
  couriers,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  couriers: Courier[];
  onChanged: () => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const startEdit = (c: Courier) => {
    setEditingId(c.id);
    setForm({ name: c.name, courier_type: c.courier_type, contact_phone: c.contact_phone || "" });
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateCourier(editingId, { name: form.name.trim(), courier_type: form.courier_type, contact_phone: form.contact_phone || null });
      } else {
        await createCourier({ name: form.name.trim(), courier_type: form.courier_type, contact_phone: form.contact_phone || null });
      }
      resetForm();
      onChanged();
      toast({ title: "Saved", description: "Courier registry updated." });
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to save courier.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (c: Courier) => {
    setBusyId(c.id);
    try {
      await setCourierActive(c.id, !c.is_active);
      onChanged();
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to update courier.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-black text-slate-800 uppercase tracking-wider">Courier Registry</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Name</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Bolt, G4S" className="h-10 text-sm bg-white border-slate-200" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Type</Label>
              <Select value={form.courier_type} onValueChange={(v: any) => setForm((p) => ({ ...p, courier_type: v }))}>
                <SelectTrigger className="h-10 text-sm bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  <SelectItem value="on_demand" className="text-sm">On-demand (rider varies each time)</SelectItem>
                  <SelectItem value="company" className="text-sm">Company (fixed courier org)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs text-slate-500">Contact phone (optional)</Label>
              <Input value={form.contact_phone} onChange={(e) => setForm((p) => ({ ...p, contact_phone: e.target.value }))} className="h-10 text-sm bg-white border-slate-200" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 px-3 rounded-md text-xs font-bold gap-1.5" style={{ backgroundColor: "#376bae", color: "white" }}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editingId ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {editingId ? "Update" : "Add Courier"}
            </Button>
            {editingId && (
              <Button size="sm" variant="outline" onClick={resetForm} className="h-8 px-3 rounded-md text-xs font-bold gap-1.5">
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 mt-1">
          {couriers.map((c) => (
            <div key={c.id} className={cn("flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border", c.is_active ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-60")}>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{c.name}</p>
                <p className="text-[11px] text-slate-400 uppercase tracking-wider font-bold">
                  {c.courier_type === "on_demand" ? "On-demand" : "Company"}
                  {c.contact_phone && ` · ${c.contact_phone}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => startEdit(c)} className="h-8 w-8 p-0">
                  <Pencil className="h-3.5 w-3.5 text-slate-400" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleToggleActive(c)} disabled={busyId === c.id} className="h-8 w-8 p-0">
                  {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className={cn("h-3.5 w-3.5", c.is_active ? "text-red-400" : "text-emerald-500")} />}
                </Button>
              </div>
            </div>
          ))}
          {couriers.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No couriers yet.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
