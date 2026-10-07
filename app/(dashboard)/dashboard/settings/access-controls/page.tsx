"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eraser, RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  AccessMatrix,
  DataTable,
  EmptyState,
  MultiUserPicker,
  PillTabs,
  StatusPill,
  ToolbarButton,
  USER_SCOPE_TABS,
  isBclStaff,
  type CellState,
  type UserScope,
  type DTColumn,
  type MatrixPermission,
  type MatrixSection,
} from "@/components/access-matrix";
import { theme } from "@/components/access-matrix/theme";
import { PERMISSIONS, type PermissionKey } from "@/lib/auth/permissions";
import type { ScannerUserRole } from "@/lib/auth/types";

// Access lives entirely in each user's scanner_users.task_manager_access column. A role is the
// users who have it: editing a role writes into every one of them. Same design as BCL Registry's
// User Rights module (components/access-matrix).

const ROLES: { key: ScannerUserRole; label: string }[] = [
  { key: "general_admin", label: "General Admin" },
  { key: "company_admin", label: "Company Admin" },
  { key: "company_staff", label: "Company Staff" },
  { key: "bcl_staff", label: "BCL Staff" },
  { key: "officer", label: "Officer" },
  { key: "petty_cash_user", label: "Petty Cash User" },
];

const ROLE_LABELS: Record<string, string> = {
  SuperAdmin: "Super Admin",
  ...Object.fromEntries(ROLES.map((r) => [r.key, r.label])),
};

// Columns: every permission, grouped by its category. Actions nested under a page say so.
const MATRIX_PERMISSIONS: MatrixPermission[] = PERMISSIONS.map((p) => {
  const parent = p.parentKey ? PERMISSIONS.find((q) => q.key === p.parentKey) : null;
  return { key: p.key, label: parent ? `${parent.label} › ${p.label}` : p.label, group: p.group };
});

type Section = "users" | "roles" | "user";

interface AccessUser {
  id: string;
  displayName: string;
  email: string | null;
  role: ScannerUserRole;
  isActive: boolean;
  companyIds: number[];
  hasAllCompanyAccess: boolean;
}

interface RoleSummary {
  role: string;
  userCount: number;
  permissions: PermissionKey[];
  partial: PermissionKey[];
}

async function requestJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok || json?.success === false) throw new Error(json?.error ?? "Request failed");
  return json;
}

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export default function AccessControlsPage() {
  const [section, setSection] = useState<Section>("users");
  // BCL Staff (company 10) by default, like BCL Registry; "All Users" shows everyone.
  const [scope, setScope] = useState<UserScope>("bcl");
  const [error, setError] = useState<string | null>(null);

  // ── Users ──
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      setUsers((await requestJson("/api/auth/access-controls/users")).users);
    } catch (e) {
      setError(errorText(e, "Failed to load users."));
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // ── Roles ──
  const [summaries, setSummaries] = useState<RoleSummary[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [roleSaving, setRoleSaving] = useState<Set<string>>(new Set());
  const loadRoles = useCallback(async (showLoading = true) => {
    if (showLoading) setRolesLoading(true);
    try {
      setSummaries((await requestJson("/api/auth/access-controls/roles")).roles);
    } catch (e) {
      setError(errorText(e, "Failed to load role permissions."));
    } finally {
      if (showLoading) setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadRoles();
  }, [loadUsers, loadRoles]);

  const summaryByRole = useMemo(() => new Map(summaries.map((s) => [s.role, s])), [summaries]);

  const roleCell = useCallback(
    (role: string, key: string): CellState => {
      const s = summaryByRole.get(role);
      if (!s) return "none";
      if (s.permissions.includes(key as PermissionKey)) return "all";
      if (s.partial.includes(key as PermissionKey)) return "some";
      return "none";
    },
    [summaryByRole]
  );

  /** Writes changes into every user of each role, then shows the server's summary. */
  const saveRoles = useCallback(
    async (roles: string[], changes: Record<string, boolean>) => {
      const keys = roles.flatMap((role) => Object.keys(changes).map((key) => `${role}:${key}`));
      // Optimistic: all users of those roles now have exactly these values.
      setSummaries((prev) =>
        prev.map((s) => {
          if (!roles.includes(s.role)) return s;
          const permissions = new Set(s.permissions);
          const partial = new Set(s.partial);
          for (const [key, value] of Object.entries(changes)) {
            partial.delete(key as PermissionKey);
            if (value) permissions.add(key as PermissionKey);
            else permissions.delete(key as PermissionKey);
          }
          return { ...s, permissions: [...permissions], partial: [...partial] };
        })
      );
      setRoleSaving((prev) => new Set([...prev, ...keys]));
      try {
        let latest: RoleSummary[] | null = null;
        for (const role of roles) {
          latest = (
            await requestJson("/api/auth/access-controls/roles", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role, changes }),
            })
          ).roles;
        }
        if (latest) setSummaries(latest);
      } catch (e) {
        setError(errorText(e, "Failed to save role permissions."));
        await loadRoles(false);
      } finally {
        setRoleSaving((prev) => {
          const next = new Set(prev);
          keys.forEach((k) => next.delete(k));
          return next;
        });
      }
    },
    [loadRoles]
  );

  const roleSections = useMemo<MatrixSection[]>(
    () =>
      ROLES.map((role) => {
        const count = summaryByRole.get(role.key)?.userCount ?? 0;
        return { id: role.key, label: role.label, detail: `${count} user${count === 1 ? "" : "s"}`, readOnly: count === 0 };
      }),
    [summaryByRole]
  );
  const editableRoles = roleSections.filter((s) => !s.readOnly).map((s) => s.id);

  const clearAllRoles = () => {
    if (!window.confirm("Turn off every permission for every user in these roles? They lose access to Task Manager until switches are turned on again. Super Admins are not affected.")) return;
    void saveRoles(editableRoles, Object.fromEntries(MATRIX_PERMISSIONS.map((p) => [p.key, false])));
  };

  // ── Selected users ──
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [accessByUser, setAccessByUser] = useState<Record<string, { role: string; permissions: PermissionKey[] }>>({});
  const [accessLoading, setAccessLoading] = useState(false);
  const [userSaving, setUserSaving] = useState<Set<string>>(new Set());
  const selectedUsers = useMemo(() => users.filter((u) => selectedIds.includes(u.id)), [users, selectedIds]);

  const loadSelectedAccess = useCallback(async () => {
    if (selectedIds.length === 0) {
      setAccessByUser({});
      return;
    }
    setAccessLoading(true);
    try {
      const json = await requestJson(`/api/auth/access-controls/users?userIds=${encodeURIComponent(selectedIds.join(","))}`);
      setAccessByUser(json.accessByUser);
    } catch (e) {
      setError(errorText(e, "Failed to load user access."));
    } finally {
      setAccessLoading(false);
    }
  }, [selectedIds]);

  useEffect(() => {
    loadSelectedAccess();
  }, [loadSelectedAccess]);

  const userCell = useCallback(
    (userId: string, key: string): CellState =>
      accessByUser[userId]?.role === "SuperAdmin" || accessByUser[userId]?.permissions.includes(key as PermissionKey)
        ? "all"
        : "none",
    [accessByUser]
  );

  const saveUsers = useCallback(
    async (userIds: string[], changes: Record<string, boolean>) => {
      const targets = userIds.filter((id) => accessByUser[id] && accessByUser[id].role !== "SuperAdmin");
      if (targets.length === 0) return;
      const keys = targets.flatMap((id) => Object.keys(changes).map((key) => `${id}:${key}`));
      setAccessByUser((prev) => {
        const next = { ...prev };
        for (const id of targets) {
          const perms = new Set(prev[id].permissions);
          for (const [key, value] of Object.entries(changes)) {
            if (value) perms.add(key as PermissionKey);
            else perms.delete(key as PermissionKey);
          }
          next[id] = { ...prev[id], permissions: [...perms] };
        }
        return next;
      });
      setUserSaving((prev) => new Set([...prev, ...keys]));
      try {
        await Promise.all(
          targets.map((userId) =>
            requestJson("/api/auth/access-controls/users", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId, permissions: changes }),
            })
          )
        );
      } catch (e) {
        setError(errorText(e, "Failed to save user access."));
      } finally {
        await loadSelectedAccess();
        setUserSaving((prev) => {
          const next = new Set(prev);
          keys.forEach((k) => next.delete(k));
          return next;
        });
      }
    },
    [accessByUser, loadSelectedAccess]
  );

  const resetSelectedToDefaults = async () => {
    const label = selectedUsers.length === 1 ? selectedUsers[0].displayName : `${selectedUsers.length} users`;
    if (!window.confirm(`Replace everything set for ${label} with the built-in defaults for their role?`)) return;
    setAccessLoading(true);
    try {
      await Promise.all(
        selectedIds.map((id) =>
          requestJson(`/api/auth/access-controls/users?userId=${encodeURIComponent(id)}`, { method: "DELETE" })
        )
      );
    } catch (e) {
      setError(errorText(e, "Failed to reset user access."));
    } finally {
      await loadSelectedAccess();
    }
  };

  const userSections = useMemo<MatrixSection[]>(
    () =>
      selectedUsers.map((u) => ({
        id: u.id,
        label: u.displayName,
        detail: ROLE_LABELS[u.role] ?? u.role,
        readOnly: u.role === "SuperAdmin",
      })),
    [selectedUsers]
  );

  // ── Users table ──
  const userColumns = useMemo<DTColumn<AccessUser>[]>(
    () => [
      { id: "name", header: "Name", sticky: true, width: 220, searchable: true, text: (u) => u.displayName, accessor: (u) => <span className="font-medium">{u.displayName}</span> },
      { id: "id", header: "ID", width: 300, searchable: true, text: (u) => u.id, accessor: (u) => <span className="font-mono text-[11px] text-muted-foreground" title={u.id}>{u.id}</span> },
      { id: "email", header: "Email", width: 240, searchable: true, text: (u) => u.email ?? "", accessor: (u) => u.email || <span className="font-medium text-red-500">Missing</span> },
      { id: "role", header: "Role", width: 160, searchable: true, text: (u) => ROLE_LABELS[u.role] ?? u.role, accessor: (u) => ROLE_LABELS[u.role] ?? u.role },
      { id: "status", header: "Status", width: 110, align: "center", text: (u) => (u.isActive ? "Active" : "Inactive"), accessor: (u) => <StatusPill active={u.isActive} /> },
      {
        id: "permissions",
        header: "Permissions",
        width: 140,
        align: "center",
        text: () => "",
        accessor: (u) => (
          <ToolbarButton
            className={theme.compactButton}
            onClick={() => {
              setSelectedIds([u.id]);
              setSection("user");
            }}
          >
            <SlidersHorizontal />
            {u.role === "SuperAdmin" ? "Full access" : "Permissions"}
          </ToolbarButton>
        ),
      },
    ],
    []
  );

  const scopedUsers = useMemo(
    () => (scope === "bcl" ? users.filter((u) => isBclStaff(u.companyIds, u.hasAllCompanyAccess)) : users),
    [users, scope]
  );
  const activeUsers = scopedUsers.filter((u) => u.isActive).length;
  const scopeTabs = <PillTabs variant="sub" tabs={USER_SCOPE_TABS} value={scope} onValueChange={setScope} />;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-slate-50/50">
      {/* Row 1: identity — same hierarchy as the KRA Email Center */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200/80 bg-white px-4 py-2.5 antialiased">
        <h1 className="text-2xl font-bold leading-none tracking-tight text-slate-900">User Access</h1>
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-sm font-semibold text-custom-blue">
          Task Manager
        </span>
        <div className="hidden items-center gap-1.5 text-base text-slate-500 md:flex">
          <span>
            {scopedUsers.length} user{scopedUsers.length === 1 ? "" : "s"}
          </span>
          <span className="text-slate-300">·</span>
          <span>{activeUsers} active</span>
        </div>
      </div>

      {/* Row 2: tabs + this tab's controls */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200/80 bg-slate-50/60 px-4 py-2 antialiased">
        <PillTabs
          tabs={[
            { value: "users", label: "Users", count: scopedUsers.length },
            { value: "roles", label: "Role Permissions", count: ROLES.length },
            { value: "user", label: "User Permissions" },
          ]}
          value={section}
          onValueChange={setSection}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {section === "users" && scopeTabs}
          {section === "roles" && (
            <span className="text-base text-slate-500">
              Editing a role writes into every user with that role. A dash means only some of them have it.
            </span>
          )}
          {section === "user" && scopeTabs}
          {section === "user" && (
            <MultiUserPicker
              value={selectedIds}
              onValueChange={setSelectedIds}
              options={scopedUsers.map((u) => ({ value: u.id, label: `${u.displayName} · ${ROLE_LABELS[u.role] ?? u.role}` }))}
            />
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
      {error && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-base text-red-700">
          {error}
          <button type="button" className="font-semibold hover:underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {section === "users" && (
        <DataTable
          title="Task Manager Users"
          showRowNumber
          columns={userColumns}
          data={scopedUsers}
          getRowId={(u) => u.id}
          loading={usersLoading}
          searchPlaceholder="Search users..."
          onRefresh={loadUsers}
          pageSize={50}
        />
      )}

      {section === "roles" && (
        <AccessMatrix
          title="Task Manager Role Permissions"
          sectionHeader="Role"
          sections={roleSections}
          permissions={MATRIX_PERMISSIONS}
          getCell={roleCell}
          isSaving={(role, key) => roleSaving.has(`${role}:${key}`)}
          onChange={(role, key, value) => saveRoles([role], { [key]: value })}
          onSelectColumn={(key, value) => saveRoles(editableRoles, { [key]: value })}
          loading={rolesLoading}
          onRefresh={() => loadRoles()}
          actions={
            <ToolbarButton tone="danger" onClick={clearAllRoles} disabled={rolesLoading || editableRoles.length === 0}>
              <Eraser />
              <span className="hidden sm:inline">Clear all</span>
            </ToolbarButton>
          }
        />
      )}

      {section === "user" &&
        (selectedUsers.length > 0 ? (
          <AccessMatrix
            title="Task Manager User Permissions"
            sectionHeader="User"
            sections={userSections}
            permissions={MATRIX_PERMISSIONS}
            getCell={userCell}
            isSaving={(id, key) => userSaving.has(`${id}:${key}`)}
            onChange={(id, key, value) => saveUsers([id], { [key]: value })}
            onSelectColumn={(key, value) => saveUsers(selectedIds, { [key]: value })}
            loading={accessLoading && Object.keys(accessByUser).length === 0}
            onRefresh={loadSelectedAccess}
            actions={
              <ToolbarButton onClick={resetSelectedToDefaults} disabled={accessLoading}>
                <RotateCcw />
                <span className="hidden sm:inline">Reset to role defaults</span>
              </ToolbarButton>
            }
          />
        ) : (
          <EmptyState>
            Pick one or more users above (or <span className="font-semibold text-foreground">Select all</span>), or use{" "}
            <span className="font-semibold text-foreground">Permissions</span> on the Users tab, to set exactly what each
            person can do.
          </EmptyState>
        ))}
      </div>
    </div>
  );
}
