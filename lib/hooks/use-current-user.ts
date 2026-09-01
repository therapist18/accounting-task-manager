"use client";

import { useEffect, useState } from "react";

// Shared with components/sidebar.tsx, which used to define its own copy of this hook + helper
// inline — extracted here so any page that needs to gate an action by the Access Control
// Matrix (not just nav-item visibility) can reuse the exact same client-side check instead of
// re-deriving it.
export type AuthUser = {
  isSuperAdmin?: boolean;
  permissions?: string[];
  name?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  [key: string]: any;
};

export function hasPermission(user: AuthUser | null, permission: string) {
  if (!permission) return true;
  if (user?.isSuperAdmin) return true;
  return Array.isArray(user?.permissions) && user.permissions.includes(permission);
}

export function useCurrentUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch("/api/auth/session");
        const json = await response.json();
        if (json?.authenticated && json?.user) {
          setUser(json.user);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  return { user, loading };
}
