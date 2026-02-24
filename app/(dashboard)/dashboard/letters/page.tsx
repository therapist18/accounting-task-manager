// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import supabase from '@/lib/supabase/client';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Shadcn Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

// Import sidebar components and database functions
import { CompanySidebar } from '../companies/company-sidebar';
import { IndividualSidebar } from '../individuals/individual-sidebar';
import { fetchCompanies, type Company } from '../companies/database';
import { fetchIndividuals, type Individual } from '../individuals/database';

// Icons
import {
    FileText, Check, Printer, Download,
    Briefcase, User, Type, Settings2,
    Mail, MapPin, Phone, Signature, Layout, Info,
    Building2, FileCheck
} from "lucide-react";

const SIGNATURE_DOC_TYPE_ID = "67d9f93a-6b2b-4e19-86a3-ea7925c3d6ab";
const VALEDICTIONS = ['Yours faithfully,', 'Yours sincerely,', 'Kind regards,', 'Respectfully yours,'];
const todayStr = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const getSupabaseImageUrl = (filePath: string | null): string | null => {
    if (!filePath) return null;
    if (filePath.startsWith('http')) return filePath;
    const bucketName = 'kyc-documents';
    const fullPath = filePath.startsWith(bucketName) ? filePath : `${bucketName}/${filePath}`;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${fullPath}`;
};

export default function LetterGenerationModule() {
    const paperRef = useRef(null);
    const [tab, setTab] = useState('companies');
    const [letterType, setLetterType] = useState('kra'); // 'kra' or 'general'

    // Selection IDs
    const [companyId, setCompanyId] = useState('');
    const [individualId, setIndividualId] = useState('');
    const [signatoryId, setSignatoryId] = useState('');

    // Custom Header/Reference States
    const [phone, setPhone] = useState('+254700298298');
    const [email, setEmail] = useState('');
    const [reference, setReference] = useState('');
    const [recipient, setRecipient] = useState('');
    const [subject, setSubject] = useState('');

    // UI States
    const [valediction, setValediction] = useState('Yours faithfully,');
    const [letterDate, setLetterDate] = useState(todayStr());

    // Data states
    const [companies, setCompanies] = useState<Company[]>([]);
    const [individuals, setIndividuals] = useState<Individual[]>([]);
    const [signatures, setSignatures] = useState([]);

    useEffect(() => {
        console.log('=== DEBUG: Initial Data Fetch ===');
        const fetchData = async () => {
            try {
                console.log('Starting data fetch...');
                const [companiesData, individualsData, signaturesData] = await Promise.all([
                    fetchCompanies(),
                    fetchIndividuals(),
                    supabase.from('acc_portal_directors_documents').select('*').eq('document_id', SIGNATURE_DOC_TYPE_ID)
                ]);

                console.log('Data fetched:');
                console.log('Companies:', companiesData.length, companiesData);
                console.log('Individuals:', individualsData.length, individualsData);
                console.log('Signatures:', signaturesData.data?.length, signaturesData.data);

                setCompanies(companiesData);
                setIndividuals(individualsData);
                setSignatures(signaturesData.data || []);
            } catch (e) {
                console.error('Failed to fetch data:', e);
                toast.error("Failed to fetch data");
            }
        };
        fetchData();
        console.log('=== END INITIAL DATA FETCH DEBUG ===');
    }, []);

    const selectedCompany = useMemo(() => companies.find(c => c.id.toString() === companyId), [companies, companyId]);
    const selectedIndividual = useMemo(() => individuals.find(i => i.id.toString() === individualId), [individuals, individualId]);

    // Update defaults when company changes
    useEffect(() => {
        console.log('=== DEBUG: Company Selection Update ===');
        console.log('Selected company:', selectedCompany);
        console.log('Letter type:', letterType);

        if (selectedCompany) {
            console.log('Contact details object:', selectedCompany.contact_details);

            // Switch between KRA and general contact details based on letter type
            if (letterType === 'kra') {
                // KRA Layout: Use KRA-specific email and default BCL phone
                const kraEmail = selectedCompany.kra_email_address || selectedCompany.contact_details?.email || '';
                console.log('KRA Email found:', kraEmail);
                setEmail(kraEmail);
                setPhone('+254700298298'); // BCL Default
                console.log('Setting phone to BCL default: +254700298298');
                setRecipient("Kenya Revenue Authority,\nP.O. Box 48240 - 00100,\nNairobi, Kenya.");
                setSubject("APPLICATION FOR TAX COMPLIANCE CERTIFICATE");
            } else {
                // General Layout: Use company communication email and office phone
                const companyEmail = selectedCompany.contact_details?.email || '';
                // Check both top-level and contact_details for phone
                const companyPhone = selectedCompany.phone
                    || selectedCompany.office_phone
                    || selectedCompany.contact_details?.office_phone
                    || selectedCompany.contact_details?.phone
                    || selectedCompany.contact_details?.mobile
                    || selectedCompany.contact_details?.telephone
                    || '+254700000000'; // Distinct from BCL default
                console.log('Company Email found:', companyEmail);
                console.log('Company Phone found:', companyPhone);
                console.log('Available phone fields:', {
                    top_level_phone: selectedCompany.phone,
                    top_level_office_phone: selectedCompany.office_phone,
                    contact_office_phone: selectedCompany.contact_details?.office_phone,
                    contact_phone: selectedCompany.contact_details?.phone,
                    contact_mobile: selectedCompany.contact_details?.mobile,
                    contact_telephone: selectedCompany.contact_details?.telephone
                });
                setEmail(companyEmail);
                setPhone(companyPhone);
                console.log('Setting phone to company phone:', companyPhone);
                setRecipient("Select Bank Ltd,\nIndustrial Area Branch,\nNairobi.");
                setSubject("REQUEST FOR BANK STATEMENT");
            }

            setReference(selectedCompany.registration_number || ''); // PIN
            console.log('Set reference to PIN:', selectedCompany.registration_number);
            console.log('Set recipient and subject based on letter type');
        }
        console.log('=== END COMPANY SELECTION DEBUG ===');
    }, [selectedCompany, letterType]);

    const availableSignatories = useMemo(() => {
        console.log('=== DEBUG: Calculating Available Signatories ===');
        console.log('companyId:', companyId);
        console.log('tab:', tab);
        console.log('individuals count:', individuals.length);
        console.log('signatures count:', signatures.length);

        // Debug: Log first few individuals to see their structure
        console.log('Sample individuals data:', individuals.slice(0, 3));

        if (!companyId || tab !== 'companies') {
            console.log('Early return: No companyId or not companies tab');
            return [];
        }

        const validRoles = ["Director", "Shareholder"];
        console.log('Valid roles:', validRoles);

        const filteredIndividuals = individuals.filter(ind => {
            const associations = ind.employment_data?.associations || [];
            console.log(`Individual ${ind.id} (${ind.full_name || ind.name}):`, {
                employment_data: ind.employment_data,
                associations: associations,
                hasCompanyAssociation: associations.some(a => a.company_id?.toString() === companyId.toString())
            });

            const hasValidAssociation = associations.some(a =>
                a.company_id?.toString() === companyId.toString() &&
                validRoles.includes(a.individual_type)
            );

            console.log(`  -> Has valid association: ${hasValidAssociation}`);
            return hasValidAssociation;
        });

        console.log('Filtered individuals count:', filteredIndividuals.length);

        const signatoryList = filteredIndividuals.map(ind => {
            const associations = ind.employment_data?.associations || [];
            const assoc = associations.find(a =>
                a.company_id?.toString() === companyId.toString() &&
                validRoles.includes(a.individual_type)
            );
            const sigDoc = signatures.find(s => s.director_id === ind.id);

            const signatory = {
                id: ind.id,
                name: ind.full_name || ind.name || 'Unknown',
                position: assoc?.individual_type || 'Director',
                signatureUrl: sigDoc ? getSupabaseImageUrl(sigDoc.file_path) : null,
                associations: associations,
                foundSignature: !!sigDoc,
                employment_data: ind.employment_data
            };

            console.log(`Signatory created:`, signatory);
            return signatory;
        });

        console.log('Final signatory list:', signatoryList);
        console.log('=== END DEBUG ===');

        return signatoryList;
    }, [companyId, individuals, signatures, tab]);

    useEffect(() => {
        console.log('=== DEBUG: Signatory Selection Effect ===');
        console.log('Available signatories:', availableSignatories);
        console.log('Current signatoryId:', signatoryId);

        if (availableSignatories.length > 0) {
            const firstSignatory = availableSignatories[0];
            console.log('Setting signatoryId to:', firstSignatory.id, firstSignatory.name);
            setSignatoryId(firstSignatory.id);
        } else {
            console.log('No available signatories, clearing signatoryId');
            setSignatoryId('');
        }
        console.log('=== END SIGNATORY SELECTION DEBUG ===');
    }, [availableSignatories]);

    const activeSignatory = availableSignatories.find(s => s.id === signatoryId);
    const isReady = tab === 'companies' ? !!selectedCompany : !!selectedIndividual;

    const exportToPDF = async () => {
        if (!paperRef.current) return;
        const canvas = await html2canvas(paperRef.current, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`${selectedCompany?.company_name || 'Letter'}.pdf`);
    };

    return (
        <div className="flex h-screen bg-[#F8FAFC] overflow-hidden text-slate-900">
            <ResizablePanelGroup direction="horizontal" className="h-full">

                {/* --- LEFT SIDEBAR (Entity Search) --- */}
                <ResizablePanel defaultSize={22} minSize={15} maxSize={30} collapsible className="bg-white border-r border-slate-200 print:hidden">
                    <div className="flex flex-col h-full">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex bg-slate-200/60 p-1 rounded-lg">
                                <button
                                    onClick={() => setTab('companies')}
                                    className={cn("flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-md transition-all", tab === 'companies' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                                >
                                    <Briefcase size={14} /> Companies
                                </button>
                                <button
                                    onClick={() => setTab('individuals')}
                                    className={cn("flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-md transition-all", tab === 'individuals' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                                >
                                    <User size={14} /> Individuals
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden">
                            {tab === 'companies' ? (
                                <CompanySidebar
                                    companies={companies} activeCompany={companyId}
                                    onCompanyClick={setCompanyId} isCollapsed={false}
                                />
                            ) : (
                                <IndividualSidebar
                                    individuals={individuals} activeIndividual={individualId}
                                    onIndividualClick={setIndividualId} isCollapsed={false}
                                />
                            )}
                        </div>
                    </div>
                </ResizablePanel>

                <ResizableHandle withHandle className="bg-slate-200 border-none w-1" />

                {/* --- MAIN CONTENT --- */}
                <ResizablePanel defaultSize={78}>
                    <div className="h-full flex flex-col">

                        {/* TOP COMMAND BAR */}
                        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="bg-blue-600 p-2.5 rounded-xl shadow-blue-200 shadow-lg">
                                    <FileText className="text-white" size={20} />
                                </div>
                                <div>
                                    <h1 className="text-sm font-black text-slate-800 uppercase">Letter Generation Engine</h1>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1">
                                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Registry Portal v2.0
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <Button variant="outline" size="sm" className="border-slate-200 text-slate-600 font-bold text-xs uppercase" disabled={!isReady} onClick={() => window.print()}>
                                    <Printer className="mr-2 h-3.5 w-3.5" /> Print
                                </Button>
                                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase shadow-lg shadow-blue-100 px-6 h-9" disabled={!isReady} onClick={exportToPDF}>
                                    <Download className="mr-2 h-3.5 w-3.5" /> Export PDF
                                </Button>
                            </div>
                        </header>

                        <ResizablePanelGroup direction="horizontal" className="flex-1">
                            {/* --- CANVAS --- */}
                            <ResizablePanel defaultSize={70} className="bg-slate-100/50">
                                <ScrollArea className="h-full">
                                    <div className="p-12 flex flex-col items-center">
                                        {isReady ? (
                                            <div className="space-y-6">
                                                <div className="flex justify-center">
                                                    <Badge variant="secondary" className="bg-white text-blue-600 border-blue-100 px-4 py-1.5 rounded-full shadow-sm">
                                                        <Type size={14} className="mr-2" />
                                                        Click text on the paper to edit directly
                                                    </Badge>
                                                </div>

                                                {/* A4 Paper */}
                                                <div
                                                    ref={paperRef}
                                                    className={cn(
                                                        "w-[210mm] min-h-[297mm] bg-white p-[25mm] shadow-[0_20px_50px_rgba(0,0,0,0.05)] transition-all",
                                                        "print:shadow-none print:w-full print:m-0"
                                                    )}
                                                >
                                                    {/* HEADER - KRA VS GENERAL */}
                                                    {letterType === 'kra' ? (
                                                        <div className="border-b-[3px] border-slate-900 pb-8 mb-10 text-center">
                                                            <h2 className="text-3xl font-black text-slate-900 uppercase mb-2">
                                                                {tab === 'companies' ? selectedCompany?.company_name : selectedIndividual?.full_name}
                                                            </h2>
                                                            <div className="text-[11px] font-bold text-slate-700 space-y-1 uppercase tracking-widest">
                                                                <p className="flex justify-center gap-4">
                                                                    <span className="flex items-center gap-1">
                                                                        EMAIL: {tab === 'companies'
                                                                            ? (selectedCompany?.kra_email_address || email || '')
                                                                            : (email || '')}
                                                                    </span>
                                                                    <span className="flex items-center gap-1">MOBILE NO: {phone || ''}</span>
                                                                </p>
                                                                <p>P.O. BOX 12345 - 00100, NAIROBI, KENYA</p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex justify-between items-start border-b-2 border-slate-100 pb-8 mb-10">
                                                            <div className="max-w-[60%]">
                                                                <h2 className="text-2xl font-bold text-slate-900 uppercase leading-tight">
                                                                    {tab === 'companies' ? selectedCompany?.company_name : selectedIndividual?.full_name}
                                                                </h2>
                                                                <div className="mt-2 text-[10px] font-black text-blue-600 uppercase tracking-widest">
                                                                    Ref: {reference}
                                                                </div>
                                                            </div>
                                                            <div className="text-right text-[10px] font-bold text-slate-500 uppercase">
                                                                <p>P.O. BOX 12345 - 00100</p>
                                                                <p>NAIROBI, KENYA</p>
                                                                <p>TEL: {phone}</p>
                                                                <p className="lowercase text-blue-600 font-black">{email}</p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* BODY */}
                                                    <div className="text-[16px] text-slate-800">
                                                        <div className="mb-4 font-bold">{letterDate}</div>

                                                        <div className="mb-10 text-right text-[14px] font-bold">
                                                            Your Ref: <span className="underline decoration-blue-200" contentEditable suppressContentEditableWarning>{reference}</span>
                                                        </div>

                                                        <div className="mb-10 whitespace-pre-wrap outline-none focus:bg-blue-50/50 p-2 -mx-2 rounded" contentEditable suppressContentEditableWarning>
                                                            {recipient}
                                                        </div>

                                                        <div className="mb-8 uppercase font-black underline underline-offset-8">
                                                            RE: <span contentEditable suppressContentEditableWarning>{subject}</span>
                                                        </div>

                                                        <div className="min-h-[350px] whitespace-pre-wrap outline-none focus:bg-blue-50/50 p-2 -mx-2 rounded mb-12" contentEditable suppressContentEditableWarning>
                                                            Dear Sir/Madam,{"\n\n"}
                                                            I am writing on behalf of the company to request for the issuance of a Tax Compliance Certificate.
                                                            All relevant returns have been filed and payments made up to date.{"\n\n"}
                                                            Your prompt assistance in this matter will be highly appreciated.
                                                        </div>

                                                        {/* SIGN-OFF */}
                                                        <div className="mt-16 space-y-12">
                                                            <div className="outline-none" contentEditable suppressContentEditableWarning>{valediction}</div>

                                                            <div className="space-y-1">
                                                                <div className="w-64 border-b border-slate-900 relative h-20 flex items-end mb-4">
                                                                    {tab === 'companies' && activeSignatory?.signatureUrl && (
                                                                        <img src={activeSignatory.signatureUrl} className="absolute bottom-1 left-0 h-28 object-contain mix-blend-multiply grayscale hover:grayscale-0 transition-all" />
                                                                    )}
                                                                </div>
                                                                <div className="font-black uppercase text-lg">
                                                                    {tab === 'companies' ? (activeSignatory?.name || '____________________') : selectedIndividual?.full_name}
                                                                </div>
                                                                <div className="text-xs text-slate-500 font-bold uppercase tracking-widest italic">
                                                                    {tab === 'companies' ? (activeSignatory?.position || 'Directors') : 'Applicant'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="h-[70vh] flex flex-col items-center justify-center text-slate-400">
                                                <div className="bg-white p-16 rounded-[40px] shadow-sm border border-slate-200 flex flex-col items-center text-center max-w-sm">
                                                    <div className="h-20 w-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 text-blue-600">
                                                        <Layout size={40} />
                                                    </div>
                                                    <h3 className="text-xl font-black text-slate-800 uppercase">Empty Canvas</h3>
                                                    <p className="text-sm text-slate-500 mt-2 font-medium">Select a record from the left sidebar to start generating a professional letterhead.</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </ResizablePanel>

                            <ResizableHandle withHandle className="bg-slate-200 border-none w-1" />

                            {/* --- RIGHT SIDEBAR (Configuration) --- */}
                            <ResizablePanel defaultSize={30} className="bg-white border-l border-slate-200 print:hidden">
                                <div className="h-full flex flex-col">
                                    <div className="p-6 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50 shrink-0">
                                        <Settings2 size={18} className="text-blue-600" />
                                        <h2 className="font-black text-sm uppercase tracking-wider text-slate-800">Configuration</h2>
                                    </div>

                                    <ScrollArea className="flex-1 px-6">
                                        <div className="py-6 space-y-6">

                                            {/* Section: Layout Type */}
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

                                            {/* Section: Contact Details */}
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

                                            {/* Section: Content */}
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

                                            {/* Section: Valediction */}
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

                                            {/* Section: Signatory */}
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
                                                                <select
                                                                    className="w-full h-10 px-3 rounded-md border border-blue-200 text-sm outline-none bg-white font-bold text-slate-700"
                                                                    value={signatoryId}
                                                                    onChange={(e) => setSignatoryId(e.target.value)}
                                                                >
                                                                    {availableSignatories.map((s) => (
                                                                        <option key={s.id} value={s.id}>{s.name} ({s.position})</option>
                                                                    ))}
                                                                </select>
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
                            </ResizablePanel>
                        </ResizablePanelGroup>
                    </div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}