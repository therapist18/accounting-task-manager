"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Save, Info, Lock, Check, X, ShieldCheck,
  AlertCircle, RefreshCw, ChevronRight, Search,
  ChevronLeft, ChevronsLeft, ChevronsRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { PERMISSIONS } from "@/lib/auth/permissions";
import type { PermissionKey } from "@/lib/auth/permissions";
import type { ScannerUserRole } from "@/lib/auth/types";

const ROLES: { key: ScannerUserRole; label: string }[] = [
  { key: "SuperAdmin", label: "Super Admin" },
  { key: "general_admin", label: "General Admin" },
  { key: "company_admin", label: "Company Admin" },
  { key: "company_staff", label: "Company Staff" },
  { key: "officer", label: "Officer" },
  { key: "petty_cash_user", label: "Petty Cash User" },
];

const ITEMS_PER_PAGE = 10;

export default function AccessControlsPage() {
  const [initialData, setInitialData] = useState<Record<string, PermissionKey[]>>({});
  const [drafts, setDrafts] = useState<Record<string, PermissionKey[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination & Filtering State
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadPermissions();
  }, []);

  async function loadPermissions() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/access-controls/roles");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load permissions.");
      const data = Object.fromEntries(
        (json.roles as { role: string; permissions: PermissionKey[] }[]).map((r) => [r.role, r.permissions])
      );
      setInitialData(data);
      setDrafts(data);
    } catch (err) {
      setError("Failed to load permissions.");
    } finally {
      setLoading(false);
    }
  }

  // Filter Logic
  const filteredPermissions = useMemo(() => {
    return PERMISSIONS.filter(p =>
      p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.group.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.key.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredPermissions.length / ITEMS_PER_PAGE);
  const paginatedPermissions = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredPermissions.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredPermissions, currentPage]);

  // Grouping paginated results
  const groupedPermissions = useMemo(() => {
    return paginatedPermissions.reduce<Record<string, typeof PERMISSIONS>>((groups, p) => {
      groups[p.group] = groups[p.group] ?? [];
      groups[p.group].push(p);
      return groups;
    }, {});
  }, [paginatedPermissions]);

  const hasChanges = useMemo(() => JSON.stringify(initialData) !== JSON.stringify(drafts), [initialData, drafts]);

  function togglePermission(roleKey: string, permission: PermissionKey) {
    setDrafts((current) => {
      const existing = new Set(current[roleKey] ?? []);
      if (existing.has(permission)) existing.delete(permission);
      else existing.add(permission);
      return { ...current, [roleKey]: Array.from(existing) };
    });
  }

  async function saveAllPermissions() {
    setSaving(true);
    try {
      const promises = Object.entries(drafts).map(([roleKey, permissions]) =>
        fetch("/api/auth/access-controls/roles", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: roleKey, permissions }),
        })
      );
      await Promise.all(promises);
      setInitialData(drafts);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] max-w-[1600px] mx-auto p-6 space-y-6">

      {/* HEADER SECTION */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xl">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Access Control Matrix</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-medium text-slate-500">Security Management</span>
              <div className="h-1 w-1 rounded-full bg-slate-300" />
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{filteredPermissions.length} Total Rules</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64 hidden lg:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search permissions..."
              className="pl-9 bg-white border-slate-200"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <Button
            onClick={saveAllPermissions}
            disabled={saving || !hasChanges}
            className={cn("h-11 px-6 shadow-lg transition-all", hasChanges ? "bg-indigo-600 hover:bg-indigo-700" : "bg-slate-800")}
          >
            {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Deploy Changes
          </Button>
        </div>
      </div>

      {/* TABLE CONTAINER - STICKY MAGIC STARTS HERE */}
      <div className="relative flex-1 min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col overflow-hidden">
        <div className="overflow-auto flex-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          <TooltipProvider delayDuration={0}>
            <Table className="border-separate border-spacing-0">
              <TableHeader className="sticky top-0 z-30">
                <TableRow className="bg-slate-50/95 backdrop-blur-sm hover:bg-slate-50/95">
                  <TableHead className="sticky left-0 z-40 w-[300px] min-w-[300px] bg-slate-50 border-r border-b font-bold text-slate-900 py-6 px-8 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                    System Permissions
                  </TableHead>
                  {ROLES.map((role) => (
                    <TableHead key={role.key} className="text-center min-w-[150px] border-b bg-slate-50/50">
                      <span className="text-xs font-black uppercase tracking-tighter text-slate-600">{role.label}</span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={ROLES.length + 1} className="h-64 text-center">Loading...</TableCell></TableRow>
                ) : Object.entries(groupedPermissions).map(([group, permissions]) => (
                  <React.Fragment key={group}>
                    <TableRow className="bg-slate-50/30">
                      <TableCell colSpan={ROLES.length + 1} className="py-2 px-8 border-b sticky left-0 z-10">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">{group}</span>
                      </TableCell>
                    </TableRow>
                    {permissions.map((p) => (
                      <TableRow key={p.key} className="group hover:bg-indigo-50/20 transition-colors">
                        <TableCell className="sticky left-0 z-20 bg-white group-hover:bg-indigo-50/10 py-5 px-8 border-r border-b shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-800">{p.label}</span>
                              <Tooltip>
                                <TooltipTrigger><Info className="h-3 w-3 text-slate-300" /></TooltipTrigger>
                                <TooltipContent className="bg-slate-900 text-[10px]">{p.key}</TooltipContent>
                              </Tooltip>
                            </div>
                            <span className="text-[11px] text-slate-500 line-clamp-1">{p.description}</span>
                          </div>
                        </TableCell>
                        {ROLES.map((role) => (
                          <TableCell key={`${role.key}-${p.key}`} className="text-center border-b p-0 group-hover:bg-indigo-50/5">
                            <div className="flex items-center justify-center">
                              <Switch
                                checked={(drafts[role.key] ?? []).includes(p.key)}
                                onCheckedChange={() => togglePermission(role.key, p.key)}
                                className="data-[state=checked]:bg-indigo-600"
                              />
                            </div>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </TooltipProvider>
        </div>

        {/* PAGINATION FOOTER */}
        <div className="shrink-0 border-t bg-slate-50/50 px-6 py-4 flex items-center justify-between">
          <p className="text-xs font-medium text-slate-500">
            Showing <span className="text-slate-900">{Math.min(filteredPermissions.length, (currentPage - 1) * ITEMS_PER_PAGE + 1)}</span> to <span className="text-slate-900">{Math.min(filteredPermissions.length, currentPage * ITEMS_PER_PAGE)}</span> of <span className="text-slate-900">{filteredPermissions.length}</span> results
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setCurrentPage(prev => prev - 1)} disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-1 mx-2">
              <span className="text-xs font-bold px-3 py-1 bg-white border rounded shadow-sm text-indigo-600">{currentPage}</span>
              <span className="text-xs text-slate-400">of</span>
              <span className="text-xs font-bold px-3 py-1 text-slate-600">{totalPages}</span>
            </div>

            <Button
              variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setCurrentPage(prev => prev + 1)} disabled={currentPage === totalPages}
            >
              <ChevronsRight className="h-4 w-4 rotate-180" /> {/* Reusing icon for next */}
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* SUCCESS/ERROR TOASTS */}
      {saved && (
        <div className="fixed bottom-10 right-10 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right-10">
          <div className="h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check className="h-5 w-5 text-white" />
          </div>
          <p className="text-sm font-bold">Permissions Updated Successfully</p>
        </div>
      )}
    </div>
  );
}