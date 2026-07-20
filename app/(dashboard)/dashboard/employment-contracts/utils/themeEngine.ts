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
  executive: { primaryColor: '#0f172a', accentColor: '#475569', fontFamily: 'Georgia, serif', label: 'Executive', description: 'High-end luxury feel, elegant lines' },
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
  brandingStrategy: 'none',
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

const THEME_STYLES: Record<DocumentTheme, (args: ThemeCssArgs) => string> = {
  corporate: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #334155;
    line-height: 1.65;
    font-size: ${10.5 * fontScale}pt;
    h1 { color: ${primaryColor}; font-weight: 800; font-size: ${18 * fontScale}pt; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 32px; position: relative; }
    h1::after { content: ''; position: absolute; left: 0; bottom: -2px; width: 80px; height: 2px; background-color: ${accentColor}; }
    h2 { color: ${primaryColor}; font-weight: 700; font-size: ${12.5 * fontScale}pt; margin-top: 32px; margin-bottom: 12px; }
    h3 { color: ${accentColor}; font-weight: 600; font-size: ${11 * fontScale}pt; margin-top: 20px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.03em; }
    p { margin-bottom: 16px; text-align: justify; }
    ul, ol { margin-bottom: 16px; padding-left: 24px; }
    li { margin-bottom: 8px; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 28px 0; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
    th, td { border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; padding: 14px 18px; text-align: left; }
    th { background-color: #f8fafc; color: ${primaryColor}; font-weight: 700; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.05em; }
    th:last-child, td:last-child { border-right: none; }
    tr:last-child td { border-bottom: none; }
    .signature-block { margin-top: 72px; display: flex; justify-content: space-between; gap: 48px; }
    .signature-column { flex: 1; }
    .signature-line { border-bottom: 1px solid #cbd5e1; height: 50px; margin-bottom: 12px; position: relative; }
    .signature-line::after { content: 'X'; position: absolute; bottom: 4px; left: 0; font-size: 10px; color: #94a3b8; font-family: sans-serif; }
    .signature-label { font-size: 9.5pt; color: ${primaryColor}; font-weight: 700; }
    .signature-sublabel { font-size: 8.5pt; color: #64748b; margin-top: 4px; }
  `,
  legal: ({ primaryColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #000000;
    line-height: 2.0;
    font-size: ${11 * fontScale}pt;
    text-align: justify;
    h1 { text-align: center; text-transform: uppercase; font-size: ${15 * fontScale}pt; font-weight: bold; color: ${primaryColor}; border-bottom: 3px double ${primaryColor}; padding-bottom: 16px; margin: 40px 0; letter-spacing: 0.08em; }
    h2 { text-transform: uppercase; font-size: ${12 * fontScale}pt; font-weight: bold; color: ${primaryColor}; margin-top: 40px; margin-bottom: 16px; text-align: center; }
    h3 { font-size: ${11 * fontScale}pt; font-weight: bold; text-decoration: underline; margin-top: 24px; margin-bottom: 12px; }
    p { margin-bottom: 24px; text-indent: 40px; }
    p.no-indent { text-indent: 0; }
    table { width: 100%; border-collapse: collapse; margin: 32px 0; border: 2px solid ${primaryColor}; }
    th, td { border: 1px solid ${primaryColor}; padding: 12px 16px; vertical-align: top; }
    th { font-weight: bold; text-transform: uppercase; font-size: 10pt; text-align: center; }
    .signature-block { margin-top: 80px; display: flex; justify-content: space-between; gap: 40px; }
    .signature-column { flex: 1; }
    .signature-line { border-bottom: 1px solid ${primaryColor}; height: 40px; margin-bottom: 8px; }
    .signature-label { font-weight: bold; font-size: 10pt; text-transform: uppercase; }
  `,
  modern: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #4b5563;
    line-height: 1.7;
    font-size: ${10.5 * fontScale}pt;
    h1 { color: ${primaryColor}; font-weight: 800; font-size: ${22 * fontScale}pt; letter-spacing: -0.03em; margin-bottom: 32px; }
    h2 { color: ${primaryColor}; font-weight: 700; font-size: ${14 * fontScale}pt; margin-top: 36px; margin-bottom: 16px; display: flex; align-items: center; }
    h2::before { content: ''; display: inline-block; width: 24px; height: 3px; background-color: ${accentColor}; margin-right: 12px; border-radius: 2px; }
    h3 { color: ${accentColor}; font-weight: 600; font-size: ${11.5 * fontScale}pt; margin-top: 20px; margin-bottom: 10px; }
    p { margin-bottom: 18px; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 32px 0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03); border: 1px solid #f3f4f6; }
    th, td { padding: 16px 20px; text-align: left; }
    th { background-color: #f9fafb; color: ${primaryColor}; font-weight: 600; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e5e7eb; }
    td { border-bottom: 1px solid #f3f4f6; }
    tr:last-child td { border-bottom: none; }
    .signature-block { margin-top: 64px; display: flex; gap: 32px; }
    .signature-column { flex: 1; background: #f9fafb; padding: 24px; border-radius: 12px; border: 1px solid #e5e7eb; }
    .signature-line { border-bottom: 2px dashed #d1d5db; height: 40px; margin-bottom: 16px; }
    .signature-label { font-size: 10pt; color: ${primaryColor}; font-weight: 700; }
  `,
  executive: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #1e293b;
    line-height: 1.8;
    font-size: ${11 * fontScale}pt;
    h1 { color: ${primaryColor}; font-weight: 400; font-size: ${22 * fontScale}pt; text-align: center; border-top: 1px solid ${accentColor}; border-bottom: 1px solid ${accentColor}; padding: 20px 0; margin-bottom: 40px; letter-spacing: 0.02em; }
    h2 { color: ${primaryColor}; font-weight: 700; font-size: ${12 * fontScale}pt; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 40px; margin-bottom: 16px; text-align: center; }
    h3 { color: ${accentColor}; font-style: italic; font-size: ${11 * fontScale}pt; margin-top: 24px; margin-bottom: 12px; }
    p { margin-bottom: 20px; text-align: justify; }
    table { width: 100%; border-collapse: collapse; margin: 36px 0; }
    th, td { border-bottom: 1px solid #cbd5e1; padding: 14px 16px; }
    th { font-weight: 700; color: ${primaryColor}; text-transform: uppercase; font-size: 9pt; letter-spacing: 0.08em; border-bottom: 2px solid ${primaryColor}; }
    .signature-block { margin-top: 80px; display: flex; justify-content: space-around; gap: 40px; }
    .signature-column { flex: 1; max-width: 45%; }
    .signature-line { border-bottom: 1px solid ${primaryColor}; height: 50px; margin-bottom: 16px; }
    .signature-label { font-weight: 600; color: ${primaryColor}; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.05em; }
  `,
  minimal: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #27272a;
    line-height: 1.6;
    font-size: ${10 * fontScale}pt;
    h1 { font-weight: 500; font-size: ${16 * fontScale}pt; margin-bottom: 32px; letter-spacing: -0.02em; color: ${primaryColor}; }
    h2 { font-weight: 500; font-size: ${12 * fontScale}pt; margin-top: 32px; margin-bottom: 12px; color: ${primaryColor}; }
    h3 { font-weight: 500; font-size: ${10.5 * fontScale}pt; margin-top: 20px; margin-bottom: 8px; color: ${accentColor}; }
    p { margin-bottom: 16px; color: #3f3f46; }
    table { width: 100%; border-collapse: collapse; margin: 32px 0; }
    th, td { border-bottom: 1px solid #e4e4e7; padding: 12px 4px; text-align: left; }
    th { font-weight: 500; color: #71717a; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.05em; }
    .signature-block { margin-top: 72px; display: flex; gap: 48px; }
    .signature-column { flex: 1; }
    .signature-line { border-bottom: 1px solid #d4d4d8; height: 40px; margin-bottom: 12px; }
    .signature-label { font-size: 9pt; color: #52525b; }
  `,
  letterhead: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #1f2937;
    line-height: 1.6;
    font-size: ${11 * fontScale}pt;
    text-align: justify;
    h1 { text-align: center; font-weight: 700; font-size: ${18 * fontScale}pt; text-transform: uppercase; letter-spacing: 0.1em; color: ${primaryColor}; margin-bottom: 36px; }
    h2 { color: ${primaryColor}; font-weight: 700; font-size: ${13 * fontScale}pt; border-bottom: 1px solid ${accentColor}; padding-bottom: 8px; margin: 32px 0 16px; }
    h3 { font-weight: 600; font-size: ${11.5 * fontScale}pt; color: #374151; margin-top: 20px; margin-bottom: 10px; }
    p { margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; margin: 28px 0; border-top: 2px solid ${primaryColor}; border-bottom: 2px solid ${primaryColor}; }
    th, td { padding: 12px 16px; text-align: left; }
    th { font-weight: 700; font-size: 9.5pt; text-transform: uppercase; color: ${primaryColor}; border-bottom: 1px solid #d1d5db; background: #f9fafb; }
    td { border-bottom: 1px solid #e5e7eb; }
    .signature-block { margin-top: 64px; display: flex; justify-content: space-between; gap: 48px; }
    .signature-column { flex: 1; }
    .signature-line { border-bottom: 1px solid ${primaryColor}; height: 40px; margin-bottom: 12px; }
    .signature-label { font-size: 10pt; font-weight: 700; color: ${primaryColor}; }
  `,
  bold: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #18181b;
    line-height: 1.6;
    font-size: ${10.5 * fontScale}pt;
    h1 { background: ${primaryColor}; color: #ffffff; font-weight: 900; font-size: ${20 * fontScale}pt; text-transform: uppercase; letter-spacing: 0.05em; padding: 24px 32px; margin: -20px -20px 40px; box-shadow: 4px 4px 0px ${accentColor}; }
    h2 { color: #ffffff; background: ${accentColor}; display: inline-block; font-weight: 800; font-size: ${12 * fontScale}pt; padding: 8px 16px; margin-top: 36px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em; }
    h3 { color: ${primaryColor}; font-weight: 800; font-size: ${11.5 * fontScale}pt; margin-top: 24px; margin-bottom: 12px; text-transform: uppercase; }
    p { margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; margin: 32px 0; border: 3px solid ${primaryColor}; box-shadow: 4px 4px 0px ${accentColor}; }
    th, td { padding: 14px 16px; text-align: left; border: 1px solid ${primaryColor}; }
    th { background: ${primaryColor}; color: #ffffff; font-weight: 800; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.05em; }
    tr:nth-child(even) td { background: #f4f4f5; }
    .signature-block { margin-top: 72px; display: flex; gap: 32px; }
    .signature-column { flex: 1; border: 3px solid ${primaryColor}; padding: 24px; box-shadow: 4px 4px 0px ${accentColor}; background: #ffffff; }
    .signature-line { border-bottom: 3px solid ${primaryColor}; height: 32px; margin-bottom: 16px; }
    .signature-label { font-size: 10pt; font-weight: 900; text-transform: uppercase; color: ${primaryColor}; }
  `,
  editorial: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #292524;
    line-height: 1.75;
    font-size: ${11 * fontScale}pt;
    h1 { font-weight: 400; font-style: italic; font-size: ${28 * fontScale}pt; color: ${primaryColor}; text-align: center; margin-bottom: 8px; letter-spacing: -0.02em; }
    h1::after { content: ''; display: block; width: 80px; height: 1px; background: ${accentColor}; margin: 24px auto 40px; }
    h2 { font-weight: 600; font-size: ${12 * fontScale}pt; color: ${primaryColor}; text-transform: uppercase; letter-spacing: 0.15em; margin-top: 40px; margin-bottom: 16px; text-align: center; }
    h3 { font-weight: 700; font-style: italic; font-size: ${11.5 * fontScale}pt; color: ${accentColor}; margin-top: 24px; margin-bottom: 12px; }
    p { margin-bottom: 20px; text-align: justify; }
    p:first-of-type::first-letter { font-size: 3.5em; font-weight: 400; float: left; line-height: 0.8; padding-right: 12px; padding-top: 8px; color: ${primaryColor}; }
    table { width: 100%; border-collapse: collapse; margin: 36px 0; }
    th, td { padding: 16px 12px; border-bottom: 1px solid #e7e5e4; text-align: left; }
    th { font-weight: 600; font-style: italic; color: ${primaryColor}; font-size: 10.5pt; border-bottom: 2px solid ${accentColor}; }
    .signature-block { margin-top: 80px; display: flex; justify-content: space-between; gap: 48px; }
    .signature-column { flex: 1; text-align: center; }
    .signature-line { border-bottom: 1px solid ${primaryColor}; height: 48px; margin-bottom: 16px; }
    .signature-label { font-size: 10pt; font-style: italic; color: ${primaryColor}; font-weight: 600; }
  `,
};

const THEME_HEADERS: Record<DocumentTheme, (args: ThemeCssArgs) => string> = {
  corporate: ({ primaryColor, accentColor }) => `
    <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 32px; font-family: 'Inter', sans-serif;">
      <div>
        <div style="font-size: 28px; font-weight: 800; color: ${primaryColor}; letter-spacing: -0.02em;">CORPORATE</div>
        <div style="font-size: 12px; font-weight: 600; color: ${accentColor}; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px;">Entity Agreement</div>
      </div>
      <div style="text-align: right; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em;">
        Official Document<br/>Strictly Confidential
      </div>
    </div>`,
  legal: ({ primaryColor }) => `
    <div style="text-align: center; border-bottom: 2px solid ${primaryColor}; padding-bottom: 24px; margin-bottom: 40px; font-family: 'Times New Roman', serif; position: relative;">
      <div style="position: absolute; bottom: 4px; left: 0; right: 0; border-bottom: 1px solid ${primaryColor};"></div>
      <h2 style="margin:0; font-size: 24px; text-transform: uppercase; letter-spacing: 0.15em; color: ${primaryColor};">Legal Agreement</h2>
      <div style="font-style: italic; font-size: 14px; margin-top: 8px; color: #333;">Execution Copy</div>
    </div>`,
  modern: ({ primaryColor, accentColor }) => `
    <div style="display: flex; justify-content: space-between; align-items: center; background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 32px; font-family: 'Inter', sans-serif; border: 1px solid #f3f4f6;">
      <div style="font-size: 24px; font-weight: 800; color: ${primaryColor}; letter-spacing: -0.03em;">
        Brand<span style="color:${accentColor};">.</span>
      </div>
      <div style="background: ${accentColor}15; color: ${accentColor}; padding: 6px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">
        Contract terms
      </div>
    </div>`,
  executive: ({ primaryColor, accentColor }) => `
    <div style="text-align: center; padding-bottom: 24px; margin-bottom: 40px; font-family: Georgia, serif; position: relative;">
      <div style="width: 60px; height: 2px; background: ${accentColor}; margin: 0 auto 20px;"></div>
      <div style="font-size: 32px; font-weight: 400; color: ${primaryColor}; letter-spacing: 0.02em;">Executive Office</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 12px; text-transform: uppercase; letter-spacing: 0.15em;">Office of the Managing Director</div>
    </div>`,
  minimal: ({ primaryColor }) => `
    <div style="margin-bottom: 48px; font-family: system-ui, sans-serif; display: flex; align-items: center; gap: 16px;">
      <div style="width: 32px; height: 32px; border-radius: 4px; background: ${primaryColor};"></div>
      <div>
        <h1 style="font-size: 16px; font-weight: 600; margin: 0; color: ${primaryColor};">Contract of Employment</h1>
        <div style="font-size: 12px; color: #71717a; margin-top: 2px;">Standard Agreement</div>
      </div>
    </div>`,
  letterhead: ({ primaryColor, accentColor }) => `
    <div style="text-align: center; border-top: 4px solid ${primaryColor}; border-bottom: 1px solid #e5e7eb; padding: 24px 0; margin-bottom: 40px; font-family: 'Calibri', Arial, sans-serif;">
      <div style="font-size: 28px; font-weight: 700; color: ${primaryColor}; letter-spacing: 0.05em;">COMPANY NAME</div>
      <div style="font-size: 10px; font-weight: 600; color: ${accentColor}; letter-spacing: 0.2em; text-transform: uppercase; margin-top: 8px;">Official Correspondence</div>
    </div>`,
  bold: ({ primaryColor, accentColor }) => `
    <div style="background: ${primaryColor}; color: #fff; padding: 32px; margin: -20px -20px 40px; display: flex; justify-content: space-between; align-items: center; font-family: Arial, sans-serif; box-shadow: 4px 4px 0px ${accentColor};">
      <div style="font-size: 32px; font-weight: 900; letter-spacing: -0.02em;">AGREEMENT<span style="color: ${accentColor};">.</span></div>
      <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; background: rgba(255,255,255,0.1); padding: 8px 12px;">Official</div>
    </div>`,
  editorial: ({ primaryColor, accentColor }) => `
    <div style="text-align: center; margin-bottom: 48px; font-family: Georgia, 'Times New Roman', serif;">
      <div style="font-size: 10px; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: ${accentColor}; border-bottom: 1px solid #e7e5e4; display: inline-block; padding-bottom: 8px; margin-bottom: 16px;">The Employment Record</div>
      <div style="font-size: 38px; font-style: italic; font-weight: 400; color: ${primaryColor};">A Formal Agreement</div>
    </div>`,
};

/**
 * Applies the selected theme, color/font overrides, and branding strategy to merged HTML.
 */
export function applyThemeToHtml(content: string, settings: ContractThemeSettings): string {
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
    const companyHeader = `<div style="text-align: center; margin-bottom: 40px; font-family: sans-serif;">
        <h1 style="margin: 0; font-size: 26px; font-weight: 700; color: ${args.primaryColor};">{{company_name}}</h1>
        <p style="margin: 8px 0; font-size: 12px; color: #64748b; letter-spacing: 0.02em;">{{company_address}} | {{company_email}}</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-top: 24px;" />
    </div>`;
    finalContent = `${companyHeader}\n<div class="document-body">${finalContent}</div>`;
  }

  // 2. Apply theme styling - inject a scoped <style> block around the content
  const css = THEME_STYLES[theme]?.(args) || THEME_STYLES.corporate(args);

  return `
    <div class="contract-theme-${theme}" style="padding: 40px; max-width: 850px; margin: 0 auto; background: white; box-sizing: border-box;">
      <style>
        .contract-theme-${theme} {
          ${css}
        }
      </style>
      ${finalContent}
    </div>
  `;
}