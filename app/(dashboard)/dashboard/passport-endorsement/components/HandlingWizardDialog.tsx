// @ts-nocheck
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  CheckCircle2,
  Loader2,
  Inbox,
  Landmark,
  Undo2,
  BellRing,
  Truck,
  ChevronLeft,
  ChevronRight,
  Save,
  Info,
  CalendarDays,
  Clock,
  Eraser,
  Copy,
  Phone,
  MessageSquare,
  SendHorizonal,
  SkipForward,
  Pencil,
  MessageCircle,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import { resolvePrimaryPhone, resolveWhatsAppNumber, resolveEmail, normalizeContactDetails, normalizeWhatsAppNumber, formatPhoneForDisplay } from "@/lib/registry/contact";
import { DateTextInput } from "./PageHeader";
import {
  upsertHandlingRecord,
  updateTaskHandlingMode,
  markTaskEndorsedIfPending,
  HANDLING_METHOD_OPTIONS,
  getHandlingMethodOption,
  composeDispatchMessage,
  composeReadyForPickupMessage,
  NOTIFIED_METHOD_LABELS,
  type PassportHandlingRecord,
  type Courier,
} from "../utils/database";

function toLocalInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowLocalInputValue() {
  return toLocalInputValue(new Date().toISOString());
}

function todayDatePart() {
  return nowLocalInputValue().split("T")[0];
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "dd/MM/yyyy, HH:mm");
  } catch {
    return "";
  }
}

// 2-Column Flex Layout (Col 1: Fixed 175px label, Col 2: 1fr full-width input)
function FormRow({
  label,
  required,
  children,
  alignTop = false,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  alignTop?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row gap-2.5 sm:gap-6 py-4 border-b border-slate-100 last:border-b-0",
        alignTop ? "sm:items-start pt-4" : "sm:items-center"
      )}
    >
      <div className="shrink-0 sm:w-[175px] sm:flex-shrink-0">
        <Label className="text-sm md:text-base font-bold text-slate-800 block leading-tight">
          {label} {required && <span className="text-red-500 font-bold">*</span>}
        </Label>
      </div>
      <div className="w-full min-w-0">{children}</div>
    </div>
  );
}

// Searchable staff picker. Uses the app's shared SearchableSelect (the same one the Emails
// module drives its Case Assignee dropdown with, off the same /api/auth/users/company10 staff
// list) rather than a hand-rolled Popover + cmdk tree — that keeps the roster rendering and
// filtering identical to every other staff dropdown in the product.
function StaffCombobox({ users, value, onChange, placeholder = "Select staff member..." }: any) {
  const options = useMemo(
    () => (users || []).map((u: any) => ({ value: String(u.id), label: u.name })),
    [users]
  );

  return (
    <SearchableSelect
      value={value || ""}
      onValueChange={onChange}
      options={options}
      placeholder={placeholder}
      emptyMessage="No staff found."
      searchPlaceholder="Search staff..."
      className="w-full"
      buttonClassName="h-12 w-full justify-between text-base font-normal border-slate-200 bg-white rounded-lg px-3.5 hover:bg-white hover:text-slate-900"
      popoverClassName="max-h-[300px] z-[200] overflow-hidden"
    />
  );
}

function DateOnlyField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [datePart, timePart] = value ? value.split("T") : ["", ""];

  const dateObj = useMemo(() => {
    if (!datePart) return undefined;
    const [y, m, d] = datePart.split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return isNaN(dt.getTime()) ? undefined : dt;
  }, [datePart]);

  const handleDateChange = (d: Date | undefined) => {
    if (!d) {
      onChange(timePart ? `${todayDatePart()}T${timePart}` : "");
      return;
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${timePart || "00:00"}`);
  };

  return (
    <div className="flex items-center gap-2 h-12 px-3.5 rounded-lg border border-slate-200 bg-white w-full">
      <CalendarDays className="h-4 w-4 text-slate-400 shrink-0" />
      <DateTextInput value={dateObj} onChange={handleDateChange} placeholder="DD/MM/YYYY" inputClassName="text-base w-full" />
    </div>
  );
}

function TimeOnlyField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [datePart, timePart] = value ? value.split("T") : ["", ""];

  const handleTimeChange = (t: string) => {
    onChange(`${datePart || todayDatePart()}T${t}`);
  };

  return (
    // Same bordered-box wrapper as DateOnlyField (icon + flex-1 input) rather than a bare
    // native <input type="time"> — a native time input doesn't reliably stretch to fill its
    // container the way a text input does, which left it visibly narrower than every other
    // field in the column. It also draws its own native picker icon at the right edge on top
    // of that (Chrome's built-in clock affordance) — hidden below via the WebKit
    // calendar-picker-indicator pseudo-element so only the one custom icon on the left shows,
    // matching the date field's single-icon look instead of looking lopsided with two.
    <div className="flex items-center gap-2 h-12 px-3.5 rounded-lg border border-slate-200 bg-white w-full">
      <Clock className="h-4 w-4 text-slate-400 shrink-0" />
      <input
        type="time"
        value={timePart || ""}
        onChange={(e) => handleTimeChange(e.target.value)}
        className="flex-1 w-full min-w-0 bg-transparent text-base outline-none border-0 p-0 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
      />
    </div>
  );
}

function HandlingMethodFields({ direction, state, setState, couriers, task, existingClientPhone }: any) {
  const courier = (couriers || []).find((c: any) => c.id === state.courierId) || null;
  const opt = getHandlingMethodOption(state.method);
  const isSelf = state.method === "client_self";
  const isRepresentative = state.method === "client_representative";
  const showPersonFields = !!opt?.needsPersonName;
  const isRiderMethod = !!opt?.needsCourier;
  // "Other" covers a rider/courier that isn't in the registry at all (a one-off, not one of
  // our regular NTL/G4S/Bolt/Uber options) — treated the same as an on_demand courier since
  // either way there's a specific individual to name, not a fixed office to route through.
  const isOther = state.courierId === "__other__";
  const isOnDemand = courier?.courier_type === "on_demand" || isOther;
  const isCompanyCourier = courier?.courier_type === "company";

  const effectiveName = state.personName || (isSelf ? (task?.applicant_name || "") : "");
  const effectivePhone = state.personPhone || (isSelf ? (existingClientPhone || "") : "");

  return (
    <>
      <FormRow label={direction === "received" ? "Received Method" : "Dispatch Method"} required>
        <Select value={state.method} onValueChange={(v) => setState((p: any) => ({ ...p, method: v }))}>
          <SelectTrigger className="h-12 w-full text-base border-slate-200 bg-white rounded-lg px-3.5">
            <SelectValue placeholder={direction === "received" ? "Select how it arrived..." : "Select how it's getting back..."} />
          </SelectTrigger>
          <SelectContent className="z-[200]">
            {HANDLING_METHOD_OPTIONS.map((opt: any) => (
              <SelectItem key={opt.value} value={opt.value} className="text-base py-2">
                {direction === "received" ? opt.receivedLabel : opt.dispatchLabel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormRow>

      {showPersonFields && (
        <>
          <FormRow label={isSelf ? "Client's Name" : "Representative's Name"} required={isRepresentative}>
            <Input
              value={effectiveName}
              onChange={(e) => setState((p: any) => ({ ...p, personName: e.target.value }))}
              placeholder="Full name"
              className="h-12 w-full text-base border-slate-200 bg-white rounded-lg px-3.5"
            />
          </FormRow>
          <FormRow label={isSelf ? "Client's Phone" : "Representative's Phone"}>
            <Input
              value={effectivePhone}
              onChange={(e) => setState((p: any) => ({ ...p, personPhone: e.target.value }))}
              placeholder="e.g. +254 712 345 678"
              className="h-12 w-full text-base border-slate-200 bg-white rounded-lg px-3.5"
            />
          </FormRow>
        </>
      )}

      {isRiderMethod && (
        <>
          <FormRow label="Courier / Rider" required>
            <Select
              value={state.courierId}
              onValueChange={(v) => setState((p: any) => ({ ...p, courierId: v, riderName: "", riderPhone: "", trackingRef: "" }))}
            >
              <SelectTrigger className="h-12 w-full text-base border-slate-200 bg-white rounded-lg px-3.5">
                <SelectValue placeholder="Select courier/rider service..." />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {(couriers || []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id} className="text-base py-2">{c.name}</SelectItem>
                ))}
                <SelectItem value="__other__" className="text-base py-2">Other (not listed)</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>

          {isOnDemand && (
            <>
              <FormRow label={isOther ? "Name" : "Rider Name"} required>
                <Input
                  value={state.riderName}
                  onChange={(e) => setState((p: any) => ({ ...p, riderName: e.target.value }))}
                  placeholder="Full name of rider"
                  className="h-12 w-full text-base border-slate-200 bg-white rounded-lg px-3.5"
                />
              </FormRow>
              <FormRow label={isOther ? "Phone" : "Rider Phone"}>
                <Input
                  value={state.riderPhone}
                  onChange={(e) => setState((p: any) => ({ ...p, riderPhone: e.target.value }))}
                  placeholder="e.g. +254 712 345 678"
                  className="h-12 w-full text-base border-slate-200 bg-white rounded-lg px-3.5"
                />
              </FormRow>
            </>
          )}

          {isCompanyCourier && (
            <FormRow label="Tracking Reference">
              <Input
                value={state.trackingRef}
                onChange={(e) => setState((p: any) => ({ ...p, trackingRef: e.target.value }))}
                placeholder="e.g. WB-92841"
                className="h-12 w-full text-base border-slate-200 bg-white rounded-lg px-3.5"
              />
            </FormRow>
          )}
        </>
      )}
    </>
  );
}

const PRIMARY_BTN = "h-11 px-6 rounded-lg text-base font-bold gap-2 text-white shadow-sm hover:opacity-95 transition-opacity";
const PRIMARY_STYLE = { backgroundColor: "#376bae" };

const PIPELINE = [
  { key: "received", label: "Received", title: "Step 1: Received from Client", icon: Inbox },
  { key: "taken", label: "At Nyayo", title: "Step 2: Taken to Nyayo House", icon: Landmark },
  { key: "returned", label: "Returned", title: "Step 3: Returned Stamped", icon: Undo2 },
  { key: "notified", label: "Notified", title: "Step 4: Client Notified", icon: BellRing },
  { key: "dispatch", label: "Dispatched", title: "Step 5: Dispatch to Client", icon: Truck },
];

function Stepper({
  record,
  activeKey,
  onSelectStep,
}: {
  record: PassportHandlingRecord | undefined;
  activeKey: string;
  onSelectStep: (key: string) => void;
}) {
  const doneMap: Record<string, boolean> = {
    received: !!record?.received_at,
    taken: !!record?.taken_at,
    returned: !!record?.returned_at,
    notified: !!record?.client_notified_at,
    dispatch: !!record?.dispatch_method && !!record?.dispatched_at,
  };

  return (
    <div className="flex items-center justify-between px-2 pt-2 pb-1">
      {PIPELINE.map((s, i) => {
        const done = doneMap[s.key];
        const isActive = activeKey === s.key;
        const Icon = s.icon;
        return (
          <React.Fragment key={s.key}>
            {i > 0 && (
              <div
                className={cn(
                  "h-1 flex-1 mx-2 rounded-full transition-colors",
                  done ? "bg-emerald-400" : "bg-slate-200"
                )}
              />
            )}
            <button
              type="button"
              onClick={() => onSelectStep(s.key)}
              className="flex flex-col items-center gap-1.5 shrink-0 group focus:outline-none cursor-pointer"
            >
              <div
                className={cn(
                  "h-11 w-11 rounded-full flex items-center justify-center border-2 transition-all",
                  done
                    ? "bg-emerald-500 border-emerald-500 text-white shadow-xs"
                    : isActive
                    ? "bg-white border-blue-600 text-blue-600 shadow-md ring-4 ring-blue-50"
                    : "bg-white border-slate-300 text-slate-400 group-hover:border-slate-400 group-hover:text-slate-600"
                )}
              >
                {done ? <CheckCircle2 className="h-6 w-6 stroke-[2.5]" /> : <Icon className="h-5 w-5" />}
              </div>
              <span
                className={cn(
                  "text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors",
                  done ? "text-emerald-700" : isActive ? "text-blue-600 font-black" : "text-slate-500"
                )}
              >
                {s.label}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function HandlingWizardDialog({
  open,
  onOpenChange,
  task,
  record,
  bclUsers,
  couriers,
  currentUserId,
  onSaved,
  onModeSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: any;
  record: PassportHandlingRecord | undefined;
  bclUsers: { id: string; name: string }[];
  couriers: Courier[];
  currentUserId: string | null;
  onSaved: (record: PassportHandlingRecord) => void;
  onModeSaved: (taskId: number, mode: "bcl" | "client") => void;
}) {
  // Everyone can attribute a step to any staff member on the roster — the dropdown shows all
  // users, defaulting to the current user as the most likely pick.
  const visibleStaffUsers = bclUsers;

  const [mode, setMode] = useState<"bcl" | "client" | null>(null);
  const [savingMode, setSavingMode] = useState(false);
  const [savingStep, setSavingStep] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<string>("received");

  const [received, setReceived] = useState({ at: "", by: "", method: "", personName: "", personPhone: "", courierId: "", riderName: "", riderPhone: "", trackingRef: "" });
  const [taken, setTaken] = useState({ at: "", by: "" });
  const [returned, setReturned] = useState({ at: "", by: "" });
  const [notified, setNotified] = useState({ at: "", by: "", method: "", message: "" });
  const [dispatch, setDispatch] = useState({ at: "", handledBy: "", method: "", personName: "", personPhone: "", courierId: "", riderName: "", riderPhone: "", trackingRef: "" });
  const [clientNotes, setClientNotes] = useState("");

  const [existingClientPhone, setExistingClientPhone] = useState<string>("");
  const [clientWhatsApp, setClientWhatsApp] = useState<string>("");
  const [clientEmail, setClientEmail] = useState<string>("");
  const [clientContactName, setClientContactName] = useState<string>("");
  const [phoneSavePrompt, setPhoneSavePrompt] = useState<{ step: "received" | "dispatch"; phone: string } | null>(null);
  const [savingPhoneToRegistry, setSavingPhoneToRegistry] = useState(false);
  const [confirmClearStep, setConfirmClearStep] = useState<string | null>(null);
  const [clearingStep, setClearingStep] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [editContactOpen, setEditContactOpen] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  // Recipient shown on the notification step. The number shown here is the one the server will
  // actually dial — the send route re-resolves it from the registry rather than trusting a number
  // passed in by the browser — so what staff confirm is what gets sent.
  const whatsAppRecipientName = clientContactName || task?.applicant_name || "the client";
  const canSendWhatsApp = Boolean(clientWhatsApp) && normalizeWhatsAppNumber(clientWhatsApp).length > 0;

  useEffect(() => {
    if (!open || !task?.individual_id) {
      setExistingClientPhone("");
      setClientWhatsApp("");
      setClientEmail("");
      setClientContactName("");
      return;
    }
    let cancelled = false;
    supabase
      .from("registry_individuals")
      .select("contact_details, full_name")
      .eq("id", task.individual_id)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        // Shared resolver — registry contact_details is sometimes an object and sometimes an
        // array, with nested and flat key variants both in use.
        setExistingClientPhone(resolvePrimaryPhone(data?.contact_details));
        setClientWhatsApp(resolveWhatsAppNumber(data?.contact_details));
        setClientEmail(resolveEmail(data?.contact_details));
        setClientContactName(data?.full_name || "");
      });
    return () => { cancelled = true; };
  }, [open, task?.individual_id]);

  useEffect(() => {
    if (!open) return;
    setPhoneSavePrompt(null);
    setConfirmClearStep(null);
    setMode(task?.passport_handling_mode || null);
    setReceived({
      at: toLocalInputValue(record?.received_at) || nowLocalInputValue(),
      by: record?.received_by || currentUserId || "",
      method: record?.received_method || "",
      personName: record?.received_person_name || "",
      personPhone: record?.received_person_phone || "",
      courierId: record?.received_courier_id || "",
      riderName: record?.received_rider_name || "",
      riderPhone: record?.received_rider_phone || "",
      trackingRef: record?.received_tracking_ref || "",
    });
    setTaken({
      at: toLocalInputValue(record?.taken_at) || nowLocalInputValue(),
      by: record?.taken_by || currentUserId || "",
    });
    setReturned({
      at: toLocalInputValue(record?.returned_at) || nowLocalInputValue(),
      by: record?.returned_by || record?.taken_by || currentUserId || "",
    });
    setNotified({
      at: toLocalInputValue(record?.client_notified_at) || nowLocalInputValue(),
      by: record?.client_notified_by || currentUserId || "",
      method: record?.client_notified_method || "",
      message: "",
    });
    setDispatch({
      at: toLocalInputValue(record?.dispatched_at) || nowLocalInputValue(),
      handledBy: record?.dispatch_handled_by || currentUserId || "",
      method: record?.dispatch_method || "",
      personName: record?.dispatch_person_name || "",
      personPhone: record?.dispatch_person_phone || "",
      courierId: record?.dispatch_courier_id || "",
      riderName: record?.dispatch_rider_name || "",
      riderPhone: record?.dispatch_rider_phone || "",
      trackingRef: record?.dispatch_tracking_ref || "",
    });
    setClientNotes(record?.notes || "");

    const doneMap = {
      received: !!record?.received_at,
      taken: !!record?.taken_at,
      returned: !!record?.returned_at,
      notified: !!record?.client_notified_at,
      dispatch: !!record?.dispatch_method && !!record?.dispatched_at,
    };
    const firstOpen = PIPELINE.find((s) => !doneMap[s.key])?.key || "received";
    setActiveStep(firstOpen);
  }, [open, task?.id, record, currentUserId]);

  const isClientConfirmed = mode === "client" && !!record?.returned_at;
  const currentStepIdx = PIPELINE.findIndex((s) => s.key === activeStep);
  const currentStepMeta = PIPELINE[currentStepIdx] || PIPELINE[0];

  const dispatchMessage = useMemo(() => {
    if (record?.dispatch_method !== "bcl_rider" || !record?.dispatched_at) return null;
    const courier = couriers.find((c) => c.id === record.dispatch_courier_id) || null;
    return composeDispatchMessage(courier, record.dispatch_rider_name);
  }, [record, couriers]);

  if (!task) return null;

  const saveMode = async (m: "bcl" | "client") => {
    setSavingMode(true);
    try {
      await updateTaskHandlingMode(task.id, m);
      setMode(m);
      onModeSaved(task.id, m);
      toast({ title: "Saved", description: `Passport handling set to ${m === "bcl" ? "BCL Handles Stamping" : "Client Handles It"}.` });
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to save handling mode.", variant: "destructive" });
    } finally {
      setSavingMode(false);
    }
  };

  const runStep = async (stepKey: string, patch: Partial<PassportHandlingRecord>, opts?: { markEndorsed?: boolean; nextStep?: string; onSuccess?: () => void }) => {
    setSavingStep(stepKey);
    try {
      const saved = await upsertHandlingRecord(task.id, task.company_id ?? null, patch, currentUserId);
      if (opts?.markEndorsed) await markTaskEndorsedIfPending(task);
      onSaved(saved);
      opts?.onSuccess?.();
      if (opts?.nextStep) {
        setActiveStep(opts.nextStep);
      }
      toast({ title: "Saved", description: "Step updated successfully." });
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to save this step.", variant: "destructive" });
    } finally {
      setSavingStep(null);
    }
  };

  const isValidLocalDateTime = (v: string) => !!v && !isNaN(new Date(v).getTime());

  // A timestamp reasonably defaults to "now" — same as when a step is first opened — so a
  // blank date/time (e.g. right after "Clear") just quietly falls back instead of blocking
  // Save with a validation error. Never returns something invalid, so `new Date(...)
  // .toISOString()` downstream can't hit the "Invalid time value" crash this replaced.
  const resolveDateTime = (v: string) => (isValidLocalDateTime(v) ? v : nowLocalInputValue());

  const requireMethod = (method: string, description: string) => {
    if (method) return true;
    toast({ title: "Missing method", description, variant: "destructive" });
    return false;
  };

  const confirmClientEndorsement = () =>
    runStep("client_confirm", {
      returned_at: new Date().toISOString(),
      returned_by: currentUserId,
      notes: clientNotes,
    }, { markEndorsed: true });

  const saveReceived = (advance = true) => {
    if (!requireMethod(received.method, "Please select how the passport was received.")) return;
    const courier = couriers.find((c) => c.id === received.courierId) || null;
    const isRider = received.method === "client_rider" || received.method === "bcl_rider";
    const isSelf = received.method === "client_self";
    const isRepresentative = received.method === "client_representative";
    const effectiveName = received.personName || (isSelf ? task.applicant_name || "" : "");
    const effectivePhone = received.personPhone || (isSelf ? existingClientPhone : "");
    return runStep(
      "received",
      {
        received_at: new Date(resolveDateTime(received.at)).toISOString(),
        received_by: received.by || null,
        received_method: received.method || null,
        received_person_name: (isSelf || isRepresentative) ? effectiveName || null : null,
        received_person_phone: (isSelf || isRepresentative) ? effectivePhone || null : null,
        // "__other__" is a UI-only sentinel for "not in our courier registry" — it isn't a
        // real tm_couriers row, so it must never be written to the courier_id FK.
        received_courier_id: isRider && received.courierId !== "__other__" ? received.courierId || null : null,
        received_rider_name: isRider && (courier?.courier_type === "on_demand" || received.courierId === "__other__") ? received.riderName || null : null,
        received_rider_phone: isRider && (courier?.courier_type === "on_demand" || received.courierId === "__other__") ? received.riderPhone || null : null,
        received_tracking_ref: isRider && courier?.courier_type === "company" ? received.trackingRef || null : null,
      },
      {
        ...(advance ? { nextStep: "taken" } : {}),
        onSuccess: () => {
          if (isSelf && !existingClientPhone && effectivePhone.trim()) {
            setPhoneSavePrompt({ step: "received", phone: effectivePhone.trim() });
          }
        },
      }
    );
  };

  const saveTaken = (advance = true) => {
    return runStep(
      "taken",
      {
        taken_at: new Date(resolveDateTime(taken.at)).toISOString(),
        taken_by: taken.by || null,
      },
      advance ? { nextStep: "returned" } : undefined
    );
  };

  const saveReturned = (advance = true) => {
    return runStep(
      "returned",
      {
        returned_at: new Date(resolveDateTime(returned.at)).toISOString(),
        returned_by: returned.by || null,
      },
      { markEndorsed: true, ...(advance ? { nextStep: "notified" } : {}) }
    );
  };

  const saveNotified = (advance = true) => {
    if (!requireMethod(notified.method, "Please select how the client was notified, or use Skip Notification.")) return;
    return runStep(
      "notified",
      {
        client_notified_at: new Date(resolveDateTime(notified.at)).toISOString(),
        client_notified_by: notified.by || null,
        client_notified_method: notified.method || null,
      },
      advance ? { nextStep: "dispatch" } : undefined
    );
  };

  // "Skip Notification" is a distinct, immediate action (not just leaving the method blank) —
  // some clients genuinely don't need telling (e.g. their dispatch method, like a standing
  // courier arrangement, already communicates it), and this records that as a deliberate
  // decision (its own at/by, method: 'skipped') rather than the step just sitting undone.
  const skipNotification = () => {
    runStep(
      "notified",
      {
        client_notified_at: new Date(resolveDateTime(notified.at)).toISOString(),
        client_notified_by: notified.by || currentUserId || null,
        client_notified_method: "skipped",
      },
      { nextStep: "dispatch" }
    );
  };

  const saveDispatch = () => {
    if (!requireMethod(dispatch.method, "Please select how the passport is getting back to the client.")) return;
    const courier = couriers.find((c) => c.id === dispatch.courierId) || null;
    const isRider = dispatch.method === "client_rider" || dispatch.method === "bcl_rider";
    const isSelf = dispatch.method === "client_self";
    const isRepresentative = dispatch.method === "client_representative";
    const effectiveName = dispatch.personName || (isSelf ? task.applicant_name || "" : "");
    const effectivePhone = dispatch.personPhone || (isSelf ? existingClientPhone : "");
    runStep(
      "dispatch",
      {
        dispatched_at: new Date(resolveDateTime(dispatch.at)).toISOString(),
        dispatch_handled_by: dispatch.handledBy || null,
        dispatch_method: dispatch.method || null,
        dispatch_person_name: (isSelf || isRepresentative) ? effectiveName || null : null,
        dispatch_person_phone: (isSelf || isRepresentative) ? effectivePhone || null : null,
        // "__other__" is a UI-only sentinel for "not in our courier registry" — it isn't a
        // real tm_couriers row, so it must never be written to the courier_id FK.
        dispatch_courier_id: isRider && dispatch.courierId !== "__other__" ? dispatch.courierId || null : null,
        dispatch_rider_name: isRider && (courier?.courier_type === "on_demand" || dispatch.courierId === "__other__") ? dispatch.riderName || null : null,
        dispatch_rider_phone: isRider && (courier?.courier_type === "on_demand" || dispatch.courierId === "__other__") ? dispatch.riderPhone || null : null,
        dispatch_tracking_ref: isRider && courier?.courier_type === "company" ? dispatch.trackingRef || null : null,
      },
      {
        onSuccess: () => {
          if (isSelf && !existingClientPhone && effectivePhone.trim()) {
            setPhoneSavePrompt({ step: "dispatch", phone: effectivePhone.trim() });
          }
        },
      }
    );
  };

  const handleCurrentStepSave = () => {
    switch (activeStep) {
      case "received":
        saveReceived(true);
        break;
      case "taken":
        saveTaken(true);
        break;
      case "returned":
        saveReturned(true);
        break;
      case "notified":
        saveNotified(true);
        break;
      case "dispatch":
        saveDispatch();
        break;
    }
  };

  const handlePrev = () => {
    if (currentStepIdx > 0) {
      setActiveStep(PIPELINE[currentStepIdx - 1].key);
    }
  };

  const handleNext = () => {
    if (currentStepIdx < PIPELINE.length - 1) {
      setActiveStep(PIPELINE[currentStepIdx + 1].key);
    }
  };

  // "Clear" deletes this step's *saved* data outright — not just the local unsaved form, which
  // left the real record (and its green "Completed" checkmark) untouched while the form looked
  // blank, so re-saving still demanded a method with nothing to actually redo. A real delete
  // against tm_passport_handling, so it's gated behind an explicit confirm banner rather than
  // firing immediately.
  const getStepClearPatch = (stepKey: string): Partial<PassportHandlingRecord> | null => {
    switch (stepKey) {
      case "received":
        return {
          received_at: null, received_by: null, received_method: null,
          received_person_name: null, received_person_phone: null,
          received_courier_id: null, received_rider_name: null, received_rider_phone: null,
          received_tracking_ref: null,
        };
      case "taken":
        return { taken_at: null, taken_by: null };
      case "returned":
        return { returned_at: null, returned_by: null };
      case "notified":
        return { client_notified_at: null, client_notified_by: null, client_notified_method: null };
      case "dispatch":
        return {
          dispatched_at: null, dispatch_handled_by: null, dispatch_method: null,
          dispatch_person_name: null, dispatch_person_phone: null,
          dispatch_courier_id: null, dispatch_rider_name: null, dispatch_rider_phone: null,
          dispatch_tracking_ref: null,
        };
      default:
        return null;
    }
  };

  // Resets this step's local form back to fresh "not started yet" defaults (today/current
  // staff) — the same shape a step shows the very first time it's opened — so it's immediately
  // ready for re-entry right after its saved data is deleted.
  const resetStepFormToFresh = (stepKey: string) => {
    switch (stepKey) {
      case "received":
        setReceived({ at: nowLocalInputValue(), by: currentUserId || "", method: "", personName: "", personPhone: "", courierId: "", riderName: "", riderPhone: "", trackingRef: "" });
        break;
      case "taken":
        setTaken({ at: nowLocalInputValue(), by: currentUserId || "" });
        break;
      case "returned":
        setReturned({ at: nowLocalInputValue(), by: currentUserId || "" });
        break;
      case "notified":
        setNotified({ at: nowLocalInputValue(), by: currentUserId || "", method: "", message: "" });
        break;
      case "dispatch":
        setDispatch({ at: nowLocalInputValue(), handledBy: currentUserId || "", method: "", personName: "", personPhone: "", courierId: "", riderName: "", riderPhone: "", trackingRef: "" });
        break;
    }
  };

  const executeClearStep = async () => {
    const stepKey = confirmClearStep;
    if (!stepKey) return;
    const patch = getStepClearPatch(stepKey);
    if (!patch) { setConfirmClearStep(null); return; }
    setClearingStep(true);
    try {
      const saved = await upsertHandlingRecord(task.id, task.company_id ?? null, patch, currentUserId);
      onSaved(saved);
      resetStepFormToFresh(stepKey);
      toast({ title: "Cleared", description: "Saved data for this step has been deleted." });
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to clear this step.", variant: "destructive" });
    } finally {
      setClearingStep(false);
      setConfirmClearStep(null);
    }
  };

  const handleCopyDispatchMessage = () => {
    if (!dispatchMessage) return;
    navigator.clipboard.writeText(dispatchMessage);
    toast({ title: "Copied", description: "Message copied — paste it into WhatsApp/SMS to the client." });
  };

  const saveClientPhoneToRegistry = async () => {
    if (!phoneSavePrompt || !task?.individual_id) return;
    setSavingPhoneToRegistry(true);
    try {
      const { data: individual, error: fetchError } = await supabase
        .from("registry_individuals")
        .select("contact_details")
        .eq("id", task.individual_id)
        .single();
      if (fetchError) throw fetchError;

      const raw = individual?.contact_details;
      const contactObj = raw
        ? JSON.parse(JSON.stringify(Array.isArray(raw) ? (raw[0] || {}) : raw))
        : {};
      if (!contactObj.phone) contactObj.phone = {};
      if (!contactObj.phone.kenyan) contactObj.phone.kenyan = {};
      contactObj.phone.kenyan.primary = phoneSavePrompt.phone;

      const { error: updateError } = await supabase
        .from("registry_individuals")
        .update({ contact_details: [contactObj] })
        .eq("id", task.individual_id);
      if (updateError) throw updateError;

      setExistingClientPhone(phoneSavePrompt.phone);
      setPhoneSavePrompt(null);
      toast({ title: "Saved", description: "Phone number added to the client's profile." });
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to save the phone number to the client's profile.", variant: "destructive" });
    } finally {
      setSavingPhoneToRegistry(false);
    }
  };

  const sendWhatsAppNotification = async () => {
    if (!task?.individual_id || sendingWhatsApp) return;

    const number = normalizeWhatsAppNumber(clientWhatsApp);
    if (!number) {
      toast({
        title: "No usable number",
        description: "Add a WhatsApp number for this client before sending.",
        variant: "destructive",
      });
      return;
    }
    if (!notified.message.trim()) {
      toast({ title: "Message is empty", description: "Write the message to send first.", variant: "destructive" });
      return;
    }

    setSendingWhatsApp(true);
    try {
      const response = await fetch("/api/passport-endorsement/whatsapp-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ individualId: task.individual_id, message: notified.message }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "WhatsApp send failed.");
      }

      const sentTo = payload?.data?.sentToDisplay || formatPhoneForDisplay(number);
      toast({
        title: "Sent to WhatsApp",
        description: `Message handed to WhatsApp for ${whatsAppRecipientName} (${sentTo}).`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Could not send",
        description: err instanceof Error ? err.message : "WhatsApp send failed.",
        variant: "destructive",
      });
    } finally {
      setSendingWhatsApp(false);
    }
  };

  // Persists edited contact fields back onto the individual's registry record. Writes the nested
  // shape used by the rest of the app and leaves every other key in contact_details untouched,
  // so unrelated contact data on the record isn't lost.
  const saveClientContact = async (next: { whatsapp: string; primary: string; email: string }) => {
    if (!task?.individual_id) return;
    setSavingContact(true);
    try {
      const { data: individual, error: fetchError } = await supabase
        .from("registry_individuals")
        .select("contact_details")
        .eq("id", task.individual_id)
        .single();
      if (fetchError) throw fetchError;

      const contactObj = normalizeContactDetails(individual?.contact_details);
      contactObj.phone = contactObj.phone || {};
      contactObj.phone.kenyan = contactObj.phone.kenyan || {};
      contactObj.email = contactObj.email || {};

      const whatsapp = next.whatsapp.trim();
      const primary = next.primary.trim();
      contactObj.phone.whatsapp = whatsapp;
      contactObj.phone.kenyan.primary = primary;
      contactObj.email.primary = next.email.trim();

      const { error: updateError } = await supabase
        .from("registry_individuals")
        .update({ contact_details: [contactObj] })
        .eq("id", task.individual_id);
      if (updateError) throw updateError;

      setClientWhatsApp(resolveWhatsAppNumber([contactObj]));
      setExistingClientPhone(resolvePrimaryPhone([contactObj]));
      setClientEmail(resolveEmail([contactObj]));
      setEditContactOpen(false);
      toast({ title: "Saved", description: "Contact details updated on the client's profile." });
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to save the contact details.", variant: "destructive" });
    } finally {
      setSavingContact(false);
    }
  };

  const stepCompletedAt = {
    received: record?.received_at ? `Completed ${fmtDateTime(record.received_at)} · ${bclUsers.find((u) => u.id === record.received_by)?.name || "Staff"}` : null,
    taken: record?.taken_at ? `Completed ${fmtDateTime(record.taken_at)} · ${bclUsers.find((u) => u.id === record.taken_by)?.name || "Staff"}` : null,
    returned: record?.returned_at ? `Completed ${fmtDateTime(record.returned_at)} · ${bclUsers.find((u) => u.id === record.returned_by)?.name || "Staff"}` : null,
    notified: record?.client_notified_at
      ? `${NOTIFIED_METHOD_LABELS[record.client_notified_method || ""] || "Completed"} ${fmtDateTime(record.client_notified_at)} · ${bclUsers.find((u) => u.id === record.client_notified_by)?.name || "Staff"}`
      : null,
    dispatch: record?.dispatched_at
      ? `Completed ${fmtDateTime(record.dispatched_at)} · ${getHandlingMethodOption(record.dispatch_method)?.dispatchLabel || ""}`
      : null,
  }[activeStep];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-white shadow-2xl border border-slate-200">
        {/* Header */}
        <DialogHeader className="px-8 pt-6 pb-5 bg-white border-b border-slate-100 shrink-0 space-y-2">
          <DialogTitle className="text-xl md:text-2xl font-black tracking-tight text-slate-900">
            {task.applicant_name}
          </DialogTitle>
          <DialogDescription className="text-base font-medium text-slate-500">
            {task.passport_number ? `Passport No: ${task.passport_number}` : "No passport number recorded"} · Stamping &amp; Handling Pipeline
          </DialogDescription>
          {mode === "bcl" && (
            <div className="pt-4 pb-1">
              <Stepper record={record} activeKey={activeStep} onSelectStep={setActiveStep} />
            </div>
          )}
        </DialogHeader>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 bg-slate-50">
          {/* Mode selector card aligned with the 2-column flex layout */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col sm:flex-row gap-2.5 sm:gap-6 sm:items-center">
            <div className="shrink-0 sm:w-[175px] sm:flex-shrink-0">
              <Label className="text-sm md:text-base font-bold text-slate-800 block">Handling Mode</Label>
            </div>
            <div className="w-full min-w-0">
              <Select value={mode || ""} onValueChange={(v) => saveMode(v as "bcl" | "client")} disabled={savingMode}>
                <SelectTrigger className="h-12 w-full text-base border-slate-200 bg-white rounded-lg px-3.5">
                  <SelectValue placeholder="Select handling mode..." />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  <SelectItem value="bcl" className="text-base py-2">BCL Handles Stamping</SelectItem>
                  <SelectItem value="client" className="text-base py-2">Client Handles It</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!mode && (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
              <p className="text-base text-slate-500 font-medium">Please select a handling mode above to proceed.</p>
            </div>
          )}

          {/* Mode: Client */}
          {mode === "client" && (
            <div className="rounded-2xl border border-violet-200 bg-white p-6 md:p-7 shadow-xs space-y-5">
              <div className="flex items-center gap-2.5 text-violet-800 pb-2 border-b border-slate-100">
                <Info className="h-5 w-5" />
                <span className="text-base font-bold">Client Self-Handling Stamping</span>
              </div>
              <FormRow label="Handling Notes" alignTop>
                <Textarea
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  placeholder="Enter details about client handling..."
                  disabled={isClientConfirmed}
                  className="w-full text-base bg-white border-slate-200 min-h-[110px] p-3 leading-relaxed rounded-lg"
                />
              </FormRow>

              {isClientConfirmed ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-base font-bold text-emerald-800 flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  Endorsement confirmed on {fmtDateTime(record!.returned_at!)}
                </div>
              ) : (
                <div className="pt-2 flex justify-end">
                  <Button
                    onClick={confirmClientEndorsement}
                    disabled={savingStep === "client_confirm"}
                    className={PRIMARY_BTN}
                    style={PRIMARY_STYLE}
                  >
                    {savingStep === "client_confirm" && <Loader2 className="h-4 w-4 animate-spin" />}
                    Mark Endorsement Confirmed
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Mode: BCL - Active Section Only */}
          {mode === "bcl" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-7 shadow-xs space-y-3">
              {/* Section Title & Status Badge */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-base">
                    {currentStepIdx + 1}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{currentStepMeta.title}</h3>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-start sm:self-auto">
                  {stepCompletedAt && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      {stepCompletedAt}
                    </span>
                  )}
                  {stepCompletedAt && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmClearStep(activeStep)}
                      className="h-9 px-3.5 text-sm font-bold gap-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 border-slate-200 hover:border-red-200"
                    >
                      <Eraser className="h-3.5 w-3.5" /> Clear
                    </Button>
                  )}
                </div>
              </div>

              {confirmClearStep === activeStep && (
                <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-red-200 bg-red-50">
                  <p className="text-sm font-bold text-red-900">
                    Delete the saved data for this step? This can't be undone.
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmClearStep(null)} disabled={clearingStep} className="text-red-700 hover:bg-red-100">
                      Cancel
                    </Button>
                    <Button type="button" size="sm" onClick={executeClearStep} disabled={clearingStep} className="gap-1.5 bg-red-600 hover:bg-red-700 text-white">
                      {clearingStep && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Delete
                    </Button>
                  </div>
                </div>
              )}

              {phoneSavePrompt && phoneSavePrompt.step === activeStep && (
                <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50">
                  <p className="text-sm font-bold text-amber-900">
                    Save {phoneSavePrompt.phone} to this client's profile for next time?
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPhoneSavePrompt(null)} className="text-amber-700 hover:bg-amber-100">
                      Not now
                    </Button>
                    <Button type="button" size="sm" onClick={saveClientPhoneToRegistry} disabled={savingPhoneToRegistry} className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white">
                      {savingPhoneToRegistry && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save to Profile
                    </Button>
                  </div>
                </div>
              )}

              {activeStep === "dispatch" && dispatchMessage && (
                <div className="flex items-start justify-between gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-blue-900 mb-1">Client Message</p>
                    <p className="text-sm text-blue-800">{dispatchMessage}</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={handleCopyDispatchMessage} className="shrink-0 gap-1.5 bg-white">
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
              )}

              {/* Step 1: Received */}
              {activeStep === "received" && (
                <div className="divide-y divide-slate-100">
                  <FormRow label="Received Date" required>
                    <DateOnlyField value={received.at} onChange={(v) => setReceived((p) => ({ ...p, at: v }))} />
                  </FormRow>
                  <FormRow label="Received Time" required>
                    <TimeOnlyField value={received.at} onChange={(v) => setReceived((p) => ({ ...p, at: v }))} />
                  </FormRow>
                  <FormRow label="Received By (Staff)" required>
                    <StaffCombobox users={visibleStaffUsers} value={received.by} onChange={(v) => setReceived((p) => ({ ...p, by: v }))} />
                  </FormRow>
                  <HandlingMethodFields direction="received" state={received} setState={setReceived} couriers={couriers} task={task} existingClientPhone={existingClientPhone} />
                </div>
              )}

              {/* Step 2: Taken to Nyayo */}
              {activeStep === "taken" && (
                <div className="divide-y divide-slate-100">
                  <FormRow label="Submission Date" required>
                    <DateOnlyField value={taken.at} onChange={(v) => setTaken((p) => ({ ...p, at: v }))} />
                  </FormRow>
                  <FormRow label="Submission Time" required>
                    <TimeOnlyField value={taken.at} onChange={(v) => setTaken((p) => ({ ...p, at: v }))} />
                  </FormRow>
                  <FormRow label="Taken By (Staff)" required>
                    <StaffCombobox users={visibleStaffUsers} value={taken.by} onChange={(v) => setTaken((p) => ({ ...p, by: v }))} />
                  </FormRow>
                </div>
              )}

              {/* Step 3: Returned Stamped */}
              {activeStep === "returned" && (
                <div className="divide-y divide-slate-100">
                  <FormRow label="Return Date" required>
                    <DateOnlyField value={returned.at} onChange={(v) => setReturned((p) => ({ ...p, at: v }))} />
                  </FormRow>
                  <FormRow label="Return Time" required>
                    <TimeOnlyField value={returned.at} onChange={(v) => setReturned((p) => ({ ...p, at: v }))} />
                  </FormRow>
                  <FormRow label="Brought Back By" required>
                    <StaffCombobox users={visibleStaffUsers} value={returned.by} onChange={(v) => setReturned((p) => ({ ...p, by: v }))} />
                  </FormRow>
                </div>
              )}

              {/* Step 4: Client Notified */}
              {activeStep === "notified" && (
                <div className="divide-y divide-slate-100">
                  <FormRow label="Notification Date">
                    <DateOnlyField value={notified.at} onChange={(v) => setNotified((p) => ({ ...p, at: v }))} />
                  </FormRow>
                  <FormRow label="Notification Time">
                    <TimeOnlyField value={notified.at} onChange={(v) => setNotified((p) => ({ ...p, at: v }))} />
                  </FormRow>
                  <FormRow label="Notified By (Staff)">
                    <StaffCombobox users={visibleStaffUsers} value={notified.by} onChange={(v) => setNotified((p) => ({ ...p, by: v }))} />
                  </FormRow>
                  <FormRow label="Notified Via" alignTop>
                    <div className="space-y-3 w-full">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {[
                          { value: "call", label: "Call", icon: Phone },
                          { value: "text", label: "Text", icon: MessageSquare },
                          { value: "auto_message", label: "Auto Message", icon: SendHorizonal },
                        ].map(({ value, label, icon: Icon }) => {
                          const active = notified.method === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() =>
                                setNotified((p) => ({
                                  ...p,
                                  method: value,
                                  message:
                                    value === "auto_message" && !p.message
                                      ? composeReadyForPickupMessage(task.applicant_name)
                                      : p.message,
                                }))
                              }
                              className={cn(
                                "flex items-center justify-center gap-2 h-11 rounded-lg border text-sm font-bold transition-colors",
                                active
                                  ? "border-blue-600 bg-blue-50 text-blue-700"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              )}
                            >
                              <Icon className="h-4 w-4" /> {label}
                            </button>
                          );
                        })}
                      </div>

                      {notified.method === "auto_message" && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label className="text-sm font-bold text-slate-700">Message to Send</Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditContactOpen(true)}
                              className="gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
                            >
                              <Pencil className="h-3.5 w-3.5" /> Edit Contact
                            </Button>
                          </div>

                          {/* Who the message is going to, so staff can confirm before sending. */}
                          <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 space-y-1">
                            <div className="flex items-center gap-2 text-sm">
                              <UserRound className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="text-slate-500">To</span>
                              <span className="font-bold text-slate-800 truncate">{whatsAppRecipientName}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <MessageCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="text-slate-500">Number</span>
                              {canSendWhatsApp ? (
                                <span className="font-mono font-bold text-slate-800">
                                  {formatPhoneForDisplay(clientWhatsApp) || clientWhatsApp}
                                </span>
                              ) : (
                                <span className="text-amber-700 font-bold">
                                  {clientWhatsApp
                                    ? `"${clientWhatsApp}" can't be used for WhatsApp`
                                    : "No WhatsApp number on file"}
                                </span>
                              )}
                            </div>
                            {clientEmail && (
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-slate-500 w-[3.25rem] ml-[1.375rem]">Email</span>
                                <span className="text-slate-600 truncate">{clientEmail}</span>
                              </div>
                            )}
                          </div>

                          <Textarea
                            value={notified.message}
                            onChange={(e) => setNotified((p) => ({ ...p, message: e.target.value }))}
                            rows={4}
                            className="text-sm bg-white"
                          />
                          <div className="flex flex-wrap gap-2.5">
                            <Button
                              type="button"
                              onClick={sendWhatsAppNotification}
                              disabled={sendingWhatsApp || !canSendWhatsApp || !notified.message.trim()}
                              className="gap-1.5 text-sm font-bold bg-green-600 hover:bg-green-700 text-white"
                            >
                              {sendingWhatsApp ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <MessageCircle className="h-3.5 w-3.5" />
                              )}
                              {sendingWhatsApp ? "Sending…" : "Send via WhatsApp"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(notified.message);
                                toast({ title: "Copied", description: "Message copied to clipboard." });
                              }}
                              className="gap-1.5 text-sm font-bold"
                            >
                              <Copy className="h-3.5 w-3.5" /> Copy Message
                            </Button>
                          </div>
                          <p className="text-xs text-slate-500">
                            Sending uses the number saved on the client&apos;s profile. Edit it above if it looks wrong.
                          </p>
                        </div>
                      )}
                    </div>
                  </FormRow>

                  <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-xs text-slate-500 max-w-sm">
                      Skip if this client doesn't need a separate notification — e.g. their dispatch method (like a standing courier pickup) already tells them.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={skipNotification}
                      disabled={savingStep === "notified"}
                      className="h-10 px-4 text-sm font-bold gap-1.5 text-slate-600 hover:bg-slate-50 border-slate-300 shrink-0"
                    >
                      {savingStep === "notified" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <SkipForward className="h-3.5 w-3.5" />
                      )}
                      Skip Notification
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 5: Dispatch */}
              {activeStep === "dispatch" && (
                <div className="divide-y divide-slate-100">
                  <FormRow label="Dispatch Date" required>
                    <DateOnlyField value={dispatch.at} onChange={(v) => setDispatch((p) => ({ ...p, at: v }))} />
                  </FormRow>
                  <FormRow label="Dispatch Time" required>
                    <TimeOnlyField value={dispatch.at} onChange={(v) => setDispatch((p) => ({ ...p, at: v }))} />
                  </FormRow>
                  <FormRow label="Handled By (Staff)" required>
                    <StaffCombobox users={visibleStaffUsers} value={dispatch.handledBy} onChange={(v) => setDispatch((p) => ({ ...p, handledBy: v }))} />
                  </FormRow>
                  <HandlingMethodFields direction="dispatch" state={dispatch} setState={setDispatch} couriers={couriers} task={task} existingClientPhone={existingClientPhone} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {mode === "bcl" && (
          <DialogFooter className="px-8 py-4 bg-white border-t border-slate-200 flex items-center justify-between sm:justify-between shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={handlePrev}
              disabled={currentStepIdx === 0}
              className="h-11 px-5 text-base font-bold gap-2 text-slate-700 hover:bg-slate-50 border-slate-300"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={handleCurrentStepSave}
                disabled={savingStep === activeStep}
                className={PRIMARY_BTN}
                style={PRIMARY_STYLE}
              >
                {savingStep === activeStep ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {currentStepIdx === PIPELINE.length - 1 ? "Save & Finalize" : "Save & Continue"}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleNext}
                disabled={currentStepIdx === PIPELINE.length - 1}
                className="h-11 px-5 text-base font-bold gap-2 text-slate-700 hover:bg-slate-50 border-slate-300"
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>

      <EditContactModal
        open={editContactOpen}
        onOpenChange={setEditContactOpen}
        contactName={whatsAppRecipientName}
        initial={{ whatsapp: clientWhatsApp, primary: existingClientPhone, email: clientEmail }}
        isSaving={savingContact}
        onSave={saveClientContact}
      />
    </Dialog>
  );
}

function EditContactModal({ open, onOpenChange, contactName, initial, isSaving, onSave }: any) {
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp || "");
  const [primary, setPrimary] = useState(initial.primary || "");
  const [email, setEmail] = useState(initial.email || "");

  // Re-seed each time it opens so a cancelled edit doesn't leave stale values behind.
  useEffect(() => {
    if (!open) return;
    setWhatsapp(initial.whatsapp || "");
    setPrimary(initial.primary || "");
    setEmail(initial.email || "");
  }, [open, initial.whatsapp, initial.primary, initial.email]);

  // Mirror the send route's validation so the problem is caught before a save.
  const normalized = normalizeWhatsAppNumber(whatsapp);
  const whatsappInvalid = Boolean(whatsapp.trim()) && !normalized;
  const normalizedDisplay = normalized ? formatPhoneForDisplay(normalized) : "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (whatsappInvalid) return;
    onSave({ whatsapp: whatsapp.trim(), primary: primary.trim(), email: email.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full bg-white">
        <DialogHeader>
          <DialogTitle>Edit Contact</DialogTitle>
          <DialogDescription>
            Update the contact details saved on {contactName}&apos;s profile. These are used for WhatsApp
            notifications and calls.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-whatsapp" className="text-sm font-bold text-slate-700">WhatsApp Number</Label>
            <Input
              id="edit-whatsapp"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="0712 345 678"
              autoComplete="off"
            />
            {whatsappInvalid ? (
              <p className="text-xs text-amber-700">
                WhatsApp can&apos;t use this number. Mobile numbers are 9 digits after 254 — landlines won&apos;t work.
              </p>
            ) : normalizedDisplay ? (
              <p className="text-xs text-slate-500">Will send to {normalizedDisplay}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-primary" className="text-sm font-bold text-slate-700">Primary Phone</Label>
            <Input
              id="edit-primary"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              placeholder="0712 345 678"
              autoComplete="off"
            />
            <p className="text-xs text-slate-500">The number used when the client is called.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-email" className="text-sm font-bold text-slate-700">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@example.com"
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || whatsappInvalid} className="gap-1.5">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}