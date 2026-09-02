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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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
  Check,
  ChevronsUpDown,
  CalendarDays,
  Clock,
  Eraser,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import { DateTextInput } from "./PageHeader";
import {
  upsertHandlingRecord,
  updateTaskHandlingMode,
  markTaskEndorsedIfPending,
  HANDLING_METHOD_OPTIONS,
  getHandlingMethodOption,
  composeDispatchMessage,
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

// Searchable staff picker
function StaffCombobox({ users, value, onChange, placeholder = "Select staff member..." }: any) {
  const [open, setOpen] = useState(false);
  const selected = (users || []).find((u: any) => u.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-12 w-full justify-between text-base font-normal border-slate-200 bg-white rounded-lg px-3.5 hover:bg-white"
        >
          <span className={cn("truncate", !selected && "text-slate-400")}>{selected?.name || placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[200]" align="start">
        <Command>
          <CommandInput placeholder="Search staff..." className="text-base" />
          <CommandList className="max-h-[260px] overflow-y-auto">
            <CommandEmpty>No staff found.</CommandEmpty>
            <CommandGroup>
              {(users || []).map((u: any) => (
                <CommandItem key={u.id} value={u.name} onSelect={() => { onChange(u.id); setOpen(false); }} className="text-base py-2">
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === u.id ? "opacity-100" : "opacity-0")} />
                  {u.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
  const isOnDemand = courier?.courier_type === "on_demand";
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
              </SelectContent>
            </Select>
          </FormRow>

          {isOnDemand && (
            <>
              <FormRow label="Rider Name" required>
                <Input
                  value={state.riderName}
                  onChange={(e) => setState((p: any) => ({ ...p, riderName: e.target.value }))}
                  placeholder="Full name of rider"
                  className="h-12 w-full text-base border-slate-200 bg-white rounded-lg px-3.5"
                />
              </FormRow>
              <FormRow label="Rider Phone">
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
  const [mode, setMode] = useState<"bcl" | "client" | null>(null);
  const [savingMode, setSavingMode] = useState(false);
  const [savingStep, setSavingStep] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<string>("received");

  const [received, setReceived] = useState({ at: "", by: "", method: "", personName: "", personPhone: "", courierId: "", riderName: "", riderPhone: "", trackingRef: "" });
  const [taken, setTaken] = useState({ at: "", by: "" });
  const [returned, setReturned] = useState({ at: "", by: "" });
  const [notified, setNotified] = useState({ at: "", by: "" });
  const [dispatch, setDispatch] = useState({ at: "", handledBy: "", method: "", personName: "", personPhone: "", courierId: "", riderName: "", riderPhone: "", trackingRef: "" });
  const [clientNotes, setClientNotes] = useState("");

  const [existingClientPhone, setExistingClientPhone] = useState<string>("");
  const [phoneSavePrompt, setPhoneSavePrompt] = useState<{ step: "received" | "dispatch"; phone: string } | null>(null);
  const [savingPhoneToRegistry, setSavingPhoneToRegistry] = useState(false);

  useEffect(() => {
    if (!open || !task?.individual_id) { setExistingClientPhone(""); return; }
    let cancelled = false;
    supabase
      .from("registry_individuals")
      .select("contact_details")
      .eq("id", task.individual_id)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        const raw = data?.contact_details;
        const contactObj = Array.isArray(raw) ? raw[0] : raw;
        setExistingClientPhone(contactObj?.phone?.kenyan?.primary || contactObj?.phone?.whatsapp || "");
      });
    return () => { cancelled = true; };
  }, [open, task?.individual_id]);

  useEffect(() => {
    if (!open) return;
    setPhoneSavePrompt(null);
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

  const requireDateTime = (v: string, label: string) => {
    if (isValidLocalDateTime(v)) return true;
    toast({ title: "Missing date/time", description: `Please set the ${label} before saving.`, variant: "destructive" });
    return false;
  };

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
    if (!requireDateTime(received.at, "received date and time")) return;
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
        received_at: new Date(received.at).toISOString(),
        received_by: received.by || null,
        received_method: received.method || null,
        received_person_name: (isSelf || isRepresentative) ? effectiveName || null : null,
        received_person_phone: (isSelf || isRepresentative) ? effectivePhone || null : null,
        received_courier_id: isRider ? received.courierId || null : null,
        received_rider_name: isRider && courier?.courier_type === "on_demand" ? received.riderName || null : null,
        received_rider_phone: isRider && courier?.courier_type === "on_demand" ? received.riderPhone || null : null,
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
    if (!requireDateTime(taken.at, "submission date and time")) return;
    return runStep(
      "taken",
      {
        taken_at: new Date(taken.at).toISOString(),
        taken_by: taken.by || null,
      },
      advance ? { nextStep: "returned" } : undefined
    );
  };

  const saveReturned = (advance = true) => {
    if (!requireDateTime(returned.at, "return date and time")) return;
    return runStep(
      "returned",
      {
        returned_at: new Date(returned.at).toISOString(),
        returned_by: returned.by || null,
      },
      { markEndorsed: true, ...(advance ? { nextStep: "notified" } : {}) }
    );
  };

  const saveNotified = (advance = true) => {
    if (!requireDateTime(notified.at, "notification date and time")) return;
    return runStep(
      "notified",
      {
        client_notified_at: new Date(notified.at).toISOString(),
        client_notified_by: notified.by || null,
      },
      advance ? { nextStep: "dispatch" } : undefined
    );
  };

  const saveDispatch = () => {
    if (!requireDateTime(dispatch.at, "dispatch date and time")) return;
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
        dispatched_at: new Date(dispatch.at).toISOString(),
        dispatch_handled_by: dispatch.handledBy || null,
        dispatch_method: dispatch.method || null,
        dispatch_person_name: (isSelf || isRepresentative) ? effectiveName || null : null,
        dispatch_person_phone: (isSelf || isRepresentative) ? effectivePhone || null : null,
        dispatch_courier_id: isRider ? dispatch.courierId || null : null,
        dispatch_rider_name: isRider && courier?.courier_type === "on_demand" ? dispatch.riderName || null : null,
        dispatch_rider_phone: isRider && courier?.courier_type === "on_demand" ? dispatch.riderPhone || null : null,
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

  const clearCurrentStep = () => {
    switch (activeStep) {
      case "received":
        setReceived({ at: "", by: "", method: "", personName: "", personPhone: "", courierId: "", riderName: "", riderPhone: "", trackingRef: "" });
        break;
      case "taken":
        setTaken({ at: "", by: "" });
        break;
      case "returned":
        setReturned({ at: "", by: "" });
        break;
      case "notified":
        setNotified({ at: "", by: "" });
        break;
      case "dispatch":
        setDispatch({ at: "", handledBy: "", method: "", personName: "", personPhone: "", courierId: "", riderName: "", riderPhone: "", trackingRef: "" });
        break;
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

  const stepCompletedAt = {
    received: record?.received_at ? `Completed ${fmtDateTime(record.received_at)} · ${bclUsers.find((u) => u.id === record.received_by)?.name || "Staff"}` : null,
    taken: record?.taken_at ? `Completed ${fmtDateTime(record.taken_at)} · ${bclUsers.find((u) => u.id === record.taken_by)?.name || "Staff"}` : null,
    returned: record?.returned_at ? `Completed ${fmtDateTime(record.returned_at)} · ${bclUsers.find((u) => u.id === record.returned_by)?.name || "Staff"}` : null,
    notified: record?.client_notified_at ? `Completed ${fmtDateTime(record.client_notified_at)} · ${bclUsers.find((u) => u.id === record.client_notified_by)?.name || "Staff"}` : null,
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearCurrentStep}
                    className="h-9 px-3.5 text-sm font-bold gap-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 border-slate-200 hover:border-red-200"
                  >
                    <Eraser className="h-3.5 w-3.5" /> Clear
                  </Button>
                </div>
              </div>

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
                    <StaffCombobox users={bclUsers} value={received.by} onChange={(v) => setReceived((p) => ({ ...p, by: v }))} />
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
                    <StaffCombobox users={bclUsers} value={taken.by} onChange={(v) => setTaken((p) => ({ ...p, by: v }))} />
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
                    <StaffCombobox users={bclUsers} value={returned.by} onChange={(v) => setReturned((p) => ({ ...p, by: v }))} />
                  </FormRow>
                </div>
              )}

              {/* Step 4: Client Notified */}
              {activeStep === "notified" && (
                <div className="divide-y divide-slate-100">
                  <FormRow label="Notification Date" required>
                    <DateOnlyField value={notified.at} onChange={(v) => setNotified((p) => ({ ...p, at: v }))} />
                  </FormRow>
                  <FormRow label="Notification Time" required>
                    <TimeOnlyField value={notified.at} onChange={(v) => setNotified((p) => ({ ...p, at: v }))} />
                  </FormRow>
                  <FormRow label="Notified By (Staff)" required>
                    <StaffCombobox users={bclUsers} value={notified.by} onChange={(v) => setNotified((p) => ({ ...p, by: v }))} />
                  </FormRow>
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
                    <StaffCombobox users={bclUsers} value={dispatch.handledBy} onChange={(v) => setDispatch((p) => ({ ...p, handledBy: v }))} />
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
    </Dialog>
  );
}