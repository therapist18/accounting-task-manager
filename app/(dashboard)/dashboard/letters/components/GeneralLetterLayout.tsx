// @ts-nocheck

import React from 'react';
import { cn } from "@/lib/utils";
import type { Company } from '../../companies/database';
import type { Individual } from '../../individuals/database';
import type { Signatory } from '../hooks/useLetterData';
import type { IndividualIdInfo } from '../hooks/useIndividualIdentificationNumbers';

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
}

export function GeneralLetterLayout({
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
    useLetterhead = false,
    headerUrl = null,
    footerUrl = null,
    headerImageUrl = '',
    footerImageUrl = ''
}: GeneralLetterLayoutProps) {
    return (
        <div className="text-[14px] text-slate-800 leading-relaxed">
            {useLetterhead && headerImageUrl ? (
                <div className="mb-6">
                    {headerImageUrl.startsWith('data:text/html') ? (
                        <iframe
                            src={headerImageUrl}
                            className="w-full h-40 border border-gray-200 rounded-lg"
                            title="Letterhead Header Preview"
                        />
                    ) : (
                        <img
                            src={headerImageUrl}
                            alt="Company Letterhead Header"
                            className="w-full h-auto border border-gray-200 rounded-lg"
                        />
                    )}
                    <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800 font-medium">
                            📄 Letterhead header preview. Your letter content will be merged into the full template when you download.
                        </p>
                    </div>
                </div>
            ) : useLetterhead && headerUrl ? (
                <div className="mb-10">
                    <img
                        src={headerUrl}
                        alt="Company Letterhead Header"
                        className="w-full h-auto max-h-[200px] object-contain"
                        onError={(e) => {
                            console.error('Failed to load letterhead header');
                            e.currentTarget.style.display = 'none';
                        }}
                    />
                </div>
            ) : (
                <div className="flex justify-between items-start border-b-2 border-slate-100 pb-8 mb-12">
                    <div className="max-w-[60%]">
                        <h2 className="text-2xl font-bold text-slate-900 uppercase leading-tight">
                            {tab === 'companies' ? selectedCompany?.company_name : selectedIndividual?.full_name}
                        </h2>
                        <div className="mt-3 text-[11px] font-black text-blue-600 uppercase tracking-wider">
                            Ref: {reference}
                        </div>
                    </div>
                    <div className="text-right text-[10px] font-bold text-slate-500 uppercase leading-relaxed">
                        <p>P.O. BOX 12345 - 00100</p>
                        <p>NAIROBI, KENYA</p>
                        <p>TEL: {phone}</p>
                        <p className="lowercase text-blue-600 font-black mt-1">{email.toLowerCase()}</p>
                    </div>
                </div>
            )}

            <div className="mb-6 text-right text-[13px] font-semibold">
                {todayStr()}
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
                <div className="outline-none focus:bg-blue-50/50 px-2 -mx-2 rounded transition-colors" contentEditable suppressContentEditableWarning>{valediction}</div>

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

            {useLetterhead && footerImageUrl && (
                <div className="mt-16 pt-8 border-t border-slate-200">
                    {footerImageUrl.startsWith('data:text/html') ? (
                        <iframe
                            src={footerImageUrl}
                            className="w-full h-32 border border-gray-200 rounded-lg"
                            title="Letterhead Footer Preview"
                        />
                    ) : (
                        <img
                            src={footerImageUrl}
                            alt="Company Letterhead Footer"
                            className="w-full h-auto border border-gray-200 rounded-lg"
                            onError={(e) => {
                                console.error('Failed to load letterhead footer');
                                e.currentTarget.style.display = 'none';
                            }}
                        />
                    )}
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800 font-medium">
                            📄 Letterhead footer preview. This will appear at the bottom of your downloaded document.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
