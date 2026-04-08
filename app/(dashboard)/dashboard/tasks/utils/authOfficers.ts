export type AuthOfficer = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  username?: string | null;
  isActive?: boolean;
  createdAt?: string;
  lastLogin?: string | null;
  name?: string;
  full_name?: string;
  jobLevels?: any[];
};

export function getOfficerDisplayName(officer: Partial<AuthOfficer> & { name?: string; full_name?: string }) {
  const fullName = `${officer.firstName ?? ""} ${officer.lastName ?? ""}`.trim();
  return fullName || officer.full_name || officer.name || officer.username || officer.email || "Unknown Officer";
}

export function normalizeAuthOfficer<T extends Partial<AuthOfficer> & { id: string | number; name?: string; full_name?: string }>(officer: T) {
  const displayName = getOfficerDisplayName(officer);

  return {
    ...officer,
    id: officer.id.toString(),
    name: displayName,
    full_name: displayName,
    jobLevels: officer.jobLevels || [],
    isActive: officer.isActive,
    firstName: officer.firstName,
    lastName: officer.lastName,
    createdAt: officer.createdAt,
    lastLogin: officer.lastLogin,
  };
}

export async function fetchAuthOfficers() {
  const response = await fetch("/api/auth/users/unified?role=officer&payrollAccess=true");
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json?.error ?? "Failed to fetch officers");
  }

  return Array.isArray(json.data) ? json.data.map(normalizeAuthOfficer) : [];
}
