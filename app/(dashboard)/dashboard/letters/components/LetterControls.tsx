import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Settings2, Layout, Phone, MapPin, Signature, Building2, FileCheck, Check, Image } from "lucide-react";
import type { Signatory } from '../hooks/useLetterData';
import type { Letterhead } from '../hooks/useLetterheads';

const VALEDICTIONS = ['Yours faithfully,', 'Yours sincerely,', 'Kind regards,', 'Respectfully yours,'];

interface LetterControlsProps {
    tab: 'companies' | 'individuals';
    letterType: 'kra' | 'general';
    setLetterType: (type: 'kra' | 'general') => void;
    phone: string;
    setPhone: (phone: string) => void;
    email: string;
    setEmail: (email: string) => void;
    reference: string;
    setReference: (reference: string) => void;
    recipient: string;
    setRecipient: (recipient: string) => void;
    subject: string;
    setSubject: (subject: string) => void;
    valediction: string;
    setValediction: (valediction: string) => void;
    availableSignatories: Signatory[];
    signatoryId: string;
    setSignatoryId: (id: string) => void;
    activeSignatory?: Signatory;
    useLetterhead: boolean;
    setUseLetterhead: (use: boolean) => void;
    hasLetterhead: boolean;
    availableLetterheads?: Letterhead[];
    selectedLetterheadId?: string;
    setSelectedLetterheadId?: (id: string) => void;
}

export function LetterControls({
    tab,
    letterType,
    setLetterType,
    phone,
    setPhone,
    email,
    setEmail,
    reference,
    setReference,
    recipient,
    setRecipient,
    subject,
    setSubject,
    valediction,
    setValediction,
    availableSignatories,
    signatoryId,
    setSignatoryId,
    activeSignatory,
    useLetterhead,
    setUseLetterhead,
    hasLetterhead,
    availableLetterheads = [],
    selectedLetterheadId,
    setSelectedLetterheadId
}: LetterControlsProps) {
    return (
        <div className="h-full flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50 shrink-0">
                <Settings2 size={18} className="text-blue-600" />
                <h2 className="font-black text-sm uppercase tracking-wider text-slate-800">Configuration</h2>
            </div>

            <ScrollArea className="flex-1 px-6">
                <div className="py-6 space-y-6">

                    <Card className="border-blue-100 shadow-sm overflow-hidden ring-1 ring-blue-50">
                        <CardHeader className="bg-blue-50/50 py-3 px-4 border-b border-blue-100">
                            <CardTitle className="text-[10px] font-black text-blue-700 uppercase tracking-widest flex items-center gap-2">
                                <Layout size={12} /> Layout Template
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-1">
                            <div className="flex">
                                <button
                                    onClick={() => setLetterType('kra')}
                                    className={cn("flex-1 py-3 text-[10px] font-black uppercase transition-all flex flex-col items-center gap-1",
                                        letterType === 'kra' ? "bg-white text-blue-600 shadow-inner" : "bg-slate-50 text-slate-400 hover:text-slate-600")}
                                >
                                    <Building2 size={14} /> KRA Layout
                                </button>
                                <button
                                    onClick={() => setLetterType('general')}
                                    className={cn("flex-1 py-3 text-[10px] font-black uppercase transition-all flex flex-col items-center gap-1",
                                        letterType === 'general' ? "bg-white text-blue-600 shadow-inner" : "bg-slate-50 text-slate-400 hover:text-slate-600")}
                                >
                                    <FileCheck size={14} /> General Layout
                                </button>
                            </div>
                        </CardContent>
                    </Card>

                    {letterType === 'general' && (
                        <Card className="border-purple-100 shadow-sm overflow-hidden ring-1 ring-purple-50">
                            <CardHeader className="bg-purple-50/50 py-3 px-4 border-b border-purple-100">
                                <CardTitle className="text-[10px] font-black text-purple-700 uppercase tracking-widest flex items-center gap-2">
                                    <Image size={12} /> Letterhead Options
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold text-slate-700">Use Uploaded Letterhead</Label>
                                    <button
                                        onClick={() => setUseLetterhead(!useLetterhead)}
                                        disabled={!hasLetterhead}
                                        className={cn(
                                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                            useLetterhead ? "bg-purple-600" : "bg-slate-200",
                                            !hasLetterhead && "opacity-50 cursor-not-allowed"
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                                useLetterhead ? "translate-x-6" : "translate-x-1"
                                            )}
                                        />
                                    </button>
                                </div>

                                {availableLetterheads.length > 0 && useLetterhead && setSelectedLetterheadId && (
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-black uppercase text-slate-400">Select Letterhead</Label>
                                        <Select
                                            value={selectedLetterheadId}
                                            onValueChange={setSelectedLetterheadId}
                                        >
                                            <SelectTrigger className="h-9 text-xs">
                                                <SelectValue placeholder="Choose letterhead template" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {availableLetterheads.map(letterhead => (
                                                    <SelectItem key={letterhead.id} value={letterhead.id}>
                                                        {letterhead.name} {letterhead.is_default && '(Default)'}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                {!hasLetterhead && (
                                    <p className="text-[10px] text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                                        No letterhead uploaded for this company
                                    </p>
                                )}
                                {hasLetterhead && useLetterhead && (
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-purple-600 bg-purple-50 p-2 rounded border border-purple-100 uppercase">
                                        <Check size={12} /> Using Company Letterhead
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    <Card className="border-slate-100 shadow-sm overflow-hidden">
                        <CardHeader className="bg-slate-50 py-3 px-4 border-b border-slate-100">
                            <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <Phone size={12} /> Header Information
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">
                                    {letterType === 'kra' ? 'Mobile Number (BCL - Default)' : 'Mobile Number'}
                                </Label>
                                <Input className="h-9 text-xs font-bold" value={phone} onChange={e => setPhone(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">
                                    {letterType === 'kra' ? 'Email Address (iTax)' : 'Email Address'}
                                </Label>
                                <Input className="h-9 text-xs font-bold" value={email} onChange={e => setEmail(e.target.value)} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-slate-100 shadow-sm overflow-hidden">
                        <CardHeader className="bg-slate-50 py-3 px-4 border-b border-slate-100">
                            <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <MapPin size={12} /> Letter Logistics
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Ref / PIN Number</Label>
                                <Input className="h-9 text-xs font-bold" value={reference} onChange={e => setReference(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Recipient</Label>
                                <Textarea className="text-xs font-medium min-h-[60px]" value={recipient} onChange={e => setRecipient(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Subject</Label>
                                <Input className="h-9 text-xs font-bold" value={subject} onChange={e => setSubject(e.target.value)} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-slate-100 shadow-sm overflow-hidden">
                        <CardHeader className="bg-slate-50 py-3 px-4 border-b border-slate-100">
                            <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <Signature size={12} /> Sign-Off Style
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Valediction</Label>
                                <select
                                    className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm outline-none bg-white font-bold text-slate-700"
                                    value={valediction}
                                    onChange={(e) => setValediction(e.target.value)}
                                >
                                    {VALEDICTIONS.map((v) => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                            </div>
                        </CardContent>
                    </Card>

                    {tab === 'companies' && (
                        <Card className="border-blue-100 shadow-sm overflow-hidden ring-1 ring-blue-50">
                            <CardHeader className="bg-blue-50/50 py-3 px-4 border-b border-blue-100">
                                <CardTitle className="text-[10px] font-black text-blue-700 uppercase tracking-widest flex items-center gap-2">
                                    <Signature size={12} /> Directors
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                                {availableSignatories.length > 0 ? (
                                    <div className="space-y-4">
                                        <Select
                                            value={signatoryId}
                                            onValueChange={(newId: string) => {
                                                setSignatoryId(newId);
                                            }}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select signatory" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {availableSignatories.map(sig => (
                                                    <SelectItem key={sig.id} value={sig.id.toString()}>
                                                        {sig.name} ({sig.position})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {activeSignatory?.signatureUrl ? (
                                            <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 p-2 rounded border border-emerald-100 uppercase">
                                                <Check size={12} /> Digital Signature Found
                                            </div>
                                        ) : (
                                            <div className="text-[10px] font-bold text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 uppercase">
                                                No signature scan found
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-500 italic">No directors found for this company.</p>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
