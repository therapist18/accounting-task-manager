import { cn } from "@/lib/utils"

// Plain <select> styled like the app's inputs. Used for company / department pickers where the list
// can be long and a native control is faster and more reliable than a Radix popover inside dialogs.
export function NativeSelect({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50",
        className
      )}
    >
      {children}
    </select>
  )
}
