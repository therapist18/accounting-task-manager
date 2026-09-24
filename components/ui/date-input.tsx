"use client"

import * as React from "react"
import { Calendar as CalendarIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { formatDateToDMY, parseDateString } from "@/lib/dateUtils"

export interface DateInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  value?: string | null
  onChange?: (value: string) => void
}

// Inserts "/" after the 2nd and 4th digit — "28082026" -> "28/08/2026". Caps at 8 digits (DDMMYYYY).
function formatDigitsAsDMY(digits: string): string {
  const day = digits.slice(0, 2)
  const month = digits.slice(2, 4)
  const year = digits.slice(4, 8)
  return [day, month, year].filter(Boolean).join("/")
}

/**
 * Date input using the app's DD/MM/YYYY convention, ported from the Company Bank Accounts module.
 *
 * A native <input type="date"> renders according to the browser's locale (often MM/DD/YYYY) and always
 * emits yyyy-MM-dd. This shows DD/MM/YYYY and accepts whatever the incoming `value` is (ISO or DMY), so
 * stored values can be passed straight in. `onChange` always hands back DD/MM/YYYY text (possibly
 * partial while typing) — convert with dateFieldToIso (lib/dateUtils) before saving.
 *
 * Typing plain digits auto-inserts the slashes ("28082026" -> "28/08/2026" as you type) — only for a
 * single digit appended at the end, so pasting or editing mid-string is left alone and is normalised on
 * blur instead. Backspacing onto a "/" removes the digit before it too, so backspace stays continuous.
 * The calendar button beside the field is an alternative way to pick the same value.
 */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onChange, className, placeholder = "DD/MM/YYYY", readOnly, disabled, onBlur, onFocus, onKeyDown, ...props }, ref) => {
    const displayValue = React.useMemo(() => formatDateToDMY(value ?? "") || "", [value])
    const [text, setText] = React.useState(displayValue)
    // While typing, every keystroke's onChange round-trips through the `value` prop, and a partial date
    // ("12/0") formats to "" — without this guard the sync below would erase what was just typed.
    const isFocused = React.useRef(false)
    const [pickerOpen, setPickerOpen] = React.useState(false)

    React.useEffect(() => {
      if (isFocused.current) return
      setText(displayValue)
    }, [displayValue])

    const selectedDate = React.useMemo(() => parseDateString(text) ?? undefined, [text])
    const handlePick = (date: Date | undefined) => {
      if (!date) return
      const formatted = formatDateToDMY(date) || ""
      setText(formatted)
      onChange?.(formatted)
      setPickerOpen(false)
    }

    return (
      <div className="relative">
        <Input
          ref={ref}
          autoComplete="off"
          inputMode="numeric"
          value={text}
          placeholder={placeholder}
          readOnly={readOnly}
          disabled={disabled}
          className={cn("pr-10", className)}
          onFocus={(e) => {
            isFocused.current = true
            onFocus?.(e)
          }}
          onKeyDown={(e) => {
            if (!readOnly && !disabled && e.key === "Backspace") {
              const el = e.currentTarget
              const pos = el.selectionStart
              if (pos != null && pos === el.selectionEnd && pos > 0 && text[pos - 1] === "/") {
                e.preventDefault()
                const digits = (text.slice(0, pos - 2) + text.slice(pos)).replace(/\D/g, "")
                const formatted = formatDigitsAsDMY(digits)
                setText(formatted)
                onChange?.(formatted)
              }
            }
            onKeyDown?.(e)
          }}
          onChange={(e) => {
            if (readOnly || disabled) return
            const raw = e.target.value
            const isSingleDigitAppend = raw.length === text.length + 1 && /^\d$/.test(raw.slice(-1))
            if (isSingleDigitAppend) {
              const formatted = formatDigitsAsDMY(raw.replace(/\D/g, "").slice(0, 8))
              setText(formatted)
              onChange?.(formatted)
              return
            }
            setText(raw)
            onChange?.(raw)
          }}
          onBlur={(e) => {
            isFocused.current = false
            if (!readOnly && !disabled) {
              const normalized = formatDateToDMY(e.target.value) || e.target.value
              setText(normalized)
              onChange?.(normalized)
            }
            onBlur?.(e)
          }}
          {...props}
        />
        {!readOnly && !disabled && (
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                tabIndex={-1}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Pick a date"
              >
                <CalendarIcon className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={selectedDate} onSelect={handlePick} initialFocus />
            </PopoverContent>
          </Popover>
        )}
      </div>
    )
  }
)
DateInput.displayName = "DateInput"
