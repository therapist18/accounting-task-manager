export type AuthOfficer = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  username?: string | null;
  isActive?: boolean;
  createdAt?: string;
  lastLogin?: string | null;
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
  };
}

export async function fetchAuthOfficers() {
  const response = await fetch("/api/auth/officers");
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json?.error ?? "Failed to fetch officers");
  }

  return Array.isArray(json) ? json.map(normalizeAuthOfficer) : [];
}
