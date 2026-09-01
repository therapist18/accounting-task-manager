"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Save, Info, Lock, Check,
  RefreshCw, ChevronDown, ChevronRight, Search,
  CornerDownRight,
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
import { cn } from "@/lib/utils";

import { PERMISSIONS, type PermissionDefinition } from "@/lib/auth/permissions";
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

// Category (group) -> Page/Component (a permission with no parentKey) -> Action (a permission
// whose parentKey points at that page) — a real tree instead of one flat list per group, so
// "Manage Couriers" reads as nested inside "Passport Endorsement Tracking" rather than sitting
// beside it as an unrelated row.
interface PageNode {
  permission: PermissionDefinition;
  children: PermissionDefinition[];
}
interface GroupNode {
  group: string;
  pages: PageNode[];
}

function buildTree(permissions: PermissionDefinition[]): GroupNode[] {
  const byKey = new Map(permissions.map((p) => [p.key, p]));
  const topLevel = permissions.filter((p) => !p.parentKey || !byKey.has(p.parentKey));
  const childrenByParent = new Map<string, PermissionDefinition[]>();
  permissions.forEach((p) => {
    if (p.parentKey && byKey.has(p.parentKey)) {
      const list = childrenByParent.get(p.parentKey) || [];
      list.push(p);
      childrenByParent.set(p.parentKey, list);
    }
  });

  const groups = new Map<string, PageNode[]>();
  topLevel.forEach((p) => {
    const list = groups.get(p.group) || [];
    list.push({ permission: p, children: childrenByParent.get(p.key) || [] });
    groups.set(p.group, list);
  });

  return Array.from(groups.entries()).map(([group, pages]) => ({ group, pages }));
}

export default function AccessControlsPage() {
  const [initialData, setInitialData] = useState<Record<string, PermissionKey[]>>({});
  const [drafts, setDrafts] = useState<Record<string, PermissionKey[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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

  const tree = useMemo(() => buildTree(PERMISSIONS), []);

  // A page or action matches on its own label/key/description; a page also counts as a match
  // if any of its actions match, so searching "courier" still surfaces the Passport Endorsement
  // Tracking page (with only the matching action shown under it) rather than nothing at all.
  const filteredTree = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tree;

    const matches = (p: PermissionDefinition) =>
      p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);

    return tree
      .map((g) => {
        const pages = g.pages
          .map((page) => {
            const childMatches = page.children.filter(matches);
            const pageMatches = matches(page.permission);
            if (!pageMatches && childMatches.length === 0) return null;
            return { permission: page.permission, children: pageMatches ? page.children : childMatches };
          })
          .filter((p): p is PageNode => p !== null);
        return pages.length > 0 ? { group: g.group, pages } : null;
      })
      .filter((g): g is GroupNode => g !== null);
  }, [tree, searchQuery]);

  const totalRules = useMemo(() => PERMISSIONS.length, []);
  const visibleRules = useMemo(
    () => filteredTree.reduce((sum, g) => sum + g.pages.reduce((s, p) => s + 1 + p.children.length, 0), 0),
    [filteredTree]
  );

  const hasChanges = useMemo(() => JSON.stringify(initialData) !== JSON.stringify(drafts), [initialData, drafts]);

  function togglePermission(roleKey: string, permission: PermissionKey) {
    setDrafts((current) => {
      const existing = new Set(current[roleKey] ?? []);
      if (existing.has(permission)) existing.delete(permission);
      else existing.add(permission);
      return { ...current, [roleKey]: Array.from(existing) };
    });
  }

  function toggleGroupCollapsed(group: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
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
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{totalRules} Total Rules</span>
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
              onChange={(e) => setSearchQuery(e.target.value)}
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

      {/* TABLE CONTAINER */}
      <div className="relative flex-1 min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col overflow-hidden">
        <div className="overflow-auto flex-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          <TooltipProvider delayDuration={0}>
            <Table className="border-separate border-spacing-0">
              <TableHeader className="sticky top-0 z-30">
                <TableRow className="bg-slate-50/95 backdrop-blur-sm hover:bg-slate-50/95">
                  <TableHead className="sticky left-0 z-40 w-14 min-w-14 bg-slate-50 border-r border-b font-bold text-slate-500 py-6 text-center shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                    #
                  </TableHead>
                  <TableHead className="sticky left-14 z-40 w-[320px] min-w-[320px] bg-slate-50 border-r border-b font-bold text-slate-900 py-6 px-6 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
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
                  <TableRow><TableCell colSpan={ROLES.length + 2} className="h-64 text-center">Loading...</TableCell></TableRow>
                ) : filteredTree.length === 0 ? (
                  <TableRow><TableCell colSpan={ROLES.length + 2} className="h-40 text-center text-sm text-slate-400">No permissions match "{searchQuery}".</TableCell></TableRow>
                ) : filteredTree.map((g, groupIdx) => {
                  const groupIndex = groupIdx + 1;
                  const isCollapsed = collapsedGroups.has(g.group);
                  return (
                    <React.Fragment key={g.group}>
                      <TableRow className="bg-slate-100/70 hover:bg-slate-100/70">
                        <TableCell className="sticky left-0 z-20 bg-slate-100/70 border-r border-b py-2.5 text-center">
                          <span className="text-[10px] font-black text-slate-400">{groupIndex}</span>
                        </TableCell>
                        <TableCell colSpan={ROLES.length + 1} className="py-2.5 px-6 border-b sticky left-14 z-10">
                          <button
                            type="button"
                            onClick={() => toggleGroupCollapsed(g.group)}
                            className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.15em] text-indigo-600 hover:text-indigo-700"
                          >
                            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            {g.group}
                            <span className="font-semibold text-slate-400 normal-case tracking-normal">
                              ({g.pages.reduce((s, p) => s + 1 + p.children.length, 0)})
                            </span>
                          </button>
                        </TableCell>
                      </TableRow>

                      {!isCollapsed && g.pages.map((page, pageIdx) => {
                        const pageIndex = `${groupIndex}.${pageIdx + 1}`;
                        return (
                          <React.Fragment key={page.permission.key}>
                            <TableRow className="group hover:bg-indigo-50/20 transition-colors">
                              <TableCell className="sticky left-0 z-20 bg-white group-hover:bg-indigo-50/10 border-r border-b text-center">
                                <span className="text-[11px] font-bold text-slate-400 tabular-nums">{pageIndex}</span>
                              </TableCell>
                              <TableCell className="sticky left-14 z-20 bg-white group-hover:bg-indigo-50/10 py-5 px-6 border-r border-b shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-slate-800">{page.permission.label}</span>
                                    <Tooltip>
                                      <TooltipTrigger><Info className="h-3 w-3 text-slate-300" /></TooltipTrigger>
                                      <TooltipContent className="bg-slate-900 text-[10px]">{page.permission.key}</TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <span className="text-[11px] text-slate-500 line-clamp-1">{page.permission.description}</span>
                                </div>
                              </TableCell>
                              {ROLES.map((role) => (
                                <TableCell key={`${role.key}-${page.permission.key}`} className="text-center border-b p-0 group-hover:bg-indigo-50/5">
                                  <div className="flex items-center justify-center">
                                    <Switch
                                      checked={(drafts[role.key] ?? []).includes(page.permission.key)}
                                      onCheckedChange={() => togglePermission(role.key, page.permission.key)}
                                      className="data-[state=checked]:bg-indigo-600"
                                    />
                                  </div>
                                </TableCell>
                              ))}
                            </TableRow>

                            {page.children.map((action, actionIdx) => {
                              const actionIndex = `${pageIndex}.${actionIdx + 1}`;
                              return (
                                <TableRow key={action.key} className="group hover:bg-indigo-50/20 transition-colors">
                                  <TableCell className="sticky left-0 z-20 bg-white group-hover:bg-indigo-50/10 border-r border-b text-center">
                                    <span className="text-[11px] font-medium text-slate-300 tabular-nums">{actionIndex}</span>
                                  </TableCell>
                                  <TableCell className="sticky left-14 z-20 bg-white group-hover:bg-indigo-50/10 py-4 pl-10 pr-6 border-r border-b shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                    <div className="flex items-start gap-2">
                                      <CornerDownRight className="h-3.5 w-3.5 text-slate-300 shrink-0 mt-0.5" />
                                      <div className="flex flex-col gap-0.5 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-semibold text-slate-700">{action.label}</span>
                                          <Tooltip>
                                            <TooltipTrigger><Info className="h-3 w-3 text-slate-300" /></TooltipTrigger>
                                            <TooltipContent className="bg-slate-900 text-[10px]">{action.key}</TooltipContent>
                                          </Tooltip>
                                        </div>
                                        <span className="text-[11px] text-slate-500 line-clamp-1">{action.description}</span>
                                      </div>
                                    </div>
                                  </TableCell>
                                  {ROLES.map((role) => (
                                    <TableCell key={`${role.key}-${action.key}`} className="text-center border-b p-0 group-hover:bg-indigo-50/5">
                                      <div className="flex items-center justify-center">
                                        <Switch
                                          checked={(drafts[role.key] ?? []).includes(action.key)}
                                          onCheckedChange={() => togglePermission(role.key, action.key)}
                                          className="data-[state=checked]:bg-indigo-600"
                                        />
                                      </div>
                                    </TableCell>
                                  ))}
                                </TableRow>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>
        </div>

        {/* FOOTER */}
        <div className="shrink-0 border-t bg-slate-50/50 px-6 py-3 flex items-center justify-between">
          <p className="text-xs font-medium text-slate-500">
            Showing <span className="text-slate-900">{visibleRules}</span> of <span className="text-slate-900">{totalRules}</span> permissions across <span className="text-slate-900">{filteredTree.length}</span> categories
          </p>
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
