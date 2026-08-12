// @ts-nocheck
import React, { useMemo } from 'react';
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
import {
    GeneralLetterThemeSettings,
    DEFAULT_GENERAL_LETTER_THEME,
    buildGeneralLetterThemeCss,
} from '../utils/letterThemeEngine';
import { GeneralLetterHeader, GeneralLetterFooter } from './GeneralLetterThemeChrome';

function todayStr(): string {
    return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const DEFAULT_BODY = `I am writing on behalf of the company to request for the issuance of a Tax Compliance Certificate.\nAll relevant returns have been filed and payments made up to date.\n\nYour prompt assistance in this matter will be highly appreciated.`;

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
    themeSettings?: GeneralLetterThemeSettings;
    isCleared?: boolean;
    kraPin?: string;
}

export function GeneralLetterLayout({
    tab,
    selectedCompany,
    selectedIndividual,
    email: emailProp,
    phone: phoneProp,
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
    themeSettings = DEFAULT_GENERAL_LETTER_THEME,
    isCleared = false,
    kraPin: kraPinProp = '',
}: GeneralLetterLayoutProps) {
    const bclContact = getBclContactDetails();
    const entityName = tab === 'companies' ? selectedCompany?.company_name : selectedIndividual?.full_name;

    const resolvedEmail = tab === 'companies'
        ? resolveCompanyGeneralEmail(selectedCompany!, emailProp)
        : resolveIndividualEmail(selectedIndividual!, emailProp);
    const resolvedPhone = tab === 'companies'
        ? resolveCompanyPhone(selectedCompany!, phoneProp)
        : resolveIndividualPhone(selectedIndividual!, phoneProp);
    const kraPin = tab === 'companies'
        ? resolveCompanyKraPin(selectedCompany, kraPinProp)
        : resolveIndividualKraPin(selectedIndividual, kraPinProp);
    const regNumber = tab === 'companies' ? (selectedCompany?.registration_number || '') : '';

    const theme = themeSettings.theme;
    const themeCss = useMemo(() => buildGeneralLetterThemeCss(themeSettings), [themeSettings]);

    const hasImageHeader = useLetterhead && (headerImageUrl || headerUrl);
    const hasImageFooter = useLetterhead && (footerImageUrl || footerUrl);

    // ── Uploaded-letterhead-image overrides - unrelated to the theme engine,
    // takes priority over it exactly as before. ─────────────────────────────

    const LetterheadHeader = () => (
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
            <div className="px-8 py-1.5 bg-blue-50 border-b border-blue-100">
                <p className="text-[11px] text-blue-600 font-medium">
                    📄 Letterhead header — merges on download.
                </p>
            </div>
        </div>
    );

    const LetterheadFooter = () => (
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

    // ── Shared sub-components ─────────────────────────────────────────────

    const RecipientBlock = () => (
        <div
            className="gl-recipient whitespace-pre-wrap outline-none focus:bg-blue-50/30 px-2 -mx-2 rounded transition-colors mb-6 text-[13px] leading-[1.85]"
            contentEditable suppressContentEditableWarning
        >{recipient}</div>
    );

    const SubjectSpan = () => (
        <span
            className="gl-subject outline-none focus:bg-yellow-50/50 px-1 -mx-1 rounded"
            contentEditable suppressContentEditableWarning
        >{subject}</span>
    );

    const BodyBlock = () => (
        <div
            className="gl-body-text whitespace-pre-wrap outline-none border border-transparent focus:border-slate-200 focus:bg-slate-50/50 px-3 -mx-3 rounded-md transition-all min-h-[200px] mb-8 text-[13.5px] leading-[1.9]"
            contentEditable suppressContentEditableWarning
        >{!isCleared ? DEFAULT_BODY : ''}</div>
    );

    const ValedictionBlock = () => (
        <div
            className="gl-valediction outline-none focus:bg-blue-50/30 px-2 -mx-2 rounded transition-colors mb-8 text-[13.5px]"
            contentEditable suppressContentEditableWarning
        >{valediction}</div>
    );

    const SignatureBlock = () => (
        <div className="space-y-1.5">
            <div className="gl-signature-line relative w-52 h-14 flex items-end">
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
            <div className="gl-signature-name font-bold uppercase tracking-[0.4px]">
                {tab === 'companies' ? (activeSignatory?.name || '____________________') : selectedIndividual?.full_name}
            </div>
            <div className="gl-signature-role text-[10px] font-semibold uppercase tracking-[2px] italic">
                {tab === 'companies' ? (activeSignatory?.position || 'Director') : 'Applicant'}
            </div>
            {tab === 'individuals' && individualIdInfo && (
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.5px] opacity-60">
                    {individualIdInfo.label}: {individualIdInfo.value}
                </div>
            )}
        </div>
    );

    // ── Themed header/refstrip/footer - one structure, CSS swaps the look
    // (same split the employment-contracts module uses via applyThemeToHtml,
    // just as live JSX + a scoped <style> tag instead of an HTML string,
    // since this surface stays contentEditable). Header/Footer JSX itself is
    // shared with LetterheadThemePreview.tsx via GeneralLetterThemeChrome.tsx
    // so both surfaces render identically from the same theme. ─────────────

    const Header = () => {
        if (hasImageHeader) return <LetterheadHeader />;
        return (
            <GeneralLetterHeader
                themeSettings={themeSettings}
                entityName={entityName}
                tagline={tab === 'companies' ? 'Registered Entity' : 'Individual Applicant'}
                addressLines={[bclContact.address]}
                phone={resolvedPhone || phoneProp}
                email={resolvedEmail || emailProp}
            />
        );
    };

    const RefStrip = () => {
        if (isCleared) return null;
        return (
            <div className="gl-refstrip flex flex-wrap items-center justify-between gap-2">
                <span>{todayStr()}</span>
                <div className="flex items-center gap-3">
                    <span className="gl-refstrip-badge">Ref: {reference || '—'}</span>
                    {kraPin && <span className="gl-refstrip-badge">PIN: {kraPin}</span>}
                </div>
                <span className="opacity-0 select-none">·</span>
            </div>
        );
    };

    const Footer = () => {
        if (hasImageFooter) return <LetterheadFooter />;
        return (
            <GeneralLetterFooter
                themeSettings={themeSettings}
                entityName={entityName}
                kraPin={kraPin}
                regNumber={regNumber}
                metaExtra={['Nairobi, Kenya', 'Confidential']}
            />
        );
    };

    return (
        <div className={cn("gl-root", `gl-theme-${theme}`, "overflow-hidden rounded-xl border border-slate-200 shadow-sm")}>
            <style>{themeCss}</style>
            <Header />
            <RefStrip />
            <div className="gl-body">
                {!isCleared && (
                    <>
                        <RecipientBlock />
                        <div className="mb-4 text-[14px] font-medium">Dear Sir/Madam,</div>
                        <div className="gl-subject-row">
                            <span className="gl-subject-label">Re:</span>
                            <SubjectSpan />
                        </div>
                    </>
                )}
                <BodyBlock />
                {!isCleared && (
                    <>
                        <div className="gl-divider" />
                        <ValedictionBlock />
                        <SignatureBlock />
                    </>
                )}
            </div>
            <Footer />
        </div>
    );
}
