export type DocumentTheme = 'consulting_standard' | 'modern_agency' | 'classic_legal';
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
  consulting_standard: { 
    primaryColor: '#0a3d7d', // Deep blue from the document text/headers
    accentColor: '#178ac7', // Light blue/cyan from the banner graphic
    fontFamily: "'Arial', 'Helvetica', sans-serif", 
    label: 'Consulting Standard', 
    description: 'Based on the official Consultancy Agreement styling' 
  },
  modern_agency: { 
    primaryColor: '#09090b', 
    accentColor: '#10b981', 
    fontFamily: "'Inter', sans-serif", 
    label: 'Modern Agency', 
    description: 'Clean, minimalist, and highly legible for modern tech/agencies' 
  },
  classic_legal: { 
    primaryColor: '#000000', 
    accentColor: '#333333', 
    fontFamily: '"Times New Roman", Times, serif', 
    label: 'Classic Legal', 
    description: 'Strict, double-spaced formal legal formatting' 
  },
};

export const DEFAULT_CONTRACT_THEME: ContractThemeSettings = {
  theme: 'consulting_standard',
  primaryColor: THEME_DEFAULTS.consulting_standard.primaryColor,
  accentColor: THEME_DEFAULTS.consulting_standard.accentColor,
  fontFamily: THEME_DEFAULTS.consulting_standard.fontFamily,
  fontScale: 1,
  brandingStrategy: 'theme_header',
};

import { COLOR_PRESETS, toWordSafeFontStack, makeCssWordSafe } from '@/lib/documentTheme';
export { COLOR_PRESETS, toWordSafeFontStack };

export const FONT_OPTIONS = [
  { name: 'Arial', family: 'Arial, Helvetica, sans-serif', desc: 'Plain sans' },
  { name: 'Times New Roman', family: '"Times New Roman", Times, serif', desc: 'Classic legal' },
  { name: 'Inter', family: 'Inter, sans-serif', desc: 'Clean modern' },
  { name: 'Georgia', family: 'Georgia, "Times New Roman", serif', desc: 'Elegant serif' },
];

type ThemeCssArgs = { primaryColor: string; accentColor: string; fontFamily: string; fontScale: number };

const BASE_SECTION_STYLES = `
  .cs-section, .cs-section * { white-space: normal; }
  .cs-section { margin-bottom: 16px; }
  .cs-section:last-child { margin-bottom: 0; }
  .cs-missing-clause { color: #b91c1c; font-style: italic; border: 1px dashed #b91c1c; padding: 10px 14px; border-radius: 4px; }
  .cs-section p { margin-bottom: 8px; }
  .cs-section ul { list-style-type: disc; margin-bottom: 8px; padding-left: 20px; }
  .cs-section ol { list-style-type: decimal; margin-bottom: 8px; padding-left: 20px; }
  .cs-section li { display: list-item; margin-bottom: 4px; }
  .cs-section h1 { margin-bottom: 16px; }
  .cs-section h2 { margin-top: 4px; margin-bottom: 8px; }
  .cs-section h3 { margin-top: 10px; margin-bottom: 6px; }
  .cs-section .signature-block { margin-top: 28px; }
  [data-section="appendix_job_description"] { page-break-before: always; }
  [data-section="signatures"] { page-break-inside: avoid; }
  .cs-section-heading { margin-top: 20px; margin-bottom: 8px; }
  .ph-entity-company { background: #dbeafe; border-radius: 3px; padding: 0 3px; }
  .ph-entity-employee { background: #dcfce7; border-radius: 3px; padding: 0 3px; }
  .ph-entity-missing { opacity: 0.55; font-style: italic; }
`;

const THEME_STYLES: Record<DocumentTheme, (args: ThemeCssArgs) => string> = {
  consulting_standard: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
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
    table { width: 100%; border-collapse: collapse; margin: 24px 0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03); border: 1px solid #e2e8f0; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 14px; text-align: left; line-height: 1.4; }
    th { background-color: ${primaryColor}; color: #ffffff; font-weight: 600; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.05em; }
    tr:nth-child(even) td { background-color: #f8fafc; }
    tr:last-child td { border-bottom: none; }
    .signature-block { margin-top: 72px; display: flex; justify-content: space-between; gap: 48px; }
    .signature-column { flex: 1; padding: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
    .signature-line { border-bottom: 1px solid #94a3b8; height: 50px; margin-bottom: 12px; position: relative; }
    .signature-line::after { content: 'Signature'; position: absolute; bottom: 4px; left: 0; font-size: 9px; color: #cbd5e1; text-transform: uppercase; font-family: sans-serif; letter-spacing: 0.1em; }
    .signature-label { font-size: 10pt; color: ${primaryColor}; font-weight: 700; text-transform: uppercase; }
  `,
  modern_agency: ({ primaryColor, accentColor, fontFamily, fontScale }) => `
    font-family: ${fontFamily};
    color: #4b5563;
    line-height: 1.75;
    font-size: ${10.5 * fontScale}pt;
    h1 { color: ${primaryColor}; font-weight: 800; font-size: ${24 * fontScale}pt; letter-spacing: -0.03em; margin-bottom: 32px; }
    h2 { color: ${primaryColor}; font-weight: 700; font-size: ${14 * fontScale}pt; margin-top: 40px; margin-bottom: 16px; display: flex; align-items: center; }
    h2::before { content: ''; display: inline-block; width: 12px; height: 12px; border-radius: 50%; background-color: ${accentColor}; margin-right: 12px; }
    h3 { color: ${accentColor}; font-weight: 600; font-size: ${11.5 * fontScale}pt; margin-top: 24px; margin-bottom: 10px; background: ${accentColor}10; display: inline-block; padding: 4px 12px; border-radius: 20px; }
    p { margin-bottom: 18px; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 24px 0; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); border: 1px solid #f3f4f6; }
    th, td { padding: 10px 14px; text-align: left; line-height: 1.4; }
    th { background-color: #f9fafb; color: ${primaryColor}; font-weight: 700; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e5e7eb; }
    td { border-bottom: 1px solid #f3f4f6; }
    tr:last-child td { border-bottom: none; }
    .signature-block { margin-top: 72px; display: flex; gap: 32px; }
    .signature-column { flex: 1; background: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.04); padding: 30px; border-radius: 16px; border: 1px solid #f3f4f6; position: relative; overflow: hidden; }
    .signature-column::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: ${accentColor}; }
    .signature-line { border-bottom: 2px dashed #d1d5db; height: 40px; margin-bottom: 16px; }
    .signature-label { font-size: 11pt; color: ${primaryColor}; font-weight: 800; }
  `,
  classic_legal: ({ primaryColor, fontFamily, fontScale }) => `
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
    table { width: 100%; border-collapse: collapse; margin: 24px 0; border: 2px solid ${primaryColor}; }
    th, td { border: 1px solid ${primaryColor}; padding: 10px 14px; vertical-align: top; line-height: 1.4; }
    th { font-weight: bold; text-transform: uppercase; font-size: 10pt; text-align: center; background: #f5f5f5; }
    .signature-block { margin-top: 80px; display: flex; justify-content: space-between; gap: 40px; }
    .signature-column { flex: 1; }
    .signature-line { border-bottom: 1px solid ${primaryColor}; height: 40px; margin-bottom: 8px; }
    .signature-label { font-weight: bold; font-size: 10pt; text-transform: uppercase; }
  `,
};

const THEME_TOC_STYLES: Record<DocumentTheme, (args: ThemeCssArgs) => string> = {
  consulting_standard: ({ primaryColor, accentColor }) => `
    .cs-toc { margin-bottom: 32px; border: 1px solid #e2e8f0; border-left: 6px solid ${accentColor}; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
    .cs-toc-heading { font-size: 11pt; font-weight: 800; padding: 12px 18px; margin: 0; text-transform: uppercase; letter-spacing: 0.08em; background: #f8fafc; color: ${primaryColor}; border-bottom: 1px solid #e2e8f0; }
    .cs-toc-list { list-style: none; margin: 0; padding: 8px 0; }
    .cs-toc-item { margin: 0; }
    .cs-toc-link { display: block; padding: 6px 18px; text-decoration: none; color: inherit; font-size: 10.5pt; line-height: 1.6; }
    .cs-toc-num { font-weight: 700; margin-right: 8px; min-width: 28px; display: inline-block; color: ${accentColor}; }
  `,
  modern_agency: ({ primaryColor, accentColor }) => `
    .cs-toc { margin-bottom: 32px; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -8px rgba(0,0,0,0.08); border: 1px solid #f3f4f6; }
    .cs-toc-heading { font-size: 11pt; font-weight: 700; padding: 14px 20px; margin: 0; color: ${primaryColor}; background: #f9fafb; }
    .cs-toc-list { list-style: none; margin: 0; padding: 6px 0; }
    .cs-toc-item { margin: 0; }
    .cs-toc-link { display: block; position: relative; padding: 7px 20px 7px 34px; text-decoration: none; color: inherit; font-size: 10pt; }
    .cs-toc-link::before { content: ''; position: absolute; left: 20px; top: 50%; margin-top: -3px; width: 6px; height: 6px; border-radius: 50%; background: ${accentColor}; }
    .cs-toc-num { font-weight: 700; margin-right: 6px; color: ${accentColor}; }
  `,
  classic_legal: ({ primaryColor }) => `
    .cs-toc { margin-bottom: 40px; border: 3px double ${primaryColor}; padding: 20px 0; }
    .cs-toc-heading { font-size: 13pt; font-weight: bold; text-align: left; text-transform: uppercase; letter-spacing: 0.15em; margin: 0 0 12px; color: ${primaryColor}; }
    .cs-toc-list { list-style: none; margin: 0; padding: 0 32px; }
    .cs-toc-item { margin: 0; text-align: left; }
    .cs-toc-link { display: block; padding: 4px 0; text-decoration: none; color: inherit; font-size: 10.5pt; }
    .cs-toc-num { font-weight: bold; margin-right: 8px; }
  `,
};

const THEME_HEADERS: Record<DocumentTheme, (args: ThemeCssArgs) => string> = {
  // Replicates the geometric graphic banner from the 2nd provided image
  consulting_standard: ({ primaryColor, accentColor }) => `
    <div style="margin-bottom: 40px; width: 100%;">
        <div style="display: flex; height: 45px; width: 100%;">
            <div style="background-color: ${accentColor}; width: 70%;"></div>
            <div style="background-color: ${primaryColor}; width: 30%; border-left: 20px solid #ffffff; /* Simulates the angle offset */"></div>
        </div>
        <div style="display: flex; height: 10px; width: 100%; margin-top: 4px;">
            <div style="flex: 1;"></div>
            <div style="background-color: ${primaryColor}; width: 30%; border-left: 20px solid #ffffff;"></div>
        </div>
    </div>`,
  modern_agency: ({ primaryColor, accentColor }) => `
    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #e4e4e7; padding-bottom: 24px; margin-bottom: 48px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 24px; height: 24px; background: ${accentColor}; border-radius: 4px;"></div>
        <div style="font-family: 'Inter', sans-serif; font-size: 20px; font-weight: 800; color: ${primaryColor};">{{company_name}}</div>
      </div>
      <div style="font-family: 'Inter', sans-serif; font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 0.1em;">Standard Agreement</div>
    </div>`,
  classic_legal: ({ primaryColor }) => `
    <div style="text-align: center; margin-bottom: 48px; font-family: 'Times New Roman', serif;">
      <h2 style="margin:0; font-size: 22px; text-transform: uppercase; font-weight: bold; color: ${primaryColor};">Legal Instrument</h2>
      <div style="width: 60%; height: 1px; background: ${primaryColor}; margin: 16px auto;"></div>
      <div style="font-size: 12px; color: #333; text-transform: uppercase; letter-spacing: 0.1em;">{{company_name}}</div>
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

    const fullSelector = selectorPart
      .split(',')
      .map((s) => `${rootSelector} ${s.trim()}`)
      .join(', ');
    rules.push(`${fullSelector} { ${body} }`);
  }

  return [`${rootSelector} { ${baseDecls.trim()} }`, ...rules].join('\n');
}



export function applyThemeToHtml(content: string, settings: ContractThemeSettings, options?: { wordSafe?: boolean }): string {
  // settings.theme || 'consulting_standard' only guards falsy values - a
  // theme key saved before this engine's DocumentTheme union changed (e.g.
  // stale cc_templates.theme_settings from an earlier iteration) is truthy
  // but absent from THEME_DEFAULTS, which crashed the primaryColor/
  // accentColor/fontFamily lookups below.
  const theme = settings.theme && THEME_DEFAULTS[settings.theme] ? settings.theme : 'consulting_standard';
  const args: ThemeCssArgs = {
    primaryColor: settings.primaryColor || THEME_DEFAULTS[theme].primaryColor,
    accentColor: settings.accentColor || THEME_DEFAULTS[theme].accentColor,
    fontFamily: settings.fontFamily || THEME_DEFAULTS[theme].fontFamily,
    fontScale: settings.fontScale || 1,
  };

  let finalContent = content;

  if (settings.brandingStrategy === 'theme_header') {
    const header = THEME_HEADERS[theme]?.(args) || '';
    finalContent = `${header}\n<div class="document-body">${finalContent}</div>`;
  } else if (settings.brandingStrategy === 'company_letterhead') {
    const companyHeader = `<div style="font-family: sans-serif; padding-bottom: 12px; margin-bottom: 20px; border-bottom: 2px solid ${args.primaryColor}; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px;">
        <div style="font-size: 17px; font-weight: 800; color: ${args.primaryColor};">${settings.theme === 'classic_legal' ? '{{company_name}}'.toUpperCase() : '{{company_name}}'}</div>
        <div style="text-align: right; font-size: 10px; color: #555; line-height: 1.5;">{{company_address}}<br/>{{company_email}}</div>
    </div>`;
    finalContent = `${companyHeader}\n<div class="document-body">${finalContent}</div>`;
  }

  const rawCss = (THEME_STYLES[theme]?.(args) || THEME_STYLES.consulting_standard(args))
    + (THEME_TOC_STYLES[theme]?.(args) || THEME_TOC_STYLES.consulting_standard(args))
    + BASE_SECTION_STYLES;
    
  const rootSelector = `.contract-theme-${theme}`;
  let flatCss = flattenNestedCss(rootSelector, rawCss);
  if (options?.wordSafe) flatCss = makeCssWordSafe(flatCss, rootSelector, args.fontFamily);

  return `
    <div class="contract-theme-${theme}" style="padding: 48px; max-width: 850px; margin: 0 auto; background: white; box-sizing: border-box;">
      <style>
        ${flatCss}
      </style>
      ${finalContent}
    </div>
  `;
}