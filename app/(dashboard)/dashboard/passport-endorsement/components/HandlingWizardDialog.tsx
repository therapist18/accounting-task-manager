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
import {
  CheckCircle2,
  Circle,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/hooks/use-toast";
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

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "dd MMM yyyy, HH:mm");
  } catch {
    return "";
  }
}

// 2-Column Row: Left column = Label & Hint; Right column = Input / Control
function FormRow({
  label,
  description,
  required,
  children,
}: {
  label: string;
  description?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-6 py-3.5 border-b border-slate-100 last:border-b-0 items-center">
      <div className="sm:col-span-1 space-y-0.5">
        <Label className="text-xs font-bold text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        {description && <p className="text-[11px] text-slate-400 leading-tight">{description}</p>}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

function ToggleButtons({ options, value, onChange }: any) {
  return (
    <div className="flex flex-wrap gap-2 p-1 bg-slate-100 rounded-lg w-fit">
      {options.map((opt: any) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-4 py-2 rounded-md text-xs font-bold transition-all",
            value === opt.value ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const PRIMARY_BTN = "h-10 px-5 rounded-md text-sm font-bold gap-2 text-white shadow-sm hover:opacity-95";
const PRIMARY_STYLE = { backgroundColor: "#376bae" };

const PIPELINE = [
  { key: "received", label: "Received", title: "Step 1: Received from client", icon: Inbox },
  { key: "taken", label: "At Nyayo", title: "Step 2: Taken to Nyayo House", icon: Landmark },
  { key: "returned", label: "Returned", title: "Step 3: Returned stamped", icon: Undo2 },
  { key: "notified", label: "Notified", title: "Step 4: Client notified", icon: BellRing },
  { key: "dispatch", label: "Dispatched", title: "Step 5: Dispatch to client", icon: Truck },
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
    <div className="flex items-center px-1">
      {PIPELINE.map((s, i) => {
        const done = doneMap[s.key];
        const isActive = activeKey === s.key;
        const Icon = s.icon;
        return (
          <React.Fragment key={s.key}>
            {i > 0 && (
              <div className={cn("h-0.5 flex-1 mx-1.5 transition-colors", done ? "bg-emerald-300" : "bg-slate-200")} />
            )}
            <button
              type="button"
              onClick={() => onSelectStep(s.key)}
              className="flex flex-col items-center gap-1.5 shrink-0 group focus:outline-none"
            >
              <div
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center border-2 transition-all",
                  done
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : isActive
                    ? "bg-white border-blue-500 text-blue-600 shadow-sm ring-2 ring-blue-100"
                    : "bg-white border-slate-200 text-slate-400 group-hover:border-slate-300"
                )}
              >
                {done ? <CheckCircle2 className="h-4.5 w-4.5" /> : <Icon className="h-4 w-4" />}
              </div>
              <span
                className={cn(
                  "text-[10px] font-black uppercase tracking-wider whitespace-nowrap",
                  done ? "text-emerald-600" : isActive ? "text-blue-600 font-extrabold" : "text-slate-400"
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

    // Focus on first incomplete step
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

  // Completion summary badge for the currently selected step
  const stepCompletedAt = {
    received: record?.received_at ? `Completed on ${fmtDateTime(record.received_at)} by ${bclUsers.find((u) => u.id === record.received_by)?.name || "Staff"}` : null,
    taken: record?.taken_at ? `Completed on ${fmtDateTime(record.taken_at)} by ${bclUsers.find((u) => u.id === record.taken_by)?.name || "Staff"}` : null,
    returned: record?.returned_at ? `Completed on ${fmtDateTime(record.returned_at)} by ${bclUsers.find((u) => u.id === record.returned_by)?.name || "Staff"}` : null,
    notified: record?.client_notified_at ? `Completed on ${fmtDateTime(record.client_notified_at)} by ${bclUsers.find((u) => u.id === record.client_notified_by)?.name || "Staff"}` : null,
    dispatch: (record?.delivered_at || record?.pickup_at)
      ? `Completed on ${fmtDateTime(record.delivered_at || record.pickup_at)} (${record.dispatch_method === "delivery" ? "Delivery" : "Pickup"})`
      : null,
  }[activeStep];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <DialogTitle className="text-lg font-black text-slate-900">
            {task.applicant_name}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 font-medium">
            {task.passport_number ? `Passport ${task.passport_number}` : "No passport number on file"} · Endorsement Handling
          </DialogDescription>
          {mode === "bcl" && (
            <div className="pt-4">
              <Stepper record={record} activeKey={activeStep} onSelectStep={setActiveStep} />
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Mode selector */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-700">Handling Mode</p>
              <p className="text-[11px] text-slate-400">Choose who is responsible for stamping at Nyayo House</p>
            </div>
            <ToggleButtons
              options={[
                { value: "bcl", label: "BCL Handles Stamping" },
                { value: "client", label: "Client Handles It" },
              ]}
              value={mode}
              onChange={saveMode}
            />
          </div>

          {!mode && (
            <p className="text-sm text-slate-400 text-center py-12">Select a handling mode above to continue.</p>
          )}

          {/* Mode: Client */}
          {mode === "client" && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/20 p-5 space-y-4">
              <div className="flex items-center gap-2 text-violet-800">
                <Info className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Client Self-Handling</span>
              </div>
              <FormRow label="Handling Notes" description="Any instructions or communication with the client">
                <Textarea
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  placeholder="Optional notes..."
                  disabled={isClientConfirmed}
                  className="text-sm bg-white border-slate-200 min-h-[90px]"
                />
              </FormRow>

              {isClientConfirmed ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
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

          {/* Mode: BCL - Selected Section Only */}
          {mode === "bcl" && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              {/* Active Step Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                    {currentStepIdx + 1}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{currentStepMeta.title}</h3>
                  </div>
                </div>

                {stepCompletedAt && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    {stepCompletedAt}
                  </span>
                )}
              </div>

              {/* Section 1: Received */}
              {activeStep === "received" && (
                <div className="divide-y divide-slate-100">
                  <FormRow label="Received At" description="Date & time passport was handed to BCL" required>
                    <Input
                      type="datetime-local"
                      value={received.at}
                      onChange={(e) => setReceived((p) => ({ ...p, at: e.target.value }))}
                      className="h-10 border-slate-200 bg-white text-sm max-w-sm"
                    />
                  </FormRow>
                  <FormRow label="Received By" description="BCL staff member who took receipt" required>
                    <Select value={received.by} onValueChange={(v) => setReceived((p) => ({ ...p, by: v }))}>
                      <SelectTrigger className="h-10 text-sm border-slate-200 bg-white max-w-sm">
                        <SelectValue placeholder="Select staff..." />
                      </SelectTrigger>
                      <SelectContent className="z-[200]">
                        {bclUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id} className="text-sm">
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormRow>
                  <FormRow label="Brought In By" description="Client or representative name">
                    <Input
                      value={received.broughtBy}
                      onChange={(e) => setReceived((p) => ({ ...p, broughtBy: e.target.value }))}
                      placeholder="Name of person who brought it"
                      className="h-10 text-sm border-slate-200 bg-white max-w-sm"
                    />
                  </FormRow>
                </div>
              )}

              {/* Section 2: Taken to Nyayo */}
              {activeStep === "taken" && (
                <div className="divide-y divide-slate-100">
                  <FormRow label="Taken At" description="Date & time passport was submitted to Nyayo" required>
                    <Input
                      type="datetime-local"
                      value={taken.at}
                      onChange={(e) => setTaken((p) => ({ ...p, at: e.target.value }))}
                      className="h-10 border-slate-200 bg-white text-sm max-w-sm"
                    />
                  </FormRow>
                  <FormRow label="Taken By" description="BCL staff member who went to Nyayo" required>
                    <Select value={taken.by} onValueChange={(v) => setTaken((p) => ({ ...p, by: v }))}>
                      <SelectTrigger className="h-10 text-sm border-slate-200 bg-white max-w-sm">
                        <SelectValue placeholder="Select staff..." />
                      </SelectTrigger>
                      <SelectContent className="z-[200]">
                        {bclUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id} className="text-sm">
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormRow>
                </div>
              )}

              {/* Section 3: Returned Stamped */}
              {activeStep === "returned" && (
                <div className="divide-y divide-slate-100">
                  <FormRow label="Returned At" description="Date & time passport returned with endorsement stamp" required>
                    <Input
                      type="datetime-local"
                      value={returned.at}
                      onChange={(e) => setReturned((p) => ({ ...p, at: e.target.value }))}
                      className="h-10 border-slate-200 bg-white text-sm max-w-sm"
                    />
                  </FormRow>
                  <FormRow label="Brought Back By" description="BCL staff member who collected it" required>
                    <Select value={returned.by} onValueChange={(v) => setReturned((p) => ({ ...p, by: v }))}>
                      <SelectTrigger className="h-10 text-sm border-slate-200 bg-white max-w-sm">
                        <SelectValue placeholder="Select staff..." />
                      </SelectTrigger>
                      <SelectContent className="z-[200]">
                        {bclUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id} className="text-sm">
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormRow>
                </div>
              )}

              {/* Section 4: Client Notified */}
              {activeStep === "notified" && (
                <div className="divide-y divide-slate-100">
                  <FormRow label="Notified At" description="Date & time client was notified ready" required>
                    <Input
                      type="datetime-local"
                      value={notified.at}
                      onChange={(e) => setNotified((p) => ({ ...p, at: e.target.value }))}
                      className="h-10 border-slate-200 bg-white text-sm max-w-sm"
                    />
                  </FormRow>
                  <FormRow label="Notified By" description="BCL staff member who communicated with client" required>
                    <Select value={notified.by} onValueChange={(v) => setNotified((p) => ({ ...p, by: v }))}>
                      <SelectTrigger className="h-10 text-sm border-slate-200 bg-white max-w-sm">
                        <SelectValue placeholder="Select staff..." />
                      </SelectTrigger>
                      <SelectContent className="z-[200]">
                        {bclUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id} className="text-sm">
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormRow>
                </div>
              )}

              {/* Section 5: Dispatch to Client */}
              {activeStep === "dispatch" && (
                <div className="divide-y divide-slate-100">
                  <FormRow label="Dispatch Method" description="How the passport is returned to the client" required>
                    <ToggleButtons
                      options={[
                        { value: "delivery", label: "Delivery" },
                        { value: "pickup", label: "Client Pickup" },
                      ]}
                      value={dispatchMethod}
                      onChange={setDispatchMethod}
                    />
                  </FormRow>

                  {dispatchMethod === "delivery" && (
                    <>
                      <FormRow label="Delivery Method" description="Delivered by staff or third-party courier" required>
                        <ToggleButtons
                          options={[
                            { value: "staff", label: "BCL Staff" },
                            { value: "courier", label: "Courier" },
                          ]}
                          value={deliveryType}
                          onChange={setDeliveryType}
                        />
                      </FormRow>

                      {deliveryType === "staff" && (
                        <FormRow label="Delivered By" description="BCL staff carrying out delivery" required>
                          <Select value={delivery.staffBy} onValueChange={(v) => setDelivery((p) => ({ ...p, staffBy: v }))}>
                            <SelectTrigger className="h-10 text-sm border-slate-200 bg-white max-w-sm">
                              <SelectValue placeholder="Select staff..." />
                            </SelectTrigger>
                            <SelectContent className="z-[200]">
                              {bclUsers.map((u) => (
                                <SelectItem key={u.id} value={u.id} className="text-sm">
                                  {u.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormRow>
                      )}

                      {deliveryType === "courier" && (
                        <>
                          <FormRow label="Courier Provider" description="Selected courier service" required>
                            <Select value={delivery.courierId} onValueChange={(v) => setDelivery((p) => ({ ...p, courierId: v }))}>
                              <SelectTrigger className="h-10 text-sm border-slate-200 bg-white max-w-sm">
                                <SelectValue placeholder="Select courier..." />
                              </SelectTrigger>
                              <SelectContent className="z-[200]">
                                {couriers.map((c) => (
                                  <SelectItem key={c.id} value={c.id} className="text-sm">
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormRow>
                          <FormRow label="Tracking Reference" description="Waybill / tracking number">
                            <Input
                              value={delivery.trackingRef}
                              onChange={(e) => setDelivery((p) => ({ ...p, trackingRef: e.target.value }))}
                              placeholder="e.g. WB-92841"
                              className="h-10 text-sm border-slate-200 bg-white max-w-sm"
                            />
                          </FormRow>
                          <FormRow
                            label="Rider Name"
                            description="Name of the courier rider"
                            required={selectedCourier?.courier_type === "on_demand"}
                          >
                            <Input
                              value={delivery.riderName}
                              onChange={(e) => setDelivery((p) => ({ ...p, riderName: e.target.value }))}
                              placeholder="Rider's full name"
                              className="h-10 text-sm border-slate-200 bg-white max-w-sm"
                            />
                          </FormRow>
                          <FormRow label="Rider Phone" description="Contact number for the rider">
                            <Input
                              value={delivery.riderPhone}
                              onChange={(e) => setDelivery((p) => ({ ...p, riderPhone: e.target.value }))}
                              placeholder="e.g. +254 7..."
                              className="h-10 text-sm border-slate-200 bg-white max-w-sm"
                            />
                          </FormRow>
                        </>
                      )}

                      <FormRow label="Delivered At" description="Date & time dispatch took place" required>
                        <Input
                          type="datetime-local"
                          value={delivery.at}
                          onChange={(e) => setDelivery((p) => ({ ...p, at: e.target.value }))}
                          className="h-10 border-slate-200 bg-white text-sm max-w-sm"
                        />
                      </FormRow>
                    </>
                  )}

                  {dispatchMethod === "pickup" && (
                    <>
                      <FormRow label="Collected By" description="Name of person picking up the passport" required>
                        <Input
                          value={pickup.personName}
                          onChange={(e) => setPickup((p) => ({ ...p, personName: e.target.value }))}
                          placeholder="Name of person collecting"
                          className="h-10 text-sm border-slate-200 bg-white max-w-sm"
                        />
                      </FormRow>
                      <FormRow label="Collector Relation" description="Self or authorized representative" required>
                        <ToggleButtons
                          options={[
                            { value: "self", label: "Client Themselves" },
                            { value: "representative", label: "Representative" },
                          ]}
                          value={pickup.relation}
                          onChange={(v: any) => setPickup((p) => ({ ...p, relation: v }))}
                        />
                      </FormRow>
                      <FormRow label="Picked Up At" description="Date & time of pickup" required>
                        <Input
                          type="datetime-local"
                          value={pickup.at}
                          onChange={(e) => setPickup((p) => ({ ...p, at: e.target.value }))}
                          className="h-10 border-slate-200 bg-white text-sm max-w-sm"
                        />
                      </FormRow>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with Previous / Next / Save Buttons */}
        {mode === "bcl" && (
          <DialogFooter className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrev}
              disabled={currentStepIdx === 0}
              className="text-xs font-bold gap-1 text-slate-700"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>

            <div className="flex items-center gap-2">
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
                {currentStepIdx === PIPELINE.length - 1 ? "Save Dispatch" : "Save & Continue"}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleNext}
                disabled={currentStepIdx === PIPELINE.length - 1}
                className="text-xs font-bold gap-1 text-slate-700"
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