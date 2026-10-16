"use client"

/**
 * A tiny stale-while-revalidate cache that lives for the browser session.
 * (Same pattern as bcl-registry's lib/sessionCache.ts.)
 *
 * Screens used to fetch on mount, so leaving the tasks page and coming back -
 * or opening a second window - meant the same requests again behind a full
 * spinner. A resource here is fetched once, shared by everything that reads it,
 * and refreshed quietly in the background when it goes stale or after a write;
 * the UI keeps showing the cached data meanwhile instead of blanking.
 *
 * ```ts
 * const departments = createSessionResource(() => fetchDepartments())
 * const { data, loading, refreshing, refresh } = useSessionResource(departments)
 *
 * // Keyed (one cache entry per department):
 * const tasksByDept = createSessionResourceFamily((deptId: string) => fetchTasks(deptId))
 * tasksByDept.get("3").ensure()
 * ```
 *
 * Works outside React too (getState / ensure / refresh), which is what lets the
 * large imperative screens adopt it without being rewritten around hooks.
 */

import { useEffect, useSyncExternalStore } from "react"

export interface SessionResourceState<T> {
  data: T | undefined
  error: Error | undefined
  /** A request is in flight (initial load or background revalidation). */
  fetching: boolean
  fetchedAt: number
}

export interface SessionResource<T> {
  getState: () => SessionResourceState<T>
  subscribe: (listener: () => void) => () => void
  /** Refetch now. Concurrent calls share one request. */
  refresh: () => Promise<T>
  /** Fetch only when there is no data yet or it is older than `staleMs`. Never rejects. */
  ensure: () => Promise<T | undefined>
  /** Like ensure(), but rejects when the fetch fails - for callers that report errors. */
  load: () => Promise<T>
  /** True when there is data and it is younger than `staleMs`. */
  isFresh: () => boolean
  /** Patch the cached data locally (realtime events, optimistic updates). */
  mutate: (update: (current: T | undefined) => T | undefined) => void
  /** Mark stale so the next ensure() refetches; keeps the data on screen meanwhile. */
  invalidate: () => void
  /** Drop the data entirely (logout). */
  reset: () => void
}

// Every resource ever created, so logout can wipe them all in one call.
const allResources = new Set<SessionResource<unknown>>()

export function createSessionResource<T>(
  fetcher: () => Promise<T>,
  { staleMs = 2 * 60_000 }: { staleMs?: number } = {}
): SessionResource<T> {
  let state: SessionResourceState<T> = { data: undefined, error: undefined, fetching: false, fetchedAt: 0 }
  let inflight: Promise<T> | null = null
  // Bumped by reset(): a request that started before a logout must not write the
  // previous user's data back into the cache when it lands.
  let generation = 0
  const listeners = new Set<() => void>()

  const set = (patch: Partial<SessionResourceState<T>>) => {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }

  const refresh = () => {
    if (inflight) return inflight
    const startedIn = generation
    set({ fetching: true })
    inflight = fetcher()
      .then((data) => {
        if (startedIn === generation) set({ data, error: undefined, fetching: false, fetchedAt: Date.now() })
        return data
      })
      .catch((error) => {
        if (startedIn === generation) {
          set({ error: error instanceof Error ? error : new Error(String(error?.message ?? error)), fetching: false })
        }
        throw error
      })
      .finally(() => {
        inflight = null
      })
    return inflight
  }

  const isFresh = () => state.data !== undefined && Date.now() - state.fetchedAt < staleMs

  const ensure = async () => {
    if (isFresh()) return state.data
    try {
      return await refresh()
    } catch {
      return state.data
    }
  }

  const resource: SessionResource<T> = {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    refresh,
    ensure,
    load: () => (isFresh() ? Promise.resolve(state.data as T) : refresh()),
    isFresh,
    mutate: (update) => set({ data: update(state.data) }),
    invalidate: () => set({ fetchedAt: 0 }),
    reset: () => {
      generation += 1
      inflight = null
      set({ data: undefined, error: undefined, fetching: false, fetchedAt: 0 })
    },
  }
  allResources.add(resource as SessionResource<unknown>)
  return resource
}

export interface SessionResourceFamily<K, T> {
  /** The resource for one key, created on first use. */
  get: (key: K) => SessionResource<T>
  /** Mark every key stale (e.g. after a write that affects all departments). */
  invalidateAll: () => void
}

/** One resource per key - e.g. tasks per department. */
export function createSessionResourceFamily<K, T>(
  fetcher: (key: K) => Promise<T>,
  options?: { staleMs?: number }
): SessionResourceFamily<K, T> {
  const members = new Map<string, SessionResource<T>>()
  return {
    get: (key) => {
      const id = JSON.stringify(key)
      let resource = members.get(id)
      if (!resource) {
        resource = createSessionResource(() => fetcher(key), options)
        members.set(id, resource)
      }
      return resource
    },
    invalidateAll: () => members.forEach((resource) => resource.invalidate()),
  }
}

/** Wipes every cached resource. Call on logout so the next user starts clean. */
export function clearSessionCache() {
  allResources.forEach((resource) => resource.reset())
}

export interface UseSessionResourceResult<T> {
  data: T | undefined
  error: Error | undefined
  /** True only while there is nothing to show yet — never during a background refresh. */
  loading: boolean
  /** A background refresh is running over data that is already on screen. */
  refreshing: boolean
  refresh: () => Promise<T>
}

/** Reads a resource and makes sure it's loaded (or revalidated if stale) on mount. */
export function useSessionResource<T>(resource: SessionResource<T>): UseSessionResourceResult<T> {
  const state = useSyncExternalStore(resource.subscribe, resource.getState, resource.getState)

  useEffect(() => {
    void resource.ensure()
  }, [resource])

  return {
    data: state.data,
    error: state.error,
    loading: state.data === undefined && !state.error,
    refreshing: state.fetching && state.data !== undefined,
    refresh: resource.refresh,
  }
}
