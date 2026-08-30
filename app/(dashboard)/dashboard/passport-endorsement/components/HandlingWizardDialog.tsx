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
import { CheckCircle2, Lock, Loader2, Inbox, Landmark, Undo2, BellRing, Truck, ShieldAlert, ArrowRight, Check, Briefcase, FileCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/hooks/use-toast";
import {
  upsertHandlingRecord,
  updateTaskHandlingMode,
  markTaskEndorsedIfPending,
  type PassportHandlingRecord,
  type Courier,
} from "../utils/database";

// --- UTILS ---

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

// --- SUBCOMPONENTS ---

function DateTimeField({ value, onChange, label, className }: { value: string; onChange: (v: string) => void; label: string, className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-[13px] font-bold text-slate-700">{label}</Label>
      <Input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-lg border-slate-200 bg-slate-50 text-[14px] font-medium focus:bg-white focus:ring-2 focus:ring-[#184489]/20 transition-all"
      />
    </div>
  );
}

function StaffSelect({ value, onChange, bclUsers, label, placeholder = "Select staff member...", className }: any) {
  return (
    <div className={cn("space-y-2", className)}>
      {label && <Label className="text-[13px] font-bold text-slate-700">{label}</Label>}
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className="h-11 rounded-lg text-[14px] font-medium border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#184489]/20 transition-all">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="z-[200] rounded-xl shadow-xl">
          {bclUsers.map((u: any) => (
            <SelectItem key={u.id} value={u.id} className="text-[14px] font-medium py-2">{u.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SegmentedControl({ options, value, onChange }: any) {
  return (
    <div className="flex p-1 bg-slate-100/80 rounded-xl w-full border border-slate-200/50">
      {options.map((opt: any) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-lg text-[13px] font-bold transition-all duration-200 flex items-center justify-center gap-2",
            value === opt.value 
              ? "bg-white text-[#184489] shadow-sm border border-slate-200/50" 
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
          )}
        >
          {value === opt.value && <Check className="h-4 w-4" />}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const PRIMARY_BTN = "h-11 px-8 rounded-lg text-[14px] font-bold gap-2 text-white shadow-md transition-all bg-[#184489] hover:bg-[#153a75] hover:shadow-lg hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none";

// --- MAIN WIZARD ---

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
  const [activeTab, setActiveTab] = useState<string>("mode");

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

  const doneMap = useMemo(() => ({
    mode: !!mode,
    received: !!record?.received_at,
    taken: !!record?.taken_at,
    returned: !!record?.returned_at,
    notified: !!record?.client_notified_at,
    dispatch: !!record?.dispatch_method && (!!record?.delivered_at || !!record?.pickup_at),
    client_confirm: !!record?.returned_at && mode === 'client'
  }), [record, mode]);

  useEffect(() => {
    if (!open) return;
    const initialMode = task?.passport_handling_mode || null;
    setMode(initialMode);
    
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

    // Determine initial active tab based on progress
    if (!initialMode) {
      setActiveTab("mode");
    } else if (initialMode === "client") {
      setActiveTab("client_confirm");
    } else {
      const bclSteps = ["received", "taken", "returned", "notified", "dispatch"];
      const firstUndone = bclSteps.find(step => !doneMap[step as keyof typeof doneMap]);
      setActiveTab(firstUndone || "dispatch");
    }
  }, [open, task?.id, record, currentUserId, task?.passport_handling_mode]); // removed doneMap to prevent loop

  const isClientConfirmed = mode === "client" && !!record?.returned_at;
  const selectedCourier = useMemo(() => couriers.find((c) => c.id === delivery.courierId), [couriers, delivery.courierId]);

  if (!task) return null;

  const saveMode = async (m: "bcl" | "client") => {
    setSavingMode(true);
    try {
      await updateTaskHandlingMode(task.id, m);
      setMode(m);
      onModeSaved(task.id, m);
      toast({ title: "Mode Updated", description: `Pipeline adjusted for ${m === "bcl" ? "BCL" : "Client"} handling.` });
      // Auto advance
      setActiveTab(m === "bcl" ? "received" : "client_confirm");
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to save handling mode.", variant: "destructive" });
    } finally {
      setSavingMode(false);
    }
  };

  const runStep = async (stepKey: string, patch: Partial<PassportHandlingRecord>, opts?: { markEndorsed?: boolean; nextTab?: string }) => {
    setSavingStep(stepKey);
    try {
      const saved = await upsertHandlingRecord(task.id, task.company_id ?? null, patch, currentUserId);
      if (opts?.markEndorsed) await markTaskEndorsedIfPending(task);
      onSaved(saved);
      if (opts?.nextTab) setActiveTab(opts.nextTab);
      toast({ title: "Progress Saved", description: "The task has been updated successfully." });
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
    }, { nextTab: "taken" });

  const saveTaken = () =>
    runStep("taken", {
      taken_at: new Date(taken.at).toISOString(),
      taken_by: taken.by || null,
    }, { nextTab: "returned" });

  const saveReturned = () =>
    runStep("returned", {
      returned_at: new Date(returned.at).toISOString(),
      returned_by: returned.by || null,
    }, { markEndorsed: true, nextTab: "notified" });

  const saveNotified = () =>
    runStep("notified", {
      client_notified_at: new Date(notified.at).toISOString(),
      client_notified_by: notified.by || null,
    }, { nextTab: "dispatch" });

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

  // Build the dynamic sidebar tabs
  let TABS = [{ id: "mode", label: "Handling Mode", icon: ShieldAlert, locked: false }];
  if (mode === "client") {
    TABS.push({ id: "client_confirm", label: "Client Confirmation", icon: FileCheck2, locked: false });
  } else if (mode === "bcl") {
    TABS = [
      ...TABS,
      { id: "received", label: "Received from Client", icon: Inbox, locked: false },
      { id: "taken", label: "Taken to Nyayo", icon: Landmark, locked: !doneMap.received },
      { id: "returned", label: "Returned Stamped", icon: Undo2, locked: !doneMap.taken },
      { id: "notified", label: "Client Notified", icon: BellRing, locked: !doneMap.returned },
      { id: "dispatch", label: "Dispatch to Client", icon: Truck, locked: !doneMap.notified },
    ];
  }

  const dispatchSummary = record?.dispatch_method === "delivery"
    ? `Delivered ${fmtDateTime(record.delivered_at)} — ${record.delivery_type === "courier" ? `Courier (${record.courier_rider_name || "—"})` : `Staff (${bclUsers.find((u) => u.id === record.delivered_by)?.name || "—"})`}`
    : record?.dispatch_method === "pickup"
    ? `Picked up ${fmtDateTime(record.pickup_at)} by ${record.pickup_person_name || "—"}`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1100px] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border-slate-200 shadow-2xl bg-[#f8fafc]">
        
        {/* Header Bar */}
        <DialogHeader className="px-8 py-5 border-b border-slate-200 bg-white shrink-0 shadow-sm z-10 flex flex-row items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-[#184489] to-blue-700 flex items-center justify-center shadow-md shadow-blue-900/20">
              <Briefcase className="h-6 w-6 text-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[12px] font-black uppercase tracking-widest text-[#184489]">
                  Task #{task.id}
                </span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="text-[12px] font-semibold text-slate-500 uppercase tracking-widest">
                  Endorsement Handling
                </span>
              </div>
              <DialogTitle className="text-2xl font-black text-slate-900 leading-none tracking-tight">
                {task.applicant_name}
              </DialogTitle>
              <DialogDescription className="text-[14px] text-slate-500 font-medium mt-1.5 flex items-center gap-2">
                {task.passport_number ? <><span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-bold">{task.passport_number}</span></> : "No passport number"} 
                {task.company_name && <> <span className="text-slate-300">•</span> {task.company_name}</>}
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <Button variant="ghost" onClick={() => onOpenChange(false)} className="h-10 px-4 text-slate-500 hover:text-slate-800 hover:bg-slate-100 font-bold">
               Close
             </Button>
          </div>
        </DialogHeader>

        {/* Split View Body */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Left Sidebar (Wizard Tabs) */}
          <div className="w-72 bg-slate-50/80 border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto custom-scrollbar pt-6 pb-8 px-4">
            <div className="space-y-1.5">
              {TABS.map((tab, idx) => {
                const isActive = activeTab === tab.id;
                const isDone = doneMap[tab.id as keyof typeof doneMap];
                const Icon = tab.icon;
                const isLocked = tab.locked;

                return (
                  <button
                    key={tab.id}
                    onClick={() => !isLocked && setActiveTab(tab.id)}
                    disabled={isLocked}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all duration-200 group relative outline-none",
                      isActive 
                        ? "bg-white shadow-sm ring-1 ring-slate-200" 
                        : isLocked 
                          ? "opacity-50 cursor-not-allowed" 
                          : "hover:bg-slate-200/50 cursor-pointer"
                    )}
                  >
                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#184489] rounded-r-md" />}
                    
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors",
                      isDone 
                        ? "bg-emerald-500 border-emerald-500 text-white" 
                        : isActive 
                          ? "bg-blue-50 border-[#184489] text-[#184489]" 
                          : "bg-slate-100 border-slate-300 text-slate-400"
                    )}>
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : isLocked ? <Lock className="h-3.5 w-3.5" /> : <Icon className="h-4 w-4" />}
                    </div>
                    
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-widest leading-none mb-1",
                        isActive ? "text-[#184489]" : isDone ? "text-emerald-600" : "text-slate-400"
                      )}>
                        Step {idx}
                      </span>
                      <span className={cn(
                        "text-[13px] font-bold truncate leading-tight",
                        isActive ? "text-slate-900" : isLocked ? "text-slate-400" : "text-slate-700"
                      )}>
                        {tab.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Pane (Content Area) */}
          <div className="flex-1 bg-white overflow-y-auto custom-scrollbar relative">
            <div className="max-w-3xl mx-auto p-10 min-h-full flex flex-col">
              
              {/* Content Switching */}
              {activeTab === "mode" && (
                <div className="flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="mb-8">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Handling Mode</h2>
                    <p className="text-slate-500 mt-2 font-medium">Determine who will physically manage the passport endorsement at Nyayo House.</p>
                  </div>
                  
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 shadow-sm max-w-xl">
                    <SegmentedControl
                      options={[
                        { value: "bcl", label: "BCL Handles Stamping" }, 
                        { value: "client", label: "Client Handles It" }
                      ]}
                      value={mode}
                      onChange={saveMode}
                    />
                    
                    <div className="mt-8 space-y-4">
                      {mode === 'bcl' && (
                        <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl flex gap-3 text-blue-800 text-sm">
                          <CheckCircle2 className="h-5 w-5 text-blue-500 shrink-0" />
                          <p><strong>BCL Pipeline Selected.</strong> You will track the physical passport through our 5-step internal pipeline (Receiving, Stamping, Returning, Dispatching).</p>
                        </div>
                      )}
                      {mode === 'client' && (
                        <div className="p-4 bg-violet-50 border border-violet-100 rounded-xl flex gap-3 text-violet-800 text-sm">
                          <CheckCircle2 className="h-5 w-5 text-violet-500 shrink-0" />
                          <p><strong>Client Pipeline Selected.</strong> You will simply mark when the client confirms they have successfully endorsed the passport.</p>
                        </div>
                      )}
                      {!mode && (
                         <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl flex gap-3 text-orange-800 text-sm">
                         <ShieldAlert className="h-5 w-5 text-orange-500 shrink-0" />
                         <p>Please select a mode to unlock the rest of the tracking steps for this case.</p>
                       </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "client_confirm" && (
                <div className="flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="mb-8">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Client Confirmation</h2>
                    <p className="text-slate-500 mt-2 font-medium">Record when the client notifies you that the endorsement is complete.</p>
                  </div>

                  <div className="space-y-6 max-w-xl">
                     <div className="space-y-2">
                        <Label className="text-[13px] font-bold text-slate-700">Internal Notes (Optional)</Label>
                        <Textarea
                          value={clientNotes}
                          onChange={(e) => setClientNotes(e.target.value)}
                          placeholder="Add any relevant notes from the client here..."
                          disabled={isClientConfirmed}
                          className="text-[14px] font-medium bg-slate-50 border-slate-200 min-h-[140px] focus:bg-white focus:ring-2 focus:ring-[#184489]/20 rounded-xl resize-none"
                        />
                      </div>
                      
                      <div className="pt-4 border-t border-slate-100">
                        {isClientConfirmed ? (
                          <div className="flex items-center gap-3 text-[14px] font-bold text-emerald-800 bg-emerald-50 px-6 py-4 rounded-xl border border-emerald-200 shadow-sm">
                            <CheckCircle2 className="h-6 w-6 text-emerald-600" /> 
                            Confirmed on {fmtDateTime(record!.returned_at!)}
                          </div>
                        ) : (
                          <Button
                            onClick={confirmClientEndorsement}
                            disabled={savingStep === "client_confirm"}
                            className={cn(PRIMARY_BTN, "w-full py-6 text-[15px]")}
                          >
                            {savingStep === "client_confirm" ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                            Mark Endorsement Confirmed
                          </Button>
                        )}
                      </div>
                  </div>
                </div>
              )}

              {activeTab === "received" && (
                <div className="flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col">
                  <div className="mb-8 shrink-0">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Received from Client</h2>
                    <p className="text-slate-500 mt-2 font-medium">Log when the physical passport arrived at the BCL office.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl mb-auto">
                    <DateTimeField label="Received at" value={received.at} onChange={(v) => setReceived((p) => ({ ...p, at: v }))} />
                    <StaffSelect label="Received by (BCL staff)" value={received.by} onChange={(v) => setReceived((p) => ({ ...p, by: v }))} bclUsers={bclUsers} />
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-[13px] font-bold text-slate-700">Brought in by (Optional)</Label>
                      <Input
                        value={received.broughtBy}
                        onChange={(e) => setReceived((p) => ({ ...p, broughtBy: e.target.value }))}
                        placeholder="Name of person who dropped it off"
                        className="h-11 rounded-lg text-[14px] font-medium border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#184489]/20"
                      />
                    </div>
                  </div>

                  <div className="pt-8 mt-12 border-t border-slate-100 flex justify-end shrink-0">
                    <Button onClick={saveReceived} disabled={savingStep === "received"} className={PRIMARY_BTN}>
                      {savingStep === "received" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Continue"}
                      {savingStep !== "received" && <ArrowRight className="h-4 w-4 ml-1" />}
                    </Button>
                  </div>
                </div>
              )}

              {activeTab === "taken" && (
                <div className="flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col">
                  <div className="mb-8 shrink-0">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Taken to Nyayo House</h2>
                    <p className="text-slate-500 mt-2 font-medium">Log when the passport left the office for official stamping.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl mb-auto">
                    <DateTimeField label="Taken at" value={taken.at} onChange={(v) => setTaken((p) => ({ ...p, at: v }))} />
                    <StaffSelect label="Taken by (BCL staff)" value={taken.by} onChange={(v) => setTaken((p) => ({ ...p, by: v }))} bclUsers={bclUsers} />
                  </div>

                  <div className="pt-8 mt-12 border-t border-slate-100 flex justify-end shrink-0">
                    <Button onClick={saveTaken} disabled={savingStep === "taken"} className={PRIMARY_BTN}>
                      {savingStep === "taken" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Continue"}
                      {savingStep !== "taken" && <ArrowRight className="h-4 w-4 ml-1" />}
                    </Button>
                  </div>
                </div>
              )}

              {activeTab === "returned" && (
                <div className="flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col">
                  <div className="mb-8 shrink-0">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Returned Stamped</h2>
                    <p className="text-slate-500 mt-2 font-medium">Log when the endorsed passport was returned to the BCL office.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl mb-auto">
                    <DateTimeField label="Returned at" value={returned.at} onChange={(v) => setReturned((p) => ({ ...p, at: v }))} />
                    <StaffSelect label="Brought back by (BCL staff)" value={returned.by} onChange={(v) => setReturned((p) => ({ ...p, by: v }))} bclUsers={bclUsers} />
                  </div>

                  <div className="pt-8 mt-12 border-t border-slate-100 flex justify-end shrink-0">
                    <Button onClick={saveReturned} disabled={savingStep === "returned"} className={PRIMARY_BTN}>
                      {savingStep === "returned" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Continue"}
                      {savingStep !== "returned" && <ArrowRight className="h-4 w-4 ml-1" />}
                    </Button>
                  </div>
                </div>
              )}

              {activeTab === "notified" && (
                <div className="flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col">
                  <div className="mb-8 shrink-0">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Client Notified</h2>
                    <p className="text-slate-500 mt-2 font-medium">Record when the client was informed the passport is ready.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl mb-auto">
                    <DateTimeField label="Notified at" value={notified.at} onChange={(v) => setNotified((p) => ({ ...p, at: v }))} />
                    <StaffSelect label="Notified by (BCL staff)" value={notified.by} onChange={(v) => setNotified((p) => ({ ...p, by: v }))} bclUsers={bclUsers} />
                  </div>

                  <div className="pt-8 mt-12 border-t border-slate-100 flex justify-end shrink-0">
                    <Button onClick={saveNotified} disabled={savingStep === "notified"} className={PRIMARY_BTN}>
                      {savingStep === "notified" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Continue"}
                      {savingStep !== "notified" && <ArrowRight className="h-4 w-4 ml-1" />}
                    </Button>
                  </div>
                </div>
              )}

              {activeTab === "dispatch" && (
                <div className="flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col">
                  <div className="mb-8 shrink-0">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Dispatch to Client</h2>
                    <p className="text-slate-500 mt-2 font-medium">Finalize how the passport leaves the office.</p>
                    {doneMap.dispatch && (
                       <div className="mt-4 p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl flex items-center gap-3">
                         <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                         <span className="font-semibold text-[14px]">{dispatchSummary}</span>
                       </div>
                    )}
                  </div>

                  <div className="space-y-8 max-w-2xl mb-auto">
                    <div className="space-y-3">
                      <Label className="text-[13px] font-bold text-slate-700">Dispatch Method</Label>
                      <SegmentedControl
                        options={[{ value: "delivery", label: "Delivery" }, { value: "pickup", label: "Client Pickup" }]}
                        value={dispatchMethod}
                        onChange={setDispatchMethod}
                      />
                    </div>

                    <StaffSelect label="Dispatch Handled By (Internal)" value={dispatchHandledBy} onChange={setDispatchHandledBy} bclUsers={bclUsers} className="md:w-1/2" />

                    {dispatchMethod === "delivery" && (
                      <div className="space-y-6 pt-6 border-t border-slate-100">
                        <div className="space-y-3">
                          <Label className="text-[13px] font-bold text-slate-700">Delivery Agent</Label>
                          <SegmentedControl
                            options={[{ value: "staff", label: "BCL Staff" }, { value: "courier", label: "Courier Service" }]}
                            value={deliveryType}
                            onChange={setDeliveryType}
                          />
                        </div>
                        
                        {deliveryType === "staff" && (
                          <StaffSelect label="Delivered by (BCL staff)" value={delivery.staffBy} onChange={(v) => setDelivery((p) => ({ ...p, staffBy: v }))} bclUsers={bclUsers} className="md:w-1/2" />
                        )}
                        
                        {deliveryType === "courier" && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                            <div className="space-y-2">
                              <Label className="text-[13px] font-bold text-slate-700">Courier Company</Label>
                              <Select value={delivery.courierId} onValueChange={(v) => setDelivery((p) => ({ ...p, courierId: v }))}>
                                <SelectTrigger className="h-11 rounded-lg text-[14px] font-medium border-slate-200 bg-white shadow-sm focus:ring-2 focus:ring-[#184489]/20">
                                  <SelectValue placeholder="Select courier..." />
                                </SelectTrigger>
                                <SelectContent className="z-[200]">
                                  {couriers.map((c) => (
                                    <SelectItem key={c.id} value={c.id} className="text-[14px] font-medium py-2">{c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[13px] font-bold text-slate-700">Tracking Ref (Optional)</Label>
                              <Input value={delivery.trackingRef} onChange={(e) => setDelivery((p) => ({ ...p, trackingRef: e.target.value }))} className="h-11 rounded-lg text-[14px] font-medium border-slate-200 bg-white shadow-sm" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[13px] font-bold text-slate-700">
                                Rider Name {selectedCourier?.courier_type === "on_demand" && <span className="text-red-500">*</span>}
                              </Label>
                              <Input value={delivery.riderName} onChange={(e) => setDelivery((p) => ({ ...p, riderName: e.target.value }))} placeholder="e.g. John Doe" className="h-11 rounded-lg text-[14px] font-medium border-slate-200 bg-white shadow-sm" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[13px] font-bold text-slate-700">Rider Phone</Label>
                              <Input value={delivery.riderPhone} onChange={(e) => setDelivery((p) => ({ ...p, riderPhone: e.target.value }))} className="h-11 rounded-lg text-[14px] font-medium border-slate-200 bg-white shadow-sm" />
                            </div>
                          </div>
                        )}
                        <DateTimeField label="Delivered at" value={delivery.at} onChange={(v) => setDelivery((p) => ({ ...p, at: v }))} className="md:w-1/2" />
                      </div>
                    )}

                    {dispatchMethod === "pickup" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-100">
                        <div className="space-y-2">
                          <Label className="text-[13px] font-bold text-slate-700">Picked up by</Label>
                          <Input value={pickup.personName} onChange={(e) => setPickup((p) => ({ ...p, personName: e.target.value }))} placeholder="Name of person collecting" className="h-11 rounded-lg text-[14px] font-medium border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#184489]/20" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[13px] font-bold text-slate-700">Relation</Label>
                          <SegmentedControl
                            options={[{ value: "self", label: "Client" }, { value: "representative", label: "Representative" }]}
                            value={pickup.relation}
                            onChange={(v: any) => setPickup((p) => ({ ...p, relation: v }))}
                          />
                        </div>
                        <DateTimeField label="Picked up at" value={pickup.at} onChange={(v) => setPickup((p) => ({ ...p, at: v }))} />
                      </div>
                    )}
                  </div>

                  <div className="pt-8 mt-12 border-t border-slate-100 flex justify-end shrink-0">
                    <Button onClick={saveDispatch} disabled={savingStep === "dispatch" || !dispatchMethod} className={PRIMARY_BTN}>
                      {savingStep === "dispatch" ? <Loader2 className="h-4 w-4 animate-spin" /> : doneMap.dispatch ? "Update Dispatch" : "Complete Tracking"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}