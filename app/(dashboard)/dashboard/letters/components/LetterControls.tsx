import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Settings2, Layout, Phone, MapPin, Signature, Building2, FileCheck, Check, Image, Upload, CreditCard, AlertCircle } from "lucide-react";
import type { Signatory } from '../hooks/useLetterData';
import type { Letterhead } from '../hooks/useLetterheads';
import type { IndividualIdInfo } from '../hooks/useIndividualIdentificationNumbers';
import { SignatureUploadDialog } from './SignatureUploadDialog';
import { Palette, Eraser, RotateCcw } from "lucide-react";
import type { LetterTheme } from './GeneralLetterLayout';

const VALEDICTIONS = ['Yours faithfully,', 'Yours sincerely,', 'Kind regards,', 'Respectfully yours,'];

interface LetterControlsProps {
    tab: 'companies' | 'individuals';
    letterType: 'kra' | 'general';
    setLetterType: (type: 'kra' | 'general') => void;
    phone: string;
    setPhone: (phone: string) => void;
    email: string;
    setEmail: (email: string) => void;
    kra_pin: string;
    setKraPin: (kra_pin: string) => void;
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
    onSignatureUpload?: (signatoryId: string, file: File) => Promise<void>;
    individualIdInfo?: IndividualIdInfo | null;
    theme?: LetterTheme;
    onThemeChange?: (theme: LetterTheme) => void;
    onClearAll?: () => void;
    onReset?: () => void;
}

export function LetterControls({ tab, letterType, setLetterType, phone, setPhone, email, setEmail, kra_pin, setKraPin, recipient, setRecipient, subject, setSubject, valediction, setValediction, availableSignatories, signatoryId, setSignatoryId, activeSignatory, useLetterhead, setUseLetterhead, hasLetterhead, availableLetterheads = [], selectedLetterheadId, setSelectedLetterheadId, onSignatureUpload, individualIdInfo, theme = 'dark-teal', onThemeChange, onClearAll, onReset }: LetterControlsProps) {
    const [showSignatureUpload, setShowSignatureUpload] = useState(false);

    const handleSignatureUpload = async (file: File) => {
        if (onSignatureUpload && activeSignatory) {
            await onSignatureUpload(activeSignatory.id.toString(), file);
        }
    };

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
                        <>
                            <Card className="border-violet-100 shadow-sm overflow-hidden ring-1 ring-violet-50">
                                <CardHeader className="bg-violet-50/50 py-3 px-4 border-b border-violet-100">
                                    <CardTitle className="text-[10px] font-black text-violet-700 uppercase tracking-widest flex items-center gap-2">
                                        <Palette size={12} /> Theme Style
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 space-y-4">
                                    <div className="grid grid-cols-2 gap-2">
                                        {([
                                            { id: 'dark-teal', label: 'Dark Teal', swatch: 'bg-slate-900 border-l-4 border-l-teal-400' },
                                            { id: 'corporate-blue', label: 'Corporate', swatch: 'bg-white border border-slate-200 border-b-4 border-b-blue-700' },
                                            { id: 'bold-violet', label: 'Bold Violet', swatch: 'bg-gradient-to-r from-violet-700 to-indigo-600' },
                                            { id: 'classic-serif', label: 'Classic Serif', swatch: 'bg-white border border-stone-200 border-t-2 border-t-stone-900' },
                                        ] as { id: LetterTheme; label: string; swatch: string }[]).map(t => (
                                            <button
                                                key={t.id}
                                                onClick={() => onThemeChange?.(t.id)}
                                                className={cn(
                                                    "flex flex-col items-center gap-2 p-2.5 rounded-lg border transition-all",
                                                    theme === t.id
                                                        ? "border-violet-500 bg-violet-50 shadow-sm"
                                                        : "border-slate-200 hover:border-slate-300 bg-white"
                                                )}
                                            >
                                                <div className={cn("w-full h-7 rounded-md", t.swatch)} />
                                                <span className={cn(
                                                    "text-[10px] font-bold uppercase tracking-wide",
                                                    theme === t.id ? "text-violet-700" : "text-slate-500"
                                                )}>{t.label}</span>
                                            </button>
                                        ))}
                                    </div>

                                    {/* Clear / Reset actions */}
                                    <div className="pt-1 flex gap-2">
                                        <button
                                            onClick={onClearAll}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-red-200 bg-red-50 text-[10px] font-black uppercase text-red-600 hover:bg-red-100 transition-colors"
                                        >
                                            <Eraser size={11} /> Clear All
                                        </button>
                                        <button
                                            onClick={onReset}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-[10px] font-black uppercase text-emerald-700 hover:bg-emerald-100 transition-colors"
                                        >
                                            <RotateCcw size={11} /> Reset
                                        </button>
                                    </div>
                                </CardContent>
                            </Card>

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
                        </>
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
                            {tab === 'companies' && (
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-slate-400">KRA PIN Number</Label>
                                    <Input className="h-9 text-xs font-bold" value={kra_pin} onChange={e => setKraPin(e.target.value)} />
                                </div>
                            )}
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

                    {tab === 'individuals' && (
                        <Card className="border-teal-100 shadow-sm overflow-hidden ring-1 ring-teal-50">
                            <CardHeader className="bg-teal-50/50 py-3 px-4 border-b border-teal-100">
                                <CardTitle className="text-[10px] font-black text-teal-700 uppercase tracking-widest flex items-center gap-2">
                                    <CreditCard size={12} /> Individual Identity
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3">
                                {individualIdInfo ? (
                                    <>
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-100 uppercase">
                                            <Check size={12} /> ID Document Found
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black uppercase text-slate-400">
                                                {individualIdInfo.label}
                                            </p>
                                            <p className="text-sm font-black text-slate-800 tracking-widest font-mono">
                                                {individualIdInfo.value}
                                            </p>
                                        </div>
                                        <p className="text-[10px] text-teal-600 bg-teal-50 p-2 rounded border border-teal-100">
                                            Included in letter subject automatically.
                                        </p>
                                    </>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 uppercase">
                                            <AlertCircle size={12} /> No ID Document Found
                                        </div>
                                        <p className="text-[10px] text-slate-400">
                                            Upload a national ID or alien certificate in the registry to auto-populate the subject line.
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

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
                                            <div className="space-y-2">
                                                <div className="text-[10px] font-bold text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 uppercase">
                                                    No signature scan found
                                                </div>
                                                {onSignatureUpload && (
                                                    <Button
                                                        onClick={() => setShowSignatureUpload(true)}
                                                        size="sm"
                                                        variant="outline"
                                                        className="w-full text-xs h-8 border-blue-200 text-blue-600 hover:bg-blue-50"
                                                    >
                                                        <Upload size={12} className="mr-2" />
                                                        Upload Signature
                                                    </Button>
                                                )}
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

            {showSignatureUpload && activeSignatory && (
                <SignatureUploadDialog
                    isOpen={showSignatureUpload}
                    onClose={() => setShowSignatureUpload(false)}
                    onUpload={handleSignatureUpload}
                    signatoryName={activeSignatory.name}
                />
            )}
        </div>
    );
}
