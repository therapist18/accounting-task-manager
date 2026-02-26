import React from 'react';
import { cn } from "@/lib/utils";
import type { Company } from '../../companies/database';
import type { Individual } from '../../individuals/database';
import type { Signatory } from '../hooks/useLetterData';

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
    activeSignatory
}: KRALetterLayoutProps) {
    return (
        <div className="text-[16px] text-slate-800">
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

            <div className="mt-16 space-y-12">
                <div className="outline-none" contentEditable suppressContentEditableWarning>{valediction}</div>

                <div className="space-y-1">
                    <div className="w-64 border-b border-slate-900 relative h-20 flex items-end mb-4">
                        {tab === 'companies' && activeSignatory?.signatureUrl && (
                            <img
                                key={`sig-${activeSignatory.id}`}
                                src={activeSignatory.signatureUrl}
                                alt={`${activeSignatory.name} signature`}
                                className="absolute bottom-1 left-0 h-28 object-contain mix-blend-multiply grayscale hover:grayscale-0 transition-all"
                                crossOrigin="anonymous"
                            />
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
    );
}
