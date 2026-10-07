"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/lib/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { getImmigrationAlerts, IMMIGRATION_ALERTS_PATH, type ImmigrationAlert } from "@/lib/immigrationAlerts"

// Tells everyone when someone's Current Immigration Status enters its grace period or expires,
// wherever they are in the app — same shape as TaskBasketNotifier.
//
// bcl-registry works out who's in the Imm Status Manager's Grace and Expired tabs on request (cached
// ~10 minutes). This polls that list and announces anyone it hasn't announced on this install —
// keyed by person + document + status, so moving from Grace to Expired is announced again — as ONE
// notification. In the desktop app it keeps
// running with the window closed (tray) and the app starts with Windows, so alerts arrive without
// anyone opening the window.

const POLL_MS = 2 * 60 * 1000
const SEEN_KEY = "immigrationAlerts.notifiedKeys.v2"
const ASKED_PERMISSION_KEY = "taskBasket.askedNotificationPermission.v1" // shared: one prompt for both notifiers

function readSeen(userId: string): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(`${SEEN_KEY}:${userId}`)
    return raw ? new Set<string>(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeSeen(userId: string, keys: Set<string>) {
  try {
    window.localStorage.setItem(`${SEEN_KEY}:${userId}`, JSON.stringify([...keys]))
  } catch {
    /* storage unavailable (private mode / quota) - worst case we notify again next load */
  }
}

function summarise(alerts: ImmigrationAlert[]) {
  const expired = alerts.filter((a) => a.status === "expired").length
  const grace = alerts.length - expired
  const parts = [expired ? `${expired} expired` : "", grace ? `${grace} entered grace period` : ""].filter(Boolean)
  const names = [...new Set(alerts.map((a) => a.person_name || "Unknown"))]
  const shown = names.slice(0, 3).join(", ")
  const more = names.length > 3 ? ` +${names.length - 3} more` : ""
  return {
    title: `Immigration status: ${parts.join(", ")}`,
    body: `${shown}${more}`,
  }
}

export default function ImmigrationAlertsNotifier({ userId }: { userId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const busyRef = useRef(false)

  // Keep the latest router/toast in refs so the polling effect below never re-subscribes on render.
  const routerRef = useRef(router)
  const toastRef = useRef(toast)
  routerRef.current = router
  toastRef.current = toast

  useEffect(() => {
    let cancelled = false
    const desktop = (window as any).desktop

    const deliver = (alerts: ImmigrationAlert[]) => {
      const { title, body } = summarise(alerts)
      const open = () => routerRef.current.push(IMMIGRATION_ALERTS_PATH)

      toastRef.current({
        title,
        description: body,
        action: (
          <ToastAction altText="Open immigration alerts" onClick={open}>
            Open
          </ToastAction>
        ),
      })

      // Native alert only when the user isn't looking at the app, so it doesn't double up on the toast.
      if (document.hasFocus()) return
      if (typeof desktop?.notify === "function") {
        desktop.notify({ title, body, navigateTo: IMMIGRATION_ALERTS_PATH })
      } else if ("Notification" in window && Notification.permission === "granted") {
        const n = new Notification(title, { body, tag: "immigration-alerts" })
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
        const { alerts } = await getImmigrationAlerts()
        if (cancelled) return
        const seen = readSeen(userId)
        // The first run on an install only records what's already open: announcing every person
        // already in Grace/Expired the first time someone opens the app would be noise, not news.
        if (seen) {
          const fresh = alerts.filter((a) => !seen.has(a.key))
          if (fresh.length) deliver(fresh)
        }
        // Only keys still listed are kept, so storage can't grow without bound.
        writeSeen(userId, new Set(alerts.map((a) => a.key)))
      } catch (error) {
        // A failed poll is silent: the next one retries, and a flaky connection shouldn't toast.
        console.warn("[immigration-alerts-notifier] check failed:", error)
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

    // Desktop: clicking the native toast brings the window forward; this takes it to the alerts page.
    // (TaskBasketNotifier does the same for its path; it isn't mounted for everyone, so this can't rely on it.)
    const stopNavigate = desktop?.onNavigate?.((payload: { path?: string }) => {
      if (payload?.path === IMMIGRATION_ALERTS_PATH) routerRef.current.push(payload.path)
    })

    // Browser: native alerts need permission, asked once on the first click (never in the desktop
    // app). TaskBasketNotifier shares the same "asked" flag, so a user is only ever asked once.
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
