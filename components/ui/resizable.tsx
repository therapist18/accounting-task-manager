"use client"

import * as React from "react"
import { GripVertical } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup
    className={cn(
      "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
      className
    )}
    {...props}
  />
)

const ResizablePanel = ResizablePrimitive.Panel

const HANDLE_CLASS =
  "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90"

// react-resizable-panels only knows the real pointer/precision capabilities it needs for this handle's
// cursor/touch-action/user-select styles once it's mounted in the browser, so its server-rendered pass
// and its own first client render never fully agree on them — a hydration mismatch on every page load
// (harmless — React just regenerates the node — but noisy). Rendering a plain, static, non-interactive
// divider until mounted sidesteps it: server and the pre-hydration client render both show the same
// plain div, then the real (draggable) handle swaps in on a normal post-mount re-render, not a
// hydration diff.
const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean
}) => {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const grip = withHandle && (
    <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
      <GripVertical className="h-2.5 w-2.5" />
    </div>
  )

  if (!mounted) return <div className={cn(HANDLE_CLASS, className)}>{grip}</div>

  return (
    <ResizablePrimitive.PanelResizeHandle className={cn(HANDLE_CLASS, className)} {...props}>
      {grip}
    </ResizablePrimitive.PanelResizeHandle>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
