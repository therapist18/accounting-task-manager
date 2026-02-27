import React from 'react';
import { cn } from "@/lib/utils";
import type { Company } from '../../companies/database';
import type { Individual } from '../../individuals/database';
import type { Signatory } from '../hooks/useLetterData';

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
    useLetterhead = false,
    headerUrl = null,
    footerUrl = null,
    headerImageUrl = '',
    footerImageUrl = ''
}: GeneralLetterLayoutProps) {
    return (
        <div className="text-[16px] text-slate-800">
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
