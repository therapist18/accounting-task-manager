'use client';

import { cn } from '@/lib/utils';
import { LetterFooter, type LetterTheme } from './GeneralLetterLayout';

export interface LetterheadThemePreviewProps {
    theme: LetterTheme;
    entityName: string;
    addressLine1?: string;
    addressLine2?: string;
    phone?: string;
    email?: string;
    kraPin?: string;
    regNumber?: string;
    logoUrl?: string | null;
}

// Letterhead-only rendering of the 4 GeneralLetterLayout themes - header +
// footer, no letter-specific content (date/recipient/subject/signature).
// The BODY placeholder in the middle stands in for wherever a future letter's
// content will be merged in (see utils/letterheadThemeBuilder.ts's literal
// "{BODY}" tag).
export function LetterheadThemePreview({
    theme,
    entityName,
    addressLine1 = '',
    addressLine2 = '',
    phone = '',
    email = '',
    kraPin = '',
    regNumber = '',
    logoUrl = null,
}: LetterheadThemePreviewProps) {
    const Logo = ({ className = '' }: { className?: string }) =>
        logoUrl ? <img src={logoUrl} alt="Company logo" className={cn('object-contain', className)} /> : null;

    const BodyPlaceholder = ({ textClass = 'text-slate-400' }: { textClass?: string }) => (
        <div className="px-10 py-9 bg-white">
            <div className={cn('min-h-[160px] border-2 border-dashed rounded-lg flex items-center justify-center text-sm italic', textClass, 'border-current/20')}>
                Letter content goes here
            </div>
        </div>
    );

    const footerProps = { entityName, regNumber, kraPin, theme };

    if (theme === 'dark-teal') {
        return (
            <div className="font-sans text-[14px] text-slate-800 leading-relaxed overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                <div className="relative bg-slate-900 px-10 py-8 flex justify-between items-end overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-teal-400/10 pointer-events-none" />
                    <div className="absolute -bottom-14 left-16 w-40 h-40 rounded-full bg-teal-400/[0.06] pointer-events-none" />
                    <div className="absolute left-0 inset-y-0 w-[5px] bg-gradient-to-b from-teal-400 to-cyan-600" />
                    <div className="relative z-10 flex items-center gap-4">
                        <Logo className="w-12 h-12 rounded bg-white/5 p-1" />
                        <div>
                            <h2 className="font-serif text-[22px] font-bold text-white tracking-[0.3px] leading-tight">{entityName || 'Company Name'}</h2>
                            <p className="mt-1 text-[10px] font-light tracking-[3px] uppercase text-teal-400">Registered Entity</p>
                        </div>
                    </div>
                    <div className="relative z-10 text-right text-[11px] font-normal text-white/50 leading-[1.9]">
                        {addressLine1 && <p>{addressLine1}</p>}
                        {addressLine2 && <p>{addressLine2}</p>}
                        {phone && <p>Tel: {phone}</p>}
                        {email && <p className="text-teal-300 font-medium lowercase">{email}</p>}
                    </div>
                </div>
                <BodyPlaceholder textClass="text-slate-400" />
                <LetterFooter {...footerProps} />
            </div>
        );
    }

    if (theme === 'corporate-blue') {
        return (
            <div className="font-sans text-[14px] text-slate-800 leading-relaxed overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                <div className="px-10 pt-8 pb-0 bg-white">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-4">
                            <Logo className="w-12 h-12 rounded" />
                            <h2 className="text-[22px] font-bold text-slate-900 tracking-tight leading-tight">{entityName || 'Company Name'}</h2>
                        </div>
                        <div className="text-right text-[10.5px] text-slate-500 leading-[1.9]">
                            {addressLine1 && <p>{addressLine1}</p>}
                            {addressLine2 && <p>{addressLine2}</p>}
                            {phone && <p>Tel: {phone}</p>}
                            {email && <p className="text-blue-600 font-semibold lowercase">{email}</p>}
                        </div>
                    </div>
                    <div className="mt-6 h-[3px] bg-blue-700 rounded-sm" />
                    <div className="mt-[2px] h-[0.5px] bg-slate-200 mb-4" />
                </div>
                <BodyPlaceholder textClass="text-blue-400" />
                <LetterFooter {...footerProps} />
            </div>
        );
    }

    if (theme === 'bold-violet') {
        return (
            <div className="font-sans text-[14px] text-slate-800 leading-relaxed overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                <div className="bg-gradient-to-r from-violet-700 to-indigo-600 px-10 py-8 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <Logo className="w-12 h-12 rounded bg-white/10 p-1" />
                        <div>
                            <h2 className="text-[22px] font-bold text-white leading-tight tracking-tight">{entityName || 'Company Name'}</h2>
                            <p className="mt-1 text-[10px] font-light tracking-[3px] uppercase text-violet-300">Registered Entity</p>
                        </div>
                    </div>
                    <div className="text-right text-[10.5px] text-white/60 leading-[1.9]">
                        {addressLine1 && <p>{addressLine1}</p>}
                        {addressLine2 && <p>{addressLine2}</p>}
                        {phone && <p>Tel: {phone}</p>}
                        {email && <p className="text-violet-200 font-medium lowercase">{email}</p>}
                    </div>
                </div>
                <BodyPlaceholder textClass="text-violet-400" />
                <LetterFooter {...footerProps} />
            </div>
        );
    }

    // classic-serif
    return (
        <div className="font-serif text-[14px] text-stone-800 leading-relaxed overflow-hidden rounded-xl border border-stone-200 shadow-sm">
            <div className="px-10 pt-8 pb-4 bg-white">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                        <Logo className="w-12 h-12 rounded" />
                        <h2 className="font-serif text-[24px] font-semibold text-stone-900 tracking-[0.3px] leading-tight">{entityName || 'Company Name'}</h2>
                    </div>
                    <div className="text-right text-[10.5px] text-stone-500 leading-[1.9]">
                        {addressLine1 && <p>{addressLine1}</p>}
                        {addressLine2 && <p>{addressLine2}</p>}
                        {phone && <p>Tel: {phone}</p>}
                        {email && <p className="text-stone-700 lowercase">{email}</p>}
                    </div>
                </div>
                <div className="mt-5 h-[1.5px] bg-stone-900" />
                <div className="mt-[3px] h-[0.5px] bg-stone-300" />
            </div>
            <BodyPlaceholder textClass="text-stone-400" />
            <LetterFooter {...footerProps} />
        </div>
    );
}
