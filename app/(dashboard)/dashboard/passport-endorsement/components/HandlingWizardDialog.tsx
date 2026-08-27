// @ts-nocheck
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Circle, Lock, Loader2 } from "lucide-react";
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

function DateTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      type="datetime-local"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 border-slate-200 bg-white text-sm"
    />
  );
}

function StaffSelect({ value, onChange, bclUsers, placeholder = "Select staff member..." }: any) {
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger className="h-10 text-sm border-slate-200 bg-white">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="z-[200]">
        {bclUsers.map((u: any) => (
          <SelectItem key={u.id} value={u.id} className="text-sm">{u.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StepShell({ index, title, done, locked, children }: any) {
  return (
    <div className={cn(
      "rounded-lg border p-4 space-y-3",
      done ? "border-emerald-200 bg-emerald-50/30" : locked ? "border-slate-100 bg-slate-50/50 opacity-60" : "border-slate-200 bg-white"
    )}>
      <div className="flex items-center gap-2.5">
        {done ? (
          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
        ) : locked ? (
          <Lock className="h-4 w-4 text-slate-300 shrink-0" />
        ) : (
          <Circle className="h-4.5 w-4.5 text-slate-300 shrink-0" />
        )}
        <span className="text-xs font-black uppercase tracking-widest text-slate-500">Step {index}</span>
        <span className="text-sm font-bold text-slate-800">{title}</span>
      </div>
      {!locked && <div className="pl-7 space-y-3">{children}</div>}
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

  // Local field state, keyed by step — seeded from `record` whenever the dialog opens for a
  // (possibly different) task, so re-opening always reflects what's actually saved.
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
    setTaken({ at: toLocalInputValue(record?.taken_at) || nowLocalInputValue(), by: record?.taken_by || currentUserId || "" });
    setReturned({
      at: toLocalInputValue(record?.returned_at) || nowLocalInputValue(),
      by: record?.returned_by || record?.taken_by || currentUserId || "",
    });
    setNotified({ at: toLocalInputValue(record?.client_notified_at) || nowLocalInputValue(), by: record?.client_notified_by || currentUserId || "" });
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
  }, [open, task?.id, record, currentUserId]);

  const isClientConfirmed = mode === "client" && !!record?.returned_at;
  const selectedCourier = useMemo(() => couriers.find((c) => c.id === delivery.courierId), [couriers, delivery.courierId]);

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

  const runStep = async (stepKey: string, patch: Partial<PassportHandlingRecord>, opts?: { markEndorsed?: boolean }) => {
    setSavingStep(stepKey);
    try {
      const saved = await upsertHandlingRecord(task.id, task.company_id ?? null, patch, currentUserId);
      if (opts?.markEndorsed) await markTaskEndorsedIfPending(task);
      onSaved(saved);
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
    });

  const saveTaken = () =>
    runStep("taken", {
      taken_at: new Date(taken.at).toISOString(),
      taken_by: taken.by || null,
    });

  const saveReturned = () =>
    runStep("returned", {
      returned_at: new Date(returned.at).toISOString(),
      returned_by: returned.by || null,
    }, { markEndorsed: true });

  const saveNotified = () =>
    runStep("notified", {
      client_notified_at: new Date(notified.at).toISOString(),
      client_notified_by: notified.by || null,
    });

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

  const ToggleButtons = ({ options, value, onChange }: any) => (
    <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-fit">
      {options.map((opt: any) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-bold transition-all",
            value === opt.value ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base font-black text-slate-900">
            {task.applicant_name}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 font-medium">
            Passport {task.passport_number || "—"} · Manage passport endorsement handling for this task.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {/* Mode selector */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-2">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Handling Mode</p>
            <ToggleButtons
              options={[{ value: "bcl", label: "BCL Handles Stamping" }, { value: "client", label: "Client Handles It" }]}
              value={mode}
              onChange={saveMode}
            />
            {savingMode && <p className="text-xs text-slate-400">Saving...</p>}
          </div>

          {!mode && (
            <p className="text-sm text-slate-400 text-center py-6">Select a handling mode above to continue.</p>
          )}

          {mode === "client" && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/30 p-4 space-y-3">
              <p className="text-sm font-bold text-violet-800">Client is handling passport endorsement independently.</p>
              <Textarea
                value={clientNotes}
                onChange={(e) => setClientNotes(e.target.value)}
                placeholder="Optional notes..."
                disabled={isClientConfirmed}
                className="text-sm bg-white border-slate-200"
              />
              {isClientConfirmed ? (
                <p className="text-xs font-bold text-emerald-700">
                  Endorsement confirmed on {new Date(record!.returned_at!).toLocaleString()}
                </p>
              ) : (
                <Button
                  size="sm"
                  onClick={confirmClientEndorsement}
                  disabled={savingStep === "client_confirm"}
                  className="h-9 px-4 rounded-md text-sm font-bold gap-2 text-white"
                  style={{ backgroundColor: "#376bae" }}
                >
                  {savingStep === "client_confirm" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Mark Endorsement Confirmed
                </Button>
              )}
            </div>
          )}

          {mode === "bcl" && (
            <div className="space-y-3">
              <StepShell index={1} title="Received from client" done={!!record?.received_at} locked={false}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Received at</Label>
                    <DateTimeField value={received.at} onChange={(v) => setReceived((p) => ({ ...p, at: v }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Received by (BCL staff)</Label>
                    <StaffSelect value={received.by} onChange={(v) => setReceived((p) => ({ ...p, by: v }))} bclUsers={bclUsers} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-slate-500">Brought in by</Label>
                    <Input
                      value={received.broughtBy}
                      onChange={(e) => setReceived((p) => ({ ...p, broughtBy: e.target.value }))}
                      placeholder="Name of the person who brought the passport"
                      className="h-10 text-sm border-slate-200 bg-white"
                    />
                  </div>
                </div>
                <Button size="sm" onClick={saveReceived} disabled={savingStep === "received"} className="h-8 px-3 rounded-md text-xs font-bold">
                  {savingStep === "received" && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                  Save
                </Button>
              </StepShell>

              <StepShell index={2} title="Taken to Nyayo House" done={!!record?.taken_at} locked={!record?.received_at}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Taken at</Label>
                    <DateTimeField value={taken.at} onChange={(v) => setTaken((p) => ({ ...p, at: v }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Taken by (BCL staff)</Label>
                    <StaffSelect value={taken.by} onChange={(v) => setTaken((p) => ({ ...p, by: v }))} bclUsers={bclUsers} />
                  </div>
                </div>
                <Button size="sm" onClick={saveTaken} disabled={savingStep === "taken"} className="h-8 px-3 rounded-md text-xs font-bold">
                  {savingStep === "taken" && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                  Save
                </Button>
              </StepShell>

              <StepShell index={3} title="Returned stamped" done={!!record?.returned_at} locked={!record?.taken_at}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Returned at</Label>
                    <DateTimeField value={returned.at} onChange={(v) => setReturned((p) => ({ ...p, at: v }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Brought back by (BCL staff)</Label>
                    <StaffSelect value={returned.by} onChange={(v) => setReturned((p) => ({ ...p, by: v }))} bclUsers={bclUsers} />
                  </div>
                </div>
                <Button size="sm" onClick={saveReturned} disabled={savingStep === "returned"} className="h-8 px-3 rounded-md text-xs font-bold">
                  {savingStep === "returned" && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                  Save
                </Button>
              </StepShell>

              <StepShell index={4} title="Client notified (ready for pickup/delivery)" done={!!record?.client_notified_at} locked={!record?.returned_at}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Notified at</Label>
                    <DateTimeField value={notified.at} onChange={(v) => setNotified((p) => ({ ...p, at: v }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Notified by (BCL staff)</Label>
                    <StaffSelect value={notified.by} onChange={(v) => setNotified((p) => ({ ...p, by: v }))} bclUsers={bclUsers} />
                  </div>
                </div>
                <Button size="sm" onClick={saveNotified} disabled={savingStep === "notified"} className="h-8 px-3 rounded-md text-xs font-bold">
                  {savingStep === "notified" && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                  Mark as Notified
                </Button>
              </StepShell>

              <StepShell index={5} title="Dispatch to client" done={!!record?.dispatch_method && (!!record?.delivered_at || !!record?.pickup_at)} locked={!record?.client_notified_at}>
                <ToggleButtons
                  options={[{ value: "delivery", label: "Delivery" }, { value: "pickup", label: "Client Pickup" }]}
                  value={dispatchMethod}
                  onChange={setDispatchMethod}
                />

                {dispatchMethod === "delivery" && (
                  <div className="space-y-3 pt-1">
                    <ToggleButtons
                      options={[{ value: "staff", label: "BCL Staff" }, { value: "courier", label: "Courier" }]}
                      value={deliveryType}
                      onChange={setDeliveryType}
                    />
                    {deliveryType === "staff" && (
                      <div className="space-y-1 max-w-xs">
                        <Label className="text-xs text-slate-500">Delivered by (BCL staff)</Label>
                        <StaffSelect value={delivery.staffBy} onChange={(v) => setDelivery((p) => ({ ...p, staffBy: v }))} bclUsers={bclUsers} />
                      </div>
                    )}
                    {deliveryType === "courier" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500">Courier</Label>
                          <Select value={delivery.courierId} onValueChange={(v) => setDelivery((p) => ({ ...p, courierId: v }))}>
                            <SelectTrigger className="h-10 text-sm border-slate-200 bg-white">
                              <SelectValue placeholder="Select courier..." />
                            </SelectTrigger>
                            <SelectContent className="z-[200]">
                              {couriers.map((c) => (
                                <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500">Tracking ref (optional)</Label>
                          <Input value={delivery.trackingRef} onChange={(e) => setDelivery((p) => ({ ...p, trackingRef: e.target.value }))} className="h-10 text-sm border-slate-200 bg-white" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500">
                            Rider name {selectedCourier?.courier_type === "on_demand" && <span className="text-red-500">*</span>}
                          </Label>
                          <Input value={delivery.riderName} onChange={(e) => setDelivery((p) => ({ ...p, riderName: e.target.value }))} placeholder="e.g. rider's name" className="h-10 text-sm border-slate-200 bg-white" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500">Rider phone</Label>
                          <Input value={delivery.riderPhone} onChange={(e) => setDelivery((p) => ({ ...p, riderPhone: e.target.value }))} className="h-10 text-sm border-slate-200 bg-white" />
                        </div>
                      </div>
                    )}
                    <div className="space-y-1 max-w-xs">
                      <Label className="text-xs text-slate-500">Delivered at</Label>
                      <DateTimeField value={delivery.at} onChange={(v) => setDelivery((p) => ({ ...p, at: v }))} />
                    </div>
                  </div>
                )}

                {dispatchMethod === "pickup" && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Picked up by</Label>
                      <Input value={pickup.personName} onChange={(e) => setPickup((p) => ({ ...p, personName: e.target.value }))} placeholder="Name of person collecting" className="h-10 text-sm border-slate-200 bg-white" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Relation</Label>
                      <ToggleButtons
                        options={[{ value: "self", label: "Client Themselves" }, { value: "representative", label: "Sent Someone" }]}
                        value={pickup.relation}
                        onChange={(v: any) => setPickup((p) => ({ ...p, relation: v }))}
                      />
                    </div>
                    <div className="space-y-1 col-span-2 max-w-xs">
                      <Label className="text-xs text-slate-500">Picked up at</Label>
                      <DateTimeField value={pickup.at} onChange={(v) => setPickup((p) => ({ ...p, at: v }))} />
                    </div>
                  </div>
                )}

                {dispatchMethod && (
                  <Button size="sm" onClick={saveDispatch} disabled={savingStep === "dispatch"} className="h-8 px-3 rounded-md text-xs font-bold">
                    {savingStep === "dispatch" && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                    Save Dispatch
                  </Button>
                )}
              </StepShell>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
