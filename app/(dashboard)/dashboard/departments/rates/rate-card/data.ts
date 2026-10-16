"use client"

import { supabase } from "@/lib/supabase/client"
import { createSessionResource } from "@/lib/sessionCache"
import { DEFAULT_SETTINGS } from "./catalog"
import type { CardType, JobLevel, RateCardRow, RateSettings, RateSettingsRow, RatesPayload } from "./types"

// Everything the rate screens and the Quotations module read, fetched once per session (see
// lib/sessionCache.ts) and patched in place after each save, so switching tabs, moving the "as of"
// date or opening a job level's history never goes back to the server.

// ── job levels ────────────────────────────────────────────────────────────────

export const jobKey = (
  departmentId: number | string,
  subdepartmentId?: number | string | null,
  classId?: number | string | null,
  subclassId?: number | string | null
) => [departmentId, subdepartmentId, classId, subclassId].filter((p) => p != null && p !== "").join("/")

/** Same as jobKey, from a tm_tasks.job_level object. */
export const jobKeyFromTaskJobLevel = (jl: { department_id?: any; subdepartment_id?: any; class_id?: any; subclass_id?: any } | null | undefined) =>
  jl ? jobKey(jl.department_id, jl.subdepartment_id, jl.class_id, jl.subclass_id) : ""

/**
 * The priceable job levels of every department: a subclass, or a class with no subclasses, or a
 * subdepartment with no classes — the same leaves the old rates table priced.
 */
export function flattenJobLevels(departments: any[]): JobLevel[] {
  const out: JobLevel[] = []
  let order = 0
  for (const d of departments || []) {
    for (const s of d.tm_subdepartments || []) {
      const base = {
        departmentId: Number(d.id), departmentName: d.name, subdepartmentId: Number(s.id), subdepartmentName: s.name,
      }
      const classes = s.classes || []
      if (classes.length === 0) {
        out.push({ ...base, key: jobKey(d.id, s.id), classId: null, className: null, subclassId: null, subclassName: null, path: s.name, order: order++ })
        continue
      }
      for (const c of classes) {
        const subs = c.subClasses || []
        if (subs.length === 0) {
          out.push({
            ...base, key: jobKey(d.id, s.id, c.id), classId: String(c.id), className: c.name, subclassId: null, subclassName: null,
            path: `${s.name} → ${c.name}`, order: order++,
          })
          continue
        }
        for (const sc of subs) {
          out.push({
            ...base, key: jobKey(d.id, s.id, c.id, sc.id), classId: String(c.id), className: c.name, subclassId: String(sc.id), subclassName: sc.name,
            path: `${s.name} → ${c.name} → ${sc.name}`, order: order++,
          })
        }
      }
    }
  }
  return out
}

// ── effective dating ─────────────────────────────────────────────────────────

export const todayYmd = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Versions per job key, newest effective_from first. */
export function indexVersions(rows: RateCardRow[]): Map<string, RateCardRow[]> {
  const map = new Map<string, RateCardRow[]>()
  for (const r of rows) {
    const list = map.get(r.job_key)
    if (list) list.push(r)
    else map.set(r.job_key, [r])
  }
  map.forEach((list) => list.sort((a, b) => (a.effective_from < b.effective_from ? 1 : a.effective_from > b.effective_from ? -1 : 0)))
  return map
}

/** The version in force on `asOf` (latest effective_from on or before it). */
export function versionOn<T extends { effective_from: string }>(versionsNewestFirst: T[] | undefined, asOf: string): T | undefined {
  return versionsNewestFirst?.find((v) => v.effective_from <= asOf)
}

/** The day before the next version starts, or null while it is the latest. */
export function versionEnd<T extends { effective_from: string }>(versionsNewestFirst: T[], index: number): string | null {
  const next = versionsNewestFirst[index - 1]
  if (!next) return null
  const d = new Date(`${next.effective_from}T00:00:00`)
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function settingsOn(rows: RateSettingsRow[] | undefined, asOf: string): RateSettings {
  const row = versionOn(rows, asOf)
  return { ...DEFAULT_SETTINGS, ...(row?.settings || {}) }
}

// ── fetching ─────────────────────────────────────────────────────────────────

async function fetchAll<T>(table: string, order: string, ascending: boolean): Promise<T[]> {
  const pageSize = 1000
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select("*").order(order, { ascending }).order("id").range(from, from + pageSize - 1)
    if (error) throw error
    out.push(...((data || []) as T[]))
    if (!data || data.length < pageSize) return out
  }
}

export const rateCardsResource = createSessionResource(
  () => fetchAll<RateCardRow>("tm_rate_cards", "effective_from", false),
  { staleMs: 5 * 60_000 }
)

export const rateSettingsResource = createSessionResource(
  () => fetchAll<RateSettingsRow>("tm_rate_settings", "effective_from", false),
  { staleMs: 10 * 60_000 }
)

// ── writes ───────────────────────────────────────────────────────────────────

export interface RateChange {
  level: JobLevel
  cardType: CardType
  rates: RatesPayload
}

/**
 * Saves the changed job levels as versions starting `effectiveFrom`. A job level that already has a
 * version on that exact date is corrected in place; otherwise a new version is added and the previous
 * one simply stops the day before. Untouched job levels keep their current version.
 */
export async function saveRateVersions(changes: RateChange[], effectiveFrom: string, note: string, userName: string | null) {
  if (changes.length === 0) return []
  const now = new Date().toISOString()
  const payload = changes.map(({ level, cardType, rates }) => ({
    job_key: level.key,
    department_id: level.departmentId,
    subdepartment_id: level.subdepartmentId,
    class_id: level.classId,
    subclass_id: level.subclassId,
    job_path: `${level.departmentName} → ${level.path}`,
    card_type: cardType,
    effective_from: effectiveFrom,
    rates,
    note: note || null,
    created_by_name: userName,
    updated_by_name: userName,
    updated_at: now,
  }))
  const { data, error } = await supabase.from("tm_rate_cards").upsert(payload, { onConflict: "job_key,effective_from" }).select("*")
  if (error) throw error
  const saved = (data || []) as RateCardRow[]
  rateCardsResource.mutate((current) => {
    const byId = new Map((current || []).map((r) => [`${r.job_key}|${r.effective_from}`, r]))
    for (const r of saved) byId.set(`${r.job_key}|${r.effective_from}`, r)
    return Array.from(byId.values())
  })
  return saved
}

export async function deleteRateVersion(id: number) {
  const { error } = await supabase.from("tm_rate_cards").delete().eq("id", id)
  if (error) throw error
  rateCardsResource.mutate((current) => (current || []).filter((r) => r.id !== id))
}

export async function saveRateSettings(effectiveFrom: string, settings: RateSettings, note: string, userName: string | null) {
  const { data, error } = await supabase
    .from("tm_rate_settings")
    .upsert({ effective_from: effectiveFrom, settings, note: note || null, created_by_name: userName }, { onConflict: "effective_from" })
    .select("*")
    .single()
  if (error) throw error
  const saved = data as RateSettingsRow
  rateSettingsResource.mutate((current) => {
    const rest = (current || []).filter((r) => r.effective_from !== saved.effective_from)
    return [saved, ...rest].sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))
  })
  return saved
}

export async function deleteRateSettings(id: number) {
  const { error } = await supabase.from("tm_rate_settings").delete().eq("id", id)
  if (error) throw error
  rateSettingsResource.mutate((current) => (current || []).filter((r) => r.id !== id))
}
