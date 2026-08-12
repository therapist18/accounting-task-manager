'use client';

import { cn } from '@/lib/utils';
import { buildGeneralLetterThemeCss, type GeneralLetterThemeSettings } from '../utils/letterThemeEngine';
import { GeneralLetterHeader, GeneralLetterFooter } from './GeneralLetterThemeChrome';

export interface LetterheadThemePreviewProps {
    themeSettings: GeneralLetterThemeSettings;
    entityName: string;
    addressLine1?: string;
    addressLine2?: string;
    phone?: string;
    email?: string;
    kraPin?: string;
    regNumber?: string;
    logoUrl?: string | null;
}

// Letterhead-only rendering of the same 8-preset theme engine the live
// letter composer uses (utils/letterThemeEngine.ts) - header + footer, no
// letter-specific content (date/recipient/subject/signature). The BODY
// placeholder in the middle stands in for wherever a future letter's
// content will be merged in (see utils/letterheadThemeBuilder.ts's literal
// "{BODY}" tag). Header/Footer JSX is shared with GeneralLetterLayout.tsx
// via GeneralLetterThemeChrome.tsx so this preview matches the live
// composer pixel-for-pixel per theme.
export function LetterheadThemePreview({
    themeSettings,
    entityName,
    addressLine1 = '',
    addressLine2 = '',
    phone = '',
    email = '',
    kraPin = '',
    regNumber = '',
    logoUrl = null,
}: LetterheadThemePreviewProps) {
    const themeCss = buildGeneralLetterThemeCss(themeSettings);
    const addressLines = [addressLine1, addressLine2].filter(Boolean);

    return (
        <div className={cn("gl-root", `gl-theme-${themeSettings.theme}`, "overflow-hidden rounded-xl border border-slate-200 shadow-sm")}>
            <style>{themeCss}</style>
            <GeneralLetterHeader
                themeSettings={themeSettings}
                entityName={entityName}
                tagline="Registered Entity"
                addressLines={addressLines}
                phone={phone}
                email={email}
                logoUrl={logoUrl}
            />
            <div className="px-10 py-9 bg-white">
                <div className="min-h-[160px] border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center text-sm italic text-slate-400">
                    Letter content goes here
                </div>
            </div>
            <GeneralLetterFooter
                themeSettings={themeSettings}
                entityName={entityName}
                kraPin={kraPin}
                regNumber={regNumber}
                metaExtra={[[addressLine1, addressLine2].filter(Boolean).join(', ')].filter(Boolean)}
            />
        </div>
    );
}
