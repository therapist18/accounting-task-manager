export type DocumentTheme = 'corporate' | 'legal' | 'modern' | 'executive' | 'minimal' | 'letterhead' | 'bold' | 'editorial';
export type BrandingStrategy = 'embedded' | 'company_letterhead' | 'theme_header' | 'none';

export interface ContractThemeSettings {
  theme: DocumentTheme;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  fontScale: 0.9 | 1 | 1.1;
  brandingStrategy: BrandingStrategy;
}

export const THEME_DEFAULTS: Record<DocumentTheme, { primaryColor: string; accentColor: string; fontFamily: string; label: string; description: string }> = {
  corporate: { primaryColor: '#0f172a', accentColor: '#2563eb', fontFamily: "'Inter', Helvetica, sans-serif", label: 'Corporate', description: 'Professional, structured, Fortune 500 styling' },
  legal: { primaryColor: '#000000', accentColor: '#000000', fontFamily: '"Times New Roman", Times, serif', label: 'Legal', description: 'Traditional, double-spaced, strict alignment' },
  modern: { primaryColor: '#111827', accentColor: '#4f46e5', fontFamily: "'Outfit', 'Inter', sans-serif", label: 'Modern', description: 'Sleek geometric typography, soft styling' },
  executive: { primaryColor: '#0f172a', accentColor: '#c5a059', fontFamily: 'Georgia, serif', label: 'Executive', description: 'High-end luxury feel, elegant lines' },
  minimal: { primaryColor: '#111111', accentColor: '#666666', fontFamily: 'system-ui, -apple-system, sans-serif', label: 'Minimal', description: 'Ultra-clean, whitespace-heavy, distraction-free' },
  letterhead: { primaryColor: '#1a3a5f', accentColor: '#b08a3e', fontFamily: "'Calibri', 'Carlito', 'Segoe UI', Arial, sans-serif", label: 'Letterhead', description: 'Classic stationery style with brand emphasis' },
  bold: { primaryColor: '#09090b', accentColor: '#f97316', fontFamily: "Arial, 'Helvetica Neue', sans-serif", label: 'Bold', description: 'High-contrast, striking brutalist touches' },
  editorial: { primaryColor: '#7c2d12', accentColor: '#c2703d', fontFamily: "Georgia, 'Times New Roman', serif", label: 'Editorial', description: 'Magazine-esque, beautiful serifs, drop caps' },
};

export const DEFAULT_CONTRACT_THEME: ContractThemeSettings = {
  theme: 'corporate',
  primaryColor: THEME_DEFAULTS.corporate.primaryColor,
  accentColor: THEME_DEFAULTS.corporate.accentColor,
  fontFamily: THEME_DEFAULTS.corporate.fontFamily,
  fontScale: 1,
  // 'theme_header' renders a large decorative banner with hardcoded generic
  // text (not the real company) - fine as an optional style choice, but a
  // poor default since it duplicates the document's own "heading" clause
  // and isn't tied to real data. 'company_letterhead' is compact and uses
  // real {{company_name}}/{{company_address}}/{{company_email}} tokens.
  brandingStrategy: 'company_letterhead',
};

export const COLOR_PRESETS = [
  { name: 'Ocean Blue', primary: '#2c3e50', accent: '#3498db' },
  { name: 'Forest', primary: '#1a3d2e', accent: '#27ae60' },
  { name: 'Royal Purple', primary: '#2c1654', accent: '#9b59b6' },
  { name: 'Crimson', primary: '#4a1515', accent: '#e74c3c' },
  { name: 'Slate', primary: '#2d3748', accent: '#64748b' },
  { name: 'Teal', primary: '#164e4e', accent: '#0d9488' },
  { name: 'Midnight', primary: '#0f172a', accent: '#6366f1' },
  { name: 'Copper', primary: '#3d1f10', accent: '#d97706' },
];

export const FONT_OPTIONS = [
  { name: 'Georgia', family: 'Georgia, "Times New Roman", serif', desc: 'Elegant serif' },
  { name: 'Times New Roman', family: '"Times New Roman", Times, serif', desc: 'Classic legal' },
  { name: 'Garamond', family: 'Garamond, "EB Garamond", serif', desc: 'Formal serif' },
  { name: 'Merriweather', family: 'Merriweather, serif', desc: 'Readable serif' },
  { name: 'Inter', family: 'Inter, sans-serif', desc: 'Clean modern' },
  { name: 'Arial', family: 'Arial, Helvetica, sans-serif', desc: 'Plain sans' },
];

type ThemeCssArgs = { primaryColor: string; accentColor: string; fontFamily: string; fontScale: number };

const BASE_SECTION_STYLES = `
  .cs-section, .cs-section * { white-space: normal; }
  .cs-section { margin-bottom: 16px; }
  .cs-section:last-child { margin-bottom: 0; }
  .cs-missing-clause { color: #b91c1c; font-style: italic; border: 1px dashed #b91c1c; padding: 10px 14px; border-radius: 4px; }
  .cs-section p { margin-bottom: 8px; }
  /* Tailwind's Preflight base reset strips list-style/margin/padding from
     every ul/ol globally - restore real bullets/numbers here since this is
     contract prose, not app UI chrome. */
  .cs-section ul { list-style-type: disc; margin-bottom: 8px; padding-left: 20px; }
  .cs-section ol { list-style-type: decimal; margin-bottom: 8px; padding-left: 20px; }
  .cs-section li { display: list-item; margin-bottom: 4px; }
  .cs-section h1 { margin-bottom: 16px; }
  .cs-section h2 { margin-top: 4px; margin-bottom: 8px; }
  .cs-section h3 { margin-top: 10px; margin-bottom: 6px; }
  .cs-section table { margin: 12px 0; }
  .cs-section th, .cs-section td { padding: 8px 12px; }
  .cs-section .signature-block { margin-top: 28px; }
  [data-section="appendix_job_description"] { page-break-before: always; }
  [data-section="signatures"] { page-break-inside: avoid; }

  .cs-toc { margin-bottom: 28px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
  .cs-toc-heading { font-size: 12pt; font-weight: 700; padding: 10px 16px; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  .cs-toc-list { list-style: none; margin: 0; padding: 8px 0; }
  .cs-toc-item { margin: 0; }
  .cs-toc-link { display: block; padding: 5px 16px; text-decoration: none; color: inherit; font-size: 10.5pt; line-height: 1.5; transition: background 0.15s; }
  .cs-toc-link:hover { background: #f1f5f9; }
  .cs-toc-num { font-weight: 700; margin-right: 6px; min-width: 28px; display: inline-block; }
  .cs-section-heading { margin-top: 20px; margin-bottom: 8px; }

  /* Highlights which entity a resolved placeholder value came from, so an
     admin reviewing the preview can spot at a glance whether a fact is
     pulled from the Company record or the Employee record - see
     ContractPreview.tsx's employeeValues wrapping. Light/pastel so it stays
     legible in print/PDF, not just on screen. */
  .ph-entity-company { background: #dbeafe; border-radius: 3px; padding: 0 3px; }
  .ph-entity-employee { background: #dcfce7; border-radius: 3px; padding: 0 3px; }
  /* An unresolved token still renders in its entity color (dimmed), so a
     blank spot reads as "this Company/Employee fact is missing" rather than
     losing the color coding entirely once there's nothing to show. */
  .ph-entity-missing { opacity: 0.55; font-style: italic; }
`;

const THEME_STYLES: Record<DocumentTheme, (args: ThemeCssArgs) => string> = {
  corporate: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #334155;
    line-height: 1.7;
    font-size: ${11.5 * fontScale}pt;
    h1 { color: ${primaryColor}; font-weight: 800; font-size: ${18 * fontScale}pt; text-transform: uppercase; letter-spacing: 0.05em; background: linear-gradient(90deg, #f8fafc 0%, transparent 100%); border-left: 6px solid ${accentColor}; padding: 12px 16px; margin-bottom: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
    h2 { color: ${primaryColor}; font-weight: 700; font-size: ${12.5 * fontScale}pt; margin-top: 36px; margin-bottom: 14px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
    h3 { color: ${accentColor}; font-weight: 700; font-size: ${11 * fontScale}pt; margin-top: 24px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    p { margin-bottom: 16px; text-align: justify; }
    ul, ol { margin-bottom: 16px; padding-left: 24px; }
    li { margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 32px 0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03); border: 1px solid #e2e8f0; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 14px 18px; text-align: left; }
    th { background-color: ${primaryColor}; color: #ffffff; font-weight: 600; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.05em; }
    tr:nth-child(even) td { background-color: #f8fafc; }
    tr:last-child td { border-bottom: none; }
    .signature-block { margin-top: 72px; display: flex; justify-content: space-between; gap: 48px; }
    .signature-column { flex: 1; padding: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
    .signature-line { border-bottom: 1px solid #94a3b8; height: 50px; margin-bottom: 12px; position: relative; }
    .signature-line::after { content: 'Signature'; position: absolute; bottom: 4px; left: 0; font-size: 9px; color: #cbd5e1; text-transform: uppercase; font-family: sans-serif; letter-spacing: 0.1em; }
    .signature-label { font-size: 10pt; color: ${primaryColor}; font-weight: 700; text-transform: uppercase; }
    .signature-sublabel { font-size: 8.5pt; color: #64748b; margin-top: 4px; }
  `,
  legal: ({ primaryColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #000000;
    line-height: 2.0;
    font-size: ${11 * fontScale}pt;
    text-align: justify;
    h1 { text-align: center; text-transform: uppercase; font-size: ${16 * fontScale}pt; font-weight: bold; color: ${primaryColor}; border-top: 4px double ${primaryColor}; border-bottom: 4px double ${primaryColor}; padding: 16px 0; margin: 40px 0; letter-spacing: 0.1em; }
    h2 { text-transform: uppercase; font-size: ${12 * fontScale}pt; font-weight: bold; color: ${primaryColor}; margin-top: 48px; margin-bottom: 16px; text-align: center; }
    h3 { font-size: ${11 * fontScale}pt; font-weight: bold; text-decoration: underline; margin-top: 24px; margin-bottom: 12px; }
    p { margin-bottom: 24px; text-indent: 48px; }
    p.no-indent { text-indent: 0; }
    ol { list-style-type: upper-roman; padding-left: 48px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 32px 0; border: 2px solid ${primaryColor}; }
    th, td { border: 1px solid ${primaryColor}; padding: 12px 16px; vertical-align: top; }
    th { font-weight: bold; text-transform: uppercase; font-size: 10pt; text-align: center; background: #f5f5f5; }
    .signature-block { margin-top: 80px; display: flex; justify-content: space-between; gap: 40px; }
    .signature-column { flex: 1; }
    .signature-line { border-bottom: 1px solid ${primaryColor}; height: 40px; margin-bottom: 8px; }
    .signature-label { font-weight: bold; font-size: 10pt; text-transform: uppercase; }
  `,
  modern: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #4b5563;
    line-height: 1.75;
    font-size: ${10.5 * fontScale}pt;
    h1 { color: ${primaryColor}; font-weight: 800; font-size: ${24 * fontScale}pt; letter-spacing: -0.03em; margin-bottom: 32px; }
    h2 { color: ${primaryColor}; font-weight: 700; font-size: ${14 * fontScale}pt; margin-top: 40px; margin-bottom: 16px; display: flex; align-items: center; }
    h2::before { content: ''; display: inline-block; width: 12px; height: 12px; border-radius: 50%; background-color: ${accentColor}; margin-right: 12px; }
    h3 { color: ${accentColor}; font-weight: 600; font-size: ${11.5 * fontScale}pt; margin-top: 24px; margin-bottom: 10px; background: ${accentColor}10; display: inline-block; padding: 4px 12px; border-radius: 20px; }
    p { margin-bottom: 18px; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 32px 0; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); border: 1px solid #f3f4f6; }
    th, td { padding: 16px 24px; text-align: left; }
    th { background-color: #f9fafb; color: ${primaryColor}; font-weight: 700; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e5e7eb; }
    td { border-bottom: 1px solid #f3f4f6; }
    tr:last-child td { border-bottom: none; }
    .signature-block { margin-top: 72px; display: flex; gap: 32px; }
    .signature-column { flex: 1; background: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.04); padding: 30px; border-radius: 16px; border: 1px solid #f3f4f6; position: relative; overflow: hidden; }
    .signature-column::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: ${accentColor}; }
    .signature-line { border-bottom: 2px dashed #d1d5db; height: 40px; margin-bottom: 16px; }
    .signature-label { font-size: 11pt; color: ${primaryColor}; font-weight: 800; }
  `,
  executive: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #1e293b;
    line-height: 1.8;
    font-size: ${11 * fontScale}pt;
    h1 { color: ${primaryColor}; font-weight: 400; font-size: ${24 * fontScale}pt; text-align: center; border-top: 1px solid ${accentColor}; border-bottom: 1px solid ${accentColor}; padding: 24px 0; margin-bottom: 48px; letter-spacing: 0.05em; background: rgba(0,0,0,0.02); }
    h2 { color: ${primaryColor}; font-weight: 700; font-size: ${12 * fontScale}pt; text-transform: uppercase; letter-spacing: 0.15em; margin-top: 48px; margin-bottom: 20px; text-align: center; }
    h2::after { content: ''; display: block; width: 40px; height: 2px; background: ${accentColor}; margin: 12px auto 0; }
    h3 { color: ${accentColor}; font-style: italic; font-weight: normal; font-size: ${12 * fontScale}pt; margin-top: 24px; margin-bottom: 12px; }
    p { margin-bottom: 20px; text-align: justify; }
    table { width: 100%; border-collapse: collapse; margin: 40px 0; border-top: 2px solid ${primaryColor}; border-bottom: 2px solid ${primaryColor}; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 16px; }
    th { font-weight: 700; color: ${primaryColor}; text-transform: uppercase; font-size: 9pt; letter-spacing: 0.1em; background: #f8fafc; }
    .signature-block { margin-top: 88px; display: flex; justify-content: space-around; gap: 40px; }
    .signature-column { flex: 1; max-width: 45%; }
    .signature-line { border-bottom: 1px solid ${primaryColor}; height: 50px; margin-bottom: 16px; }
    .signature-label { font-weight: 700; color: ${primaryColor}; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.1em; }
  `,
  minimal: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #27272a;
    line-height: 1.6;
    font-size: ${10 * fontScale}pt;
    h1 { font-weight: 300; font-size: ${20 * fontScale}pt; margin-bottom: 40px; letter-spacing: -0.02em; color: ${primaryColor}; }
    h2 { font-weight: 500; font-size: ${12 * fontScale}pt; margin-top: 40px; margin-bottom: 16px; color: ${primaryColor}; border-bottom: 1px solid #f4f4f5; padding-bottom: 8px; }
    h3 { font-weight: 400; font-size: ${10.5 * fontScale}pt; margin-top: 24px; margin-bottom: 8px; color: ${accentColor}; text-transform: uppercase; letter-spacing: 0.05em; }
    p { margin-bottom: 20px; color: #3f3f46; font-weight: 300; }
    table { width: 100%; border-collapse: collapse; margin: 40px 0; }
    th, td { border-bottom: 1px solid #e4e4e7; padding: 16px 8px; text-align: left; }
    th { font-weight: 500; color: #a1a1aa; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.1em; }
    .signature-block { margin-top: 80px; display: flex; gap: 64px; }
    .signature-column { flex: 1; }
    .signature-line { border-bottom: 1px solid #d4d4d8; height: 40px; margin-bottom: 12px; }
    .signature-label { font-size: 9pt; color: #52525b; font-weight: 500; }
  `,
  letterhead: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #1f2937;
    line-height: 1.65;
    font-size: ${11 * fontScale}pt;
    text-align: justify;
    h1 { text-align: center; font-weight: 700; font-size: ${20 * fontScale}pt; text-transform: uppercase; letter-spacing: 0.1em; color: ${primaryColor}; margin-bottom: 40px; }
    h2 { color: #ffffff; background: ${primaryColor}; font-weight: 700; font-size: ${12 * fontScale}pt; padding: 8px 16px; margin: 40px 0 20px; letter-spacing: 0.05em; text-transform: uppercase; }
    h3 { font-weight: 700; font-size: ${11.5 * fontScale}pt; color: ${accentColor}; margin-top: 24px; margin-bottom: 12px; }
    p { margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; margin: 32px 0; box-shadow: 0 0 0 1px #e5e7eb; }
    th, td { padding: 14px 16px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { font-weight: 700; font-size: 9.5pt; text-transform: uppercase; color: ${primaryColor}; background: #f9fafb; border-bottom: 2px solid ${primaryColor}; }
    .signature-block { margin-top: 72px; display: flex; justify-content: space-between; gap: 48px; }
    .signature-column { flex: 1; border-top: 1px solid #e5e7eb; padding-top: 24px; }
    .signature-line { border-bottom: 1px solid ${primaryColor}; height: 40px; margin-bottom: 12px; }
    .signature-label { font-size: 10pt; font-weight: 700; color: ${primaryColor}; }
  `,
  bold: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #000000;
    line-height: 1.6;
    font-size: ${11 * fontScale}pt;
    h1 { background: ${primaryColor}; color: #ffffff; font-weight: 900; font-size: ${22 * fontScale}pt; text-transform: uppercase; letter-spacing: 0.05em; padding: 24px 32px; margin: 0 0 48px; border: 4px solid #000000; box-shadow: 8px 8px 0px ${accentColor}; }
    h2 { color: #000000; display: inline-block; font-weight: 900; font-size: ${14 * fontScale}pt; padding: 8px 16px; margin-top: 40px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.05em; border: 3px solid #000000; box-shadow: 4px 4px 0px ${accentColor}; background: #ffffff; }
    h3 { color: ${primaryColor}; font-weight: 900; font-size: ${12 * fontScale}pt; margin-top: 24px; margin-bottom: 12px; text-transform: uppercase; border-bottom: 4px solid ${accentColor}; display: inline-block; }
    p { margin-bottom: 20px; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin: 40px 0; border: 4px solid #000000; box-shadow: 8px 8px 0px ${accentColor}; background: #ffffff; }
    th, td { padding: 16px; text-align: left; border: 2px solid #000000; }
    th { background: ${primaryColor}; color: #ffffff; font-weight: 900; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.05em; }
    .signature-block { margin-top: 80px; display: flex; gap: 40px; }
    .signature-column { flex: 1; border: 4px solid #000000; padding: 24px; box-shadow: 8px 8px 0px ${accentColor}; background: #ffffff; }
    .signature-line { border-bottom: 4px solid #000000; height: 32px; margin-bottom: 16px; }
    .signature-label { font-size: 11pt; font-weight: 900; text-transform: uppercase; color: #000000; }
  `,
  editorial: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #292524;
    line-height: 1.8;
    font-size: ${11.5 * fontScale}pt;
    h1 { font-weight: 400; font-style: italic; font-size: ${32 * fontScale}pt; color: ${primaryColor}; text-align: center; margin-bottom: 16px; letter-spacing: -0.02em; }
    h1::after { content: ''; display: block; width: 120px; height: 1px; background: ${accentColor}; margin: 32px auto 48px; }
    h2 { font-weight: 600; font-size: ${12 * fontScale}pt; color: ${primaryColor}; text-transform: uppercase; letter-spacing: 0.2em; margin-top: 48px; margin-bottom: 20px; text-align: center; }
    h3 { font-weight: 700; font-style: italic; font-size: ${12 * fontScale}pt; color: ${accentColor}; margin-top: 24px; margin-bottom: 12px; border-left: 3px solid ${accentColor}; padding-left: 12px; }
    p { margin-bottom: 24px; text-align: justify; }
    p:first-of-type::first-letter { font-size: 4.5em; font-weight: 400; float: left; line-height: 0.8; padding-right: 16px; padding-top: 8px; color: ${primaryColor}; }
    table { width: 100%; border-collapse: collapse; margin: 40px 0; }
    th, td { padding: 18px 12px; border-bottom: 1px solid #e7e5e4; text-align: left; }
    th { font-weight: 600; font-style: italic; color: ${primaryColor}; font-size: 11pt; border-bottom: 2px solid ${accentColor}; }
    .signature-block { margin-top: 88px; display: flex; justify-content: space-between; gap: 64px; }
    .signature-column { flex: 1; text-align: center; }
    .signature-line { border-bottom: 1px solid ${primaryColor}; height: 48px; margin-bottom: 16px; }
    .signature-label { font-size: 11pt; font-style: italic; color: ${primaryColor}; font-weight: 600; }
  `,
};

const THEME_HEADERS: Record<DocumentTheme, (args: ThemeCssArgs) => string> = {
  corporate: ({ primaryColor, accentColor }) => `
    <div style="display: flex; justify-content: space-between; align-items: stretch; background: #f8fafc; border: 1px solid #e2e8f0; border-left: 8px solid ${primaryColor}; border-radius: 8px; padding: 24px; margin-bottom: 40px; font-family: 'Inter', sans-serif; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
      <div>
        <div style="font-size: 28px; font-weight: 900; color: ${primaryColor}; letter-spacing: -0.02em;">CORPORATE</div>
        <div style="font-size: 12px; font-weight: 700; color: ${accentColor}; text-transform: uppercase; letter-spacing: 0.15em; margin-top: 8px;">Official Entity Agreement</div>
      </div>
      <div style="text-align: right; display: flex; flex-direction: column; justify-content: center; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; border-left: 1px solid #cbd5e1; padding-left: 20px;">
        <div>Reference ID: <strong style="color:${primaryColor}">DOC-HQ</strong></div>
        <div style="margin-top: 4px;">Strictly Confidential</div>
      </div>
    </div>`,
  legal: ({ primaryColor }) => `
    <div style="text-align: center; border: 4px double ${primaryColor}; padding: 24px; margin-bottom: 48px; font-family: 'Times New Roman', serif; background: #ffffff;">
      <h2 style="margin:0; font-size: 28px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.2em; color: ${primaryColor};">Legal Agreement</h2>
      <div style="width: 100px; height: 1px; background: ${primaryColor}; margin: 16px auto;"></div>
      <div style="font-style: italic; font-weight: bold; font-size: 14px; color: #333; text-transform: uppercase; letter-spacing: 0.1em;">Execution Copy</div>
    </div>`,
  modern: ({ primaryColor, accentColor }) => `
    <div style="display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg, #ffffff 0%, #f3f4f6 100%); border-radius: 20px; padding: 32px; margin-bottom: 40px; font-family: 'Inter', sans-serif; box-shadow: 0 10px 30px -10px rgba(0,0,0,0.1); border: 1px solid #ffffff;">
      <div style="font-size: 28px; font-weight: 900; color: ${primaryColor}; letter-spacing: -0.04em; display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; border-radius: 8px; background: ${accentColor}; box-shadow: 0 4px 12px ${accentColor}40;"></div>
        Brand<span style="color:${accentColor};">.</span>
      </div>
      <div style="background: #ffffff; color: ${primaryColor}; padding: 8px 16px; border-radius: 30px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        Contract Terms
      </div>
    </div>`,
  executive: ({ primaryColor, accentColor }) => `
    <div style="text-align: center; padding: 32px 0; margin-bottom: 48px; font-family: Georgia, serif; position: relative; border-bottom: 1px solid #e2e8f0;">
      <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 80px; height: 3px; background: ${accentColor};"></div>
      <div style="font-size: 36px; font-weight: 400; color: ${primaryColor}; letter-spacing: 0.05em; text-transform: uppercase;">Executive Office</div>
      <div style="font-size: 12px; color: ${accentColor}; margin-top: 16px; font-style: italic; letter-spacing: 0.15em;">Office of the Managing Director</div>
    </div>`,
  minimal: ({ primaryColor, accentColor }) => `
    <div style="margin-bottom: 56px; font-family: system-ui, sans-serif; display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid #f4f4f5; padding-bottom: 24px;">
      <div>
        <h1 style="font-size: 18px; font-weight: 500; margin: 0; color: ${primaryColor}; letter-spacing: -0.02em;">Contract of Employment</h1>
        <div style="font-size: 13px; color: #71717a; margin-top: 4px;">Standard Agreement</div>
      </div>
      <div style="font-size: 24px; font-weight: 300; color: ${accentColor};">01</div>
    </div>`,
  letterhead: ({ primaryColor, accentColor }) => `
    <div style="text-align: center; border-top: 6px solid ${primaryColor}; border-bottom: 2px solid ${accentColor}; padding: 32px 0; margin-bottom: 48px; font-family: 'Calibri', Arial, sans-serif; background: #fafaf9;">
      <div style="font-size: 32px; font-weight: 800; color: ${primaryColor}; letter-spacing: 0.1em;">COMPANY NAME</div>
      <div style="font-size: 11px; font-weight: 700; color: #6b7280; letter-spacing: 0.25em; text-transform: uppercase; margin-top: 12px;">Official Corporate Correspondence</div>
    </div>`,
  bold: ({ primaryColor, accentColor }) => `
    <div style="background: ${primaryColor}; color: #fff; padding: 40px; margin: 0 0 56px; display: flex; justify-content: space-between; align-items: center; font-family: Arial, sans-serif; border: 4px solid #000000; box-shadow: 12px 12px 0px ${accentColor};">
      <div style="font-size: 40px; font-weight: 900; letter-spacing: -0.02em; text-transform: uppercase;">Agreement</div>
      <div style="font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; background: #ffffff; color: ${primaryColor}; padding: 12px 20px; border: 2px solid #000000;">Strict / Official</div>
    </div>`,
  editorial: ({ primaryColor, accentColor }) => `
    <div style="text-align: center; margin-bottom: 56px; font-family: Georgia, 'Times New Roman', serif;">
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.4em; text-transform: uppercase; color: ${accentColor}; margin-bottom: 24px;">— The Employment Record —</div>
      <div style="font-size: 44px; font-style: italic; font-weight: 400; color: ${primaryColor}; line-height: 1.1;">A Formal Agreement<br>of Terms & Conditions</div>
    </div>`,
};

function flattenNestedCss(rootSelector: string, css: string): string {
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  const rules: string[] = [];
  let baseDecls = '';
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(css)) !== null) {
    const preText = match[1];
    const body = match[2].trim();

    const lastSemi = preText.lastIndexOf(';');
    const selectorPart = (lastSemi === -1 ? preText : preText.slice(lastSemi + 1)).trim();
    baseDecls += lastSemi === -1 ? '' : preText.slice(0, lastSemi + 1);

    if (!selectorPart || !body) continue;

    // Nested selector may itself be comma-separated (e.g. "th, td")
    const fullSelector = selectorPart
      .split(',')
      .map((s) => `${rootSelector} ${s.trim()}`)
      .join(', ');
    rules.push(`${fullSelector} { ${body} }`);
  }

  return [`${rootSelector} { ${baseDecls.trim()} }`, ...rules].join('\n');
}

function makeWordSafe(css: string): string {
  return css
    .replace(/(\.signature-block\s*\{[^}]*?)display:\s*flex;?/g, '$1display: table; width: 100%;')
    .replace(/(\.signature-column\s*\{[^}]*?)flex:\s*1;?/g, '$1display: table-cell; width: 50%; vertical-align: top;');
}

export function applyThemeToHtml(content: string, settings: ContractThemeSettings, options?: { wordSafe?: boolean }): string {
  const theme = settings.theme || 'corporate';
  const args: ThemeCssArgs = {
    primaryColor: settings.primaryColor || THEME_DEFAULTS[theme].primaryColor,
    accentColor: settings.accentColor || THEME_DEFAULTS[theme].accentColor,
    fontFamily: settings.fontFamily || THEME_DEFAULTS[theme].fontFamily,
    fontScale: settings.fontScale || 1,
  };

  let finalContent = content;

  // 1. Branding Strategy: Prepend header if applicable
  if (settings.brandingStrategy === 'theme_header') {
    const header = THEME_HEADERS[theme]?.(args) || '';
    finalContent = `${header}\n<div class="document-body">${finalContent}</div>`;
  } else if (settings.brandingStrategy === 'company_letterhead') {
    // Compact two-column letterhead (name/tagline left, address block right,
    // thin accent rule beneath) - deliberately small, since the document's
    // own "heading"/"parties" clauses already carry the actual contract
    // title/preamble further down. This block is letterhead branding only,
    // not a second title page.
    const companyHeader = `<div style="font-family: sans-serif; padding-bottom: 12px; margin-bottom: 20px; border-bottom: 2px solid ${args.accentColor}; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px;">
        <div style="font-size: 17px; font-weight: 800; color: ${args.primaryColor}; letter-spacing: 0.01em;">{{company_name}}</div>
        <div style="text-align: right; font-size: 10px; color: #64748b; line-height: 1.5;">{{company_address}}<br/>{{company_email}}</div>
    </div>`;
    finalContent = `${companyHeader}\n<div class="document-body">${finalContent}</div>`;
  }

  // 2. Apply theme styling - inject a flat (Word-parseable), scoped <style> block
  const rawCss = (THEME_STYLES[theme]?.(args) || THEME_STYLES.corporate(args)) + BASE_SECTION_STYLES;
  const rootSelector = `.contract-theme-${theme}`;
  let flatCss = flattenNestedCss(rootSelector, rawCss);
  if (options?.wordSafe) flatCss = makeWordSafe(flatCss);

  return `
    <div class="contract-theme-${theme}" style="padding: 48px; max-width: 850px; margin: 0 auto; background: white; box-sizing: border-box;">
      <style>
        ${flatCss}
      </style>
      ${finalContent}
    </div>
  `;
}