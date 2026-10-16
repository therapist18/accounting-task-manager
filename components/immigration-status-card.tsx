"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, ShieldAlert } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { IMMIGRATION_ALERTS_PATH, immigrationAlertsResource, type ImmigrationAlert } from "@/lib/immigrationAlerts"

// Dashboard card: how many people are Expired / in their grace period, plus the most urgent few.
// Loads in the browser so the dashboard never waits on bcl-registry (an uncached calculation takes a
// while); the list arrives already sorted most-urgent-first.
export default function ImmigrationStatusCard() {
  // Starts from the shared copy the notifier keeps, so the card usually renders without a request.
  const [alerts, setAlerts] = useState<ImmigrationAlert[] | null>(() => immigrationAlertsResource.getState().data?.alerts ?? null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    immigrationAlertsResource
      .load()
      .then((r) => !cancelled && setAlerts(r.alerts))
      .catch((error) => {
        console.warn("[immigration-status-card]", error)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (failed) return null

  const expired = alerts?.filter((a) => a.status === "expired") ?? []
  const grace = alerts?.filter((a) => a.status === "grace") ?? []
  const urgent = [...grace.slice(0, 3), ...expired.slice(0, 3)]

  return (
    <Link href={IMMIGRATION_ALERTS_PATH} className="block">
      <Card className="border border-slate-200 shadow-sm rounded-lg bg-white hover:border-custom-blue/30 hover:shadow-md transition-all cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-4">
          <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Immigration Status</CardTitle>
          <ShieldAlert className="h-4 w-4 text-slate-400" />
        </CardHeader>
        <CardContent className="px-4 pb-4 flex flex-wrap gap-x-8 gap-y-3">
          {alerts === null ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking immigration statuses…
            </div>
          ) : (
            <>
              <div>
                <div className="text-3xl font-black text-red-600">{expired.length}</div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">Expired</p>
              </div>
              <div>
                <div className="text-3xl font-black text-amber-600">{grace.length}</div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">In grace period</p>
              </div>
              <div className="flex-1 min-w-[260px] space-y-1">
                {urgent.length === 0 ? (
                  <p className="text-xs text-slate-400 pt-2">No one is in their grace period or expired.</p>
                ) : (
                  urgent.map((a) => (
                    <div key={a.key} className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate text-slate-700">
                        <span className="font-semibold">{a.person_name || "Unknown"}</span>
                        {a.company_prefix ? <span className="text-slate-400"> · {a.company_prefix}</span> : null}
                        {a.doc_type_name ? <span className="text-slate-400"> · {a.doc_type_name}</span> : null}
                      </span>
                      <span className={a.status === "expired" ? "shrink-0 text-red-600 font-medium" : "shrink-0 text-amber-600 font-medium"}>
                        {a.status === "expired" ? `expired ${Math.abs(a.days_to_go ?? 0)}d ago` : `${a.days_to_go ?? 0}d left`}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
