// @ts-nocheck
import React from 'react';
import { cn } from "@/lib/utils";
import type { Company } from '../../companies/database';
import type { Individual } from '../../individuals/database';
import type { Signatory } from '../hooks/useLetterData';
import type { IndividualIdInfo } from '../hooks/useIndividualIdentificationNumbers';
import {
    getBclContactDetails,
    resolveCompanyGeneralEmail,
    resolveCompanyKraPin,
    resolveCompanyPhone,
    resolveIndividualEmail,
    resolveIndividualKraPin,
    resolveIndividualPhone,
} from '../utils/contactDetails';

export type LetterTheme = 'dark-teal' | 'corporate-blue' | 'bold-violet' | 'classic-serif';

function todayStr(): string {
    return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const DEFAULT_BODY = `I am writing on behalf of the company to request for the issuance of a Tax Compliance Certificate.\nAll relevant returns have been filed and payments made up to date.\n\nYour prompt assistance in this matter will be highly appreciated.`;

// ── Contact detail resolvers ────────────────────────────────────────────────

function legacyResolveCompanyEmail(company: Company, fallback = ''): string {
    if (company?.kra_email_address) return company.kra_email_address;
    const cd = Array.isArray(company?.contact_details)
        ? company.contact_details[0]
        : company?.contact_details;
    return cd?.current_communication_email
        || cd?.alternative_email_address
        || cd?.email
        || fallback;
}

function legacyResolveCompanyPhone(company: Company, fallback = ''): string {
    const cd = Array.isArray(company?.contact_details)
        ? company.contact_details[0]
        : company?.contact_details;
    return cd?.phone || cd?.mobile || cd?.telephone || cd?.office_phone
        || company?.phone || company?.office_phone
        || fallback;
}

function legacyResolveIndividualEmail(individual: Individual, fallback = ''): string {
    const cd = Array.isArray(individual?.contact_details)
        ? individual.contact_details[0]
        : individual?.contact_details;
    return cd?.email || cd?.current_communication_email || fallback;
}

function legacyResolveIndividualPhone(individual: Individual, fallback = ''): string {
    const cd = Array.isArray(individual?.contact_details)
        ? individual.contact_details[0]
        : individual?.contact_details;
    return cd?.phone || cd?.mobile || cd?.telephone || fallback;
}

// ── Footer designs ──────────────────────────────────────────────────────────

interface FooterProps {
    entityName?: string;
    regNumber?: string;
    kraPin?: string;
    accentColor?: string;  // tailwind bg class for the thin bar
    theme: LetterTheme;
}

function LetterFooter({ entityName, regNumber, kraPin, theme }: FooterProps) {
    const baseWrap = "px-10 py-4 border-t";

    if (theme === 'dark-teal') {
        return (
            <div className={cn(baseWrap, "border-slate-200 bg-slate-900 flex items-center justify-between gap-4")}>
                <div className="flex items-center gap-3">
                    <div className="flex gap-[3px]">
                        {[1, 0.5, 0.2].map((o, i) => (
                            <span key={i} className="w-[4px] h-[4px] rounded-full bg-teal-400" style={{ opacity: o }} />
                        ))}
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-[1.5px] text-white/40">{entityName}</span>
                </div>
                <div className="flex items-center gap-4 text-[9.5px] uppercase tracking-[1px]">
                    {kraPin && <span className="text-teal-400/70 font-mono font-medium">PIN: {kraPin}</span>}
                    {regNumber && <span className="text-white/20">|</span>}
                    {regNumber && <span className="text-white/30 font-mono">Reg: {regNumber}</span>}
                    <span className="text-white/20">|</span>
                    <span className="text-white/30">Nairobi, Kenya</span>
                    <span className="text-white/20">|</span>
                    <span className="text-white/25 italic">Confidential</span>
                </div>
            </div>
        );
    }

    if (theme === 'corporate-blue') {
        return (
            <div className={cn(baseWrap, "border-slate-200 bg-white")}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-[20px] w-[3px] bg-blue-700 rounded-sm" />
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-slate-700">{entityName}</span>
                            {kraPin && <span className="text-[9px] font-mono text-blue-600 tracking-wide">KRA PIN: {kraPin}</span>}
                        </div>
                    </div>
                    <div className="flex items-center gap-3 text-[9.5px] text-slate-400">
                        {regNumber && <span className="font-mono">Reg: {regNumber}</span>}
                        <span className="text-slate-200">|</span>
                        <span>Nairobi, Kenya</span>
                        <span className="text-slate-200">|</span>
                        <span className="italic text-slate-300">Confidential</span>
                    </div>
                </div>
                <div className="mt-3 h-[2px] bg-blue-700 rounded-sm" />
                <div className="mt-[2px] h-[0.5px] bg-slate-100" />
            </div>
        );
    }

    if (theme === 'bold-violet') {
        return (
            <div className="bg-gradient-to-r from-violet-700 to-indigo-600 px-10 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-white/70 uppercase tracking-[1.5px]">{entityName}</span>
                    {kraPin && <span className="text-[9px] bg-white/10 text-violet-200 font-mono px-2 py-[2px] rounded-full">PIN: {kraPin}</span>}
                </div>
                <div className="flex items-center gap-3 text-[9.5px] text-white/40 uppercase tracking-[1px]">
                    {regNumber && <span className="font-mono text-white/50">Reg: {regNumber}</span>}
                    <span>·</span>
                    <span>Nairobi, Kenya</span>
                    <span>·</span>
                    <span className="italic text-violet-200/50">Confidential</span>
                </div>
            </div>
        );
    }

    // Classic serif
    return (
        <div className={cn(baseWrap, "border-stone-300 bg-white")}>
            <div className="h-[0.5px] bg-stone-200 mb-3" />
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                    <span className="font-serif text-[11px] font-semibold text-stone-700 tracking-wide">{entityName}</span>
                    {kraPin && <span className="text-[9px] font-mono text-stone-400">KRA PIN: {kraPin}</span>}
                </div>
                <div className="flex items-center gap-3 text-[9.5px] text-stone-300 italic">
                    {regNumber && <span className="font-mono not-italic text-stone-400">Reg: {regNumber}</span>}
                    <span>·</span>
                    <span>Nairobi, Kenya</span>
                    <span>·</span>
                    <span>Confidential</span>
                </div>
            </div>
        </div>
    );
}

// ── Props ───────────────────────────────────────────────────────────────────

interface GeneralLetterLayoutProps {
    tab: 'companies' | 'individuals';
    selectedCompany?: Company;
    selectedIndividual?: Individual;
    email: string;
    phone: string;
    letterDate: string;
    reference: string;
    recipient: string;
    subject: string;
    valediction: string;
    activeSignatory?: Signatory;
    individualIdInfo?: IndividualIdInfo | null;
    useLetterhead?: boolean;
    headerUrl?: string | null;
    footerUrl?: string | null;
    headerImageUrl?: string;
    footerImageUrl?: string;
    theme?: LetterTheme;
    isCleared?: boolean;
    kraPin?: string;
}

export function GeneralLetterLayout({
    tab,
    selectedCompany,
    selectedIndividual,
    email: emailProp,
    phone: phoneProp,
    letterDate,
    reference,
    recipient,
    subject,
    valediction,
    activeSignatory,
    individualIdInfo,
    useLetterhead = false,
    headerUrl = null,
    footerUrl = null,
    headerImageUrl = '',
    footerImageUrl = '',
    theme = 'dark-teal',
    isCleared = false,
    kraPin: kraPinProp = '',
}: GeneralLetterLayoutProps) {
    const bclContact = getBclContactDetails();
    const entityName = tab === 'companies'
        ? selectedCompany?.company_name
        : selectedIndividual?.full_name;

    // Resolve actual contact details from records
    const resolvedEmail = tab === 'companies'
        ? resolveCompanyGeneralEmail(selectedCompany!, emailProp)
        : resolveIndividualEmail(selectedIndividual!, emailProp);

    const resolvedPhone = tab === 'companies'
        ? resolveCompanyPhone(selectedCompany!, phoneProp)
        : resolveIndividualPhone(selectedIndividual!, phoneProp);

    const kraPin = tab === 'companies'
        ? resolveCompanyKraPin(selectedCompany, kraPinProp)
        : resolveIndividualKraPin(selectedIndividual, kraPinProp);

    const regNumber = tab === 'companies'
        ? (selectedCompany?.registration_number || '')
        : '';

    // ── Letterhead image overrides ────────────────────────────────────────

    const LetterheadHeader = () => {
        if (!useLetterhead || (!headerImageUrl && !headerUrl)) return null;
        return (
            <div>
                {headerImageUrl?.startsWith('data:text/html') ? (
                    <iframe src={headerImageUrl} className="w-full h-40 border-0" title="Letterhead Header Preview" />
                ) : (
                    <img
                        src={headerImageUrl || headerUrl || ''}
                        alt="Company Letterhead Header"
                        className="w-full h-auto max-h-[200px] object-contain"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                )}
                <div className="px-10 py-1.5 bg-blue-50 border-b border-blue-100">
                    <p className="text-[11px] text-blue-600 font-medium">
                        📄 Letterhead header — merges on download.
                    </p>
                </div>
            </div>
        );
    };

    const LetterheadFooter = () => {
        if (!useLetterhead || (!footerImageUrl && !footerUrl)) return null;
        return (
            <div className="border-t border-slate-200 bg-slate-50">
                {footerImageUrl?.startsWith('data:text/html') ? (
                    <iframe src={footerImageUrl} className="w-full h-28 border-0" title="Letterhead Footer Preview" />
                ) : (
                    <img
                        src={footerImageUrl || footerUrl || ''}
                        alt="Company Letterhead Footer"
                        className="w-full h-auto"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                )}
            </div>
        );
    };

    // ── Shared sub-components ─────────────────────────────────────────────

    const RecipientBlock = ({ className = '' }) => (
        <div
            className={cn("whitespace-pre-wrap outline-none focus:bg-blue-50/30 px-2 -mx-2 rounded transition-colors", className)}
            contentEditable suppressContentEditableWarning
        >{recipient}</div>
    );

    const SubjectSpan = ({ className = '' }) => (
        <span
            className={cn("outline-none focus:bg-yellow-50/50 px-1 -mx-1 rounded", className)}
            contentEditable suppressContentEditableWarning
        >{subject}</span>
    );

    // Body is always present and editable; default text is shown when not cleared
    const BodyBlock = ({ className = '' }) => (
        <div
            className={cn(
                "whitespace-pre-wrap outline-none border border-transparent focus:border-slate-200 focus:bg-slate-50/50 px-3 -mx-3 rounded-md transition-all",
                className
            )}
            contentEditable suppressContentEditableWarning
        >{!isCleared ? DEFAULT_BODY : ''}</div>
    );

    const ValedictionBlock = ({ className = '' }) => (
        <div
            className={cn("outline-none focus:bg-blue-50/30 px-2 -mx-2 rounded transition-colors", className)}
            contentEditable suppressContentEditableWarning
        >{valediction}</div>
    );

    const SignatureBlock = ({ nameClass = '', roleClass = '' }) => (
        <div className="space-y-1.5">
            <div className="relative w-52 h-14 border-b-2 border-current flex items-end">
                {tab === 'companies' && activeSignatory?.signatureUrl && (
                    <img
                        key={`sig-${activeSignatory.id}`}
                        src={activeSignatory.signatureUrl}
                        alt={`${activeSignatory.name} signature`}
                        className="absolute bottom-1 left-0 h-12 max-w-full object-contain mix-blend-multiply"
                        crossOrigin="anonymous"
                    />
                )}
            </div>
            <div className={cn("font-bold uppercase tracking-[0.4px]", nameClass)}>
                {tab === 'companies' ? (activeSignatory?.name || '____________________') : selectedIndividual?.full_name}
            </div>
            <div className={cn("text-[10px] font-semibold uppercase tracking-[2px] italic", roleClass)}>
                {tab === 'companies' ? (activeSignatory?.position || 'Director') : 'Applicant'}
            </div>
            {tab === 'individuals' && individualIdInfo && (
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.5px] opacity-60">
                    {individualIdInfo.label}: {individualIdInfo.value}
                </div>
            )}
        </div>
    );

    // ── Ref strip with PIN ─────────────────────────────────────────────────
    // Shown in all themes; hidden entirely when isCleared

    const RefStrip = ({ bg = 'bg-slate-50', border = 'border-y border-slate-200', textClass = 'text-slate-500', pillClass = 'bg-slate-900 text-teal-400' }) => (
        <div className={cn("flex flex-wrap items-center justify-between gap-2 px-10 py-2.5 text-[10px] font-medium uppercase tracking-[1.5px]", bg, border, textClass)}>
            <span>{todayStr()}</span>
            <div className="flex items-center gap-3">
                <span className={cn("px-3 py-[3px] rounded-full text-[10px] tracking-wide font-medium", pillClass)}>
                    Ref: {reference || '—'}
                </span>
                {kraPin && (
                    <span className={cn("px-3 py-[3px] rounded-full text-[10px] font-mono font-semibold", pillClass)}>
                        PIN: {kraPin}
                    </span>
                )}
            </div>
            <span className="opacity-60"></span>
        </div>
    );

    const footerProps: FooterProps = { entityName, regNumber, kraPin, theme };

    // ══════════════════════════════════════════
    // THEME: DARK TEAL
    // ══════════════════════════════════════════
    if (theme === 'dark-teal') {
        return (
            <div className="font-sans text-[14px] text-slate-800 leading-relaxed overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                {useLetterhead && (headerImageUrl || headerUrl) ? <LetterheadHeader /> : (
                    <div className="relative bg-slate-900 px-10 py-8 flex justify-between items-end overflow-hidden">
                        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-teal-400/10 pointer-events-none" />
                        <div className="absolute -bottom-14 left-16 w-40 h-40 rounded-full bg-teal-400/[0.06] pointer-events-none" />
                        <div className="absolute left-0 inset-y-0 w-[5px] bg-gradient-to-b from-teal-400 to-cyan-600" />
                        <div className="relative z-10">
                            <h2 className="font-serif text-[22px] font-bold text-white tracking-[0.3px] leading-tight">{entityName || 'Company Name'}</h2>
                            <p className="mt-1 text-[10px] font-light tracking-[3px] uppercase text-teal-400">{tab === 'companies' ? 'Registered Entity' : 'Individual Applicant'}</p>
                        </div>
                        <div className="relative z-10 text-right text-[11px] font-normal text-white/50 leading-[1.9]">
                            <p>{bclContact.address}</p>
                            <p>Tel: {resolvedPhone || phoneProp}</p>
                            <p className="text-teal-300 font-medium lowercase">{resolvedEmail || emailProp}</p>
                        </div>
                    </div>
                )}

                {!isCleared && (
                    <RefStrip />
                )}

                <div className="px-10 py-9 bg-white">
                    {!isCleared && (
                        <>
                            <RecipientBlock className="mb-6 text-[13px] text-slate-600 leading-[1.85]" />
                            <div className="mb-4 text-[14px] font-medium text-slate-900">Dear Sir/Madam,</div>
                            <div className="flex items-center gap-3 mb-7 pl-4 py-3 pr-4 bg-teal-50 border-l-[3px] border-teal-500 rounded-r-md">
                                <span className="text-[10px] font-semibold uppercase tracking-[1.5px] text-cyan-700 whitespace-nowrap">Re:</span>
                                <SubjectSpan className="text-[13.5px] font-semibold uppercase text-slate-900 underline decoration-teal-400 underline-offset-[3px]" />
                            </div>
                        </>
                    )}
                    <BodyBlock className="min-h-[200px] mb-8 text-[13.5px] text-slate-600 leading-[1.9]" />
                    {!isCleared && (
                        <>
                            <div className="h-px my-7 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
                            <ValedictionBlock className="mb-8 text-[13.5px] text-slate-800" />
                            <SignatureBlock nameClass="font-serif text-[16px] text-slate-900" roleClass="text-slate-500" />
                        </>
                    )}
                </div>

                {useLetterhead && (footerImageUrl || footerUrl)
                    ? <LetterheadFooter />
                    : <LetterFooter {...footerProps} />
                }
            </div>
        );
    }

    // ══════════════════════════════════════════
    // THEME: CORPORATE BLUE
    // ══════════════════════════════════════════
    if (theme === 'corporate-blue') {
        return (
            <div className="font-sans text-[14px] text-slate-800 leading-relaxed overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                {useLetterhead && (headerImageUrl || headerUrl) ? <LetterheadHeader /> : (
                    <div className="px-10 pt-8 pb-0 bg-white">
                        <div className="flex justify-between items-start">
                            <div>
                                <h2 className="text-[22px] font-bold text-slate-900 tracking-tight leading-tight">{entityName || 'Company Name'}</h2>
                                <p className="mt-1.5 text-[10px] font-semibold tracking-[2px] uppercase text-blue-700">Ref: {reference || '—'}</p>
                            </div>
                            <div className="text-right text-[10.5px] text-slate-500 leading-[1.9]">
                                <p>{bclContact.address}</p>
                                <p>Tel: {resolvedPhone || phoneProp}</p>
                                <p className="text-blue-600 font-semibold lowercase">{resolvedEmail || emailProp}</p>
                            </div>
                        </div>
                        <div className="mt-6 h-[3px] bg-blue-700 rounded-sm" />
                        <div className="mt-[2px] h-[0.5px] bg-slate-200" />
                    </div>
                )}

                {!isCleared && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-10 py-2 bg-blue-50 border-b border-blue-100 text-[10px] font-medium uppercase tracking-[1.2px] text-blue-700">
                        <span>{todayStr()}</span>
                        <div className="flex gap-3">
                            {kraPin && <span className="font-mono bg-blue-700 text-white px-3 py-[3px] rounded-full">PIN: {kraPin}</span>}
                        </div>
                        <span className="text-blue-400"></span>
                    </div>
                )}

                <div className="px-10 py-9 bg-white">
                    {!isCleared && (
                        <>
                            <RecipientBlock className="mb-6 text-[13px] text-slate-600 leading-[1.85]" />
                            <div className="mb-4 text-[14px] font-medium text-slate-900">Dear Sir/Madam,</div>
                            <div className="mb-7">
                                <span className="font-bold text-[14px] text-blue-700 uppercase tracking-wider underline decoration-blue-300 underline-offset-4">
                                    Re: <SubjectSpan />
                                </span>
                            </div>
                        </>
                    )}
                    <BodyBlock className="min-h-[200px] mb-8 text-[13.5px] text-slate-600 leading-[1.9]" />
                    {!isCleared && (
                        <>
                            <div className="h-px my-7 bg-slate-100" />
                            <ValedictionBlock className="mb-8 text-[13.5px] text-slate-800" />
                            <SignatureBlock nameClass="text-[15px] text-slate-900" roleClass="text-slate-400" />
                        </>
                    )}
                </div>

                {useLetterhead && (footerImageUrl || footerUrl)
                    ? <LetterheadFooter />
                    : <LetterFooter {...footerProps} />
                }
            </div>
        );
    }

    // ══════════════════════════════════════════
    // THEME: BOLD VIOLET
    // ══════════════════════════════════════════
    if (theme === 'bold-violet') {
        return (
            <div className="font-sans text-[14px] text-slate-800 leading-relaxed overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                {useLetterhead && (headerImageUrl || headerUrl) ? <LetterheadHeader /> : (
                    <div className="bg-gradient-to-r from-violet-700 to-indigo-600 px-10 py-8 flex justify-between items-center">
                        <div>
                            <h2 className="text-[22px] font-bold text-white leading-tight tracking-tight">{entityName || 'Company Name'}</h2>
                            <p className="mt-1 text-[10px] font-light tracking-[3px] uppercase text-violet-300">{tab === 'companies' ? 'Registered Entity' : 'Individual Applicant'}</p>
                        </div>
                        <div className="text-right text-[10.5px] text-white/60 leading-[1.9]">
                            <p>{bclContact.address}</p>
                            <p>Tel: {resolvedPhone || phoneProp}</p>
                            <p className="text-violet-200 font-medium lowercase">{resolvedEmail || emailProp}</p>
                        </div>
                    </div>
                )}

                {!isCleared && (
                    <div className="flex flex-wrap items-center gap-4 px-10 py-2.5 bg-violet-50 border-b border-violet-100 text-[10px] text-violet-700 font-medium uppercase tracking-[1.2px]">
                        <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
                            {todayStr()}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
                            Ref: {reference || '—'}
                        </span>
                        {kraPin && (
                            <span className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
                                PIN: {kraPin}
                            </span>
                        )}
                    </div>
                )}

                <div className="px-10 py-9 bg-white">
                    {!isCleared && (
                        <>
                            <RecipientBlock className="mb-6 text-[13px] text-slate-600 leading-[1.85]" />
                            <div className="mb-4 text-[14px] font-medium text-slate-900">Dear Sir/Madam,</div>
                            <div className="mb-7 bg-fuchsia-50 border border-fuchsia-100 rounded-lg p-4">
                                <div className="text-[9px] font-bold uppercase tracking-[1.5px] text-violet-500 mb-1">Subject</div>
                                <SubjectSpan className="text-[13.5px] font-bold uppercase text-indigo-900" />
                            </div>
                        </>
                    )}
                    <BodyBlock className="min-h-[200px] mb-8 text-[13.5px] text-slate-600 leading-[1.9]" />
                    {!isCleared && (
                        <>
                            <div className="h-px my-7 bg-gradient-to-r from-violet-200 via-indigo-100 to-transparent" />
                            <ValedictionBlock className="mb-8 text-[13.5px] text-slate-800" />
                            <SignatureBlock nameClass="text-[15px] text-indigo-900" roleClass="text-violet-400" />
                        </>
                    )}
                </div>

                {useLetterhead && (footerImageUrl || footerUrl)
                    ? <LetterheadFooter />
                    : <LetterFooter {...footerProps} />
                }
            </div>
        );
    }

    // ══════════════════════════════════════════
    // THEME: CLASSIC SERIF
    // ══════════════════════════════════════════
    return (
        <div className="font-serif text-[14px] text-stone-800 leading-relaxed overflow-hidden rounded-xl border border-stone-200 shadow-sm">
            {useLetterhead && (headerImageUrl || headerUrl) ? <LetterheadHeader /> : (
                <div className="px-10 pt-8 pb-4 bg-white">
                    <div className="flex justify-between items-start">
                        <h2 className="font-serif text-[24px] font-semibold text-stone-900 tracking-[0.3px] leading-tight">{entityName || 'Company Name'}</h2>
                        <div className="text-right text-[10.5px] text-stone-500 leading-[1.9]">
                            <p>{bclContact.address}</p>
                            <p>Tel: {resolvedPhone || phoneProp}</p>
                            <p className="text-stone-700 lowercase">{resolvedEmail || emailProp}</p>
                        </div>
                    </div>
                    <div className="mt-5 h-[1.5px] bg-stone-900" />
                    <div className="mt-[3px] h-[0.5px] bg-stone-300" />
                </div>
            )}

            {!isCleared && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-10 py-2 bg-stone-50 border-b border-stone-200 text-[10px] font-medium uppercase tracking-[1.5px] text-stone-500">
                    <span className="italic font-serif normal-case text-[11px]">{todayStr()}</span>
                    <div className="flex items-center gap-3">
                        <span className="bg-stone-900 text-stone-100 px-3 py-[3px] rounded-full font-sans">Ref: {reference || '—'}</span>
                        {kraPin && <span className="bg-stone-900 text-stone-100 px-3 py-[3px] rounded-full font-mono font-sans">PIN: {kraPin}</span>}
                    </div>
                    <span className="opacity-40"></span>
                </div>
            )}

            <div className="px-10 py-9 bg-white">
                {!isCleared && (
                    <>
                        <RecipientBlock className="mb-6 text-[13px] text-stone-600 leading-[1.85] font-sans" />
                        <div className="mb-4 text-[14px] text-stone-900">Dear Sir/Madam,</div>
                        <div className="mb-7">
                            <span className="text-[14px] font-semibold text-stone-900 underline decoration-stone-400 underline-offset-4 tracking-wide">
                                Re: <SubjectSpan />
                            </span>
                        </div>
                    </>
                )}
                <BodyBlock className="min-h-[200px] mb-8 text-[14px] text-stone-600 leading-[2] font-sans" />
                {!isCleared && (
                    <>
                        <div className="h-px my-7 bg-stone-200" />
                        <ValedictionBlock className="mb-8 text-[14px] text-stone-800" />
                        <SignatureBlock nameClass="font-serif text-[16px] text-stone-900" roleClass="text-stone-400 not-italic font-sans" />
                    </>
                )}
            </div>

            {useLetterhead && (footerImageUrl || footerUrl)
                ? <LetterheadFooter />
                : <LetterFooter {...footerProps} />
            }
        </div>
    );
}
