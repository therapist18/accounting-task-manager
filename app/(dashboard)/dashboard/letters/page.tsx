// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, ImageRun } from 'docx';
import { saveAs } from 'file-saver';
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import supabase from "@/lib/supabase/client";
import { CompanySidebar } from '../companies/company-sidebar';
import { IndividualSidebar } from '../individuals/individual-sidebar';
import { useLetterData } from './hooks/useLetterData';
import { useLetterheadData } from './hooks/useLetterheadData';
import { useLetterheads } from './hooks/useLetterheads';
import { KRALetterLayout } from './components/KRALetterLayout';
import { GeneralLetterLayout } from './components/GeneralLetterLayout';
import { LetterControls } from './components/LetterControls';
import { LetterThemePanel } from './components/LetterThemePanel';
import { DEFAULT_GENERAL_LETTER_THEME } from './utils/letterThemeEngine';
import { generateLetterWithLetterhead, downloadBlob } from './utils/letterheadMerge';
import * as mammoth from 'mammoth';
import {
    FileText, FileDown, Download, Briefcase, User, Type, Layout, ZoomIn, ZoomOut, ChevronDown, Palette,
    PanelLeftClose, PanelLeftOpen, Columns2, PanelRightClose, PanelRightOpen,
    ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { useSignatureUploadHandler } from './components/SignatureUploadHandler';
import { exportToWord } from './utils/exportToWord';
import { printHtmlAsPdf } from './utils/printExport';
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
    const entityName = tab === 'companies' ? selectedCompany?.company_name : selectedIndividual?.full_name;
    const individualIds = useMemo(() => individuals.map(i => i.id), [individuals]);
    const { identificationNumbers } = useIndividualIdentificationNumbers(individualIds);
    const individualIdInfo: IndividualIdInfo | null = useMemo(
        () => selectedIndividual ? resolveIndividualId(identificationNumbers[selectedIndividual.id]) : null,
        [selectedIndividual, identificationNumbers]
    );
    // General letters only - "handle themes the same way as the contract
    // module" (see utils/letterThemeEngine.ts + components/LetterThemePanel.tsx).
    // KRA letters keep their fixed slate design, no theme picker.
    const [generalLetterTheme, setGeneralLetterTheme] = useState(DEFAULT_GENERAL_LETTER_THEME);
    const [themePanelOpen, setThemePanelOpen] = useState(false);
    const [isLetterCleared, setIsLetterCleared] = useState(false);
    const bclContact = getBclContactDetails();

    // Panel collapse/expand triggers - same pattern as the employment-contracts
    // module's page.tsx header pill.
    const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
    const configPanelRef = useRef<ImperativePanelHandle>(null);
    const previewPanelRef = useRef<ImperativePanelHandle>(null);
    const [collapsedPanels, setCollapsedPanels] = useState({ sidebar: false, config: false, preview: false });
    const togglePanel = (key: keyof typeof collapsedPanels) => {
        const ref = key === 'sidebar' ? sidebarPanelRef : key === 'config' ? configPanelRef : previewPanelRef;
        const panel = ref.current;
        if (!panel) return;
        if (panel.isCollapsed()) panel.expand(); else panel.collapse();
    };

    // Preview zoom/sizing - mirrors the employment-contracts module's
    // ContractPreview toolbar (fit-to-width by default, switches to manual
    // the moment +/-/is touched).
    const scrollContainerRef = useRef(null);
    const PAGE_WIDTH_PX = 794; // A4 width at 96dpi
    const PAGE_HEIGHT_PX = 1123; // A4 height at 96dpi
    const PAGE_GUTTER_X_PX = 16 * 2; // the preview wrapper's own p-4
    const PAGE_GUTTER_Y_PX = 16 * 2;
    const [zoomPct, setZoomPct] = useState(80);
    const manualZoomRatio = zoomPct / 100;
    const [sizingMode, setSizingMode] = useState('fit');
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const zoomRatio = useMemo(() => {
        if (sizingMode === 'fit' && containerSize.width > 0) return Math.max(0.1, (containerSize.width - PAGE_GUTTER_X_PX) / PAGE_WIDTH_PX);
        if (sizingMode === 'fill' && containerSize.height > 0) return Math.max(0.1, (containerSize.height - PAGE_GUTTER_Y_PX) / PAGE_HEIGHT_PX);
        return manualZoomRatio;
    }, [sizingMode, containerSize, manualZoomRatio]);
    const setManualZoom = (updater) => {
        const base = sizingMode === 'manual' ? zoomPct : Math.round(zoomRatio * 100);
        setSizingMode('manual');
        setZoomPct(Math.min(150, Math.max(40, updater(base))));
    };

    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Pagination - mirrors ContractPreview.tsx: a hidden, unscaled clone of
    // the same letter measures its natural height (ResizeObserver +
    // image-load re-measure), which drives totalPages/pageCanvasHeightPx;
    // scroll position maps back to a current-page indicator.
    const contentMeasureRef = useRef(null);
    const [contentHeightPx, setContentHeightPx] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const totalPages = Math.max(1, Math.ceil(contentHeightPx / PAGE_HEIGHT_PX));
    const pageCanvasHeightPx = totalPages * PAGE_HEIGHT_PX;

    useEffect(() => {
        const el = contentMeasureRef.current;
        if (!el) return;

        const measure = () => {
            setTimeout(() => setContentHeightPx(el.scrollHeight), 50);
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);

        const images = el.querySelectorAll('img');
        images.forEach((img) => img.addEventListener('load', measure));

        return () => {
            observer.disconnect();
            images.forEach((img) => img.removeEventListener('load', measure));
        };
    }, [isReady]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        let rafId;

        const onScroll = () => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                const page = Math.floor(container.scrollTop / (PAGE_HEIGHT_PX * zoomRatio)) + 1;
                setCurrentPage(Math.max(1, Math.min(page, totalPages)));
            });
        };

        container.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
        return () => {
            container.removeEventListener('scroll', onScroll);
            cancelAnimationFrame(rafId);
        };
    }, [totalPages, zoomRatio]);

    const scrollToPage = (page: number) => {
        const container = scrollContainerRef.current;
        if (!container) return;
        container.scrollTo({ top: (page - 1) * PAGE_HEIGHT_PX * zoomRatio, behavior: 'smooth' });
    };

    // Reset scroll/page on record or letter-type switch.
    useEffect(() => {
        scrollContainerRef.current?.scrollTo({ top: 0 });
        setCurrentPage(1);
    }, [companyId, individualId, letterType]);

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

    // Prints the live paperRef DOM via the browser's native print pipeline
    // (see utils/printExport.ts - same real-vector-text technique the
    // employment-contracts module uses) instead of rasterizing it with
    // html2canvas/jsPDF. Cloning the actual DOM node (not a re-render from
    // state) means any inline "click text on the paper to edit directly"
    // edits are captured exactly as shown on screen. pageMargin is '0'
    // because paperRef already carries its own p-16 page padding - the
    // default 0.5in @page margin would double up on top of that and push a
    // short one-page letter onto a near-empty second page.
    const handleDownloadPdf = async () => {
        if (!isReady || !paperRef.current) return;
        await printHtmlAsPdf(paperRef.current.outerHTML, { pageMargin: '0' });
    };

    const handleExportToWord = async () => {
        if (!isReady) return;

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
            themeSettings: generalLetterTheme,
        });
    };

    const letterContent = letterType === 'kra' ? (
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
            themeSettings={generalLetterTheme}
            isCleared={isLetterCleared}
            kraPin={kra_pin}
        />
    );

    return (
        <div className="h-screen w-full flex flex-col bg-[#F8FAFC] overflow-hidden text-slate-900">
            <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-600 p-2.5 rounded-xl shadow-blue-200 shadow-lg">
                            <FileText className="text-white" size={20} />
                        </div>
                        <div>
                            <h1 className="text-sm font-black text-slate-800 uppercase">Letter Generation Engine</h1>
                        </div>
                    </div>

                    {/* Panel visibility toggles - same segmented pill as the
                        employment-contracts module's page.tsx header. */}
                    <div className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-full border border-slate-200/80">
                        <button
                            onClick={() => togglePanel('sidebar')}
                            title={collapsedPanels.sidebar ? 'Show entities panel' : 'Hide entities panel'}
                            className={cn(
                                "p-1.5 rounded-full transition-all",
                                collapsedPanels.sidebar ? "text-slate-400 hover:text-slate-600" : "bg-blue-600 text-white shadow-sm"
                            )}
                        >
                            {collapsedPanels.sidebar ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={() => togglePanel('config')}
                            title={collapsedPanels.config ? 'Show configuration panel' : 'Hide configuration panel'}
                            className={cn(
                                "p-1.5 rounded-full transition-all",
                                collapsedPanels.config ? "text-slate-400 hover:text-slate-600" : "bg-blue-600 text-white shadow-sm"
                            )}
                        >
                            <Columns2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => togglePanel('preview')}
                            title={collapsedPanels.preview ? 'Show preview panel' : 'Hide preview panel'}
                            className={cn(
                                "p-1.5 rounded-full transition-all",
                                collapsedPanels.preview ? "text-slate-400 hover:text-slate-600" : "bg-blue-600 text-white shadow-sm"
                            )}
                        >
                            {collapsedPanels.preview ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </header>

            {/* Sidebar | Configuration | Preview - same left-to-right order as
                the employment-contracts module (entities -> data/values ->
                document preview). */}
            <div className="flex-1 min-h-0 w-full relative">
                <ResizablePanelGroup direction="horizontal" className="h-full">
                    <ResizablePanel
                        ref={sidebarPanelRef}
                        defaultSize={20} minSize={15} maxSize={30}
                        collapsible collapsedSize={0}
                        onCollapse={() => setCollapsedPanels((p) => ({ ...p, sidebar: true }))}
                        onExpand={() => setCollapsedPanels((p) => ({ ...p, sidebar: false }))}
                        className="bg-white border-r border-slate-200 print:hidden"
                    >
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

                    <ResizablePanel
                        ref={configPanelRef}
                        defaultSize={40} minSize={28}
                        collapsible collapsedSize={0}
                        onCollapse={() => setCollapsedPanels((p) => ({ ...p, config: true }))}
                        onExpand={() => setCollapsedPanels((p) => ({ ...p, config: false }))}
                        className="bg-white border-r border-slate-200 print:hidden"
                    >
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
                            onClearAll={() => setIsLetterCleared(true)}
                            onReset={() => setIsLetterCleared(false)}
                            entityName={entityName}
                        />
                    </ResizablePanel>

                    <ResizableHandle withHandle className="bg-slate-200 border-none w-1" />

                    <ResizablePanel
                        ref={previewPanelRef}
                        defaultSize={40} minSize={25}
                        collapsible collapsedSize={0}
                        onCollapse={() => setCollapsedPanels((p) => ({ ...p, preview: true }))}
                        onExpand={() => setCollapsedPanels((p) => ({ ...p, preview: false }))}
                        className="bg-slate-100/50 flex flex-col"
                    >
                        {/* Docked toolbar - zoom/fit controls + theme + export,
                            mirrors the employment-contracts module's
                            ContractPreview toolbar. */}
                        <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-200/70 bg-white/80 backdrop-blur z-20">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <div className="flex items-center h-8 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden shadow-sm shrink-0">
                                    <button
                                        onClick={() => setManualZoom((z) => z - 10)}
                                        disabled={sizingMode === 'manual' && zoomPct <= 40}
                                        title="Zoom out"
                                        className="px-2 h-full text-slate-500 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                                    >
                                        <ZoomOut className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="text-xs font-medium text-slate-600 w-10 text-center tabular-nums select-none border-x border-slate-200">
                                        {Math.round(zoomRatio * 100)}%
                                    </span>
                                    <button
                                        onClick={() => setManualZoom((z) => z + 10)}
                                        disabled={sizingMode === 'manual' && zoomPct >= 150}
                                        title="Zoom in"
                                        className="px-2 h-full text-slate-500 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                                    >
                                        <ZoomIn className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                <div className="flex items-center h-8 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden shadow-sm shrink-0">
                                    <button
                                        onClick={() => setSizingMode('fit')}
                                        title="Fit page to width"
                                        className={cn("px-2.5 h-full text-[10px] font-bold uppercase tracking-wide transition-colors", sizingMode === 'fit' ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-200")}
                                    >
                                        Fit
                                    </button>
                                    <button
                                        onClick={() => setSizingMode('fill')}
                                        title="Fill available height"
                                        className={cn("px-2.5 h-full text-[10px] font-bold uppercase tracking-wide transition-colors border-l border-slate-200", sizingMode === 'fill' ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-200")}
                                    >
                                        Fill
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                                {letterType === 'general' && (
                                    <button
                                        onClick={() => setThemePanelOpen(true)}
                                        title="Customize letter theme"
                                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors shrink-0"
                                    >
                                        <Palette className="w-4 h-4" />
                                    </button>
                                )}

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            disabled={!isReady}
                                            className="h-8 px-3 flex items-center gap-1.5 rounded-lg text-xs font-medium bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors shrink-0"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            Export
                                            <ChevronDown className="w-3 h-3 ml-0.5" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-40">
                                        <DropdownMenuItem onClick={handleDownloadPdf} disabled={!isReady}>
                                            <FileDown className="w-3.5 h-3.5 mr-2 text-slate-400" /> PDF Document
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={handleExportToWord} disabled={!isReady}>
                                            <FileText className="w-3.5 h-3.5 mr-2 text-slate-400" /> Word Document
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>

                        {/* Main preview area - native scroll (not Radix ScrollArea)
                            so scrollTop can drive the pagination footer, same as
                            ContractPreview.tsx. */}
                        <div ref={scrollContainerRef} className="flex-1 overflow-auto">
                            <div className="p-4 flex flex-col items-center min-h-full">
                                {isReady ? (
                                    <div className="space-y-2">
                                        <div className="flex justify-center">
                                            <Badge variant="secondary" className="bg-white text-blue-600 border-blue-100 px-4 py-1.5 rounded-full shadow-sm">
                                                <Type size={14} className="mr-2" />
                                                Click text on the paper to edit directly
                                            </Badge>
                                        </div>

                                        {/* Scaled canvas - outer box reserves the real
                                            (unscaled) multi-page footprint so the
                                            page-break guides land on exact page
                                            boundaries; inner box is the live-scale
                                            transform, same split as ContractPreview.tsx. */}
                                        <div
                                            className="relative shrink-0 shadow-2xl shadow-slate-300/30 transition-transform duration-200"
                                            style={{ width: PAGE_WIDTH_PX * zoomRatio, height: pageCanvasHeightPx * zoomRatio }}
                                        >
                                            <div
                                                className="absolute top-0 left-0 bg-white origin-top-left"
                                                style={{ width: PAGE_WIDTH_PX, height: pageCanvasHeightPx, transform: `scale(${zoomRatio})` }}
                                            >
                                                {Array.from({ length: totalPages - 1 }, (_, i) => (
                                                    <div
                                                        key={`pb-${i}`}
                                                        className="absolute left-0 right-0 pointer-events-none z-10"
                                                        style={{ top: (i + 1) * PAGE_HEIGHT_PX }}
                                                    >
                                                        <div className="border-t border-dashed border-slate-300/60" style={{ marginLeft: 48, marginRight: 48 }} />
                                                    </div>
                                                ))}

                                                <div
                                                    ref={paperRef}
                                                    className={cn(
                                                        "w-full min-h-full bg-white p-16",
                                                        "print:shadow-none print:w-full print:m-0"
                                                    )}
                                                >
                                                    {letterContent}
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
                        </div>

                        {/* Docked pagination footer - mirrors ContractPreview.tsx. */}
                        {isReady && (
                            <div className="shrink-0 flex items-center justify-center gap-2.5 px-4 py-2 border-t border-slate-200/70 bg-white/80 backdrop-blur z-10 print:hidden">
                                <div className="flex items-center h-8 rounded-full border border-slate-200 bg-white shadow-sm overflow-hidden">
                                    <button onClick={() => scrollToPage(1)} disabled={currentPage <= 1} title="First page" className="w-8 h-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors border-r border-slate-100">
                                        <ChevronsLeft className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => scrollToPage(currentPage - 1)} disabled={currentPage <= 1} title="Previous page" className="w-8 h-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                </div>

                                <span className="text-xs font-medium text-slate-600 tabular-nums">
                                    Page <span className="text-slate-900 font-bold">{currentPage}</span> / {totalPages}
                                </span>

                                <div className="flex items-center h-8 rounded-full border border-slate-200 bg-white shadow-sm overflow-hidden">
                                    <button onClick={() => scrollToPage(currentPage + 1)} disabled={currentPage >= totalPages} title="Next page" className="w-8 h-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => scrollToPage(totalPages)} disabled={currentPage >= totalPages} title="Last page" className="w-8 h-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors border-l border-slate-100">
                                        <ChevronsRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Hidden unscaled clone, measured for pagination only -
                            same technique as ContractPreview.tsx's contentMeasureRef. */}
                        <div className="absolute top-0 left-0 pointer-events-none z-[-1] opacity-0" aria-hidden="true">
                            <div ref={contentMeasureRef} className="bg-white p-16" style={{ width: PAGE_WIDTH_PX }}>
                                {isReady && letterContent}
                            </div>
                        </div>
                    </ResizablePanel>
                </ResizablePanelGroup>

                <LetterThemePanel
                    open={themePanelOpen}
                    onClose={() => setThemePanelOpen(false)}
                    settings={generalLetterTheme}
                    onChange={setGeneralLetterTheme}
                />
            </div>
        </div>
    );
}
