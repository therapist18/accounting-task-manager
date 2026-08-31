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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/hooks/use-toast";
import { DateTextInput } from "./PageHeader";
import {
  upsertHandlingRecord,
  updateTaskHandlingMode,
  markTaskEndorsedIfPending,
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

// Solid 2-Column Row: Left = Label (38% width), Right = Value / Full-width Input (62% width)
function FormRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-6 py-5 border-b border-slate-100 last:border-b-0">
      <div className="sm:w-[38%] shrink-0">
        <Label className="text-base font-bold text-slate-800 block">
          {label} {required && <span className="text-red-500 font-bold">*</span>}
        </Label>
      </div>
      <div className="w-full sm:w-[62%] min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ToggleButtons({ options, value, onChange }: any) {
  return (
    <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-100 rounded-xl w-fit border border-slate-200/60">
      {options.map((opt: any) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-4 py-2 rounded-lg text-sm md:text-base font-bold transition-all",
            value === opt.value
              ? "bg-white text-blue-600 shadow-xs font-black"
              : "text-slate-600 hover:text-slate-900"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Searchable staff picker — swaps the plain <Select> the "who did this" fields used to use for
// a filterable combobox, since bclUsers can run long enough that scrolling a plain dropdown to
// find one name is slower than just typing it.
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

// Date and Time are each their own labeled FormRow (not one shared "Date & Time" row) — both
// read from and write to the same "YYYY-MM-DDTHH:mm" value string (the shape every save
// function already converts via `new Date(x.at).toISOString()`), so DateOnlyField and
// TimeOnlyField below only ever touch their own half of it.
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
      {/* PageHeader's own DateTextInput (dd/mm/yyyy, typed) rather than a native
          <input type="date">, whose displayed format follows the browser/OS locale and can't
          be forced to dd/mm/yyyy. */}
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
    <Input
      type="time"
      value={timePart || ""}
      onChange={(e) => handleTimeChange(e.target.value)}
      className="h-12 w-full border-slate-200 bg-white text-base rounded-lg px-3.5"
    />
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
    dispatch: !!record?.dispatch_method && (!!record?.delivered_at || !!record?.pickup_at),
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

  // Local field state
  const [received, setReceived] = useState({ at: "", by: "", broughtBy: "" });
  const [taken, setTaken] = useState({ at: "", by: "" });
  const [returned, setReturned] = useState({ at: "", by: "" });
  const [notified, setNotified] = useState({ at: "", by: "" });
  const [dispatchMethod, setDispatchMethod] = useState<"delivery" | "pickup" | "">("");
  const [deliveryType, setDeliveryType] = useState<"staff" | "courier" | "">("");
  const [delivery, setDelivery] = useState({ at: "", staffBy: "", courierId: "", riderName: "", riderPhone: "", trackingRef: "" });
  const [pickup, setPickup] = useState({ at: "", personName: "", relation: "" as "" | "self" | "representative" });
  const [clientNotes, setClientNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode(task?.passport_handling_mode || null);
    setReceived({
      at: toLocalInputValue(record?.received_at) || nowLocalInputValue(),
      by: record?.received_by || currentUserId || "",
      broughtBy: record?.brought_by_name || "",
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
    setDispatchMethod(record?.dispatch_method || "");
    setDeliveryType(record?.delivery_type || "");
    setDelivery({
      at: toLocalInputValue(record?.delivered_at) || nowLocalInputValue(),
      staffBy: record?.delivered_by || "",
      courierId: record?.courier_id || "",
      riderName: record?.courier_rider_name || "",
      riderPhone: record?.courier_rider_phone || "",
      trackingRef: record?.courier_tracking_ref || "",
    });
    setPickup({
      at: toLocalInputValue(record?.pickup_at) || nowLocalInputValue(),
      personName: record?.pickup_person_name || "",
      relation: record?.pickup_relation || "",
    });
    setClientNotes(record?.notes || "");

    const doneMap = {
      received: !!record?.received_at,
      taken: !!record?.taken_at,
      returned: !!record?.returned_at,
      notified: !!record?.client_notified_at,
      dispatch: !!record?.dispatch_method && (!!record?.delivered_at || !!record?.pickup_at),
    };
    const firstOpen = PIPELINE.find((s) => !doneMap[s.key])?.key || "received";
    setActiveStep(firstOpen);
  }, [open, task?.id, record, currentUserId]);

  const isClientConfirmed = mode === "client" && !!record?.returned_at;
  const selectedCourier = useMemo(() => couriers.find((c) => c.id === delivery.courierId), [couriers, delivery.courierId]);

  const currentStepIdx = PIPELINE.findIndex((s) => s.key === activeStep);
  const currentStepMeta = PIPELINE[currentStepIdx] || PIPELINE[0];

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

  const runStep = async (stepKey: string, patch: Partial<PassportHandlingRecord>, opts?: { markEndorsed?: boolean; nextStep?: string }) => {
    setSavingStep(stepKey);
    try {
      const saved = await upsertHandlingRecord(task.id, task.company_id ?? null, patch, currentUserId);
      if (opts?.markEndorsed) await markTaskEndorsedIfPending(task);
      onSaved(saved);
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

  const confirmClientEndorsement = () =>
    runStep("client_confirm", {
      returned_at: new Date().toISOString(),
      returned_by: currentUserId,
      notes: clientNotes,
    }, { markEndorsed: true });

  const saveReceived = (advance = true) =>
    runStep(
      "received",
      {
        received_at: new Date(received.at).toISOString(),
        received_by: received.by || null,
        brought_by_name: received.broughtBy || null,
      },
      advance ? { nextStep: "taken" } : undefined
    );

  const saveTaken = (advance = true) =>
    runStep(
      "taken",
      {
        taken_at: new Date(taken.at).toISOString(),
        taken_by: taken.by || null,
      },
      advance ? { nextStep: "returned" } : undefined
    );

  const saveReturned = (advance = true) =>
    runStep(
      "returned",
      {
        returned_at: new Date(returned.at).toISOString(),
        returned_by: returned.by || null,
      },
      { markEndorsed: true, ...(advance ? { nextStep: "notified" } : {}) }
    );

  const saveNotified = (advance = true) =>
    runStep(
      "notified",
      {
        client_notified_at: new Date(notified.at).toISOString(),
        client_notified_by: notified.by || null,
      },
      advance ? { nextStep: "dispatch" } : undefined
    );

  const saveDispatch = () => {
    if (dispatchMethod === "delivery") {
      runStep("dispatch", {
        dispatch_method: "delivery",
        delivery_type: deliveryType || null,
        delivered_by: deliveryType === "staff" ? delivery.staffBy || null : null,
        courier_id: deliveryType === "courier" ? delivery.courierId || null : null,
        courier_rider_name: deliveryType === "courier" ? delivery.riderName || null : null,
        courier_rider_phone: deliveryType === "courier" ? delivery.riderPhone || null : null,
        courier_tracking_ref: deliveryType === "courier" ? delivery.trackingRef || null : null,
        delivered_at: new Date(delivery.at).toISOString(),
        pickup_person_name: null,
        pickup_relation: null,
        pickup_at: null,
      });
    } else if (dispatchMethod === "pickup") {
      runStep("dispatch", {
        dispatch_method: "pickup",
        pickup_person_name: pickup.personName || null,
        pickup_relation: pickup.relation || null,
        pickup_at: new Date(pickup.at).toISOString(),
        delivery_type: null,
        delivered_by: null,
        courier_id: null,
        courier_rider_name: null,
        courier_rider_phone: null,
        courier_tracking_ref: null,
        delivered_at: null,
      });
    }
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

  const stepCompletedAt = {
    received: record?.received_at ? `Completed ${fmtDateTime(record.received_at)} · ${bclUsers.find((u) => u.id === record.received_by)?.name || "Staff"}` : null,
    taken: record?.taken_at ? `Completed ${fmtDateTime(record.taken_at)} · ${bclUsers.find((u) => u.id === record.taken_by)?.name || "Staff"}` : null,
    returned: record?.returned_at ? `Completed ${fmtDateTime(record.returned_at)} · ${bclUsers.find((u) => u.id === record.returned_by)?.name || "Staff"}` : null,
    notified: record?.client_notified_at ? `Completed ${fmtDateTime(record.client_notified_at)} · ${bclUsers.find((u) => u.id === record.client_notified_by)?.name || "Staff"}` : null,
    dispatch: (record?.delivered_at || record?.pickup_at)
      ? `Completed ${fmtDateTime(record.delivered_at || record.pickup_at)} · ${record.dispatch_method === "delivery" ? "Delivery" : "Pickup"}`
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
          {/* Mode selector card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-base font-bold text-slate-800 shrink-0">Handling Mode</p>
            <div className="w-full sm:w-72">
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
            <div className="rounded-2xl border border-violet-200 bg-white p-6 shadow-xs space-y-5">
              <div className="flex items-center gap-2.5 text-violet-800 pb-2 border-b border-slate-100">
                <Info className="h-5 w-5" />
                <span className="text-base font-bold">Client Self-Handling Stamping</span>
              </div>
              <FormRow label="Handling Notes">
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

                {stepCompletedAt && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 self-start sm:self-auto">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {stepCompletedAt}
                  </span>
                )}
              </div>

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
                  <FormRow label="Brought In By">
                    <Input
                      value={received.broughtBy}
                      onChange={(e) => setReceived((p) => ({ ...p, broughtBy: e.target.value }))}
                      placeholder="e.g. John Doe / Courier rider"
                      className="h-12 w-full text-base border-slate-200 bg-white rounded-lg px-3.5"
                    />
                  </FormRow>
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
                  <FormRow label="Dispatch Method" required>
                    <Select value={dispatchMethod} onValueChange={(v) => setDispatchMethod(v as "delivery" | "pickup")}>
                      <SelectTrigger className="h-12 w-full sm:w-72 text-base border-slate-200 bg-white rounded-lg px-3.5">
                        <SelectValue placeholder="Select dispatch method..." />
                      </SelectTrigger>
                      <SelectContent className="z-[200]">
                        <SelectItem value="delivery" className="text-base py-2">Delivery</SelectItem>
                        <SelectItem value="pickup" className="text-base py-2">Client Pickup</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormRow>

                  {dispatchMethod === "delivery" && (
                    <>
                      <FormRow label="Delivery Option" required>
                        <ToggleButtons
                          options={[
                            { value: "staff", label: "BCL Staff" },
                            { value: "courier", label: "Courier Service" },
                          ]}
                          value={deliveryType}
                          onChange={setDeliveryType}
                        />
                      </FormRow>

                      {deliveryType === "staff" && (
                        <FormRow label="Delivered By (Staff)" required>
                          <StaffCombobox users={bclUsers} value={delivery.staffBy} onChange={(v) => setDelivery((p) => ({ ...p, staffBy: v }))} />
                        </FormRow>
                      )}

                      {deliveryType === "courier" && (
                        <>
                          <FormRow label="Courier Company" required>
                            <Select value={delivery.courierId} onValueChange={(v) => setDelivery((p) => ({ ...p, courierId: v }))}>
                              <SelectTrigger className="h-12 w-full text-base border-slate-200 bg-white rounded-lg px-3.5">
                                <SelectValue placeholder="Select courier company..." />
                              </SelectTrigger>
                              <SelectContent className="z-[200]">
                                {couriers.map((c) => (
                                  <SelectItem key={c.id} value={c.id} className="text-base py-2">
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormRow>
                          <FormRow label="Tracking Reference">
                            <Input
                              value={delivery.trackingRef}
                              onChange={(e) => setDelivery((p) => ({ ...p, trackingRef: e.target.value }))}
                              placeholder="e.g. WB-92841"
                              className="h-12 w-full text-base border-slate-200 bg-white rounded-lg px-3.5"
                            />
                          </FormRow>
                          <FormRow
                            label="Rider Name"
                            required={selectedCourier?.courier_type === "on_demand"}
                          >
                            <Input
                              value={delivery.riderName}
                              onChange={(e) => setDelivery((p) => ({ ...p, riderName: e.target.value }))}
                              placeholder="Full name of rider"
                              className="h-12 w-full text-base border-slate-200 bg-white rounded-lg px-3.5"
                            />
                          </FormRow>
                          <FormRow label="Rider Phone">
                            <Input
                              value={delivery.riderPhone}
                              onChange={(e) => setDelivery((p) => ({ ...p, riderPhone: e.target.value }))}
                              placeholder="e.g. +254 712 345 678"
                              className="h-12 w-full text-base border-slate-200 bg-white rounded-lg px-3.5"
                            />
                          </FormRow>
                        </>
                      )}

                      <FormRow label="Delivered Date" required>
                        <DateOnlyField value={delivery.at} onChange={(v) => setDelivery((p) => ({ ...p, at: v }))} />
                      </FormRow>
                      <FormRow label="Delivered Time" required>
                        <TimeOnlyField value={delivery.at} onChange={(v) => setDelivery((p) => ({ ...p, at: v }))} />
                      </FormRow>
                    </>
                  )}

                  {dispatchMethod === "pickup" && (
                    <>
                      <FormRow label="Collected By" required>
                        <Input
                          value={pickup.personName}
                          onChange={(e) => setPickup((p) => ({ ...p, personName: e.target.value }))}
                          placeholder="Name of collector"
                          className="h-12 w-full text-base border-slate-200 bg-white rounded-lg px-3.5"
                        />
                      </FormRow>
                      <FormRow label="Collector Relationship" required>
                        <Select value={pickup.relation} onValueChange={(v: any) => setPickup((p) => ({ ...p, relation: v }))}>
                          <SelectTrigger className="h-12 w-full sm:w-72 text-base border-slate-200 bg-white rounded-lg px-3.5">
                            <SelectValue placeholder="Select relationship..." />
                          </SelectTrigger>
                          <SelectContent className="z-[200]">
                            <SelectItem value="self" className="text-base py-2">Client Themselves</SelectItem>
                            <SelectItem value="representative" className="text-base py-2">Representative</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormRow>
                      <FormRow label="Pickup Date" required>
                        <DateOnlyField value={pickup.at} onChange={(v) => setPickup((p) => ({ ...p, at: v }))} />
                      </FormRow>
                      <FormRow label="Pickup Time" required>
                        <TimeOnlyField value={pickup.at} onChange={(v) => setPickup((p) => ({ ...p, at: v }))} />
                      </FormRow>
                    </>
                  )}
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
