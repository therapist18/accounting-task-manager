"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/lib/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import {
  IMMIGRATION_NOTIFICATIONS_PATH,
  fetchImmigrationItemsSince,
  type ImmigrationItem,
} from "@/lib/immigrationNotifications"

// Tells everyone when the EFNS automation records something new — a permit approved or issued, an
// invoice raised, a payment received — wherever they are in the app, same shape as
// ImmigrationAlertsNotifier and mounted beside it in the dashboard layout.
//
// The news comes from outside this app: the automation writes immigration_notifications /
// immigration_payments itself, so unlike Immigration Alerts there is no alert list to read — the
// "new" is a row this install hasn't announced yet. It therefore reads only the rows created since
// its own last check (a handful) rather than the whole pair of tables the page loads.
//
// In the desktop app it keeps running with the window closed (tray) and the app starts with
// Windows, so a run that lands overnight is announced without anyone opening the window; in a
// browser it needs a tab open.

const POLL_MS = 2 * 60 * 1000
// The watermark comes from this browser's clock while created_at comes from the database, so the
// next check re-reads the minute before the watermark instead of trusting them to agree — a browser
// running a little behind would otherwise drop rows permanently. Anything that overlap returns
// twice is filtered out by the seen set below.
const OVERLAP_MS = 60 * 1000
// When the last check finished. One key doing two jobs: the watermark the next query starts from,
// and the marker the other windows and tabs of this app read so they don't ask (and announce) too.
const LAST_CHECK_KEY = "tm.immigrationNotifications.lastCheck"
const SEEN_KEY = "immigrationNotifications.notifiedKeys.v1"
const ASKED_PERMISSION_KEY = "taskBasket.askedNotificationPermission.v1" // shared with the other notifiers: asked once, ever

function lastCheckAt(): number {
  try {
    return Number(window.localStorage.getItem(LAST_CHECK_KEY) || 0)
  } catch {
    return 0
  }
}

function markChecked(at: number) {
  try {
    window.localStorage.setItem(LAST_CHECK_KEY, String(at))
  } catch {
    // Storage unavailable: this window just checks on its own schedule.
  }
}

function checkedRecentlyElsewhere(): boolean {
  return Date.now() - lastCheckAt() < POLL_MS
}

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

// One notification for a whole poll's worth of rows: a run lands as a burst, and "3 approved ·
// 1 issued, Patel Dinesh, JMR Infotech" is news while the same rows one by one would be noise.
function summarise(items: ImmigrationItem[]) {
  const byStatus = new Map<string, number>()
  for (const item of items) byStatus.set(item.status, (byStatus.get(item.status) || 0) + 1)
  const statuses = [...byStatus].map(([status, count]) => `${count} ${status}`).join(" · ")

  const names = [...new Set(items.map((item) => item.applicant || item.name))]
  const shown = names.slice(0, 3).join(", ")
  const more = names.length > 3 ? ` +${names.length - 3} more` : ""

  return {
    title: `Immigration notifications: ${items.length} new`,
    body: [statuses, `${shown}${more}`].filter(Boolean).join("\n"),
  }
}

export default function ImmigrationNotificationsNotifier({ userId }: { userId: string }) {
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

    const deliver = (items: ImmigrationItem[]) => {
      const { title, body } = summarise(items)
      const open = () => routerRef.current.push(IMMIGRATION_NOTIFICATIONS_PATH)

      toastRef.current({
        title,
        description: body,
        action: (
          <ToastAction altText="Open immigration notifications" onClick={open}>
            Open
          </ToastAction>
        ),
      })

      // Native alert only when the user isn't looking at the app, so it doesn't double up on the toast.
      if (document.hasFocus()) return
      if (typeof desktop?.notify === "function") {
        desktop.notify({ title, body, navigateTo: IMMIGRATION_NOTIFICATIONS_PATH })
      } else if ("Notification" in window && Notification.permission === "granted") {
        const n = new Notification(title, { body, tag: "immigration-notifications" })
        n.onclick = () => {
          window.focus()
          open()
          n.close()
        }
      }
    }

    const check = async () => {
      if (busyRef.current || cancelled) return
      // Another window (or this one, on a quick refocus) checked within the interval - whatever it
      // found is already announced there, and advancing the watermark together means the rows can't
      // come back for anyone.
      if (checkedRecentlyElsewhere()) return
      busyRef.current = true
      try {
        const previous = lastCheckAt()
        // First run on an install: start the clock rather than announce what the tables already
        // hold. Announcing a few hundred records nobody just created would be history, not news.
        if (!previous) {
          writeSeen(userId, new Set())
          markChecked(Date.now())
          return
        }

        // Taken before the query, so rows written while it runs are inside the next window even if
        // this one is slow; the watermark only ever moves forwards.
        const startedAt = Date.now()
        const items = await fetchImmigrationItemsSince(
          new Date(previous - OVERLAP_MS).toISOString(),
        )
        if (cancelled) return

        // Recorded before announcing, not after: the key set is what the next check compares
        // against, so a second window opening mid-announcement must not repeat it. Replacing the
        // set with this window's rows prunes everything the next query can no longer return.
        const seen = readSeen(userId)
        writeSeen(userId, new Set(items.map((item) => item.key)))
        markChecked(startedAt)

        // A browser without readable storage can't tell old rows from new ones, so it stays quiet
        // rather than re-announcing the same records on every poll.
        if (seen) {
          const fresh = items.filter((item) => !seen.has(item.key))
          if (fresh.length) deliver(fresh)
        }
      } catch (error) {
        // A failed poll is silent: the watermark doesn't move, so the next one retries the same
        // window, and a flaky connection shouldn't toast.
        console.warn("[immigration-notifications-notifier] check failed:", error)
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

    // Desktop: clicking the native toast brings the window forward; this takes it to the page.
    const stopNavigate = desktop?.onNavigate?.((payload: { path?: string }) => {
      if (payload?.path === IMMIGRATION_NOTIFICATIONS_PATH) routerRef.current.push(payload.path)
    })

    // Browser: native alerts need permission, asked once on the first click (never in the desktop
    // app). The other notifiers share the same "asked" flag, so a user is only ever asked once.
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
