"use client"

import { useToast } from "@/lib/hooks/use-toast"
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

const TOAST_ICON_STYLES = {
  default: {
    icon: Info,
    wrapperClassName: "bg-white text-slate-700",
    label: "Notice",
  },
  destructive: {
    icon: XCircle,
    wrapperClassName: "bg-red-600 text-white",
    label: "Error",
  },
  success: {
    icon: CheckCircle2,
    wrapperClassName: "bg-green-600 text-white",
    label: "Success",
  },
  warning: {
    icon: AlertTriangle,
    wrapperClassName: "bg-amber-600 text-white",
    label: "Warning",
  },
  info: {
    icon: Info,
    wrapperClassName: "bg-blue-600 text-white",
    label: "Info",
  },
} as const

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant = "default", ...props }) {
        const toastMeta = TOAST_ICON_STYLES[variant] || TOAST_ICON_STYLES.default
        const Icon = toastMeta.icon

        return (
          <Toast key={id} {...props}>
            <div className="absolute inset-x-0 top-0 h-1 bg-black/5">
              <div
                className={`h-full ${variant === "destructive"
                  ? "bg-red-400"
                  : variant === "success"
                    ? "bg-green-400"
                    : variant === "warning"
                      ? "bg-amber-400"
                      : variant === "info"
                        ? "bg-blue-400"
                        : "bg-slate-400"
                  }`}
              />
            </div>

            <div className="flex items-start gap-3 pr-4">
              <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${toastMeta.wrapperClassName}`}>
                <Icon className="h-4 w-4" />
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-center gap-2">
                  {variant === "default" && title === "Processing" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                  )}
                </div>
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport className="top-4 right-4 sm:top-4 sm:bottom-auto" />
    </ToastProvider>
  )
}
