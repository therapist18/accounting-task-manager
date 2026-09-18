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

// Module-level cache + in-flight dedup: every mounted useCurrentUser() instance (and there
// can be dozens at once — e.g. one per EditableStageCell in a task table) shares a single
// /api/auth/session request instead of each firing its own on mount.
let sessionCache: { user: AuthUser | null; timestamp: number } | null = null;
let sessionPromise: Promise<AuthUser | null> | null = null;
const SESSION_CACHE_MS = 30 * 1000;

async function loadSession(): Promise<AuthUser | null> {
  const now = Date.now();
  if (sessionCache && now - sessionCache.timestamp < SESSION_CACHE_MS) {
    return sessionCache.user;
  }
  if (!sessionPromise) {
    sessionPromise = (async () => {
      try {
        const response = await fetch("/api/auth/session");
        const json = await response.json();
        const user = json?.authenticated && json?.user ? json.user : null;
        sessionCache = { user, timestamp: Date.now() };
        return user;
      } catch (error) {
        console.error(error);
        sessionCache = { user: null, timestamp: Date.now() };
        return null;
      } finally {
        sessionPromise = null;
      }
    })();
  }
  return sessionPromise;
}

export function useCurrentUser() {
  const [user, setUser] = useState<AuthUser | null>(sessionCache?.user ?? null);
  const [loading, setLoading] = useState(
    !sessionCache || Date.now() - sessionCache.timestamp >= SESSION_CACHE_MS
  );

  useEffect(() => {
    let cancelled = false;
    loadSession()
      .then((loadedUser) => {
        if (!cancelled) setUser(loadedUser);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading };
}
