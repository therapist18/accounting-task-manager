"use client"

import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-4 right-4 z-[100] flex max-h-screen w-full max-w-[420px] flex-col gap-3 p-0 sm:top-auto sm:bottom-4 sm:right-4",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-3 overflow-hidden rounded-xl border p-4 pr-8 shadow-xl backdrop-blur-sm transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default: "border-gray-200/50 bg-white/95 text-gray-900 shadow-gray-900/10",
        destructive:
          "border-red-200/50 bg-red-50/95 text-red-900 shadow-red-900/10",
        success: "border-green-200/50 bg-green-50/95 text-green-900 shadow-green-900/10",
        warning: "border-yellow-200/50 bg-yellow-50/95 text-yellow-900 shadow-yellow-900/10",
        info: "border-blue-200/50 bg-blue-50/95 text-blue-900 shadow-blue-900/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-gray-200/50 bg-gray-50/50 px-3 text-sm font-medium text-gray-700 backdrop-blur-sm transition-all hover:bg-gray-100/80 hover:border-gray-300/50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400/50 focus:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-red-200/50 group-[.destructive]:bg-red-50/50 group-[.destructive]:text-red-700 group-[.destructive]:hover:bg-red-100/80 group-[.destructive]:hover:border-red-300/50 group-[.destructive]:hover:text-red-900 group-[.destructive]:focus:ring-red-400/50 group-[.success]:border-green-200/50 group-[.success]:bg-green-50/50 group-[.success]:text-green-700 group-[.success]:hover:bg-green-100/80 group-[.success]:hover:border-green-300/50 group-[.success]:hover:text-green-900 group-[.success]:focus:ring-green-400/50 group-[.warning]:border-yellow-200/50 group-[.warning]:bg-yellow-50/50 group-[.warning]:text-yellow-700 group-[.warning]:hover:bg-yellow-100/80 group-[.warning]:hover:border-yellow-300/50 group-[.warning]:hover:text-yellow-900 group-[.warning]:focus:ring-yellow-400/50 group-[.info]:border-blue-200/50 group-[.info]:bg-blue-50/50 group-[.info]:text-blue-700 group-[.info]:hover:bg-blue-100/80 group-[.info]:hover:border-blue-300/50 group-[.info]:hover:text-blue-900 group-[.info]:focus:ring-blue-400/50",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-md p-1.5 text-gray-400/70 opacity-0 transition-all hover:bg-gray-100/80 hover:text-gray-600 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-gray-400/50 focus:ring-offset-1 group-hover:opacity-100 group-[.destructive]:text-red-300/70 group-[.destructive]:hover:bg-red-100/80 group-[.destructive]:hover:text-red-600 group-[.destructive]:focus:ring-red-400/50 group-[.success]:text-green-300/70 group-[.success]:hover:bg-green-100/80 group-[.success]:hover:text-green-600 group-[.success]:focus:ring-green-400/50 group-[.warning]:text-yellow-300/70 group-[.warning]:hover:bg-yellow-100/80 group-[.warning]:hover:text-yellow-600 group-[.warning]:focus:ring-yellow-400/50 group-[.info]:text-blue-300/70 group-[.info]:hover:bg-blue-100/80 group-[.info]:hover:text-blue-600 group-[.info]:focus:ring-blue-400/50",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-semibold", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-sm opacity-90", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
