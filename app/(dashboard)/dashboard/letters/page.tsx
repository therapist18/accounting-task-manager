// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, ImageRun } from 'docx';
import { saveAs } from 'file-saver';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import supabase from "@/lib/supabase/client";
import { CompanySidebar } from '../companies/company-sidebar';
import { IndividualSidebar } from '../individuals/individual-sidebar';
import { useLetterData } from './hooks/useLetterData';
import { useLetterheadData } from './hooks/useLetterheadData';
import { useLetterheads } from './hooks/useLetterheads';
import { KRALetterLayout } from './components/KRALetterLayout';
import { GeneralLetterLayout, LetterTheme } from './components/GeneralLetterLayout';
import { LetterControls } from './components/LetterControls';
import { generateLetterWithLetterhead, downloadBlob } from './utils/letterheadMerge';
import * as mammoth from 'mammoth';
import { FileText, Download, Briefcase, User, Type, Layout } from "lucide-react";
import { useSignatureUploadHandler } from './components/SignatureUploadHandler';
import { exportToWord } from './utils/exportToWord';
import { useIndividualIdentificationNumbers, resolveIndividualId } from './hooks/useIndividualIdentificationNumbers';
import type { IndividualIdInfo } from './hooks/useIndividualIdentificationNumbers';
import {
    getBclContactDetails,
    resolveCompanyGeneralEmail,
    resolveCompanyKraEmail,
    resolveCompanyKraPin,
    resolveCompanyPhone,
    resolveIndividualEmail,
    resolveIndividualKraPin,
    resolveIndividualPhone,
} from './utils/contactDetails';

const todayStr = () => {
    const date = new Date();
    const day = date.getDate();
    const month = date.toLocaleDateString('en-GB', { month: 'long' });
    const year = date.getFullYear();

    // Add ordinal suffix to day
    const getOrdinalSuffix = (n) => {
        if (n > 3 && n < 21) return 'th';
        if (n === 1 || n === 21) return 'st';
        if (n === 2 || n === 22) return 'nd';
        if (n === 3 || n === 23) return 'rd';
        return 'th';
    };

    return `${day}${getOrdinalSuffix(day)} ${month} ${year}`;
};

export default function LetterGenerationModule() {
    const paperRef = useRef(null);
    const [tab, setTab] = useState<'companies' | 'individuals'>('companies');
    const [letterType, setLetterType] = useState<'kra' | 'general'>('kra');
    const [companyId, setCompanyId] = useState('');
    const [individualId, setIndividualId] = useState('');
    const [signatoryId, setSignatoryId] = useState('');
    const [categoryFilters, setCategoryFilters] = useState(null);
    const handleCategoryFilterChange = (filters) => { setCategoryFilters(filters); };
    const [phone, setPhone] = useState('+254700298298');
    const [email, setEmail] = useState('');
    const [reference, setReference] = useState('');
    const [kra_pin, setKraPin] = useState('');
    const [recipient, setRecipient] = useState('');
    const [subject, setSubject] = useState('');
    const [valediction, setValediction] = useState('Yours faithfully,');
    const [letterDate, setLetterDate] = useState(todayStr());
    const [useLetterhead, setUseLetterhead] = useState(false);
    const [selectedLetterheadId, setSelectedLetterheadId] = useState<string>('');
    const [headerImageUrl, setHeaderImageUrl] = useState<string>('');
    const [footerImageUrl, setFooterImageUrl] = useState<string>('');
    const [loadingPreview, setLoadingPreview] = useState(false);
    const { companies, individuals, availableSignatories, refreshIndividuals, refreshSignatures } = useLetterData(tab, companyId);
    const { headerUrl, footerUrl, hasLetterhead } = useLetterheadData(companyId);
    const { letterheads, loading: letterheadsLoading, getDefaultLetterhead } = useLetterheads(tab === 'companies' && companyId ? parseInt(companyId) : undefined);
    const { handleSignatureUpload: handleSignatureUploadHook } = useSignatureUploadHandler({ refreshIndividuals, refreshSignatures });
    const selectedCompany = useMemo(() => companies.find(c => c.id.toString() === companyId), [companies, companyId]);
    const selectedIndividual = useMemo(() => individuals.find(i => i.id.toString() === individualId), [individuals, individualId]);
    const activeSignatory = availableSignatories.find(s => s.id.toString() === signatoryId.toString());
    const isReady = tab === 'companies' ? !!selectedCompany : !!selectedIndividual;
    const individualIds = useMemo(() => individuals.map(i => i.id), [individuals]);
    const { identificationNumbers } = useIndividualIdentificationNumbers(individualIds);
    const individualIdInfo: IndividualIdInfo | null = useMemo(
        () => selectedIndividual ? resolveIndividualId(identificationNumbers[selectedIndividual.id]) : null,
        [selectedIndividual, identificationNumbers]
    );
    const [letterTheme, setLetterTheme] = useState<LetterTheme>('dark-teal');
    const [isLetterCleared, setIsLetterCleared] = useState(false);
    const bclContact = getBclContactDetails();

    useEffect(() => {
        if (selectedCompany) {
            if (letterType === 'kra') {
                const kraEmail = resolveCompanyKraEmail(selectedCompany);
                setEmail(kraEmail);
                setPhone(bclContact.phone);
                setRecipient("Kenya Revenue Authority,\nP.O. Box 48240 - 00100,\nNairobi, Kenya.");
                // Add KRA PIN to subject if available
                const kraPin = resolveCompanyKraPin(selectedCompany);
                const subjectWithPin = kraPin
                    ? `APPLICATION FOR TAX COMPLIANCE CERTIFICATE (KRA PIN: ${kraPin})`
                    : "APPLICATION FOR TAX COMPLIANCE CERTIFICATE";
                setSubject(subjectWithPin);
                setKraPin(kraPin);
            } else {
                const companyEmail = resolveCompanyGeneralEmail(selectedCompany);
                const companyPhone = resolveCompanyPhone(selectedCompany, '+254700000000');
                setEmail(companyEmail);
                setPhone(companyPhone);
                setRecipient("Select Bank Ltd,\nIndustrial Area Branch,\nNairobi.");
                // Add registration number to subject if available
                const regNumber = selectedCompany.registration_number || '';
                const subjectWithReg = regNumber
                    ? `REQUEST FOR BANK STATEMENT (Reg No: ${regNumber})`
                    : "REQUEST FOR BANK STATEMENT";
                setSubject(subjectWithReg);
            }
            setReference(selectedCompany.registration_number || '');
        }
    }, [selectedCompany, letterType, bclContact.phone]);

    useEffect(() => {
        if (selectedIndividual) {
            const idInfo = resolveIndividualId(identificationNumbers[selectedIndividual.id]);
            const idSuffix = idInfo ? ` (${idInfo.label}: ${idInfo.value})` : '';
            const individualKraPin = resolveIndividualKraPin(selectedIndividual);
            const kraSuffix = individualKraPin ? ` (KRA PIN: ${individualKraPin})` : idSuffix;

            if (letterType === 'kra') {
                setEmail(resolveIndividualEmail(selectedIndividual));
                setPhone(bclContact.phone);
                setRecipient("Kenya Revenue Authority,\nP.O. Box 48240 - 00100,\nNairobi, Kenya.");
                setSubject(`APPLICATION FOR TAX COMPLIANCE CERTIFICATE${kraSuffix}`);
                setKraPin(individualKraPin);
            } else {
                setEmail(resolveIndividualEmail(selectedIndividual));
                setPhone(resolveIndividualPhone(selectedIndividual, '+254700000000'));
                setRecipient("Select Bank Ltd,\nIndustrial Area Branch,\nNairobi.");
                setSubject(`REQUEST FOR BANK STATEMENT${idSuffix}`);
                setReference('');
                setKraPin(individualKraPin);
            }
        }
    }, [selectedIndividual, letterType, identificationNumbers, bclContact.phone]);

    useEffect(() => {
        if (availableSignatories.length > 0) {
            setSignatoryId(prevId => {
                const currentSignatoryExists = availableSignatories.some(s => s.id === prevId);

                if (!prevId || !currentSignatoryExists) {
                    return availableSignatories[0].id;
                }
                return prevId;
            });
        } else {
            setSignatoryId('');
        }
    }, [availableSignatories]);

    useEffect(() => {
        if (!hasLetterhead) {
            setUseLetterhead(false);
        }
    }, [hasLetterhead]);

    // Auto-select default letterhead when company changes
    useEffect(() => {
        if (letterheads.length > 0 && !selectedLetterheadId) {
            const defaultLh = getDefaultLetterhead();
            if (defaultLh) {
                setSelectedLetterheadId(defaultLh.id);
            } else if (letterheads.length > 0) {
                setSelectedLetterheadId(letterheads[0].id);
            }
        }
    }, [letterheads, companyId]);

    // Load letterhead preview when selected
    useEffect(() => {
        const loadLetterheadPreview = async () => {
            if (!selectedLetterheadId || !useLetterhead) {
                setHeaderImageUrl('');
                setFooterImageUrl('');
                return;
            }

            const selectedLh = letterheads.find(lh => lh.id === selectedLetterheadId);
            if (!selectedLh) return;

            // Check if header/footer images already exist in metadata
            if (selectedLh.metadata?.header_image_url && selectedLh.metadata?.footer_image_url) {
                setHeaderImageUrl(selectedLh.metadata.header_image_url);
                setFooterImageUrl(selectedLh.metadata.footer_image_url);
                return;
            }

            // Extract header/footer if not exists
            setLoadingPreview(true);
            try {
                const response = await fetch('/api/letterheads/extract-header-footer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        letterheadId: selectedLh.id,
                        filePath: selectedLh.file_path,
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    setHeaderImageUrl(data.header_image_url);
                    setFooterImageUrl(data.footer_image_url);
                }
            } catch (error) {
                console.error('Error loading letterhead preview:', error);
            } finally {
                setLoadingPreview(false);
            }
        };

        loadLetterheadPreview();
    }, [selectedLetterheadId, useLetterhead, letterheads]);

    const exportToPDF = async () => {
        if (!paperRef.current) return;

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pdfWidth = pdf.internal.pageSize.getWidth();

        const hasImageHeader = useLetterhead && headerImageUrl;
        const shouldUseFallbackHeader = !hasImageHeader;

        if (shouldUseFallbackHeader) {
            const entityName = tab === 'companies' ? selectedCompany?.company_name : selectedIndividual?.full_name;
            const canvas = await html2canvas(paperRef.current, {
                scale: 4,
                useCORS: true,
                backgroundColor: '#ffffff',
            });

            const imgData = canvas.toDataURL('image/png');
            const imgWidth = pdfWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
        } else {
            // Handle full-image letterhead capture
            const canvas = await html2canvas(paperRef.current, { scale: 4, useCORS: true });
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pdfWidth, (canvas.height * pdfWidth) / canvas.width);
        }

        pdf.save(`${(tab === 'companies' ? selectedCompany?.company_name : selectedIndividual?.full_name) || 'Letter'}.pdf`);
    };

    const handleExportToWord = async () => {
        console.log('[handleExportToWord] Function called!');

        if (!isReady) {
            console.log('[handleExportToWord] Not ready, returning');
            return;
        }

        console.log('[handleExportToWord] Calling exportToWord...');

        await exportToWord({
            tab,
            letterType,
            selectedCompany,
            selectedIndividual,
            email,
            phone,
            letterDate,
            reference,
            recipient,
            subject,
            valediction,
            activeSignatory,
            useLetterhead,
            headerImageUrl,
            footerImageUrl,
            letterheads,
            selectedLetterheadId,
            generateLetterWithLetterhead,
            downloadBlob,
            individualIdInfo,
            kraPin: kra_pin,
            theme: letterTheme,
        });
    };

    return (
        <div className="flex h-screen bg-[#F8FAFC] overflow-hidden text-slate-900">
            <ResizablePanelGroup direction="horizontal" className="h-full">
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
                                    companies={companies}
                                    activeCompany={companyId}
                                    onCompanyClick={setCompanyId}
                                    isCollapsed={false}
                                    showCategoryFilter={true}
                                    onCategoryFilterChange={handleCategoryFilterChange}
                                    initialCategoryFilters={categoryFilters}
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

                <ResizablePanel defaultSize={78}>
                    <div className="h-full flex flex-col">
                        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="bg-blue-600 p-2.5 rounded-xl shadow-blue-200 shadow-lg">
                                    <FileText className="text-white" size={20} />
                                </div>
                                <div>
                                    <h1 className="text-sm font-black text-slate-800 uppercase">Letter Generation Engine</h1>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <Button variant="outline" size="sm" className="border-slate-200 text-slate-600 font-bold text-xs uppercase" disabled={!isReady} onClick={handleExportToWord}>
                                    <Download className="mr-2 h-3.5 w-3.5" /> Download Word
                                </Button>
                                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase shadow-lg shadow-blue-100 px-6 h-9" disabled={!isReady} onClick={exportToPDF}>
                                    <Download className="mr-2 h-3.5 w-3.5" /> Export PDF
                                </Button>
                            </div>
                        </header>

                        <ResizablePanelGroup direction="horizontal" className="flex-1">
                            <ResizablePanel defaultSize={70} className="bg-slate-100/50">
                                <ScrollArea className="h-full">
                                    <div className="p-4 flex flex-col items-center">
                                        {isReady ? (
                                            <div className="space-y-2">
                                                <div className="flex justify-center">
                                                    <Badge variant="secondary" className="bg-white text-blue-600 border-blue-100 px-4 py-1.5 rounded-full shadow-sm">
                                                        <Type size={14} className="mr-2" />
                                                        Click text on the paper to edit directly
                                                    </Badge>
                                                </div>

                                                <div
                                                    ref={paperRef}
                                                    className={cn(
                                                        "w-[210mm] min-h-[297mm] bg-white p-16 shadow-[0_20px_50px_rgba(0,0,0,0.05)] transition-all",
                                                        "print:shadow-none print:w-full print:m-0"
                                                    )}
                                                >
                                                    {letterType === 'kra' ? (
                                                        <KRALetterLayout
                                                            tab={tab}
                                                            selectedCompany={selectedCompany}
                                                            selectedIndividual={selectedIndividual}
                                                            email={email}
                                                            phone={phone}
                                                            letterDate={letterDate}
                                                            reference={reference}
                                                            recipient={recipient}
                                                            subject={subject}
                                                            valediction={valediction}
                                                            activeSignatory={activeSignatory}
                                                            individualIdInfo={individualIdInfo}
                                                            kraPin={kra_pin}
                                                        />
                                                    ) : (
                                                        <GeneralLetterLayout
                                                            tab={tab}
                                                            selectedCompany={selectedCompany}
                                                            selectedIndividual={selectedIndividual}
                                                            email={email}
                                                            phone={phone}
                                                            letterDate={letterDate}
                                                            reference={reference}
                                                            recipient={recipient}
                                                            subject={subject}
                                                            valediction={valediction}
                                                            activeSignatory={activeSignatory}
                                                            individualIdInfo={individualIdInfo}
                                                            useLetterhead={useLetterhead}
                                                            headerUrl={headerUrl}
                                                            footerUrl={footerUrl}
                                                            headerImageUrl={headerImageUrl}
                                                            footerImageUrl={footerImageUrl}
                                                            theme={letterTheme}
                                                            isCleared={isLetterCleared}
                                                            kraPin={kra_pin}
                                                        />
                                                    )}
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

                            <ResizablePanel defaultSize={30} className="bg-white border-l border-slate-200 print:hidden">
                                <LetterControls
                                    tab={tab}
                                    letterType={letterType}
                                    setLetterType={setLetterType}
                                    phone={phone}
                                    setPhone={setPhone}
                                    email={email}
                                    setEmail={setEmail}
                                    kra_pin={kra_pin}
                                    setKraPin={setKraPin}
                                    reference={reference}
                                    setReference={setReference}
                                    recipient={recipient}
                                    setRecipient={setRecipient}
                                    subject={subject}
                                    setSubject={setSubject}
                                    valediction={valediction}
                                    setValediction={setValediction}
                                    availableSignatories={availableSignatories}
                                    signatoryId={signatoryId}
                                    setSignatoryId={setSignatoryId}
                                    activeSignatory={activeSignatory}
                                    hasLetterhead={hasLetterhead || letterheads.length > 0}
                                    useLetterhead={useLetterhead}
                                    setUseLetterhead={setUseLetterhead}
                                    availableLetterheads={letterheads}
                                    selectedLetterheadId={selectedLetterheadId}
                                    setSelectedLetterheadId={setSelectedLetterheadId}
                                    onSignatureUpload={handleSignatureUploadHook}
                                    individualIdInfo={individualIdInfo}
                                    theme={letterTheme}
                                    onThemeChange={(t) => setLetterTheme(t)}
                                    onClearAll={() => setIsLetterCleared(true)}
                                    onReset={() => setIsLetterCleared(false)}
                                />
                            </ResizablePanel>
                        </ResizablePanelGroup>
                    </div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}
