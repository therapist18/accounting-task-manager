// @ts-nocheck
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Circle, Lock, Loader2, ChevronDown, Pencil, Inbox, Landmark, Undo2, BellRing, Truck } from "lucide-react";
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

function DateTimeField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-slate-500">{label}</Label>
      <Input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 border-slate-200 bg-white text-sm"
      />
    </div>
  );
}

function StaffSelect({ value, onChange, bclUsers, label, placeholder = "Select staff member..." }: any) {
  return (
    <div className="space-y-1.5">
      {label && <Label className="text-xs font-semibold text-slate-500">{label}</Label>}
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className="h-12 text-sm border-slate-200 bg-white">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="z-[200]">
          {bclUsers.map((u: any) => (
            <SelectItem key={u.id} value={u.id} className="text-sm">{u.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ToggleButtons({ options, value, onChange }: any) {
  return (
    <div className="flex gap-1.5 p-1.5 bg-slate-100/80 rounded-xl w-fit border border-slate-200/60">
      {options.map((opt: any) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-5 py-2.5 rounded-lg text-sm font-bold transition-all",
            value === opt.value ? "bg-white text-blue-700 shadow-md shadow-blue-500/10" : "text-slate-500 hover:text-slate-800 hover:bg-white/60"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const PRIMARY_BTN = "h-11 px-6 rounded-lg text-sm font-bold gap-2 text-white shadow-md shadow-blue-500/20 hover:opacity-95";
const PRIMARY_STYLE = { backgroundColor: "#376bae" };

// Horizontal pipeline stepper — gives an at-a-glance read of where this task sits, instead of
// scrolling past 5 stacked forms to figure it out.
const PIPELINE = [
  { key: "received", label: "Received", icon: Inbox },
  { key: "taken", label: "At Nyayo", icon: Landmark },
  { key: "returned", label: "Returned", icon: Undo2 },
  { key: "notified", label: "Notified", icon: BellRing },
  { key: "dispatch", label: "Dispatched", icon: Truck },
];

function Stepper({ record }: { record: PassportHandlingRecord | undefined }) {
  const doneMap: Record<string, boolean> = {
    received: !!record?.received_at,
    taken: !!record?.taken_at,
    returned: !!record?.returned_at,
    notified: !!record?.client_notified_at,
    dispatch: !!record?.dispatch_method && (!!record?.delivered_at || !!record?.pickup_at),
  };
  const currentIdx = PIPELINE.findIndex((s) => !doneMap[s.key]);

  return (
    <div className="flex items-center px-1">
      {PIPELINE.map((s, i) => {
        const done = doneMap[s.key];
        const isCurrent = i === currentIdx;
        const Icon = s.icon;
        return (
          <React.Fragment key={s.key}>
            {i > 0 && (
              <div className={cn("h-0.5 flex-1 mx-1.5", done || i <= currentIdx ? "bg-emerald-300" : "bg-slate-200")} />
            )}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div className={cn(
                "h-11 w-11 rounded-full flex items-center justify-center border-2 transition-colors shadow-sm",
                done ? "bg-emerald-500 border-emerald-500 text-white shadow-emerald-500/30"
                  : isCurrent ? "bg-white border-blue-500 text-blue-600 shadow-blue-500/20"
                  : "bg-white border-slate-200 text-slate-300"
              )}>
                {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              <span className={cn(
                "text-[11px] font-black uppercase tracking-wider whitespace-nowrap",
                done ? "text-emerald-600" : isCurrent ? "text-blue-600" : "text-slate-300"
              )}>
                {s.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// A completed step collapses to a one-line summary (what happened, who, when) with an Edit
// affordance, instead of always showing the full form — so a task several steps in doesn't
// read as five open forms stacked on top of each other.
function StepShell({ index, title, done, locked, summary, expanded, onToggle, children }: any) {
  if (locked) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-6 py-4 flex items-center gap-3 opacity-60">
        <Lock className="h-4 w-4 text-slate-300 shrink-0" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Step {index}</span>
        <span className="text-sm font-semibold text-slate-400">{title}</span>
        <span className="ml-auto text-[11px] font-bold text-slate-300">Locked · previous step required</span>
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-colors",
      done ? "border-emerald-200 bg-emerald-50/30" : "border-blue-200 bg-blue-50/20"
    )}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-6 py-4 text-left"
      >
        {done ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
        ) : (
          <Circle className="h-5 w-5 text-blue-500 shrink-0" />
        )}
        <span className="text-xs font-black uppercase tracking-widest text-slate-400 shrink-0">Step {index}</span>
        <span className="text-[15px] font-bold text-slate-800 shrink-0">{title}</span>
        {done && !expanded && summary && (
          <span className="text-sm text-slate-500 truncate ml-1">— {summary}</span>
        )}
        <div className="ml-auto flex items-center gap-2.5 shrink-0">
          {done && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400">
              <Pencil className="h-3 w-3" /> {expanded ? "Editing" : "Edit"}
            </span>
          )}
          <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", expanded && "rotate-180")} />
        </div>
      </button>
      {expanded && <div className="px-6 pb-6 pt-2 space-y-5 border-t border-black/5">{children}</div>}
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Local field state, keyed by step — seeded from `record` whenever the dialog opens for a
  // (possibly different) task, so re-opening always reflects what's actually saved.
  const [received, setReceived] = useState({ at: "", by: "", broughtBy: "" });
  const [taken, setTaken] = useState({ at: "", by: "" });
  const [returned, setReturned] = useState({ at: "", by: "" });
  const [notified, setNotified] = useState({ at: "", by: "" });
  const [dispatchMethod, setDispatchMethod] = useState<"delivery" | "pickup" | "">("");
  const [dispatchHandledBy, setDispatchHandledBy] = useState("");
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
    setTaken({ at: toLocalInputValue(record?.taken_at) || nowLocalInputValue(), by: record?.taken_by || currentUserId || "" });
    setReturned({
      at: toLocalInputValue(record?.returned_at) || nowLocalInputValue(),
      by: record?.returned_by || record?.taken_by || currentUserId || "",
    });
    setNotified({ at: toLocalInputValue(record?.client_notified_at) || nowLocalInputValue(), by: record?.client_notified_by || currentUserId || "" });
    setDispatchMethod(record?.dispatch_method || "");
    setDispatchHandledBy(record?.dispatch_handled_by || currentUserId || "");
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

    // Auto-expand only the first not-yet-done step so the dialog opens focused on what needs
    // doing next, rather than five open forms or (for a task several steps in) nothing open.
    const doneMap = {
      received: !!record?.received_at,
      taken: !!record?.taken_at,
      returned: !!record?.returned_at,
      notified: !!record?.client_notified_at,
      dispatch: !!record?.dispatch_method && (!!record?.delivered_at || !!record?.pickup_at),
    };
    const firstOpen = PIPELINE.find((s) => !doneMap[s.key])?.key;
    setExpanded(firstOpen ? { [firstOpen]: true } : {});
  }, [open, task?.id, record, currentUserId]);

  const isClientConfirmed = mode === "client" && !!record?.returned_at;
  const selectedCourier = useMemo(() => couriers.find((c) => c.id === delivery.courierId), [couriers, delivery.courierId]);

  const toggleStep = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

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

  const runStep = async (stepKey: string, patch: Partial<PassportHandlingRecord>, opts?: { markEndorsed?: boolean; collapseNext?: string }) => {
    setSavingStep(stepKey);
    try {
      const saved = await upsertHandlingRecord(task.id, task.company_id ?? null, patch, currentUserId);
      if (opts?.markEndorsed) await markTaskEndorsedIfPending(task);
      onSaved(saved);
      // Collapse the step just saved and open the next one, so completing a step naturally
      // scrolls the dialog's focus forward instead of leaving everything expanded.
      setExpanded((prev) => ({ ...prev, [stepKey]: false, ...(opts?.collapseNext ? { [opts.collapseNext]: true } : {}) }));
      toast({ title: "Saved", description: "Step updated." });
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

  const saveReceived = () =>
    runStep("received", {
      received_at: new Date(received.at).toISOString(),
      received_by: received.by || null,
      brought_by_name: received.broughtBy || null,
    }, { collapseNext: "taken" });

  const saveTaken = () =>
    runStep("taken", {
      taken_at: new Date(taken.at).toISOString(),
      taken_by: taken.by || null,
    }, { collapseNext: "returned" });

  const saveReturned = () =>
    runStep("returned", {
      returned_at: new Date(returned.at).toISOString(),
      returned_by: returned.by || null,
    }, { markEndorsed: true, collapseNext: "notified" });

  const saveNotified = () =>
    runStep("notified", {
      client_notified_at: new Date(notified.at).toISOString(),
      client_notified_by: notified.by || null,
    }, { collapseNext: "dispatch" });

  const saveDispatch = () => {
    if (dispatchMethod === "delivery") {
      runStep("dispatch", {
        dispatch_method: "delivery",
        dispatch_handled_by: dispatchHandledBy || null,
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
        dispatch_handled_by: dispatchHandledBy || null,
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

  const dispatchSummary = record?.dispatch_method === "delivery"
    ? `Delivered ${fmtDateTime(record.delivered_at)} — ${record.delivery_type === "courier" ? `Courier (${record.courier_rider_name || "—"})` : `Staff (${bclUsers.find((u) => u.id === record.delivered_by)?.name || "—"})`}`
    : record?.dispatch_method === "pickup"
    ? `Picked up ${fmtDateTime(record.pickup_at)} by ${record.pickup_person_name || "—"}`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border-slate-200 shadow-2xl">
        <DialogHeader className="px-8 pt-7 pb-5 border-b border-slate-100 bg-gradient-to-r from-white via-white to-blue-50/40">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-widest text-custom-blue mb-2">
                Passport Endorsement · Handling Wizard
              </div>
              <DialogTitle className="text-2xl font-black text-slate-900 leading-tight">
                {task.applicant_name}
              </DialogTitle>
              <DialogDescription className="text-[15px] text-slate-500 font-semibold mt-1.5">
                {task.passport_number ? `Passport ${task.passport_number}` : "No passport number on file"} · Task #{task.id} · Manage endorsement handling
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {mode && (
                <span className={cn(
                  "inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border shadow-sm",
                  mode === "bcl" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-violet-50 text-violet-700 border-violet-200"
                )}>
                  {mode === "bcl" ? "BCL Handles" : "Client Handles"}
                </span>
              )}
              {!!record?.received_at && (
                <span className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm">
                  In progress
                </span>
              )}
            </div>
          </div>
          {mode === "bcl" && (
            <div className="pt-5 mt-4 border-t border-slate-100">
              <Stepper record={record} />
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5 custom-scrollbar">
          {/* Mode selector */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Handling Mode</p>
            <ToggleButtons
              options={[{ value: "bcl", label: "BCL Handles Stamping" }, { value: "client", label: "Client Handles It" }]}
              value={mode}
              onChange={saveMode}
            />
            {savingMode && <p className="text-xs text-slate-400">Saving...</p>}
          </div>

          {!mode && (
            <p className="text-sm text-slate-400 text-center py-12">Select a handling mode above to continue.</p>
          )}

          {mode === "client" && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-6 space-y-4">
              <p className="text-[15px] font-bold text-violet-800">Client is handling passport endorsement independently.</p>
              <Textarea
                value={clientNotes}
                onChange={(e) => setClientNotes(e.target.value)}
                placeholder="Optional notes..."
                disabled={isClientConfirmed}
                className="text-sm bg-white border-slate-200 min-h-[110px]"
              />
              {isClientConfirmed ? (
                <p className="text-sm font-bold text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Endorsement confirmed on {fmtDateTime(record!.returned_at!)}
                </p>
              ) : (
                <Button
                  onClick={confirmClientEndorsement}
                  disabled={savingStep === "client_confirm"}
                  className={PRIMARY_BTN}
                  style={PRIMARY_STYLE}
                >
                  {savingStep === "client_confirm" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Mark Endorsement Confirmed
                </Button>
              )}
            </div>
          )}

          {mode === "bcl" && (
            <div className="space-y-3">
              <StepShell
                index={1}
                title="Received from client"
                done={!!record?.received_at}
                locked={false}
                expanded={!!expanded.received}
                onToggle={() => toggleStep("received")}
                summary={record?.received_at ? `${fmtDateTime(record.received_at)} by ${bclUsers.find((u) => u.id === record.received_by)?.name || "—"}${record.brought_by_name ? ` · brought in by ${record.brought_by_name}` : ""}` : ""}
              >
                <div className="grid grid-cols-3 gap-4">
                  <DateTimeField label="Received at" value={received.at} onChange={(v) => setReceived((p) => ({ ...p, at: v }))} />
                  <StaffSelect label="Received by (BCL staff)" value={received.by} onChange={(v) => setReceived((p) => ({ ...p, by: v }))} bclUsers={bclUsers} />
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-500">Brought in by</Label>
                    <Input
                      value={received.broughtBy}
                      onChange={(e) => setReceived((p) => ({ ...p, broughtBy: e.target.value }))}
                      placeholder="Name of the person who brought the passport"
                      className="h-12 text-sm border-slate-200 bg-white"
                    />
                  </div>
                </div>
                <Button onClick={saveReceived} disabled={savingStep === "received"} className={PRIMARY_BTN} style={PRIMARY_STYLE}>
                  {savingStep === "received" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save &amp; Continue
                </Button>
              </StepShell>

              <StepShell
                index={2}
                title="Taken to Nyayo House"
                done={!!record?.taken_at}
                locked={!record?.received_at}
                expanded={!!expanded.taken}
                onToggle={() => toggleStep("taken")}
                summary={record?.taken_at ? `${fmtDateTime(record.taken_at)} by ${bclUsers.find((u) => u.id === record.taken_by)?.name || "—"}` : ""}
              >
                <div className="grid grid-cols-2 gap-4">
                  <DateTimeField label="Taken at" value={taken.at} onChange={(v) => setTaken((p) => ({ ...p, at: v }))} />
                  <StaffSelect label="Taken by (BCL staff)" value={taken.by} onChange={(v) => setTaken((p) => ({ ...p, by: v }))} bclUsers={bclUsers} />
                </div>
                <Button onClick={saveTaken} disabled={savingStep === "taken"} className={PRIMARY_BTN} style={PRIMARY_STYLE}>
                  {savingStep === "taken" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save &amp; Continue
                </Button>
              </StepShell>

              <StepShell
                index={3}
                title="Returned stamped"
                done={!!record?.returned_at}
                locked={!record?.taken_at}
                expanded={!!expanded.returned}
                onToggle={() => toggleStep("returned")}
                summary={record?.returned_at ? `${fmtDateTime(record.returned_at)} by ${bclUsers.find((u) => u.id === record.returned_by)?.name || "—"}` : ""}
              >
                <div className="grid grid-cols-2 gap-4">
                  <DateTimeField label="Returned at" value={returned.at} onChange={(v) => setReturned((p) => ({ ...p, at: v }))} />
                  <StaffSelect label="Brought back by (BCL staff)" value={returned.by} onChange={(v) => setReturned((p) => ({ ...p, by: v }))} bclUsers={bclUsers} />
                </div>
                <Button onClick={saveReturned} disabled={savingStep === "returned"} className={PRIMARY_BTN} style={PRIMARY_STYLE}>
                  {savingStep === "returned" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save &amp; Continue
                </Button>
              </StepShell>

              <StepShell
                index={4}
                title="Client notified (ready for pickup/delivery)"
                done={!!record?.client_notified_at}
                locked={!record?.returned_at}
                expanded={!!expanded.notified}
                onToggle={() => toggleStep("notified")}
                summary={record?.client_notified_at ? `${fmtDateTime(record.client_notified_at)} by ${bclUsers.find((u) => u.id === record.client_notified_by)?.name || "—"}` : ""}
              >
                <div className="grid grid-cols-2 gap-4">
                  <DateTimeField label="Notified at" value={notified.at} onChange={(v) => setNotified((p) => ({ ...p, at: v }))} />
                  <StaffSelect label="Notified by (BCL staff)" value={notified.by} onChange={(v) => setNotified((p) => ({ ...p, by: v }))} bclUsers={bclUsers} />
                </div>
                <Button onClick={saveNotified} disabled={savingStep === "notified"} className={PRIMARY_BTN} style={PRIMARY_STYLE}>
                  {savingStep === "notified" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Mark as Notified
                </Button>
              </StepShell>

              <StepShell
                index={5}
                title="Dispatch to client"
                done={!!record?.dispatch_method && (!!record?.delivered_at || !!record?.pickup_at)}
                locked={!record?.client_notified_at}
                expanded={!!expanded.dispatch}
                onToggle={() => toggleStep("dispatch")}
                summary={dispatchSummary}
              >
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-500">How is it getting back to the client?</Label>
                  <ToggleButtons
                    options={[{ value: "delivery", label: "Delivery" }, { value: "pickup", label: "Client Pickup" }]}
                    value={dispatchMethod}
                    onChange={setDispatchMethod}
                  />
                </div>

                <div className="max-w-sm">
                  <StaffSelect label="Dispatch handled by (BCL staff)" value={dispatchHandledBy} onChange={setDispatchHandledBy} bclUsers={bclUsers} />
                </div>

                {dispatchMethod === "delivery" && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-500">Who is delivering it?</Label>
                      <ToggleButtons
                        options={[{ value: "staff", label: "BCL Staff" }, { value: "courier", label: "Courier" }]}
                        value={deliveryType}
                        onChange={setDeliveryType}
                      />
                    </div>
                    {deliveryType === "staff" && (
                      <div className="max-w-xs">
                        <StaffSelect label="Delivered by (BCL staff)" value={delivery.staffBy} onChange={(v) => setDelivery((p) => ({ ...p, staffBy: v }))} bclUsers={bclUsers} />
                      </div>
                    )}
                    {deliveryType === "courier" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-500">Courier</Label>
                          <Select value={delivery.courierId} onValueChange={(v) => setDelivery((p) => ({ ...p, courierId: v }))}>
                            <SelectTrigger className="h-12 text-sm border-slate-200 bg-white">
                              <SelectValue placeholder="Select courier..." />
                            </SelectTrigger>
                            <SelectContent className="z-[200]">
                              {couriers.map((c) => (
                                <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-500">Tracking ref (optional)</Label>
                          <Input value={delivery.trackingRef} onChange={(e) => setDelivery((p) => ({ ...p, trackingRef: e.target.value }))} className="h-12 text-sm border-slate-200 bg-white" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-500">
                            Rider name {selectedCourier?.courier_type === "on_demand" && <span className="text-red-500">*</span>}
                          </Label>
                          <Input value={delivery.riderName} onChange={(e) => setDelivery((p) => ({ ...p, riderName: e.target.value }))} placeholder="e.g. rider's name" className="h-12 text-sm border-slate-200 bg-white" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-500">Rider phone</Label>
                          <Input value={delivery.riderPhone} onChange={(e) => setDelivery((p) => ({ ...p, riderPhone: e.target.value }))} className="h-12 text-sm border-slate-200 bg-white" />
                        </div>
                      </div>
                    )}
                    <div className="max-w-xs">
                      <DateTimeField label="Delivered at" value={delivery.at} onChange={(v) => setDelivery((p) => ({ ...p, at: v }))} />
                    </div>
                  </div>
                )}

                {dispatchMethod === "pickup" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-500">Picked up by</Label>
                      <Input value={pickup.personName} onChange={(e) => setPickup((p) => ({ ...p, personName: e.target.value }))} placeholder="Name of person collecting" className="h-12 text-sm border-slate-200 bg-white" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-500">Relation</Label>
                      <ToggleButtons
                        options={[{ value: "self", label: "Client Themselves" }, { value: "representative", label: "Sent Someone" }]}
                        value={pickup.relation}
                        onChange={(v: any) => setPickup((p) => ({ ...p, relation: v }))}
                      />
                    </div>
                    <div className="col-span-2 max-w-xs">
                      <DateTimeField label="Picked up at" value={pickup.at} onChange={(v) => setPickup((p) => ({ ...p, at: v }))} />
                    </div>
                  </div>
                )}

                {dispatchMethod && (
                  <Button onClick={saveDispatch} disabled={savingStep === "dispatch"} className={PRIMARY_BTN} style={PRIMARY_STYLE}>
                    {savingStep === "dispatch" && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save Dispatch
                  </Button>
                )}
              </StepShell>
            </div>
          )}
        </div>

        <div className="px-8 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-4">
          <p className="text-xs text-slate-500 font-semibold">
            Each step saves on its own — work through them in order and the passport moves along the pipeline.
          </p>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-11 px-6 rounded-xl text-[13px] font-bold text-slate-700 bg-white border-slate-200 hover:bg-slate-50 shadow-sm gap-2 shrink-0"
          >
            Close Wizard
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
