// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import supabase from '@/lib/supabase/client';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, UnderlineType } from 'docx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Shadcn Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList, CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";

// Icons
import {
    FileText, ChevronDown, Check,
    Calendar, Printer, Download,
    Briefcase, User, Type, Search
} from "lucide-react";

const SIGNATURE_DOC_TYPE_ID = "67d9f93a-6b2b-4e19-86a3-ea7925c3d6ab";
const VALEDICTIONS = ['Yours faithfully,', 'Yours sincerely,', 'Kind regards,', 'Respectfully yours,'];
const todayStr = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// Helper function to construct Supabase storage URL
const getSupabaseImageUrl = (filePath: string | null): string | null => {
    if (!filePath) return null;

    // If it's already a full URL, return as is
    if (filePath.startsWith('http')) return filePath;

    // Otherwise, construct the Supabase storage URL
    const bucketName = 'kyc-documents';
    const fullPath = filePath.startsWith(bucketName) ? filePath : `${bucketName}/${filePath}`;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${fullPath}`;
};

export default function LetterGenerationModule() {
    const paperRef = useRef(null);
    const [tab, setTab] = useState('companies');
    const [letterType, setLetterType] = useState('kra');

    // Selection IDs
    const [companyId, setCompanyId] = useState('');
    const [individualId, setIndividualId] = useState('');
    const [signatoryId, setSignatoryId] = useState('');

    // UI States
    const [valediction, setValediction] = useState('Yours faithfully,');
    const [letterDate, setLetterDate] = useState(todayStr());
    const [openCompany, setOpenCompany] = useState(false);
    const [openIndividual, setOpenIndividual] = useState(false);
    const [openSignatory, setOpenSignatory] = useState(false);

    // Data states
    const [companies, setCompanies] = useState([]);
    const [individuals, setIndividuals] = useState([]);
    const [signatures, setSignatures] = useState([]);

    // --- Data Fetching ---
    useEffect(() => {
        const fetchData = async () => {
            try {
                const { data: cos } = await supabase.from('acc_portal_company_duplicate').select('*').order('company_name');
                const { data: inds } = await supabase.from('registry_individuals').select('*').order('full_name');
                const { data: sigs } = await supabase.from('acc_portal_directors_documents').select('*').eq('document_id', SIGNATURE_DOC_TYPE_ID);

                setCompanies(cos || []);
                setIndividuals(inds || []);
                setSignatures(sigs || []);
            } catch (e) {
                toast.error("Failed to fetch data");
            }
        };
        fetchData();
    }, []);

    // --- Signatory Logic (Filtering Directors, Shareholders only) ---
    const availableSignatories = useMemo(() => {
        if (!companyId || tab !== 'companies') return [];

        const validRoles = ["Director", "Shareholder"];

        return individuals.filter(ind => {
            const associations = ind.employment_data?.associations || [];
            return associations.some(a =>
                a.company_id?.toString() === companyId.toString() &&
                validRoles.includes(a.individual_type)
            );
        }).map(ind => {
            const assoc = ind.employment_data.associations.find(a => a.company_id?.toString() === companyId.toString() && ["Director", "Shareholder"].includes(a.individual_type));
            const sigDoc = signatures.find(s => s.director_id === ind.id);

            return {
                id: ind.id,
                name: ind.full_name,
                position: assoc?.individual_type || 'Director',
                signatureUrl: sigDoc ? getSupabaseImageUrl(sigDoc.file_path) : null
            };
        });
    }, [companyId, individuals, signatures, tab]);

    useEffect(() => {
        if (availableSignatories.length > 0) setSignatoryId(availableSignatories[0].id);
        else setSignatoryId('');
    }, [availableSignatories]);

    // --- Derived Data Helper ---
    const selectedCompany = companies.find(c => c.id.toString() === companyId);
    const selectedIndividual = individuals.find(i => i.id === individualId);
    const activeSignatory = availableSignatories.find(s => s.id === signatoryId);

    const isReady = tab === 'companies' ? !!selectedCompany : !!selectedIndividual;

    // Company Detail Helpers
    const getContactInfo = () => {
        if (!selectedCompany) return {};
        const contact = selectedCompany.contact_details?.[0] || {};
        const postal = selectedCompany.postal_address_details?.[0] || {};

        return {
            phone: contact.office_phone_number || '---',
            email: letterType === 'kra'
                ? (selectedCompany.kra_email_address || '---')
                : (contact.current_communication_email || '---'),
            address: postal.full_postal_address || '---',
            town: postal.postal_town || '---',
            pin: selectedCompany.kra_pin || '---'
        };
    };

    const details = getContactInfo();

    const exportToPDF = async () => {
        if (!paperRef.current) return;
        const canvas = await html2canvas(paperRef.current, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`${tab === 'companies' ? selectedCompany.company_name : selectedIndividual.full_name}_Letter.pdf`);
    };

    return (
        <div className="flex h-screen bg-zinc-100 overflow-hidden font-sans text-zinc-900 print:bg-white">
            {/* --- SIDEBAR --- */}
            <aside className="w-[380px] bg-white border-r flex flex-col shadow-xl z-10 print:hidden">
                <div className="p-6 border-b bg-zinc-900 text-white">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="h-8 w-8 bg-blue-500 rounded flex items-center justify-center">
                            <FileText size={18} />
                        </div>
                        <h1 className="font-bold text-lg tracking-tight">Letter Hub</h1>
                    </div>
                </div>

                <ScrollArea className="flex-1">
                    <div className="p-6 space-y-8">
                        {/* 1. Template Toggle */}
                        <div className="space-y-3">
                            <Label className="text-[11px] uppercase font-bold text-zinc-400">Template Style</Label>
                            <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 rounded-lg">
                                <button onClick={() => setLetterType('kra')} className={cn("py-2 text-xs font-medium rounded-md transition-all", letterType === 'kra' ? "bg-white shadow-sm text-blue-600" : "text-zinc-500")}>KRA Template</button>
                                <button onClick={() => setLetterType('general')} className={cn("py-2 text-xs font-medium rounded-md transition-all", letterType === 'general' ? "bg-white shadow-sm text-blue-600" : "text-zinc-500")}>General</button>
                            </div>
                        </div>

                        {/* 2. Entity Selector */}
                        <Tabs value={tab} onValueChange={setTab} className="w-full">
                            <TabsList className="grid w-full grid-cols-2 mb-4">
                                <TabsTrigger value="companies" className="text-xs">Company</TabsTrigger>
                                <TabsTrigger value="individuals" className="text-xs">Personal</TabsTrigger>
                            </TabsList>

                            <TabsContent value="companies" className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[11px] uppercase font-bold text-zinc-400">Search Company</Label>
                                    <Popover open={openCompany} onOpenChange={setOpenCompany}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className="w-full justify-between h-10 text-xs">
                                                <span className="truncate">{selectedCompany?.company_name || "Select..."}</span>
                                                <Search className="h-3 w-3 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[330px] p-0" align="start">
                                            <Command>
                                                <CommandInput placeholder="Type company name..." />
                                                <CommandList>
                                                    <CommandEmpty>No company found.</CommandEmpty>
                                                    <CommandGroup>
                                                        {companies.map((c) => (
                                                            <CommandItem key={c.id} onSelect={() => { setCompanyId(c.id.toString()); setOpenCompany(false); }}>
                                                                <Check className={cn("mr-2 h-4 w-4", companyId === c.id.toString() ? "opacity-100" : "opacity-0")} />
                                                                {c.company_name}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                {selectedCompany && (
                                    <div className="space-y-2 pt-2 animate-in fade-in slide-in-from-top-1">
                                        <Label className="text-[11px] uppercase font-bold text-zinc-400">Authorized Signatory</Label>
                                        <Popover open={openSignatory} onOpenChange={setOpenSignatory}>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" className="w-full justify-between h-10 text-xs">
                                                    <span className="truncate font-medium">{activeSignatory?.name || "Select Signatory"}</span>
                                                    <ChevronDown className="h-4 w-4 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-[330px] p-0" align="start">
                                                <Command>
                                                    <CommandInput placeholder="Search officials..." />
                                                    <CommandList>
                                                        <CommandEmpty>No directors or shareholders found.</CommandEmpty>
                                                        <CommandGroup>
                                                            {availableSignatories.map((s) => (
                                                                <CommandItem key={s.id} onSelect={() => { setSignatoryId(s.id); setOpenSignatory(false); }}>
                                                                    <div className="flex flex-col">
                                                                        <span>{s.name}</span>
                                                                        <span className="text-[10px] text-zinc-400 uppercase">{s.position}</span>
                                                                    </div>
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="individuals" className="space-y-4">
                                <Label className="text-[11px] uppercase font-bold text-zinc-400">Search Individual</Label>
                                <Popover open={openIndividual} onOpenChange={setOpenIndividual}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between h-10 text-xs">
                                            <span className="truncate">{selectedIndividual?.full_name || "Select name..."}</span>
                                            <Search className="h-3 w-3 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[330px] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="Search people..." />
                                            <CommandList>
                                                <CommandEmpty>No results.</CommandEmpty>
                                                <CommandGroup>
                                                    {individuals.map((i) => (
                                                        <CommandItem key={i.id} onSelect={() => { setIndividualId(i.id); setOpenIndividual(false); }}>
                                                            {i.full_name}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </TabsContent>
                        </Tabs>

                        <Separator />

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-[11px] uppercase font-bold text-zinc-400">Valediction</Label>
                                <select className="w-full h-10 px-3 rounded-md border text-xs outline-none" value={valediction} onChange={(e) => setValediction(e.target.value)}>
                                    {VALEDICTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] uppercase font-bold text-zinc-400">Letter Date</Label>
                                <Input className="h-10 text-xs" value={letterDate} onChange={e => setLetterDate(e.target.value)} />
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div className="p-6 border-t bg-zinc-50 space-y-2">
                    <Button className="w-full bg-blue-600 hover:bg-blue-700 shadow-lg text-xs" disabled={!isReady} onClick={exportToPDF}>
                        <Download className="mr-2 h-4 w-4" /> Download PDF
                    </Button>
                    <Button variant="outline" className="w-full text-xs" disabled={!isReady} onClick={() => window.print()}>
                        <Printer className="mr-2 h-4 w-4" /> Print Document
                    </Button>
                </div>
            </aside>

            {/* --- MAIN CANVAS --- */}
            <main className="flex-1 overflow-y-auto p-12 flex flex-col items-center print:p-0 print:bg-white print:overflow-visible">
                {isReady ? (
                    <div className="flex flex-col items-center">
                        <div className="mb-6 bg-blue-600 text-white px-5 py-2 rounded-full shadow-lg flex gap-4 items-center print:hidden">
                            <span className="text-xs font-medium flex items-center gap-2">
                                <Type size={14} /> Click any text to edit directly
                            </span>
                        </div>

                        {/* A4 Paper Component */}
                        <div
                            ref={paperRef}
                            className={cn(
                                "w-[210mm] min-h-[297mm] bg-white p-[25mm] flex flex-col relative transition-all",
                                "shadow-[0_0_50px_rgba(0,0,0,0.08)] print:shadow-none print:w-full print:m-0 print:p-[20mm]"
                            )}
                        >
                            {/* --- HEADER LOGIC --- */}
                            {tab === 'companies' ? (
                                letterType === 'kra' ? (
                                    <div className="text-center border-b-[3px] border-zinc-900 pb-6 mb-10">
                                        <h2 className="text-2xl font-serif font-black text-zinc-900 uppercase tracking-tight mb-2">
                                            {selectedCompany.company_name}
                                        </h2>
                                        <div className="text-[11px] font-bold text-zinc-700 space-y-1 uppercase tracking-wider leading-relaxed">
                                            <p>EMAIL: {details.email} &nbsp;&nbsp;|&nbsp;&nbsp; MOBILE NO: {details.phone}</p>
                                            <p>P.O. BOX - {details.address}, {details.town}, KENYA</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex justify-between items-start border-b-2 border-zinc-100 pb-8 mb-10">
                                        <div className="max-w-[65%]">
                                            <h2 className="text-2xl font-serif font-bold text-zinc-900 leading-tight uppercase">
                                                {selectedCompany.company_name}
                                            </h2>
                                            <div className="mt-2 text-[11px] font-bold text-zinc-500 uppercase">
                                                PIN: {details.pin}
                                            </div>
                                        </div>
                                        <div className="text-right text-[10px] text-zinc-500 uppercase leading-relaxed font-medium">
                                            <p>P.O. Box {details.address}</p>
                                            <p>{details.town}, KENYA</p>
                                            <p>Tel: {details.phone}</p>
                                            <p className="lowercase font-bold text-zinc-800">{details.email}</p>
                                        </div>
                                    </div>
                                )
                            ) : (
                                <div className="border-b-2 border-zinc-900 pb-6 mb-10 flex justify-between items-end">
                                    <div>
                                        <h2 className="text-2xl font-serif font-bold text-zinc-900">{selectedIndividual.full_name}</h2>
                                        <p className="text-[10px] text-zinc-500 font-bold uppercase mt-1 tracking-widest">Personal Account</p>
                                    </div>
                                    <div className="text-right text-[11px] font-bold text-zinc-600 uppercase space-y-1">
                                        <p>ID: {selectedIndividual.id_number || '---'}</p>
                                        <p>PIN: {selectedIndividual.kra_pin || '---'}</p>
                                    </div>
                                </div>
                            )}

                            {/* --- CONTENT --- */}
                            <div className="flex-1 font-serif text-[15px] leading-relaxed text-zinc-800">
                                <div className="mb-8 font-medium">{letterDate}</div>

                                <div className="mb-6 flex gap-2 group justify-end">
                                    Your Ref:<span className="font-bold min-w-[150px] outline-none border-b border-transparent focus:border-blue-200 focus:bg-blue-50/30 px-1 transition-all" contentEditable suppressContentEditableWarning>
                                        {letterType === 'kra' ? `PIN ${details.pin}` : 'GEN/FIN/2026/102'}
                                    </span>
                                </div>

                                <div className="mb-8">
                                    <div className="text-[9px] font-black text-zinc-300 uppercase mb-2 tracking-widest print:hidden">Recipient:</div>
                                    <div className="whitespace-pre-wrap outline-none focus:bg-zinc-50 p-2 -m-2 rounded transition-colors" contentEditable suppressContentEditableWarning>
                                        {letterType === 'kra' ?
                                            "Kenya Revenue Authority,\nNairobi, Kenya." :
                                            "The Branch Manager,\nSelect Bank Ltd,\nIndustrial Area Branch,\nNairobi."
                                        }
                                    </div>
                                </div>

                                <div className="mb-8 uppercase font-bold underline decoration-zinc-900 underline-offset-[6px] decoration-1">
                                    RE: <span className="outline-none focus:bg-blue-50 px-1" contentEditable suppressContentEditableWarning>
                                        {letterType === 'kra' ? 'Application for Tax Compliance Certificate' : 'Request for Bank Statement'}
                                    </span>
                                </div>

                                <div className="min-h-[350px] whitespace-pre-wrap outline-none focus:bg-zinc-50 py-2 leading-relaxed" contentEditable suppressContentEditableWarning>
                                    Dear Sir/Madam,{"\n\n"}
                                    I am writing on behalf of the company to request for...{"\n\n"}
                                    Your prompt assistance in this matter will be highly appreciated.
                                </div>

                                {/* --- SIGN-OFF --- */}
                                <div className="mt-12 space-y-10">
                                    <div className="outline-none" contentEditable suppressContentEditableWarning>{valediction}</div>

                                    <div className="space-y-1">
                                        {/* Signature Rendering */}
                                        <div className="w-56 border-b border-zinc-900 relative h-20 flex items-end mb-2">
                                            {tab === 'companies' && activeSignatory?.signatureUrl ? (
                                                <img
                                                    src={activeSignatory.signatureUrl}
                                                    alt="Official Signature"
                                                    className="absolute bottom-1 left-0 h-24 object-contain mix-blend-multiply grayscale print:grayscale transition-all hover:grayscale-0"
                                                />
                                            ) : (
                                                <div className="text-[10px] text-zinc-200 italic pb-1 no-print">Signatory scan appears here</div>
                                            )}
                                            <div className="absolute -bottom-[2px] w-full border-b border-zinc-400 border-dotted print:hidden" />
                                        </div>

                                        <div className="font-bold uppercase tracking-tight">
                                            {tab === 'companies' ? (activeSignatory?.name || '____________________') : selectedIndividual?.full_name}
                                        </div>
                                        <div className="text-sm text-zinc-500 italic">
                                            {tab === 'companies' ? (activeSignatory?.position || 'Director') : 'Individual'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* --- FOOTER --- */}
                            <div className="mt-16 pt-6 border-t border-zinc-100 flex justify-between items-center">
                                <p className="text-[8px] text-zinc-400 uppercase tracking-[0.3em] font-medium">
                                    Generated via Registry Portal &bull; {new Date().getFullYear()}
                                </p>
                                <div className="flex gap-4">
                                    <span className="text-[8px] text-zinc-400 font-mono">DOC-ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}</span>
                                    <span className="text-[8px] text-zinc-400 font-mono uppercase">Original Copy</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-400 animate-in fade-in duration-700">
                        <div className="bg-white p-12 rounded-3xl shadow-sm border border-zinc-200/50 flex flex-col items-center">
                            <div className="h-20 w-20 bg-zinc-50 rounded-full flex items-center justify-center mb-6">
                                <FileText size={40} className="opacity-20" />
                            </div>
                            <h3 className="text-xl font-bold text-zinc-800">Ready to Generate</h3>
                            <p className="text-sm max-w-[250px] text-center mt-2 leading-relaxed">Select a company or individual record from the sidebar to populate the letterhead.</p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}