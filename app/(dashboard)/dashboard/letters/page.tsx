// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import supabase from '@/lib/supabase/client';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
    Building2,
    User,
    FileText,
    Search,
    ChevronDown,
    Check,
    Calendar,
    Printer,
    Copy,
    Mail,
    Phone,
    MapPin
} from "lucide-react";

const SIGNATURE_DOC_TYPE_ID = "67d9f93a-6b2b-4e19-86a3-ea7925c3d6ab";
const VALEDICTIONS = ['Yours faithfully,', 'Yours sincerely,', 'Kind regards,', 'Respectfully yours,'];
const todayStr = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IM+Fell+English&display=swap');
  .lgm *, .lgm *::before, .lgm *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .lgm {
    font-family: 'Inter', sans-serif;
    background: #f4f4f5;
    min-height: 100vh;
    display: grid;
    grid-template-columns: 272px 1fr;
  }

  /* SIDEBAR */
  .s {
    background: #fff;
    border-right: 1px solid #e4e4e7;
    padding: 20px 16px;
    display: flex; flex-direction: column; gap: 16px;
    overflow-y: auto;
  }
  .s-title { font-size: 14px; font-weight: 600; color: #18181b; padding-bottom: 14px; border-bottom: 1px solid #e4e4e7; }
  .s-label { font-size: 10px; font-weight: 600; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 5px; }
  .s-select, .s-input {
    font-family: 'Inter', sans-serif; font-size: 13px;
    border: 1px solid #e4e4e7; border-radius: 6px;
    padding: 7px 9px; color: #18181b; background: #fff; width: 100%; outline: none;
  }
  .s-select:focus, .s-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.12); }
  .s-tabs { display: flex; border: 1px solid #e4e4e7; border-radius: 6px; overflow: hidden; }
  .s-tab { flex: 1; padding: 7px 4px; border: none; background: transparent; font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 500; color: #71717a; cursor: pointer; }
  .s-tab.on { background: #18181b; color: #fff; }
  .s-pills { display: flex; gap: 6px; }
  .s-pill { flex: 1; padding: 8px 4px; border: 1px solid #e4e4e7; border-radius: 6px; background: #fff; font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 500; color: #71717a; cursor: pointer; text-align: center; }
  .s-pill.on { border-color: #3b82f6; background: #eff6ff; color: #1d4ed8; }
  .s-hr { height: 1px; background: #e4e4e7; }
  .sig-card { border: 1px solid #e4e4e7; border-radius: 6px; padding: 10px 12px; background: #fafafa; }
  .sig-name { font-size: 13px; font-weight: 600; color: #18181b; }
  .sig-pos { font-size: 11px; color: #71717a; margin-top: 1px; }
  .sig-thumb { margin-top: 8px; height: 34px; border: 1px dashed #d4d4d8; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #a1a1aa; }
  .s-btn { width: 100%; padding: 9px; border-radius: 6px; border: none; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; }
  .s-btn-dark { background: #18181b; color: #fff; }
  .s-btn-dark:hover { background: #27272a; }
  .s-btn-out { background: #fff; color: #18181b; border: 1px solid #e4e4e7; margin-top: 6px; }
  .s-btn-out:hover { border-color: #71717a; }

  /* PREVIEW */
  .pv { padding: 28px; display: flex; flex-direction: column; align-items: center; gap: 12px; overflow-y: auto; }
  .pv-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60vh; color: #a1a1aa; gap: 10px; }
  .pv-empty-icon { font-size: 36px; opacity: 0.35; }
  .pv-empty-text { font-size: 13px; }

  /* PAPER */
  .paper {
    background: #fff; width: 100%; max-width: 720px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.07), 0 8px 24px rgba(0,0,0,0.05);
    border-radius: 3px; border: 1px solid #e4e4e7; overflow: hidden;
  }

  /* KRA header */
  .kra-h { background: #1e3a5f; padding: 22px 32px 16px; border-bottom: 3px solid #c4972a; }
  .kra-name { font-family: 'IM Fell English', serif; font-size: 20px; color: #fff; margin-bottom: 5px; }
  .kra-meta { font-size: 11px; color: rgba(255,255,255,0.65); display: flex; gap: 14px; flex-wrap: wrap; }

  /* General header */
  .gen-h { padding: 26px 32px 18px; border-bottom: 2px solid #18181b; display: flex; justify-content: space-between; align-items: flex-start; }
  .gen-name { font-family: 'IM Fell English', serif; font-size: 20px; color: #18181b; }
  .gen-meta { font-size: 11px; color: #71717a; line-height: 1.85; text-align: right; }

  /* Ind header */
  .ind-h { padding: 22px 32px 16px; border-bottom: 2px solid #18181b; }
  .ind-name { font-family: 'IM Fell English', serif; font-size: 20px; color: #18181b; }
  .ind-sub { font-size: 11px; color: #71717a; margin-top: 3px; display: flex; gap: 14px; }

  /* Body */
  .lb { padding: 24px 32px; }
  .l-date { font-size: 12px; color: #71717a; margin-bottom: 18px; }
  .l-ref { font-size: 13px; margin-bottom: 4px; }
  .l-ref b { font-weight: 600; }
  .l-to-label { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
  .l-subj { font-size: 13px; font-weight: 700; text-decoration: underline; text-transform: uppercase; color: #18181b; margin-bottom: 22px; letter-spacing: 0.2px; }
  .l-content {
    font-size: 13px; line-height: 1.9; color: #18181b; min-height: 150px;
    outline: none; border-bottom: 1px dashed #d4d4d8; padding-bottom: 10px;
  }
  .l-content:empty::before { content: 'Type body here...'; color: #d4d4d8; }

  /* editable inline */
  .ed { border-bottom: 1px dashed #c4972a; display: inline-block; min-width: 28px; outline: none; padding: 0 2px; }
  .ed:empty::before { content: attr(data-p); color: #d4d4d8; font-style: italic; }
  .ed:focus { background: rgba(196,151,42,0.06); }
  .ed-block { display: block; min-height: 44px; white-space: pre-wrap; }

  /* Signoff */
  .so { padding: 6px 32px 32px; }
  .val-sel {
    font-family: 'Inter', sans-serif; font-size: 13px;
    border: none; border-bottom: 1px dashed #c4972a;
    background: transparent; color: #18181b; cursor: pointer;
    padding: 1px 3px; outline: none; margin-bottom: 36px; display: block;
  }
  .sig-line { border-bottom: 1px solid #18181b; width: 190px; height: 40px; position: relative; margin-bottom: 5px; display: flex; align-items: flex-end; }
  .sig-dots { font-size: 14px; color: #b4b4b4; letter-spacing: 2px; padding-bottom: 4px; }
  .sig-person-name { font-size: 13px; font-weight: 600; color: #18181b; }
  .sig-person-pos { font-size: 12px; color: #71717a; }

  /* Footer */
  .pfoot { background: #fafafa; border-top: 1px solid #e4e4e7; padding: 9px 32px; font-size: 10px; color: #a1a1aa; text-align: center; letter-spacing: 0.3px; }

  @media print {
    .s, .no-print { display: none !important; }
    .lgm { grid-template-columns: 1fr; }
    .pv { padding: 0; }
    .paper { box-shadow: none; border: none; max-width: 100%; }
  }
`;

export default function LetterGenerationModule() {
    const [tab, setTab] = useState('companies');
    const [type, setType] = useState('kra');
    const [companyId, setCompanyId] = useState('');
    const [directorId, setDirectorId] = useState('');
    const [individualId, setIndividualId] = useState('');
    const [valediction, setValediction] = useState('Yours faithfully,');
    const [letterDate, setLetterDate] = useState(todayStr());
    const [directors, setDirectors] = useState([]);

    // Popover states for searchable selects
    const [companyPopoverOpen, setCompanyPopoverOpen] = useState(false);
    const [signatoryPopoverOpen, setSignatoryPopoverOpen] = useState(false);
    const [individualPopoverOpen, setIndividualPopoverOpen] = useState(false);

    // Data fetching states
    const [companies, setCompanies] = useState([]);
    const [individuals, setIndividuals] = useState([]);
    const [directorDocuments, setDirectorDocuments] = useState([]);
    const [loading, setLoading] = useState(true);

    // Fetch data from Supabase
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch companies
                const { data: companiesData, error: companiesError } = await supabase
                    .from('acc_portal_company_duplicate')
                    .select('*')
                    .order('company_name');

                if (companiesError) throw companiesError;

                // Fetch individuals
                const { data: individualsData, error: individualsError } = await supabase
                    .from('registry_individuals')
                    .select('id, full_name, employment_data')
                    .order('full_name');

                if (individualsError) throw individualsError;

                // Fetch director documents (signatures)
                const { data: documentsData, error: documentsError } = await supabase
                    .from('acc_portal_directors_documents')
                    .select('*')
                    .eq('document_type_id', SIGNATURE_DOC_TYPE_ID);

                if (documentsError) throw documentsError;

                setCompanies(companiesData || []);
                setIndividuals(individualsData || []);
                setDirectorDocuments(documentsData || []);
            } catch (error) {
                console.error('Error fetching data:', error);
                toast.error('Failed to load data');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    // Filter individuals linked to selected company (only directors and shareholders)
    const availableSignatories = useMemo(() => {
        if (!companyId) return [];
        return individuals.filter(ind => {
            const associations = ind.employment_data?.associations || [];
            return associations.some(a =>
                a.company_id &&
                a.company_id.toString() === companyId.toString() &&
                (a.individual_type === "Director" || a.individual_type === "Shareholder")
            );
        });
    }, [individuals, companyId]);

    // Update directors when company changes
    useEffect(() => {
        if (companyId) {
            const signatories = availableSignatories.map(ind => {
                const assoc = ind.employment_data?.associations?.find(
                    a => a.company_id &&
                        a.company_id.toString() === companyId.toString() &&
                        (a.individual_type === "Director" || a.individual_type === "Shareholder")
                );

                // Find signature for this individual
                const signatureDoc = directorDocuments.find(doc =>
                    doc.individual_id === ind.id &&
                    doc.document_type_id === SIGNATURE_DOC_TYPE_ID
                );

                return {
                    individual_id: ind.id,
                    name: ind.full_name,
                    position: assoc?.individual_type || "Director",
                    signature_url: signatureDoc?.document_url || null
                };
            });
            setDirectors(signatories);
            setDirectorId(signatories[0]?.individual_id || '');
        } else {
            setDirectors([]);
            setDirectorId('');
        }
    }, [companyId, availableSignatories, directorDocuments]);

    const company = companies.find(c => c.id.toString() === companyId) || null;
    const director = directors.find(d => d.individual_id === directorId) || null;
    const individual = individuals.find(i => i.id === individualId) || null;

    const ready = tab === 'companies' ? !!company : !!individual;
    const signName = tab === 'companies' ? director?.name : individual?.full_name;
    const signPos = tab === 'companies' ? (director?.position || '') : 'Individual';

    const renderHeader = () => {
        if (tab === 'companies' && company) {
            if (type === 'kra') return (
                <div className="kra-h">
                    <div className="kra-name">{company.company_name}</div>
                    <div className="kra-meta">
                        <span>EMAIL: {company.kra_email_address || '---'} M NO: {company.contact_details?.[0]?.office_phone_number || '---'}</span>
                        <span>P.O. BOX - {company.postal_address_details?.[0]?.full_postal_address || '---'}</span>
                    </div>
                </div>
            );
            return (
                <div className="gen-h">
                    <div className="gen-name">{company.company_name}</div>
                    <div className="gen-meta">
                        <div>EMAIL: {company.contact_details?.[0]?.current_communication_email || company.kra_email_address || '---'} M NO: {company.contact_details?.[0]?.office_phone_number || '---'}</div>
                        <div>P.O. BOX - {company.postal_address_details?.[0]?.full_postal_address || '---'}, {company.postal_address_details?.[0]?.postal_town || 'NAIROBI'}, {company.postal_address_details?.[0]?.postal_country || 'KENYA'}</div>
                        <div>Physical Address: {company.physical_address_details?.[0]?.full_physical_address || '---'}, {company.physical_address_details?.[0]?.physical_town || 'NAIROBI'}, {company.physical_address_details?.[0]?.physical_country || 'KENYA'}</div>
                    </div>
                </div>
            );
        }
        if (tab === 'individuals' && individual) return (
            <div className="ind-h">
                <div className="ind-name">{individual.full_name}</div>
                <div className="ind-sub">
                    {individual.id_number && <span>ID: {individual.id_number}</span>}
                    {individual.kra_pin && <span>KRA PIN: {individual.kra_pin}</span>}
                </div>
            </div>
        );
        return null;
    };

    const footerText = () => {
        if (company) return [company.contact_details?.[0]?.current_communication_email, company.contact_details?.[0]?.office_phone_number && `Tel: ${company.contact_details[0].office_phone_number}`, company.postal_address_details?.[0]?.full_postal_address && `P.O. Box ${company.postal_address_details[0].full_postal_address}`].filter(Boolean).join('  ·  ');
        if (individual) return [individual.full_name, individual.kra_pin && `KRA PIN: ${individual.kra_pin}`].filter(Boolean).join('  ·  ');
        return '';
    };

    return (
        <>
            <style>{css}</style>
            <div className="lgm">

                {/* ── SIDEBAR ── */}
                <Card className="s border-0 shadow-lg">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <FileText className="text-blue-600 h-6 w-6" />
                            <h2 className="text-xl font-bold">Letter Generator</h2>
                        </div>

                        <Tabs value={tab} onValueChange={setTab} className="w-full">
                            <TabsList className="grid w-full grid-cols-2 mb-6">
                                <TabsTrigger value="companies" className="flex items-center gap-2">
                                    <Building2 className="h-4 w-4" />
                                    Companies
                                </TabsTrigger>
                                <TabsTrigger value="individuals" className="flex items-center gap-2">
                                    <User className="h-4 w-4" />
                                    Individuals
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="companies" className="space-y-4">
                                <div>
                                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Letter Type</Label>
                                    <div className="flex gap-2">
                                        <Button
                                            variant={type === 'kra' ? 'default' : 'outline'}
                                            className="flex-1"
                                            onClick={() => setType('kra')}
                                        >
                                            🏛 KRA
                                        </Button>
                                        <Button
                                            variant={type === 'general' ? 'default' : 'outline'}
                                            className="flex-1"
                                            onClick={() => setType('general')}
                                        >
                                            📝 General
                                        </Button>
                                    </div>
                                </div>

                                <div>
                                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Company</Label>
                                    <Popover open={companyPopoverOpen} onOpenChange={setCompanyPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className="w-full justify-between"
                                            >
                                                {companyId
                                                    ? companies.find((c) => c.id.toString() === companyId)?.company_name
                                                    : "Search companies..."}
                                                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-full p-0">
                                            <Command>
                                                <CommandInput placeholder="Search companies..." />
                                                <CommandEmpty>No company found.</CommandEmpty>
                                                <CommandList>
                                                    <CommandGroup>
                                                        {companies.map((c) => (
                                                            <CommandItem
                                                                key={c.id}
                                                                value={c.company_name}
                                                                onSelect={() => {
                                                                    setCompanyId(c.id.toString());
                                                                    setCompanyPopoverOpen(false);
                                                                }}
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        companyId === c.id.toString() ? "opacity-100" : "opacity-0"
                                                                    )}
                                                                />
                                                                {c.company_name}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                {company && (
                                    <>
                                        <div>
                                            <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Signatory</Label>
                                            <Popover open={signatoryPopoverOpen} onOpenChange={setSignatoryPopoverOpen}>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        role="combobox"
                                                        className="w-full justify-between"
                                                    >
                                                        {directorId
                                                            ? directors.find((d) => d.individual_id === directorId)?.name
                                                            : "Search signatories..."}
                                                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-full p-0">
                                                    <Command>
                                                        <CommandInput placeholder="Search signatories..." />
                                                        <CommandEmpty>No signatory found.</CommandEmpty>
                                                        <CommandList>
                                                            <CommandGroup>
                                                                {directors.map((d) => (
                                                                    <CommandItem
                                                                        key={d.individual_id}
                                                                        value={d.name}
                                                                        onSelect={() => {
                                                                            setDirectorId(d.individual_id);
                                                                            setSignatoryPopoverOpen(false);
                                                                        }}
                                                                    >
                                                                        <Check
                                                                            className={cn(
                                                                                "mr-2 h-4 w-4",
                                                                                directorId === d.individual_id ? "opacity-100" : "opacity-0"
                                                                            )}
                                                                        />
                                                                        <div className="flex flex-col">
                                                                            <span>{d.name}</span>
                                                                            <span className="text-xs text-muted-foreground capitalize">
                                                                                {d.position}
                                                                            </span>
                                                                        </div>
                                                                    </CommandItem>
                                                                ))}
                                                            </CommandGroup>
                                                        </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                        </div>

                                        {director && (
                                            <Card className="border bg-gray-50">
                                                <CardContent className="p-4">
                                                    <div className="font-semibold text-sm">{director.name}</div>
                                                    <div className="text-xs text-gray-600 mt-1">{director.position}</div>
                                                    <div className="mt-3 h-8 border border-dashed border-gray-300 rounded flex items-center justify-center">
                                                        {director.signature_url ? (
                                                            <img
                                                                src={director.signature_url}
                                                                alt={`${director.name}'s signature`}
                                                                className="max-h-full max-w-full object-contain"
                                                            />
                                                        ) : (
                                                            <span className="text-xs text-gray-500">No signature on file</span>
                                                        )}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}
                                    </>
                                )}
                            </TabsContent>

                            <TabsContent value="individuals" className="space-y-4">
                                <div>
                                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Letter Type</Label>
                                    <div className="flex gap-2">
                                        <Button
                                            variant={type === 'kra' ? 'default' : 'outline'}
                                            className="flex-1"
                                            onClick={() => setType('kra')}
                                        >
                                            🏛 KRA
                                        </Button>
                                        <Button
                                            variant={type === 'general' ? 'default' : 'outline'}
                                            className="flex-1"
                                            onClick={() => setType('general')}
                                        >
                                            📝 General
                                        </Button>
                                    </div>
                                </div>

                                <div>
                                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Individual</Label>
                                    <Popover open={individualPopoverOpen} onOpenChange={setIndividualPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className="w-full justify-between"
                                            >
                                                {individualId
                                                    ? individuals.find((i) => i.id === individualId)?.full_name
                                                    : "Search individuals..."}
                                                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-full p-0">
                                            <Command>
                                                <CommandInput placeholder="Search individuals..." />
                                                <CommandEmpty>No individual found.</CommandEmpty>
                                                <CommandList>
                                                    <CommandGroup>
                                                        {individuals.map((i) => (
                                                            <CommandItem
                                                                key={i.id}
                                                                value={i.full_name}
                                                                onSelect={() => {
                                                                    setIndividualId(i.id);
                                                                    setIndividualPopoverOpen(false);
                                                                }}
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        individualId === i.id ? "opacity-100" : "opacity-0"
                                                                    )}
                                                                />
                                                                {i.full_name}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </TabsContent>
                        </Tabs>

                        {ready && (
                            <>
                                <div className="border-t pt-4">
                                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Date</Label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <Input
                                            value={letterDate}
                                            onChange={(e) => setLetterDate(e.target.value)}
                                            placeholder="Select date"
                                            className="pl-10"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="flex-1" />

                        {ready && (
                            <div className="space-y-2 border-t pt-4">
                                <Button className="w-full" onClick={() => window.print()}>
                                    <Printer className="mr-2 h-4 w-4" />
                                    Print / Save PDF
                                </Button>
                                <Button variant="outline" className="w-full" onClick={() => navigator.clipboard.writeText(document.getElementById('the-paper')?.innerText || '')}>
                                    <Copy className="mr-2 h-4 w-4" />
                                    Copy Text
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* ── PREVIEW ── */}
                <div className="pv">
                    {!ready ? (
                        <div className="pv-empty">
                            <div className="pv-empty-icon">📄</div>
                            <div className="pv-empty-text">Select a {tab === 'companies' ? 'company' : 'individual'} to preview</div>
                        </div>
                    ) : (
                        <div className="paper" id="the-paper">
                            {renderHeader()}

                            <div className="lb">
                                <div className="l-date">{letterDate}</div>

                                <div className="l-ref" style={{ marginBottom: 4 }}>
                                    <b>REF: </b>
                                    <span className="ed" contentEditable suppressContentEditableWarning data-p="e.g. ABC/KRA/001/2026" />
                                </div>

                                <div style={{ marginBottom: 18 }}>
                                    <div className="l-to-label">TO:</div>
                                    <div className="ed ed-block" contentEditable suppressContentEditableWarning data-p={type === 'kra' ? 'The Commissioner,\nKenya Revenue Authority,\nNairobi.' : 'Recipient name / address'} />
                                </div>

                                <div className="l-subj">
                                    RE: <span className="ed" contentEditable suppressContentEditableWarning data-p="Enter subject" />
                                </div>

                                <div className="l-content" contentEditable suppressContentEditableWarning />
                            </div>

                            <div className="so">
                                <select className="val-sel" value={valediction} onChange={e => setValediction(e.target.value)}>
                                    {VALEDICTIONS.map(v => <option key={v}>{v}</option>)}
                                </select>
                                <div className="sig-line">
                                    <div className="sig-dots">……………………………</div>
                                </div>
                                <div className="sig-person-name">{signName || '—'}</div>
                                <div className="sig-person-pos">{signPos}</div>
                            </div>

                            <div className="pfoot">{footerText()}</div>
                        </div>
                    )}
                </div>

            </div>
        </>
    );
}