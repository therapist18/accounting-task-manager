export type DocumentTheme = 'corporate' | 'legal' | 'modern' | 'executive' | 'minimal';
export type BrandingStrategy = 'embedded' | 'company_letterhead' | 'theme_header' | 'none';

export const THEME_STYLES: Record<DocumentTheme, string> = {
  corporate: `
    font-family: Arial, Helvetica, sans-serif;
    color: #333333;
    line-height: 1.6;
    h1, h2, h3 { color: #0056b3; font-weight: bold; border-bottom: 2px solid #0056b3; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 15px; }
    th, td { border: 1px solid #dddddd; padding: 8px; }
    th { background-color: #f2f2f2; }
    .signature-block { margin-top: 40px; border-top: 1px solid #000; width: 300px; padding-top: 10px; }
  `,
  legal: `
    font-family: "Times New Roman", Times, serif;
    color: #000000;
    line-height: 2.0;
    text-align: justify;
    h1, h2, h3 { text-align: center; text-transform: uppercase; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #000; padding: 10px; }
    .signature-block { margin-top: 50px; display: flex; justify-content: space-between; }
    .signature-line { border-top: 1px solid #000; width: 250px; padding-top: 5px; text-align: left; }
  `,
  modern: `
    font-family: "Inter", "Segoe UI", Roboto, sans-serif;
    color: #1f2937;
    line-height: 1.5;
    h1, h2, h3 { color: #111827; font-weight: 600; letter-spacing: -0.025em; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 20px 0; }
    th { background-color: #f3f4f6; text-align: left; padding: 12px; border-bottom: 2px solid #e5e7eb; }
    td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
    .signature-block { margin-top: 40px; border-top: 2px dashed #d1d5db; width: 300px; padding-top: 15px; }
  `,
  executive: `
    font-family: "Georgia", serif;
    color: #1e293b;
    line-height: 1.8;
    h1, h2, h3 { color: #0f172a; font-weight: normal; font-style: italic; border-bottom: 1px solid #cbd5e1; }
    table { width: 100%; border-collapse: collapse; margin: 25px 0; }
    th, td { border: 1px solid #94a3b8; padding: 10px; }
    th { background-color: #f8fafc; font-weight: bold; }
    .signature-block { margin-top: 60px; border-top: 1px solid #334155; width: 100%; text-align: left; padding-top: 10px; }
  `,
  minimal: `
    font-family: system-ui, -apple-system, sans-serif;
    color: #000000;
    line-height: 1.4;
    h1, h2, h3 { font-weight: 500; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { border-bottom: 1px solid #eaeaea; padding: 8px 0; }
    th { font-weight: 500; text-align: left; color: #666; }
    .signature-block { margin-top: 50px; padding-top: 20px; }
  `
};

export const THEME_HEADERS: Record<DocumentTheme, string> = {
  corporate: `<div style="text-align: right; border-bottom: 3px solid #0056b3; padding-bottom: 10px; margin-bottom: 20px; font-family: Arial, sans-serif;">
                <strong style="color: #0056b3; font-size: 24px;">CORPORATE ENTITY</strong><br/>
                <span style="font-size: 12px; color: #666;">Official Employment Document</span>
              </div>`,
  legal: `<div style="text-align: center; border-bottom: 1px double #000; padding-bottom: 10px; margin-bottom: 30px; font-family: 'Times New Roman', serif;">
                <h2 style="margin:0; text-transform:uppercase; letter-spacing: 2px;">Legal Agreement</h2>
                <span style="font-style: italic;">Strictly Private & Confidential</span>
          </div>`,
  modern: `<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e5e7eb; padding-bottom: 15px; margin-bottom: 25px; font-family: 'Inter', sans-serif;">
             <div style="font-size: 20px; font-weight: bold; color: #111827;">Brand<span style="color:#3b82f6;">.</span></div>
             <div style="font-size: 12px; color: #6b7280;">Employment Contract</div>
           </div>`,
  executive: `<div style="text-align: center; border-bottom: 1px solid #cbd5e1; padding-bottom: 20px; margin-bottom: 30px; font-family: Georgia, serif;">
                <div style="font-size: 28px; font-style: italic; color: #0f172a;">Executive Office</div>
                <div style="font-size: 11px; color: #475569; margin-top: 5px; text-transform: uppercase; letter-spacing: 1px;">Office of the Managing Director</div>
              </div>`,
  minimal: `<div style="margin-bottom: 40px; font-family: system-ui, sans-serif;">
              <h1 style="font-size: 18px; font-weight: 500; margin: 0;">Contract of Employment</h1>
            </div>`
};

/**
 * Applies the selected document theme and branding strategy to an HTML template.
 */
export function applyThemeToHtml(
  content: string, 
  theme: DocumentTheme = 'corporate', 
  brandingStrategy: BrandingStrategy = 'none'
): string {
  let finalContent = content;

  // 1. Branding Strategy: Prepend header if applicable
  if (brandingStrategy === 'theme_header') {
    const header = THEME_HEADERS[theme] || '';
    finalContent = `${header}\n<div class="document-body">${finalContent}</div>`;
  } else if (brandingStrategy === 'company_letterhead') {
    // In a full implementation, we would fetch the company's actual HTML letterhead
    // and inject the body into it. For now, we simulate a generic company header.
    const companyHeader = `<div style="text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 24px;">{{company_name}}</h1>
        <p style="margin: 5px 0; font-size: 12px; color: #666;">{{company_address}} | {{company_email}}</p>
        <hr style="border: 0; border-top: 1px solid #ccc; margin-top: 15px;" />
    </div>`;
    finalContent = `${companyHeader}\n<div class="document-body">${finalContent}</div>`;
  }

  // 2. Apply Theme Styling
  // For HTML, we inject a <style> block or wrap it in a styled container.
  const css = THEME_STYLES[theme] || THEME_STYLES.corporate;
  
  return `
    <div class="contract-theme-${theme}" style="padding: 20px; max-width: 800px; margin: 0 auto; background: white;">
      <style>
        .contract-theme-${theme} {
          ${css}
        }
      </style>
      ${finalContent}
    </div>
  `;
}

/**
 * Note for DOCX templates:
 * Applying themes (fonts, colors, etc.) dynamically to a DOCX file requires deep XML manipulation 
 * of the word/styles.xml and word/theme/theme1.xml inside the zipped buffer.
 * 
 * If a user selects "Embedded in Template", the DOCX's original styles remain untouched.
 * If a user wants to use a "Theme" for DOCX without an advanced library (like docxtemplater PRO), 
 * the recommended approach is to either:
 * A) Provide pre-styled DOCX template variations (Corporate.docx, Legal.docx).
 * B) Convert the content to HTML first, apply the HTML theme, and then convert back to PDF/Word.
 */
