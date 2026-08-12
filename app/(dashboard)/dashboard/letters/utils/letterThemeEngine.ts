// General-letter theme engine, deliberately reusing the employment-contracts
// module's theme primitives (DocumentTheme id set, THEME_DEFAULTS,
// COLOR_PRESETS, FONT_OPTIONS, the ContractThemeSettings shape) instead of
// duplicating them - "handle themes the same way as the contract module"
// means the same 8 presets, the same adjustable primary/accent/font/scale
// knobs, and literally the same <ContractThemeEditor> UI. Only the CSS
// below is letter-specific, since a letter's anatomy (header/refstrip/
// subject/body/signature/footer) doesn't share selectors with a contract's
// (h1/h2/h3/table/signature-block).
import {
  DocumentTheme,
  BrandingStrategy,
  ContractThemeSettings,
  THEME_DEFAULTS,
  COLOR_PRESETS,
  FONT_OPTIONS,
} from '../../employment-contracts/utils/themeEngine';

export type { DocumentTheme, BrandingStrategy };
export { THEME_DEFAULTS, COLOR_PRESETS, FONT_OPTIONS };

// Same shape as the contract module's settings object - this is what lets
// <ContractThemeEditor> be reused verbatim for letters (see
// LetterThemePanel.tsx) instead of forking a near-identical editor.
export type GeneralLetterThemeSettings = ContractThemeSettings;

export const DEFAULT_GENERAL_LETTER_THEME: GeneralLetterThemeSettings = {
  theme: 'corporate',
  primaryColor: THEME_DEFAULTS.corporate.primaryColor,
  accentColor: THEME_DEFAULTS.corporate.accentColor,
  fontFamily: THEME_DEFAULTS.corporate.fontFamily,
  fontScale: 1,
  // Unlike a contract (which already has its own body "heading" clause), a
  // letter has no other title element - the themed header is the only place
  // the sender's identity appears, so it defaults on rather than 'none'.
  brandingStrategy: 'theme_header',
};

type ThemeCssArgs = { primaryColor: string; accentColor: string; fontFamily: string; fontScale: number };

// One structure (GeneralLetterLayout.tsx), one scoped stylesheet per theme -
// same split EC's applyThemeToHtml uses. Selectors are written flat rather
// than through EC's nested-CSS flattener since this is injected straight
// into a live React <style> tag, not fed through the MSO/Word HTML pipeline.
const LETTER_THEME_STYLES: Record<DocumentTheme, (args: ThemeCssArgs) => string> = {
  corporate: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    .gl-root { font-family: ${fontFamily}; color: #334155; line-height: 1.7; font-size: ${10.5 * fontScale}pt; }
    .gl-header { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 6px solid ${primaryColor}; padding: 24px 32px; }
    .gl-header-title { color: ${primaryColor}; font-weight: 800; font-size: ${18 * fontScale}pt; letter-spacing: 0.02em; }
    .gl-header-tagline { color: ${accentColor}; font-weight: 700; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.15em; margin-top: 6px; }
    .gl-header-contact { color: #64748b; font-size: 9pt; line-height: 1.8; }
    .gl-header-contact a, .gl-header-contact .gl-accent { color: ${accentColor}; font-weight: 600; }
    .gl-refstrip { background: #f8fafc; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 10px 32px; color: #64748b; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.08em; }
    .gl-refstrip-badge { background: ${primaryColor}; color: #fff; border-radius: 999px; padding: 3px 12px; font-size: 9pt; }
    .gl-body { padding: 36px 32px; }
    .gl-subject-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #f8fafc; border-left: 3px solid ${accentColor}; border-radius: 0 6px 6px 0; margin-bottom: 28px; }
    .gl-subject-label { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${accentColor}; }
    .gl-subject { font-weight: 700; text-transform: uppercase; text-decoration: underline; text-decoration-color: ${accentColor}; }
    .gl-divider { height: 1px; background: linear-gradient(90deg, transparent, #e2e8f0, transparent); margin: 28px 0; }
    .gl-signature-line { border-bottom: 1px solid #94a3b8; }
    .gl-signature-name { color: #0f172a; font-family: ${fontFamily}; }
    .gl-signature-role { color: #64748b; }
    .gl-footer { background: ${primaryColor}; color: rgba(255,255,255,0.5); padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .gl-footer-entity { color: rgba(255,255,255,0.85); font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; font-size: 9pt; }
    .gl-footer-meta { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.06em; }
  `,
  legal: ({ primaryColor, fontFamily, fontScale }) => `
    .gl-root { font-family: ${fontFamily}; color: #000; line-height: 1.9; font-size: ${10.5 * fontScale}pt; }
    .gl-header { text-align: center; border-top: 4px double ${primaryColor}; border-bottom: 4px double ${primaryColor}; padding: 24px 32px; }
    .gl-header-title { color: ${primaryColor}; font-weight: 700; font-size: ${17 * fontScale}pt; text-transform: uppercase; letter-spacing: 0.12em; }
    .gl-header-tagline { color: #333; font-style: italic; font-weight: 700; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 10px; }
    .gl-header-contact { color: #333; font-size: 9pt; line-height: 1.9; text-align: center; margin-top: 10px; }
    .gl-refstrip { border-bottom: 1px solid #000; padding: 8px 32px; color: #333; font-size: 9pt; text-align: center; letter-spacing: 0.08em; }
    .gl-refstrip-badge { color: ${primaryColor}; font-weight: 700; }
    .gl-body { padding: 36px 32px; text-align: justify; }
    .gl-subject-row { text-align: center; margin-bottom: 28px; }
    .gl-subject-label { font-weight: 700; }
    .gl-subject { font-weight: 700; text-decoration: underline; text-transform: uppercase; letter-spacing: 0.05em; }
    .gl-divider { height: 1px; background: #000; margin: 28px 0; }
    .gl-signature-line { border-bottom: 1px solid ${primaryColor}; }
    .gl-signature-name { color: #000; }
    .gl-signature-role { color: #333; }
    .gl-footer { background: #fff; border-top: 1px solid #000; padding: 14px 32px; text-align: center; }
    .gl-footer-entity { font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; font-size: 9pt; }
    .gl-footer-meta { color: #555; font-size: 8.5pt; }
  `,
  modern: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    .gl-root { font-family: ${fontFamily}; color: #4b5563; line-height: 1.75; font-size: ${10 * fontScale}pt; }
    .gl-header { background: linear-gradient(135deg, #ffffff 0%, #f3f4f6 100%); border-radius: 20px; padding: 28px 32px; box-shadow: 0 10px 30px -10px rgba(0,0,0,0.08); }
    .gl-header-title { color: ${primaryColor}; font-weight: 800; font-size: ${18 * fontScale}pt; letter-spacing: -0.02em; }
    .gl-header-tagline { color: ${accentColor}; font-weight: 600; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 6px; display: flex; align-items: center; gap: 6px; }
    .gl-header-tagline::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: ${accentColor}; display: inline-block; }
    .gl-header-contact { color: #6b7280; font-size: 9pt; line-height: 1.8; }
    .gl-header-contact .gl-accent { color: ${accentColor}; font-weight: 700; }
    .gl-refstrip { padding: 10px 32px; }
    .gl-refstrip-badge { background: #fff; color: ${primaryColor}; border-radius: 999px; padding: 4px 14px; font-size: 9pt; font-weight: 700; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .gl-body { padding: 36px 32px; }
    .gl-subject-row { background: ${accentColor}12; border-radius: 12px; padding: 14px 18px; margin-bottom: 28px; }
    .gl-subject-label { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${accentColor}; }
    .gl-subject { font-weight: 700; color: ${primaryColor}; }
    .gl-divider { height: 1px; background: #f3f4f6; margin: 28px 0; }
    .gl-signature-line { border-bottom: 2px dashed #d1d5db; }
    .gl-signature-name { color: ${primaryColor}; font-weight: 800; }
    .gl-signature-role { color: #9ca3af; }
    .gl-footer { background: #fff; border-radius: 0 0 20px 20px; padding: 14px 32px; box-shadow: 0 -4px 20px rgba(0,0,0,0.03); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .gl-footer-entity { color: ${primaryColor}; font-weight: 700; font-size: 9pt; }
    .gl-footer-meta { color: #9ca3af; font-size: 8.5pt; }
  `,
  executive: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    .gl-root { font-family: ${fontFamily}; color: #1e293b; line-height: 1.8; font-size: ${10.5 * fontScale}pt; }
    .gl-header { text-align: center; border-top: 1px solid ${accentColor}; border-bottom: 1px solid ${accentColor}; padding: 28px 32px; background: rgba(0,0,0,0.015); }
    .gl-header-title { color: ${primaryColor}; font-weight: 400; font-size: ${20 * fontScale}pt; letter-spacing: 0.04em; }
    .gl-header-tagline { color: ${accentColor}; font-style: italic; font-size: 9pt; letter-spacing: 0.12em; margin-top: 10px; }
    .gl-header-contact { color: #64748b; font-size: 9pt; line-height: 1.9; text-align: center; margin-top: 12px; }
    .gl-refstrip { text-align: center; padding: 8px 32px; color: #64748b; font-size: 9pt; letter-spacing: 0.1em; text-transform: uppercase; }
    .gl-refstrip-badge { color: ${accentColor}; font-weight: 700; }
    .gl-body { padding: 40px 32px; text-align: justify; }
    .gl-subject-row { text-align: center; margin-bottom: 32px; }
    .gl-subject-label { font-weight: 700; color: ${primaryColor}; text-transform: uppercase; letter-spacing: 0.1em; }
    .gl-subject { font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    .gl-divider { height: 2px; width: 40px; background: ${accentColor}; margin: 32px auto; }
    .gl-signature-line { border-bottom: 1px solid ${primaryColor}; }
    .gl-signature-name { color: ${primaryColor}; }
    .gl-signature-role { color: #64748b; letter-spacing: 0.1em; }
    .gl-footer { background: #fff; border-top: 1px solid #e2e8f0; padding: 16px 32px; text-align: center; }
    .gl-footer-entity { font-weight: 700; color: ${primaryColor}; text-transform: uppercase; letter-spacing: 0.1em; font-size: 9pt; }
    .gl-footer-meta { color: #94a3b8; font-size: 8.5pt; letter-spacing: 0.05em; }
  `,
  minimal: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    .gl-root { font-family: ${fontFamily}; color: #27272a; line-height: 1.6; font-size: ${10 * fontScale}pt; }
    .gl-header { border-bottom: 1px solid #f4f4f5; padding: 24px 32px; }
    .gl-header-title { color: ${primaryColor}; font-weight: 300; font-size: ${17 * fontScale}pt; letter-spacing: -0.01em; }
    .gl-header-tagline { color: ${accentColor}; font-weight: 400; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px; }
    .gl-header-contact { color: #71717a; font-size: 8.5pt; line-height: 1.8; }
    .gl-refstrip { padding: 6px 32px; color: #a1a1aa; font-size: 8.5pt; }
    .gl-refstrip-badge { color: #52525b; }
    .gl-body { padding: 32px; }
    .gl-subject-row { margin-bottom: 24px; }
    .gl-subject-label { font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.08em; font-size: 8.5pt; }
    .gl-subject { font-weight: 500; }
    .gl-divider { height: 1px; background: #f4f4f5; margin: 24px 0; }
    .gl-signature-line { border-bottom: 1px solid #d4d4d8; }
    .gl-signature-name { color: #27272a; font-weight: 500; }
    .gl-signature-role { color: #71717a; }
    .gl-footer { border-top: 1px solid #f4f4f5; padding: 12px 32px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .gl-footer-entity { color: #52525b; font-weight: 500; font-size: 8.5pt; }
    .gl-footer-meta { color: #a1a1aa; font-size: 8pt; }
  `,
  letterhead: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    .gl-root { font-family: ${fontFamily}; color: #1f2937; line-height: 1.7; font-size: ${10.5 * fontScale}pt; }
    .gl-header { text-align: center; padding: 28px 32px 20px; }
    .gl-header-title { color: ${primaryColor}; font-weight: 700; font-size: ${19 * fontScale}pt; text-transform: uppercase; letter-spacing: 0.08em; }
    .gl-header-tagline { display: none; }
    .gl-header-contact { color: #4b5563; font-size: 9pt; line-height: 1.9; text-align: center; margin-top: 8px; }
    .gl-header-rule-1 { height: 3px; background: ${primaryColor}; }
    .gl-header-rule-2 { height: 1px; background: ${accentColor}; }
    .gl-refstrip { text-align: right; padding: 10px 32px; color: #6b7280; font-size: 9pt; }
    .gl-refstrip-badge { background: ${primaryColor}; color: #fff; border-radius: 4px; padding: 3px 12px; font-size: 9pt; }
    .gl-body { padding: 32px; }
    .gl-subject-row { border: 1px solid #e5e7eb; padding: 12px 16px; margin-bottom: 28px; }
    .gl-subject-label { font-weight: 700; color: ${primaryColor}; text-transform: uppercase; }
    .gl-subject { font-weight: 700; text-transform: uppercase; }
    .gl-divider { height: 1px; background: #e5e7eb; margin: 28px 0; }
    .gl-signature-line { border-bottom: 1px solid ${primaryColor}; }
    .gl-signature-name { color: ${primaryColor}; font-weight: 700; }
    .gl-signature-role { color: #6b7280; }
    .gl-footer { background: ${primaryColor}; color: #fff; padding: 12px 32px; text-align: center; }
    .gl-footer-flank { height: 1px; background: rgba(255,255,255,0.4); }
    .gl-footer-entity { font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; font-size: 9pt; }
    .gl-footer-meta { color: rgba(255,255,255,0.7); font-size: 8.5pt; }
  `,
  bold: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    .gl-root { font-family: ${fontFamily}; color: #000; line-height: 1.6; font-size: ${10.5 * fontScale}pt; }
    .gl-header { background: ${primaryColor}; color: #fff; padding: 28px 32px; border: 4px solid #000; box-shadow: 8px 8px 0px ${accentColor}; }
    .gl-header-title { font-weight: 900; font-size: ${19 * fontScale}pt; text-transform: uppercase; letter-spacing: 0.03em; }
    .gl-header-tagline { color: ${accentColor}; font-weight: 700; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 8px; }
    .gl-header-contact { color: rgba(255,255,255,0.7); font-size: 9pt; line-height: 1.8; }
    .gl-refstrip { padding: 10px 32px; }
    .gl-refstrip-badge { background: #fff; color: #000; border: 2px solid #000; padding: 3px 12px; font-weight: 700; font-size: 9pt; }
    .gl-body { padding: 36px 32px; }
    .gl-subject-row { border: 3px solid #000; padding: 12px 16px; box-shadow: 4px 4px 0px ${accentColor}; margin-bottom: 28px; background: #fff; }
    .gl-subject-label { font-weight: 900; text-transform: uppercase; }
    .gl-subject { font-weight: 900; text-transform: uppercase; }
    .gl-divider { height: 3px; background: #000; margin: 28px 0; }
    .gl-signature-line { border-bottom: 4px solid #000; }
    .gl-signature-name { color: #000; font-weight: 900; }
    .gl-signature-role { color: #000; font-weight: 700; }
    .gl-footer { background: #000; color: #fff; padding: 14px 32px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .gl-footer-entity { font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; font-size: 9pt; }
    .gl-footer-meta { color: ${accentColor}; font-weight: 700; font-size: 8.5pt; text-transform: uppercase; }
  `,
  editorial: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    .gl-root { font-family: ${fontFamily}; color: #292524; line-height: 1.8; font-size: ${10.5 * fontScale}pt; }
    .gl-header { text-align: center; padding: 32px 32px 8px; }
    .gl-header-title { color: ${primaryColor}; font-weight: 400; font-style: italic; font-size: ${24 * fontScale}pt; letter-spacing: -0.01em; }
    .gl-header-tagline { color: ${accentColor}; font-weight: 700; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.3em; margin-top: 10px; }
    .gl-header-contact { color: #78716c; font-size: 9pt; line-height: 1.9; text-align: center; margin-top: 12px; }
    .gl-header-rule { width: 80px; height: 1px; background: ${accentColor}; margin: 20px auto 0; }
    .gl-refstrip { text-align: center; padding: 8px 32px; color: #a8a29e; font-size: 9pt; font-style: italic; }
    .gl-refstrip-badge { color: ${primaryColor}; font-style: normal; font-weight: 700; }
    .gl-body { padding: 32px; text-align: justify; }
    .gl-subject-row { text-align: center; margin-bottom: 28px; }
    .gl-subject-label { font-style: italic; color: ${accentColor}; text-transform: uppercase; letter-spacing: 0.2em; font-size: 9pt; }
    .gl-subject { font-style: italic; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    .gl-divider { height: 1px; background: #e7e5e4; margin: 28px 0; }
    .gl-signature-line { border-bottom: 1px solid ${primaryColor}; }
    .gl-signature-name { color: ${primaryColor}; font-style: italic; }
    .gl-signature-role { color: #78716c; font-style: italic; }
    .gl-footer { border-top: 1px solid #e7e5e4; padding: 14px 32px; text-align: center; }
    .gl-footer-entity { font-style: italic; font-weight: 600; color: ${primaryColor}; font-size: 9pt; }
    .gl-footer-meta { color: #a8a29e; font-size: 8.5pt; font-style: italic; }
  `,
};

// Structural rules that hold regardless of theme - kept out of each theme
// block above so every theme only has to declare color/type/spacing, not
// re-derive layout mechanics. .gl-refstrip's flex layout is likewise never
// themed (every theme wants date-left/badges-right), so it's applied as a
// plain Tailwind class directly in GeneralLetterLayout.tsx's JSX instead of
// living here - only the split-footer themes above needed an explicit
// per-theme `display: flex` because the centered themes (legal/executive/
// editorial) deliberately stack rather than split.
const BASE_LETTER_STYLES = `
  .gl-footer-entity, .gl-footer-meta { display: block; }
  .gl-subject-label { margin-right: 8px; }
  .gl-header-logo { width: 44px; height: 44px; object-fit: contain; margin-bottom: 8px; }
`;

export function buildGeneralLetterThemeCss(settings: GeneralLetterThemeSettings): string {
  const theme = settings.theme || 'corporate';
  const args: ThemeCssArgs = {
    primaryColor: settings.primaryColor || THEME_DEFAULTS[theme].primaryColor,
    accentColor: settings.accentColor || THEME_DEFAULTS[theme].accentColor,
    fontFamily: settings.fontFamily || THEME_DEFAULTS[theme].fontFamily,
    fontScale: settings.fontScale || 1,
  };
  return (LETTER_THEME_STYLES[theme] || LETTER_THEME_STYLES.corporate)(args) + BASE_LETTER_STYLES;
}

// ── Word/.docx palette helpers ──────────────────────────────────────────────
// The docx library can't consume CSS, so Word export (exportToWord.ts,
// letterheadThemeBuilder.ts) needs the same theme decisions expressed as
// flat hex colors. Mirrors LETTER_THEME_STYLES above exactly: 'bold' is the
// only theme with a solid-color header; corporate/letterhead/bold are the
// only solid-color footers - everything else is light/white with
// theme-colored text.

export function hexNoHash(hex: string | undefined, fallback: string): string {
  if (!hex) return fallback;
  return hex.replace('#', '').toUpperCase();
}

export function wordHeaderPalette(settings: GeneralLetterThemeSettings, fallbackPrimary = '0F172A', fallbackAccent = '2563EB') {
  const primary = hexNoHash(settings.primaryColor, fallbackPrimary);
  const accent = hexNoHash(settings.accentColor, fallbackAccent);
  if (settings.theme === 'bold') return { bg: primary, title: 'FFFFFF', accent: 'FFFFFF', meta: 'FFFFFF', line: accent };
  return { bg: 'FFFFFF', title: primary, accent, meta: '64748B', line: accent };
}

export function wordFooterPalette(settings: GeneralLetterThemeSettings, fallbackPrimary = '0F172A', fallbackAccent = '2563EB') {
  const primary = hexNoHash(settings.primaryColor, fallbackPrimary);
  const accent = hexNoHash(settings.accentColor, fallbackAccent);
  const isSolid = settings.theme === 'corporate' || settings.theme === 'letterhead' || settings.theme === 'bold';
  const bg = isSolid ? (settings.theme === 'bold' ? '000000' : primary) : 'FFFFFF';
  return { bg, text: isSolid ? 'FFFFFF' : '64748B', accent: isSolid ? 'FFFFFF' : accent };
}
