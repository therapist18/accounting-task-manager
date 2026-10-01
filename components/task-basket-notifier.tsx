"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/lib/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { getTaskBasketItems, TASK_BASKET_MODULE_LABELS, type TaskBasketItem } from "@/lib/supabase/taskBasket"
import { fetchCompanies, type Company } from "@/app/(dashboard)/dashboard/companies/database"
import { companyMatchesCategoryFilters, DEFAULT_CATEGORY_FILTERS } from "@/app/generic-components/companyCategoryFilters"

// Tells the user when companies land in the Task Basket, wherever they are in the app.
//
// Mounted once in the dashboard layout (only for users who can open the basket), so it runs on every
// page, not just /dashboard/task-basket. The basket is filled in one burst by kra-tools' daily job
// (10:00 EAT on the deadline), so a poll normally finds a whole batch at once; that is reported as
// ONE notification with per-module counts rather than one per company.
//
// Which companies count: the same client-category filter the basket page starts on (ACC / Active /
// Operational). That is also the filter kra-tools applies when it sends the bank statement and file
// requests, so the basket only ever holds companies that match it — applying it here keeps the
// notification count identical to what the page shows by default, and keeps rows that couldn't be
// categorised (company missing from the list) rather than hiding an overdue item.

const POLL_MS = 2 * 60 * 1000
const COMPANY_REFRESH_MS = 60 * 60 * 1000
const BASKET_PATH = "/dashboard/task-basket"
const SEEN_KEY = "taskBasket.notifiedIds.v1"
const ASKED_PERMISSION_KEY = "taskBasket.askedNotificationPermission.v1"

function readSeen(userId: string): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(`${SEEN_KEY}:${userId}`)
    return raw ? new Set<string>(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeSeen(userId: string, ids: Set<string>) {
  try {
    window.localStorage.setItem(`${SEEN_KEY}:${userId}`, JSON.stringify([...ids]))
  } catch {
    /* storage unavailable (private mode / quota) - worst case we notify again next load */
  }
}

function summarise(items: TaskBasketItem[]) {
  const byModule = new Map<string, number>()
  for (const item of items) {
    const label = TASK_BASKET_MODULE_LABELS[item.module] ?? item.module
    byModule.set(label, (byModule.get(label) || 0) + 1)
  }
  const modules = [...byModule].map(([label, count]) => `${label} ${count}`).join(" · ")
  const names = [...new Set(items.map((i) => i.company_name))]
  const shown = names.slice(0, 3).join(", ")
  const more = names.length > 3 ? ` +${names.length - 3} more` : ""
  return {
    title: `Task Basket: ${items.length} new item${items.length === 1 ? "" : "s"}`,
    body: `${modules}\n${shown}${more}`,
  }
}

export default function TaskBasketNotifier({ userId }: { userId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const companiesRef = useRef<{ list: Company[]; fetchedAt: number } | null>(null)
  const busyRef = useRef(false)

  // Keep the latest router/toast in refs so the polling effect below never re-subscribes on render.
  const routerRef = useRef(router)
  const toastRef = useRef(toast)
  routerRef.current = router
  toastRef.current = toast

  useEffect(() => {
    let cancelled = false
    const desktop = (window as any).desktop

    const getCompanies = async (): Promise<Company[]> => {
      const cached = companiesRef.current
      if (cached && Date.now() - cached.fetchedAt < COMPANY_REFRESH_MS) return cached.list
      const list = await fetchCompanies()
      companiesRef.current = { list, fetchedAt: Date.now() }
      return list
    }

    const deliver = (items: TaskBasketItem[]) => {
      const { title, body } = summarise(items)
      const open = () => routerRef.current.push(BASKET_PATH)

      // In-app toast, with a shortcut to the basket.
      toastRef.current({
        title,
        description: body,
        action: (
          <ToastAction altText="Open the Task Basket" onClick={open}>
            Open
          </ToastAction>
        ),
      })

      // Native alert only when the user isn't looking at the app, so it doesn't double up on the toast.
      if (document.hasFocus()) return
      if (typeof desktop?.notify === "function") {
        desktop.notify({ title, body, navigateTo: BASKET_PATH })
      } else if ("Notification" in window && Notification.permission === "granted") {
        const n = new Notification(title, { body, tag: "task-basket" })
        n.onclick = () => {
          window.focus()
          open()
          n.close()
        }
      }
    }

    const check = async () => {
      if (busyRef.current || cancelled) return
      busyRef.current = true
      try {
        const [items, companies] = await Promise.all([
          getTaskBasketItems({ status: "open" }),
          getCompanies().catch(() => [] as Company[]),
        ])
        if (cancelled) return

        const companyById = new Map(companies.map((c) => [String(c.id), c]))
        const visible = items.filter(
          (item) =>
            !companyById.has(String(item.company_id)) ||
            companyMatchesCategoryFilters(companyById.get(String(item.company_id)), DEFAULT_CATEGORY_FILTERS)
        )

        const seen = readSeen(userId)
        const currentIds = new Set(visible.map((i) => i.id))
        // The first run on a browser/install only records what is already there: announcing every
        // existing open item the first time someone opens the app would be noise, not news.
        if (seen) {
          const fresh = visible.filter((i) => !seen.has(i.id))
          if (fresh.length) deliver(fresh)
        }
        // Only ids still open are kept, so storage can't grow without bound. A row deleted and then
        // re-added by the next daily run gets a new id and is announced again, which is correct.
        writeSeen(userId, currentIds)
      } catch (error) {
        // A failed poll is silent: the next one retries, and a flaky connection shouldn't toast.
        console.warn("[task-basket-notifier] check failed:", error)
      } finally {
        busyRef.current = false
      }
    }

    check()
    const timer = window.setInterval(check, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") check()
    }
    document.addEventListener("visibilitychange", onVisible)

    // Desktop: clicking the native toast brings the window forward; this takes it to the basket.
    const stopNavigate = desktop?.onNavigate?.((payload: { path?: string }) => {
      if (payload?.path) routerRef.current.push(payload.path)
    })

    // Browser: native alerts need permission, and browsers only allow asking from a user gesture,
    // so ask once, on the first click anywhere (never in the desktop app, which has its own path).
    const askPermissionOnce = () => {
      if (typeof desktop?.notify === "function") return
      if (!("Notification" in window) || Notification.permission !== "default") return
      try {
        if (window.localStorage.getItem(ASKED_PERMISSION_KEY)) return
        window.localStorage.setItem(ASKED_PERMISSION_KEY, "1")
      } catch {
        return
      }
      Notification.requestPermission().catch(() => {})
    }
    document.addEventListener("click", askPermissionOnce, { once: true })

    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
      document.removeEventListener("click", askPermissionOnce)
      if (typeof stopNavigate === "function") stopNavigate()
    }
  }, [userId])

  return null
}
