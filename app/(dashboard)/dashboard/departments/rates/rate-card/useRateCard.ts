"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import {
  COMPONENT_BY_KEY, emptyImmigrationRates, emptyJobRates, normalizeImmigrationRates, normalizeJobRates,
} from "./catalog"
import { immigrationBreakdown, jobBreakdown } from "./calc"
import type { RowModel } from "./columns"
import { saveRateVersions, versionOn } from "./data"
import { IMMIGRATION_PRESETS, JOB_PRESETS } from "./presets"
import type { CardType, ImmigrationRates, JobLevel, JobRates, RateCardRow, RateSettings, RatesPayload } from "./types"

// ── presets → rates ──────────────────────────────────────────────────────────

export function immigrationFromPreset(id: string): ImmigrationRates | null {
  const p = IMMIGRATION_PRESETS.find((x) => x.id === id)
  if (!p) return null
  const base = emptyImmigrationRates()
  const components = { ...base.components }
  for (const [key, value] of Object.entries(p.components)) {
    const def = COMPONENT_BY_KEY[key]
    // "Alien" in the sheet's help rows = available but not included by default.
    components[key] = {
      on: value.on,
      amount: value.amount ?? (value.optional ? def?.defaultAmount ?? null : null),
      ...(def?.currency ? { currency: value.currency ?? "KES" } : {}),
    }
  }
  return {
    ...base,
    components,
    issuancePaidAtBank: p.issuancePaidAtBank,
    validity: { ...p.validity },
    payment: { mode: p.payment.mode, installments: [...p.payment.installments] },
    note: [p.gratis ? "Issuance: Gratis" : "", p.note].filter(Boolean).join("; "),
  }
}

export function jobFromPreset(id: string, current: JobRates): JobRates | null {
  const p = JOB_PRESETS.find((x) => x.id === id)
  if (!p) return null
  return {
    ...current,
    basis: p.basis ?? current.basis,
    estimateNote: p.estimateNote,
    frequency: p.frequency ?? current.frequency,
    requirement: p.requirement ?? current.requirement,
    detailsPrompt: p.detailsPrompt,
    officialFee: { on: true, amount: p.officialFee ?? 0, currency: "KES" },
    consultancyFee: p.consultancyFee,
    note: p.officialNote ? `Official fee: ${p.officialNote}` : current.note,
  }
}

// ── the hook ─────────────────────────────────────────────────────────────────

interface Config<R, B> {
  cardType: CardType
  normalize: (raw: any) => R
  empty: () => R
  breakdown: (rates: R, settings: RateSettings) => B
}

const CONFIG = {
  immigration: { cardType: "immigration", normalize: normalizeImmigrationRates, empty: emptyImmigrationRates, breakdown: immigrationBreakdown } as Config<ImmigrationRates, ReturnType<typeof immigrationBreakdown>>,
  job: { cardType: "job", normalize: normalizeJobRates, empty: emptyJobRates, breakdown: jobBreakdown } as Config<JobRates, ReturnType<typeof jobBreakdown>>,
}

/**
 * Edits in progress for one rate card. Rows are rebuilt from (job levels × versions × drafts) but a
 * row object is reused whenever none of its inputs changed, so the memoised grid rows only
 * re-render the rows that were actually edited.
 */
export function useRateCard<K extends keyof typeof CONFIG>(
  kind: K,
  levels: JobLevel[],
  versions: Map<string, RateCardRow[]>,
  asOf: string,
  settings: RateSettings
) {
  type R = K extends "immigration" ? ImmigrationRates : JobRates
  type B = ReturnType<(typeof CONFIG)[K]["breakdown"]>
  const config = CONFIG[kind] as unknown as Config<R, B>

  const [drafts, setDrafts] = useState<Map<string, R>>(() => new Map())
  const normalized = useRef(new WeakMap<RateCardRow, R>())
  const emptyByKey = useRef(new Map<string, R>())
  const rowCache = useRef(new Map<string, { row: RowModel<R, B>; settings: RateSettings }>())

  const ratesFor = useCallback(
    (key: string, version: RateCardRow | undefined): R => {
      if (version) {
        let r = normalized.current.get(version)
        if (!r) {
          r = config.normalize(version.rates)
          normalized.current.set(version, r)
        }
        return r
      }
      let r = emptyByKey.current.get(key)
      if (!r) {
        r = config.empty()
        emptyByKey.current.set(key, r)
      }
      return r
    },
    [config]
  )

  const rows = useMemo(() => {
    const out: RowModel<R, B>[] = []
    for (const level of levels) {
      const list = versions.get(level.key)
      const version = versionOn(list, asOf)
      const draft = drafts.get(level.key)
      const rates = draft ?? ratesFor(level.key, version)
      const versionCount = list?.length ?? 0
      const prev = rowCache.current.get(level.key)
      if (
        prev && prev.settings === settings && prev.row.level === level && prev.row.version === version &&
        prev.row.rates === rates && prev.row.versionCount === versionCount && prev.row.dirty === !!draft
      ) {
        out.push(prev.row)
        continue
      }
      const row: RowModel<R, B> = { level, version, versionCount, rates, breakdown: config.breakdown(rates, settings), dirty: !!draft }
      rowCache.current.set(level.key, { row, settings })
      out.push(row)
    }
    return out
  }, [levels, versions, asOf, drafts, settings, ratesFor, config])

  const setDraft = useCallback((key: string, rates: R) => {
    setDrafts((prev) => new Map(prev).set(key, rates))
  }, [])

  const discard = useCallback((key: string) => {
    setDrafts((prev) => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [])

  const discardAll = useCallback(() => setDrafts(new Map()), [])

  const save = useCallback(
    async (effectiveFrom: string, note: string, userName: string | null) => {
      const byKey = new Map(levels.map((l) => [l.key, l]))
      const changes = Array.from(drafts.entries())
        .filter(([key]) => byKey.has(key))
        .map(([key, rates]) => ({ level: byKey.get(key)!, cardType: config.cardType, rates: rates as RatesPayload }))
      const saved = await saveRateVersions(changes, effectiveFrom, note, userName)
      setDrafts(new Map())
      return saved.length
    },
    [drafts, levels, config]
  )

  return { rows, drafts, dirtyCount: drafts.size, setDraft, discard, discardAll, save, ratesFor }
}
