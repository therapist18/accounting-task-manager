// Shared header/footer "chrome" for the 8-preset general-letter theme
// engine (utils/letterThemeEngine.ts) - extracted out of GeneralLetterLayout.tsx
// so both the live letter composer (GeneralLetterLayout.tsx) and the
// letterhead-only preview used by "Build a Letterhead"
// (LetterheadThemePreview.tsx) render identically from the same theme
// instead of maintaining two copies of the same CSS-class wiring.
import type { GeneralLetterThemeSettings } from '../utils/letterThemeEngine';

export interface GeneralLetterHeaderProps {
    themeSettings: GeneralLetterThemeSettings;
    entityName?: string;
    tagline?: string;
    addressLines?: string[];
    phone?: string;
    email?: string;
    logoUrl?: string | null;
}

export function GeneralLetterHeader({
    themeSettings,
    entityName,
    tagline,
    addressLines = [],
    phone,
    email,
    logoUrl = null,
}: GeneralLetterHeaderProps) {
    if (themeSettings.brandingStrategy === 'none') return null;
    const theme = themeSettings.theme;
    const compact = themeSettings.brandingStrategy === 'company_letterhead';

    return (
        <div className="gl-header" style={compact ? { paddingTop: 16, paddingBottom: 16 } : undefined}>
            {logoUrl && <img src={logoUrl} alt="Logo" className="gl-header-logo" />}
            <div className="gl-header-title">{entityName || 'Company Name'}</div>
            {!compact && tagline && (
                <div className="gl-header-tagline">{tagline}</div>
            )}
            {(addressLines.length > 0 || phone || email) && (
                <div className="gl-header-contact" style={compact ? { marginTop: 6 } : undefined}>
                    {addressLines.map((line, i) => <p key={i}>{line}</p>)}
                    {phone && <p>Tel: {phone}</p>}
                    {email && <p className="gl-accent">{email}</p>}
                </div>
            )}
            {theme === 'letterhead' && (
                <>
                    <div className="gl-header-rule-1" style={{ marginTop: 20 }} />
                    <div className="gl-header-rule-2" style={{ marginTop: 3 }} />
                </>
            )}
            {theme === 'editorial' && <div className="gl-header-rule" />}
        </div>
    );
}

export interface GeneralLetterFooterProps {
    themeSettings: GeneralLetterThemeSettings;
    entityName?: string;
    kraPin?: string;
    regNumber?: string;
    // Extra meta segments appended after PIN/Reg - e.g. ['Nairobi, Kenya',
    // 'Confidential'] for the live composer, or an address for the
    // letterhead builder.
    metaExtra?: string[];
}

export function GeneralLetterFooter({
    themeSettings,
    entityName,
    kraPin,
    regNumber,
    metaExtra = [],
}: GeneralLetterFooterProps) {
    const theme = themeSettings.theme;
    const metaLine = [kraPin && `PIN: ${kraPin}`, regNumber && `Reg: ${regNumber}`, ...metaExtra]
        .filter(Boolean).join('   •   ');

    if (theme === 'letterhead') {
        return (
            <div className="gl-footer">
                <div className="flex items-center justify-center gap-4">
                    <span className="gl-footer-flank flex-1 max-w-[100px]" />
                    <span className="gl-footer-entity">{entityName}</span>
                    <span className="gl-footer-flank flex-1 max-w-[100px]" />
                </div>
                <div className="gl-footer-meta mt-1 text-center">{metaLine}</div>
            </div>
        );
    }

    return (
        <div className="gl-footer">
            <span className="gl-footer-entity">{entityName}</span>
            <span className="gl-footer-meta">{metaLine}</span>
        </div>
    );
}
