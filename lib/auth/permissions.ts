import type { ScannerUserRole } from "@/lib/auth/types";

export type PermissionKey =
  | "dashboard.view"
  | "emails.view"
  | "tasks_requirements.view"
  | "tasks.view"
  | "tasks.bypass_sequential_stages"
  | "reports.view"
  | "summary_reports.view"
  | "passport_endorsement.view"
  | "passport_endorsement.couriers.manage"
  | "company_profiles.view"
  | "users.view"
  | "users.manage"
  | "settings.departments.view"
  | "settings.stages.view"
  | "settings.rates.view"
  | "settings.upload_requirements.view"
  | "settings.guidelines.view"
  | "settings.documents_fields.view"
  | "settings.automations.view"
  | "settings.access_controls.view"
  | "settings.access_controls.manage"
  | "templates.view"
  | "master_fields.view"
  | "letters.view"
  | "letterheads.view"
  | "diary.view"
  | "bcl_task_diary.view"
  | "bcl_task_diary.settings.view"
  | "bcl_task_diary.admin.view"
  | "applications.view";

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  group: string;
  description: string;
  paths?: string[];
  // Nests this permission under another one that represents the actual page/component it acts
  // on — e.g. "Manage Couriers" has no page of its own, it's an action inside the Passport
  // Endorsement Tracking page. Lets the Access Control Matrix render a real
  // category -> page/component -> action tree instead of one flat list per group.
  parentKey?: PermissionKey;
}

export const PERMISSIONS: PermissionDefinition[] = [
  { key: "dashboard.view", label: "Dashboard", group: "Workspace", description: "View the main dashboard.", paths: ["/dashboard"] },
  { key: "emails.view", label: "Email Inbox", group: "Workspace", description: "View connected email inboxes.", paths: ["/dashboard/emails"] },
  { key: "tasks_requirements.view", label: "Task Requirements", group: "Task Management", description: "View task requirement records.", paths: ["/dashboard/tasks-requirements"] },
  { key: "tasks.view", label: "Task Tracking", group: "Task Management", description: "View and work with tracked tasks.", paths: ["/dashboard/tasks"] },
  { key: "tasks.bypass_sequential_stages", label: "Bypass Stage Order", group: "Task Management", description: "Update any stage on a task at any time, regardless of order. Without this, stages must be completed or skipped in order before later ones become editable.", parentKey: "tasks.view" },
  { key: "reports.view", label: "Reports", group: "Task Management", description: "View reports dashboards.", paths: ["/dashboard/reports"] },
  { key: "summary_reports.view", label: "Summary Reports Dashboard", group: "Task Management", description: "View the admin summary reports dashboard.", paths: ["/dashboard/summary-reports"] },
  { key: "passport_endorsement.view", label: "Passport Endorsement Tracking", group: "Task Management", description: "Track passport handling and Nyayo House endorsement for immigration tasks.", paths: ["/dashboard/passport-endorsement"] },
  { key: "passport_endorsement.couriers.manage", label: "Manage Couriers", group: "Task Management", description: "Add and edit courier/rider service records used for passport receipt and dispatch.", parentKey: "passport_endorsement.view" },
  { key: "company_profiles.view", label: "Company Profiles", group: "Task Management", description: "View company profiles: their people and tasks.", paths: ["/dashboard/company-profiles"] },
  { key: "users.view", label: "View Users", group: "Administration", description: "Open user management screens.", paths: ["/dashboard/users-management"] },
  { key: "users.manage", label: "Manage Users", group: "Administration", description: "Create, update, and delete user accounts.", parentKey: "users.view" },
  { key: "settings.departments.view", label: "Departments", group: "Settings", description: "Manage department structures.", paths: ["/dashboard/departments/departments", "/dashboard/departments"] },
  { key: "settings.stages.view", label: "Stages", group: "Settings", description: "Manage stage definitions.", paths: ["/dashboard/departments/stages"] },
  { key: "settings.rates.view", label: "Rates", group: "Settings", description: "Manage rates and charges.", paths: ["/dashboard/departments/rates"] },
  { key: "settings.upload_requirements.view", label: "Upload Requirements", group: "Settings", description: "Manage upload requirements.", paths: ["/dashboard/departments/upload-requirements"] },
  { key: "settings.guidelines.view", label: "Guidelines", group: "Settings", description: "Manage department guidelines.", paths: ["/dashboard/departments/guidelines", "/dashboard/departments/department-guidelines", "/dashboard/departments/job-specific-questions"] },
  { key: "settings.documents_fields.view", label: "Documents + Fields", group: "Settings", description: "Manage documents and field mappings.", paths: ["/dashboard/departments/documents+fields"] },
  { key: "settings.automations.view", label: "Automations", group: "Settings", description: "Manage automation rules.", paths: ["/dashboard/departments/automation"] },
  { key: "settings.access_controls.view", label: "View Access Controls", group: "Settings", description: "View user access settings.", paths: ["/dashboard/settings/access-controls"] },
  { key: "settings.access_controls.manage", label: "Manage Access Controls", group: "Settings", description: "Update user page and action permissions.", parentKey: "settings.access_controls.view" },
  { key: "templates.view", label: "Templates", group: "Documents", description: "View document templates.", paths: ["/dashboard/templates"] },
  { key: "master_fields.view", label: "Master Fields", group: "Documents", description: "View master fields.", paths: ["/dashboard/master-fields"] },
  { key: "letters.view", label: "Letter Generation", group: "Letters", description: "Generate letters.", paths: ["/dashboard/letters", "/dashboard/letters-james"] },
  { key: "letterheads.view", label: "Letterheads", group: "Letters", description: "Manage letterheads.", paths: ["/dashboard/letters/letterheads"] },
  { key: "diary.view", label: "Diary", group: "Diary", description: "View the diary.", paths: ["/dashboard/diary"] },
  { key: "bcl_task_diary.view", label: "BCL Task Diary", group: "Diary", description: "Open personal task diary.", paths: ["/dashboard/bcl-task-diary"] },
  { key: "bcl_task_diary.settings.view", label: "Recurring Templates", group: "Diary", description: "Manage recurring task templates.", paths: ["/dashboard/bcl-task-diary/settings"] },
  { key: "bcl_task_diary.admin.view", label: "Task Diary Admin", group: "Diary", description: "Open task diary admin dashboard.", paths: ["/dashboard/bcl-task-diary/admin"] },
  { key: "applications.view", label: "Applications", group: "Applications", description: "View application workflows.", paths: ["/dashboard/applications"] },
];

const ADMIN_PERMISSIONS: PermissionKey[] = PERMISSIONS.map((permission) => permission.key);

export const DEFAULT_ROLE_PERMISSIONS: Record<ScannerUserRole, PermissionKey[]> = {
  SuperAdmin: ADMIN_PERMISSIONS,
  general_admin: ADMIN_PERMISSIONS,
  company_admin: ADMIN_PERMISSIONS.filter((key) => key !== "settings.access_controls.manage"),
  officer: [
    "dashboard.view",
    "tasks_requirements.view",
    "tasks.view",
    "reports.view",
    "passport_endorsement.view",
    "templates.view",
    "letters.view",
    "diary.view",
    "bcl_task_diary.view",
    "applications.view",
  ],
  company_staff: [
    "dashboard.view",
    "tasks_requirements.view",
    "tasks.view",
    "reports.view",
    "passport_endorsement.view",
    "templates.view",
    "letters.view",
    "diary.view",
    "bcl_task_diary.view",
    "applications.view",
  ],
  petty_cash_user: ["dashboard.view", "reports.view", "diary.view"],
};

export function getDefaultPermissionsForRole(role: ScannerUserRole): PermissionKey[] {
  return DEFAULT_ROLE_PERMISSIONS[role] ?? [];
}

export function findPermissionForPath(pathname: string): PermissionDefinition | null {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const matches = PERMISSIONS
    .filter((permission) =>
      permission.paths?.some((path) => normalizedPath === path || normalizedPath.startsWith(`${path}/`))
    )
    .sort((left, right) => Math.max(...(right.paths ?? [""]).map((p) => p.length)) - Math.max(...(left.paths ?? [""]).map((p) => p.length)));

  return matches[0] ?? null;
}

export function hasPermission(permissions: string[], key: PermissionKey): boolean {
  return permissions.includes(key);
}
