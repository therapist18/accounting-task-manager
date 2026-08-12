import React, { useMemo, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Settings2, Signature, Building2, FileCheck, Check, Image, Upload, CreditCard, AlertCircle, FileText, Eraser, RotateCcw } from "lucide-react";
import type { Signatory } from '../hooks/useLetterData';
import type { Letterhead } from '../hooks/useLetterheads';
import type { IndividualIdInfo } from '../hooks/useIndividualIdentificationNumbers';
import { SignatureUploadDialog } from './SignatureUploadDialog';

const VALEDICTIONS = ['Yours faithfully,', 'Yours sincerely,', 'Kind regards,', 'Respectfully yours,'];

interface LetterField {
    key: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    textarea?: boolean;
    selectOptions?: string[];
}

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
    onClearAll?: () => void;
    onReset?: () => void;
    entityName?: string;
}

// A single letter "field" row, styled after the employment-contracts
// module's Data & Values rows (ContractEditor.tsx's PlaceholderRow) - a
// missing-data left accent bar + indicator, grouped under a section
// heading, filterable by All/With Data/Missing. Letters don't have a
// generic {{token}} registry like contracts do, so this is a cosmetic
// reskin of the same ~8 fixed fields onto that visual language, not a new
// data model.
function FieldRow({ label, value, onChange, missing, textarea, selectOptions }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    missing: boolean;
    textarea?: boolean;
    selectOptions?: string[];
}) {
    return (
        <div className={cn(
            "grid grid-cols-[38%_1fr] gap-3 p-3 items-center transition-colors hover:bg-slate-50/80 relative overflow-hidden",
            missing && "bg-amber-50/30"
        )}>
            <div className={cn("absolute left-0 top-0 bottom-0 w-[3px]", missing ? "bg-amber-400" : "bg-transparent")} />
            <div className="flex items-center gap-1.5 pl-2 pr-1">
                {missing && <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                <Label className="text-xs font-semibold text-slate-700">{label}</Label>
            </div>
            <div>
                {selectOptions ? (
                    <select
                        className="w-full h-8 px-2 rounded-md border border-slate-200 text-xs outline-none bg-white font-medium text-slate-700"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                    >
                        {selectOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                ) : textarea ? (
                    <Textarea className="text-xs font-medium min-h-[56px]" value={value} onChange={(e) => onChange(e.target.value)} />
                ) : (
                    <Input
                        className={cn("h-8 text-xs font-medium", missing && "border-amber-200 bg-amber-50/50")}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="Not set"
                    />
                )}
            </div>
        </div>
    );
}

export function LetterControls({ tab, letterType, setLetterType, phone, setPhone, email, setEmail, kra_pin, setKraPin, recipient, setRecipient, subject, setSubject, valediction, setValediction, availableSignatories, signatoryId, setSignatoryId, activeSignatory, useLetterhead, setUseLetterhead, hasLetterhead, availableLetterheads = [], selectedLetterheadId, setSelectedLetterheadId, onSignatureUpload, individualIdInfo, onClearAll, onReset, entityName }: LetterControlsProps) {
    const [showSignatureUpload, setShowSignatureUpload] = useState(false);
    const [dataFilter, setDataFilter] = useState<'all' | 'with' | 'missing'>('all');

    const handleSignatureUpload = async (file: File) => {
        if (onSignatureUpload && activeSignatory) {
            await onSignatureUpload(activeSignatory.id.toString(), file);
        }
    };

    const groups = useMemo(() => {
        const headerInfo: LetterField[] = [
            { key: 'phone', label: letterType === 'kra' ? 'Mobile (BCL default)' : 'Mobile Number', value: phone, onChange: setPhone },
            { key: 'email', label: letterType === 'kra' ? 'Email (iTax)' : 'Email Address', value: email, onChange: setEmail },
        ];
        const letterDetails: LetterField[] = [
            ...(tab === 'companies' ? [{ key: 'kra_pin', label: 'KRA PIN Number', value: kra_pin, onChange: setKraPin }] : []),
            { key: 'recipient', label: 'Recipient', value: recipient, onChange: setRecipient, textarea: true },
            { key: 'subject', label: 'Subject', value: subject, onChange: setSubject },
        ];
        const signOff: LetterField[] = [
            { key: 'valediction', label: 'Valediction', value: valediction, onChange: setValediction, selectOptions: VALEDICTIONS },
        ];
        return [
            { label: 'Header Info', fields: headerInfo },
            { label: 'Letter Details', fields: letterDetails },
            { label: 'Sign-Off', fields: signOff },
        ];
    }, [letterType, tab, phone, email, kra_pin, recipient, subject, valediction]);

    const allFields = useMemo(() => groups.flatMap((g) => g.fields), [groups]);
    const missingCount = allFields.filter((f) => !f.value?.trim()).length;
    const withDataCount = allFields.length - missingCount;

    const filteredGroups = useMemo(() => {
        if (dataFilter === 'all') return groups;
        return groups
            .map((g) => ({ ...g, fields: g.fields.filter((f) => dataFilter === 'missing' ? !f.value?.trim() : !!f.value?.trim()) }))
            .filter((g) => g.fields.length > 0);
    }, [groups, dataFilter]);

    return (
        <div className="h-full flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50 shrink-0 min-w-0">
                <Settings2 size={16} className="text-blue-600 shrink-0" />
                <h2 className="font-bold text-sm text-slate-800 shrink-0">Configuration</h2>
                {entityName && (
                    <>
                        <span className="text-slate-300 shrink-0">/</span>
                        <span className="text-sm font-semibold text-slate-600 truncate">{entityName}</span>
                    </>
                )}
            </div>

            <ScrollArea className="flex-1">
                <div className="p-4 space-y-6">

                    {/* Layout Template - a mode switch, not a data field, so it
                        sits outside the filterable field list below. */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="flex">
                            <button
                                onClick={() => setLetterType('kra')}
                                className={cn("flex-1 py-2.5 text-[10px] font-bold uppercase transition-all flex flex-col items-center gap-1",
                                    letterType === 'kra' ? "bg-white text-blue-600 shadow-inner" : "bg-slate-50 text-slate-400 hover:text-slate-600")}
                            >
                                <Building2 size={14} /> KRA Layout
                            </button>
                            <button
                                onClick={() => setLetterType('general')}
                                className={cn("flex-1 py-2.5 text-[10px] font-bold uppercase transition-all flex flex-col items-center gap-1",
                                    letterType === 'general' ? "bg-white text-blue-600 shadow-inner" : "bg-slate-50 text-slate-400 hover:text-slate-600")}
                            >
                                <FileCheck size={14} /> General Layout
                            </button>
                        </div>
                    </div>

                    {letterType === 'general' && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                                    <Image size={12} /> Letterhead
                                </h4>
                                <div className="h-px flex-1 bg-slate-200" />
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200/60 p-3 space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold text-slate-700">Use Uploaded Letterhead</Label>
                                    <button
                                        onClick={() => setUseLetterhead(!useLetterhead)}
                                        disabled={!hasLetterhead}
                                        className={cn(
                                            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                                            useLetterhead ? "bg-blue-600" : "bg-slate-200",
                                            !hasLetterhead && "opacity-50 cursor-not-allowed"
                                        )}
                                    >
                                        <span className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform", useLetterhead ? "translate-x-4" : "translate-x-1")} />
                                    </button>
                                </div>

                                {availableLetterheads.length > 0 && useLetterhead && setSelectedLetterheadId && (
                                    <Select value={selectedLetterheadId} onValueChange={setSelectedLetterheadId}>
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue placeholder="Choose letterhead template" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableLetterheads.map((lh) => (
                                                <SelectItem key={lh.id} value={lh.id}>{lh.name} {lh.is_default && '(Default)'}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}

                                {!hasLetterhead && (
                                    <p className="text-[10px] text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                                        No letterhead uploaded for this company
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Filterable field list - mirrors ContractEditor.tsx's
                        Data & Values: segmented All/With Data/Missing filter
                        with live counts, fields grouped under a heading,
                        each row flagged when empty. */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-blue-600" /> Letter Fields
                            </h3>
                            <div className="p-0.5 bg-slate-200/50 rounded-lg inline-flex items-center shadow-inner">
                                {([
                                    { key: 'all', label: 'All', count: allFields.length },
                                    { key: 'with', label: 'With Data', count: withDataCount },
                                    { key: 'missing', label: 'Missing', count: missingCount },
                                ] as const).map((t) => (
                                    <button
                                        key={t.key}
                                        onClick={() => setDataFilter(t.key)}
                                        className={cn(
                                            "px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all flex items-center gap-1",
                                            dataFilter === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                        )}
                                    >
                                        {t.label}
                                        <span className={cn(
                                            "text-[9px] px-1 py-px rounded-full font-bold",
                                            dataFilter === t.key
                                                ? (t.key === 'missing' && t.count > 0 ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-600")
                                                : "bg-transparent"
                                        )}>{t.count}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {filteredGroups.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 px-4 bg-white/50 border border-dashed border-slate-300 rounded-xl">
                                <Check className="w-8 h-8 text-emerald-400/60 mb-2" />
                                <p className="text-xs text-slate-500">No fields match this filter.</p>
                            </div>
                        ) : (
                            filteredGroups.map((group) => (
                                <div key={group.label} className="space-y-2">
                                    <div className="flex items-center gap-3">
                                        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{group.label}</h4>
                                        <div className="h-px flex-1 bg-slate-200" />
                                    </div>
                                    <div className="bg-white rounded-xl border border-slate-200/60 divide-y divide-slate-100 overflow-hidden">
                                        {group.fields.map((f) => (
                                            <FieldRow
                                                key={f.key}
                                                label={f.label}
                                                value={f.value}
                                                onChange={f.onChange}
                                                missing={!f.value?.trim()}
                                                textarea={f.textarea}
                                                selectOptions={f.selectOptions}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {letterType === 'general' && (
                        <div className="flex gap-2">
                            <button
                                onClick={onClearAll}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-red-200 bg-red-50 text-[10px] font-bold uppercase text-red-600 hover:bg-red-100 transition-colors"
                            >
                                <Eraser size={11} /> Clear All
                            </button>
                            <button
                                onClick={onReset}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-[10px] font-bold uppercase text-emerald-700 hover:bg-emerald-100 transition-colors"
                            >
                                <RotateCcw size={11} /> Reset
                            </button>
                        </div>
                    )}

                    {tab === 'individuals' && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                                    <CreditCard size={12} /> Individual Identity
                                </h4>
                                <div className="h-px flex-1 bg-slate-200" />
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200/60 p-3 space-y-3">
                                {individualIdInfo ? (
                                    <>
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-100 uppercase">
                                            <Check size={12} /> ID Document Found
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold uppercase text-slate-400">{individualIdInfo.label}</p>
                                            <p className="text-sm font-bold text-slate-800 tracking-widest font-mono">{individualIdInfo.value}</p>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 uppercase">
                                        <AlertCircle size={12} /> No ID Document Found
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {tab === 'companies' && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                                    <Signature size={12} /> Directors
                                </h4>
                                <div className="h-px flex-1 bg-slate-200" />
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200/60 p-3">
                                {availableSignatories.length > 0 ? (
                                    <div className="space-y-3">
                                        <Select value={signatoryId} onValueChange={setSignatoryId}>
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue placeholder="Select signatory" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {availableSignatories.map((sig) => (
                                                    <SelectItem key={sig.id} value={sig.id.toString()}>{sig.name} ({sig.position})</SelectItem>
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
                                                    <Button onClick={() => setShowSignatureUpload(true)} size="sm" variant="outline" className="w-full text-xs h-8 border-blue-200 text-blue-600 hover:bg-blue-50">
                                                        <Upload size={12} className="mr-2" /> Upload Signature
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-500 italic">No directors found for this company.</p>
                                )}
                            </div>
                        </div>
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
