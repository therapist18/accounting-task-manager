import React from 'react';
import { Mail, Phone, MapPin } from 'lucide-react';
import { cn } from "@/lib/utils";
import type { Company } from '../../companies/database';
import type { Individual } from '../../individuals/database';
import type { Signatory } from '../hooks/useLetterData';
import type { IndividualIdInfo } from '../hooks/useIndividualIdentificationNumbers';
import { getBclContactDetails, resolveCompanyKraEmail, resolveCompanyKraPin, resolveIndividualEmail, resolveIndividualKraPin } from '../utils/contactDetails';

interface KRALetterLayoutProps {
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
    kraPin?: string;
}

export function KRALetterLayout({
    tab,
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
    individualIdInfo,
    kraPin: kraPinProp = ''
}: KRALetterLayoutProps) {
    const bclContact = getBclContactDetails();
    const entityName = tab === 'companies' ? selectedCompany?.company_name : selectedIndividual?.full_name;
    const displayEmail = tab === 'companies'
        ? resolveCompanyKraEmail(selectedCompany, email)
        : resolveIndividualEmail(selectedIndividual, email);
    const kraPin = tab === 'companies'
        ? resolveCompanyKraPin(selectedCompany, kraPinProp)
        : resolveIndividualKraPin(selectedIndividual, kraPinProp);
    const regNumber = tab === 'companies' ? (selectedCompany?.registration_number || '') : '';
    const footerLine = [regNumber && `Reg. No. ${regNumber}`, 'Nairobi, Kenya', 'Confidential']
        .filter(Boolean)
        .join('   •   ');

    return (
        <div className="text-[14px] text-slate-800 leading-relaxed">
            <div className="text-center mb-10">
                <h2 className="font-serif text-[26px] font-bold text-slate-900 uppercase tracking-[0.5px] mb-3">
                    {entityName}
                </h2>
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                        <Mail className="w-3 h-3 text-slate-400" /> {displayEmail}
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-slate-400" /> {bclContact.phone}
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-slate-400" /> {bclContact.address.toUpperCase()}
                    </span>
                </div>
                {kraPin && (
                    <p className="mt-2.5 text-[11px] font-bold text-slate-700 tracking-wider">KRA PIN: {kraPin}</p>
                )}
                <div className="mt-5 h-[3px] bg-slate-900" />
                <div className="mt-[3px] h-[1px] bg-slate-300" />
            </div>

            <div className="mb-6 text-right text-[13px] font-semibold text-slate-700">
                {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>

            <div className="mb-6 whitespace-pre-wrap outline-none focus:bg-blue-50/50 p-3 -mx-3 rounded transition-colors" contentEditable suppressContentEditableWarning>
                {recipient}
            </div>

            <div className="mb-6 font-semibold text-[14px]">Dear Sir/Madam,</div>

            <div className="mb-10 uppercase font-black text-[15px] underline decoration-2 underline-offset-4">
                RE: <span contentEditable suppressContentEditableWarning className="outline-none focus:bg-blue-50/50 px-1 -mx-1 rounded">{subject}</span>
            </div>

            <div className="min-h-[400px] whitespace-pre-wrap outline-none focus:bg-blue-50/50 p-3 -mx-3 rounded mb-8 text-[14px] leading-relaxed transition-colors" contentEditable suppressContentEditableWarning>
                I am writing on behalf of the company to request for the issuance of a Tax Compliance Certificate.
                All relevant returns have been filed and payments made up to date.{"\n\n"}
                Your prompt assistance in this matter will be highly appreciated.
            </div>

            <div className="space-y-12">
                <div className="outline-none font-bold focus:bg-blue-50/50 px-2 -mx-2 rounded transition-colors" contentEditable suppressContentEditableWarning>{valediction}</div>

                <div className="space-y-2">
                    <div className="w-72 border-b-2 border-slate-900 relative h-24 flex items-end">
                        {tab === 'companies' && activeSignatory?.signatureUrl && (
                            <img
                                key={`sig-${activeSignatory.id}`}
                                src={activeSignatory.signatureUrl}
                                alt={`${activeSignatory.name} signature`}
                                className="absolute bottom-2 left-0 h-32 max-w-full object-contain mix-blend-multiply hover:grayscale-0 transition-all duration-200"
                                crossOrigin="anonymous"
                            />
                        )}
                    </div>
                    <div className="font-black uppercase text-[16px] text-slate-900">
                        {tab === 'companies' ? (activeSignatory?.name || '____________________') : selectedIndividual?.full_name}
                    </div>
                    <div className="text-[11px] text-slate-600 font-bold uppercase tracking-wider italic">
                        {tab === 'companies' ? (activeSignatory?.position || 'Directors') : 'Applicant'}
                    </div>
                    {tab === 'individuals' && individualIdInfo && (
                        <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                            {individualIdInfo.label}: {individualIdInfo.value}
                        </div>
                    )}
                </div>
            </div>

            {/* Bleeds to the page edge against the paperRef wrapper's own p-16
                padding (see letters/page.tsx), matching the flanking-line
                footer band motif of the sample letterhead designs. */}
            <div className="mt-14 -mx-16 -mb-16 px-16 py-4 bg-slate-100 border-t border-slate-200">
                <div className="flex items-center justify-center gap-4">
                    <span className="h-px flex-1 max-w-[140px] bg-slate-300" />
                    <span className="text-[10px] font-semibold uppercase tracking-[2.5px] text-slate-500 text-center whitespace-nowrap">
                        {footerLine}
                    </span>
                    <span className="h-px flex-1 max-w-[140px] bg-slate-300" />
                </div>
            </div>
        </div>
    );
}
