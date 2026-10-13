"use client"

import { useEffect, useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

// Where the Windows installer (dist-electron/TaskManager-Setup-<version>.exe) is
// hosted. The installer is too large to ship from /public, so it lives in external
// storage and the button stays hidden until this is configured.
const DOWNLOAD_URL = process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL

export function DownloadDesktopAppButton() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Hidden inside the desktop app itself (preload exposes window.desktop) and on
    // non-Windows machines, since only a Windows build is produced.
    const isWindows = /Windows/i.test(navigator.userAgent)
    setShow(Boolean(DOWNLOAD_URL) && !window.desktop && isWindows)
  }, [])

  if (!show) return null

  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/10"
    >
      <a href={DOWNLOAD_URL} download title="Download the Task Manager desktop app for Windows">
        <Download className="h-4 w-4" />
        <span className="hidden md:inline">Get desktop app</span>
      </a>
    </Button>
  )
}
