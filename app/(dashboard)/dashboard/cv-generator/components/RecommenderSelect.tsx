// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search, Plus, Loader2, X, User, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { CreatableCombobox, type ComboOption } from "./CreatableCombobox";
import supabase from "@/lib/supabase/client";

export interface Recommender {
  id: string;
  contact_name: string;
  email_address: string | null;
  personal_mobile: string | null;
  position: string | null;
  client_company_id: number | null;
  third_party_company_id: number | null;
  company_name?: string | null;
  source: "third_party" | "individual";
}

interface RecommenderSelectProps {
  value: string | null;
  onChange: (recommender: Recommender | null) => void;
  className?: string;
  placeholder?: string;
}

export function RecommenderSelect({ value, onChange, className, placeholder = "Search recommender..." }: RecommenderSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recommenders, setRecommenders] = useState<Recommender[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchRecommenders = useCallback(async () => {
    setLoading(true);
    try {
      const [tpcRes, indRes, clientCoRes, tpcCoRes] = await Promise.all([
        supabase.from("third_party_contacts").select("*").eq("contact_type", "Recommender").eq("status", "active"),
        supabase.from("registry_individuals").select("id, full_name, contact_details").not("full_name", "is", null).limit(300),
        supabase.from("acc_portal_company_duplicate").select("id, company_name"),
        supabase.from("third_party_companies").select("id, company_name"),
      ]);

      const coMap = new Map<number, string>();
      (clientCoRes.data || []).forEach((c: any) => { if (c.company_name) coMap.set(c.id, c.company_name); });
      (tpcCoRes.data || []).forEach((c: any) => { if (c.company_name) coMap.set(c.id, c.company_name); });

      const results: Recommender[] = [];

      (tpcRes.data || []).forEach((r: any) => {
        const companyName = (r.client_company_id && coMap.get(r.client_company_id)) || (r.third_party_company_id && coMap.get(r.third_party_company_id)) || null;
        results.push({
          id: r.id, contact_name: r.contact_name, email_address: r.email_address,
          personal_mobile: r.personal_mobile, position: r.position,
          client_company_id: r.client_company_id, third_party_company_id: r.third_party_company_id,
          company_name: companyName, source: "third_party",
        });
      });

      (indRes.data || []).forEach((r: any) => {
        if (!results.find(o => o.contact_name?.toLowerCase() === r.full_name?.toLowerCase())) {
          const contact = Array.isArray(r.contact_details) ? r.contact_details[0] : r.contact_details || {};
          results.push({
            id: `ind:${r.id}`, contact_name: r.full_name, email_address: contact.email?.primary || null,
            personal_mobile: contact.phone?.kenyan?.primary || contact.phone?.abroad?.primary || null,
            position: null, client_company_id: null, third_party_company_id: null,
            company_name: null, source: "individual",
          });
        }
      });

      setRecommenders(results.sort((a, b) => (a.contact_name || "").localeCompare(b.contact_name || "")));
    } catch (e) {
      console.error("Error fetching recommenders:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecommenders(); }, [fetchRecommenders]);

  const filtered = useMemo(() => {
    if (!query) return recommenders;
    const q = query.toLowerCase();
    return recommenders.filter(r =>
      r.contact_name?.toLowerCase().includes(q) ||
      r.email_address?.toLowerCase().includes(q) ||
      r.personal_mobile?.includes(q) ||
      r.company_name?.toLowerCase().includes(q)
    );
  }, [recommenders, query]);

  const selected = useMemo(() => recommenders.find(r => r.id === value), [recommenders, value]);
  const displayName = selected ? selected.contact_name : "";

  return (
    <>
      <div className={cn("relative", className)}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={query || displayName || ""}
              onChange={e => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder={placeholder}
              className="w-full h-8 pl-9 pr-8 text-xs border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            {(query || displayName) && (
              <button onClick={() => { setQuery(""); onChange(null); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs gap-1 shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3 w-3" /> New
          </Button>
        </div>

        {open && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto">
            {loading ? (
              <div className="p-3 text-center text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400">
                {query ? "No match found" : "No recommenders yet"}
                <button onClick={() => { setOpen(false); setCreateOpen(true); }} className="block w-full mt-2 text-blue-600 font-medium hover:underline">+ Create new recommender</button>
              </div>
            ) : (
              <div className="py-1">
                {filtered.map(r => (
                  <button
                    key={r.id}
                    onClick={() => { onChange(r); setQuery(""); setOpen(false); }}
                    className={cn("w-full px-3 py-2 text-left hover:bg-blue-50 flex items-start gap-2 transition-colors", value === r.id && "bg-blue-50")}
                  >
                    <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="h-3 w-3 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900 truncate">{r.contact_name}</span>
                        {value === r.id && <Check className="h-3 w-3 text-blue-600 shrink-0" />}
                        {r.source === "individual" && <span className="text-[9px] px-1 py-0 h-4 shrink-0 border border-slate-200 rounded-full">Registry</span>}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {[r.position, r.company_name, r.email_address, r.personal_mobile].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}

      <CreateRecommenderDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(rec) => { onChange(rec); fetchRecommenders(); }} />
    </>
  );
}

interface CreateRecommenderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (recommender: Recommender) => void;
}

function CreateRecommenderDialog({ open, onOpenChange, onCreated }: CreateRecommenderDialogProps) {
  const [saving, setSaving] = useState(false);
  const [companyOptions, setCompanyOptions] = useState<ComboOption[]>([]);
  const [form, setForm] = useState({ name: "", position: "", email: "", phone: "", company: "" });

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [clientRes, tpcRes] = await Promise.all([
        supabase.from("acc_portal_company_duplicate").select("id, company_name").order("company_name"),
        supabase.from("third_party_companies").select("id, company_name").eq("status", "active").order("company_name"),
      ]);
      const compSet = new Map<string, string>();
      (clientRes.data || []).forEach((c: any) => { if (c.company_name) compSet.set(c.company_name.trim(), c.company_name.trim()); });
      (tpcRes.data || []).forEach((c: any) => { if (c.company_name) compSet.set(c.company_name.trim(), c.company_name.trim()); });
      setCompanyOptions([...compSet.values()].sort().map(n => ({ value: n, label: n })));
    })();
  }, [open]);

  const handleCreateCompany = async (label: string) => {
    await supabase.from("third_party_companies").insert({ company_name: label });
    setCompanyOptions(prev => [...prev, { value: label, label }].sort((a, b) => a.label.localeCompare(b.label)));
    return label;
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      let thirdPartyCompanyId = null;
      let clientCompanyId = null;

      if (form.company) {
        const { data: clientCo } = await supabase.from("acc_portal_company_duplicate").select("id").ilike("company_name", form.company).limit(1);
        if (clientCo && clientCo.length > 0) {
          clientCompanyId = clientCo[0].id;
        } else {
          const { data: tpcCo } = await supabase.from("third_party_companies").select("id").ilike("company_name", form.company).limit(1);
          if (tpcCo && tpcCo.length > 0) {
            thirdPartyCompanyId = tpcCo[0].id;
          } else {
            const { data: newCo } = await supabase.from("third_party_companies").insert({ company_name: form.company }).select("id").single();
            thirdPartyCompanyId = newCo?.id;
          }
        }
      }

      const { data, error } = await supabase.from("third_party_contacts").insert({
        contact_name: form.name,
        email_address: form.email || null,
        personal_mobile: form.phone || null,
        position: form.position || null,
        contact_type: "Recommender",
        client_company_id: clientCompanyId,
        third_party_company_id: thirdPartyCompanyId,
        status: "active",
      }).select("*").single();

      if (error) throw error;

      toast.success("Recommender created!");
      onCreated({
        id: data.id, contact_name: data.contact_name, email_address: data.email_address,
        personal_mobile: data.personal_mobile, position: data.position,
        client_company_id: data.client_company_id, third_party_company_id: data.third_party_company_id,
        company_name: form.company || null, source: "third_party",
      });
      setForm({ name: "", position: "", email: "", phone: "", company: "" });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center"><Plus className="h-4 w-4 text-blue-600" /></div>
            Add New Recommender
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-semibold text-slate-600">Full Name *</Label>
            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. John Smith" className="h-8 text-xs mt-1" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600">Position / Title</Label>
            <Input value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))} placeholder="e.g. Director" className="h-8 text-xs mt-1" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600">Company</Label>
            <CreatableCombobox options={companyOptions} value={form.company} onChange={v => setForm(p => ({ ...p, company: v }))} onCreateOption={handleCreateCompany} placeholder="Select or create company..." createLabel="Create company" className="h-8 text-xs mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600">Email</Label>
              <Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" className="h-8 text-xs mt-1" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600">Phone</Label>
              <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+254..." className="h-8 text-xs mt-1" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-8 text-xs">Cancel</Button>
          <Button onClick={save} disabled={saving || !form.name.trim()} className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Create Recommender
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
