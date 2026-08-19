import { FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRef } from 'react';
import type { Individual } from '../../individuals/database';

interface BiodataPreviewProps {
  selectedIndividual: Individual | null;
  biodataConfig: any;
}

export function BiodataPreview({ selectedIndividual, biodataConfig }: BiodataPreviewProps) {
  const printRef = useRef<HTMLIFrameElement>(null);

  if (!selectedIndividual) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500">
        <FileText className="w-12 h-12 text-slate-300 mb-4" />
        <p>No preview available</p>
      </div>
    );
  }

  const fullName = selectedIndividual.full_name;

  const handlePrint = () => {
    if (printRef.current) {
      printRef.current.contentWindow?.print();
    }
  };

  const getTheme1Html = () => {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>Biodata - ${fullName}</title>
          <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Great+Vibes&family=Montserrat:wght@300;400;600&display=swap" rel="stylesheet">
          <style>
              :root { --royal-blue: #0a1e3d; --gold: #d4af37; --soft-gold: #fcf6ba; }
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { background-color: #f0f0f0; font-family: 'Montserrat', sans-serif; display: flex; justify-content: center; padding: 20px 0; }
              .biodata-card { width: 210mm; height: 297mm; background: var(--royal-blue); position: relative; color: white; padding: 20px 32px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.5); border: 6px double var(--gold); }
              header { display: flex; align-items: center; justify-content: center; gap: 30px; position: relative; z-index: 2; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid rgba(212,175,55,0.3); }
              .header-info { display: flex; flex-direction: column; align-items: flex-start; }
              .header-info h2 { font-family: 'Great Vibes', cursive; font-size: 2.4rem; color: var(--gold); margin-bottom: 0px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); line-height: 1.1; }
              .header-divider { width: 100%; height: 2px; background: linear-gradient(to right, var(--gold), transparent); margin: 6px 0; }
              .subtitle { letter-spacing: 4px; font-weight: 300; font-size: 0.75rem; color: var(--soft-gold); margin-bottom: 12px; }
              .header-contact { display: flex; flex-direction: column; gap: 6px; font-size: 0.75rem; }
              .header-contact span { display: flex; align-items: center; gap: 8px; color: var(--gold); font-weight: 600; }
              .header-contact .address { color: var(--soft-gold); font-weight: 400; opacity: 0.9; }
              .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; position: relative; z-index: 2; }
              .detail-box { background: rgba(255,255,255,0.05); border: 1px solid rgba(212,175,55,0.3); padding: 10px 16px; border-radius: 12px; backdrop-filter: blur(5px); }
              .section-title { font-family: 'Cinzel', serif; color: var(--gold); font-size: 0.9rem; border-bottom: 1px solid var(--gold); padding-bottom: 4px; margin-bottom: 7px; text-align: center; letter-spacing: 1.5px; }
              .info-row { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 4px; font-size: 0.75rem; }
              .label { color: var(--soft-gold); font-weight: 300; flex-shrink: 0; }
              .value { font-weight: 600; text-align: right; max-width: 62%; }
              .family-section { grid-column: span 2; margin-top: 5px; }
              .family-content { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
              .family-member-title { color: var(--gold); font-weight: 600; margin-bottom: 3px; display: block; font-size: 0.85rem; }
              .family-content p, .roots-text { font-size: 0.75rem; line-height: 1.4; }
              @media print {
                  @page { size: A4; margin: 0; }
                  body { padding: 0; }
                  .biodata-card { box-shadow: none; border: none; }
                  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              }
          </style>
      </head>
      <body>
          <div class="biodata-card">
              <header>
                  <div class="header-info">
                      <h2>${fullName}</h2>
                      <div class="header-divider"></div>
                      <p class="subtitle">MATRIMONIAL BIODATA</p>
                      <div class="header-contact">
                          <span>📞 ${biodataConfig.phone || '-'}</span>
                          <span>✉️ ${biodataConfig.email || '-'}</span>
                          <span class="address">📍 ${biodataConfig.address || '-'}</span>
                      </div>
                  </div>
              </header>
              <div class="details-grid">
                  <div class="detail-box">
                      <h3 class="section-title">Personal Details</h3>
                      <div class="info-row"><span class="label">Date of Birth</span><span class="value">${biodataConfig.personal?.dob || '-'}</span></div>
                      <div class="info-row"><span class="label">Time of Birth</span><span class="value">${biodataConfig.personal?.tob || '-'}</span></div>
                      <div class="info-row"><span class="label">Birth Place</span><span class="value">${biodataConfig.personal?.birthPlace || '-'}</span></div>
                      <div class="info-row"><span class="label">Height</span><span class="value">${biodataConfig.personal?.height || '-'}</span></div>
                      <div class="info-row"><span class="label">Religion</span><span class="value">${biodataConfig.personal?.religion || '-'}</span></div>
                      <div class="info-row"><span class="label">Community</span><span class="value">${biodataConfig.personal?.community || '-'}</span></div>
                      <div class="info-row"><span class="label">Nationality</span><span class="value">${biodataConfig.personal?.nationality || '-'}</span></div>
                      <div class="info-row"><span class="label">Marital Status</span><span class="value">${biodataConfig.personal?.maritalStatus || '-'}</span></div>
                  </div>
                  <div class="detail-box">
                      <h3 class="section-title">Career & Lifestyle</h3>
                      <div class="info-row"><span class="label">Education</span><span class="value">${biodataConfig.career?.education || '-'}</span></div>
                      <div class="info-row"><span class="label">Occupation</span><span class="value">${biodataConfig.career?.occupation || '-'}</span></div>
                      <div class="info-row"><span class="label">Hobbies</span><span class="value">${biodataConfig.career?.hobbies || '-'}</span></div>
                      <div class="info-row"><span class="label">Languages</span><span class="value">${biodataConfig.career?.languages || '-'}</span></div>
                  </div>
                  <div class="detail-box family-section">
                      <h3 class="section-title">Family Background</h3>
                      <div class="family-content">
                          <div>
                              <span class="family-member-title">Father</span>
                              <p>${biodataConfig.family?.fatherName || '-'}</p>
                              <p style="color: var(--soft-gold);">${biodataConfig.family?.fatherDesc || ''}</p>
                          </div>
                          <div>
                              <span class="family-member-title">Mother</span>
                              <p>${biodataConfig.family?.motherName || '-'}</p>
                              <p style="color: var(--soft-gold);">${biodataConfig.family?.motherDesc || ''}</p>
                          </div>
                      </div>
                      <div style="margin-top: 10px; border-top: 1px solid rgba(212, 175, 55, 0.2); padding-top: 10px;">
                          <span class="family-member-title">Maternal Family</span>
                          <p>${biodataConfig.family?.maternalDesc || '-'}</p>
                      </div>
                  </div>
                  <div class="detail-box family-section">
                      <h3 class="section-title">Community & Roots</h3>
                      <p class="roots-text">${biodataConfig.roots || '-'}</p>
                  </div>
              </div>
          </div>
      </body>
      </html>
    `;
  };

  const getTheme2Html = () => {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>Biodata - ${fullName}</title>
          <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,500;0,700;1,500&display=swap" rel="stylesheet">
          <style>
              :root { --bg-color: #FDFBF7; --primary-dark: #4A1525; --gold: #C5A059; --text-main: #333333; --text-light: #666666; }
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { background-color: #e0e0e0; font-family: 'Montserrat', sans-serif; display: flex; justify-content: center; padding: 20px 0; }
              .biodata-card { width: 210mm; height: 297mm; background-color: var(--bg-color); position: relative; box-shadow: 0 15px 40px rgba(0,0,0,0.2); padding: 22px 20px; overflow: hidden; }
              .biodata-card::after { content: ""; position: absolute; top: 15px; left: 15px; right: 15px; bottom: 15px; border: 1px solid var(--gold); pointer-events: none; z-index: 10; }
              .center-panel { background: rgba(255,255,255,0.6); border: 2px solid rgba(197,160,89,0.3); border-radius: 15px; padding: 20px 30px; z-index: 2; display: flex; flex-direction: column; gap: 14px; }
              header { text-align: center; border-bottom: 1px solid var(--gold); padding-bottom: 10px; position: relative; }
              header h1 { font-family: 'Playfair Display', serif; color: var(--primary-dark); font-size: 1.85rem; line-height: 1.2; margin-bottom: 6px; }
              .subtitle { font-size: 0.8rem; letter-spacing: 3px; color: var(--gold); font-weight: 500; text-transform: uppercase; }
              .contact-info { text-align: center; font-size: 0.8rem; color: var(--text-main); line-height: 1.55; margin-top: 7px; }
              .section { margin-top: 5px; }
              .section-title { font-family: 'Playfair Display', serif; font-size: 1.15rem; color: var(--primary-dark); font-style: italic; margin-bottom: 9px; display: flex; align-items: center; gap: 10px; }
              .section-title::after { content: ""; flex: 1; height: 1px; background: linear-gradient(to right, var(--gold), transparent); }
              .info-row { display: grid; grid-template-columns: 38% 62%; padding: 4px 0; border-bottom: 1px dashed rgba(197,160,89,0.4); font-size: 0.8rem; }
              .label { color: var(--text-light); font-weight: 500; }
              .value { color: var(--text-main); font-weight: 600; }
              .family-block { margin-bottom: 8px; font-size: 0.8rem; line-height: 1.42; }
              .family-role { font-weight: 600; color: var(--primary-dark); }
              .family-desc { color: var(--text-light); padding-left: 10px; border-left: 2px solid var(--gold); margin-top: 3px; }
              .roots-text { font-size: 0.8rem; line-height: 1.6; color: var(--text-main); text-align: justify; }
              @media print {
                  @page { size: A4; margin: 0; }
                  body { padding: 0; background: none; }
                  .biodata-card { box-shadow: none; border: none; }
                  .biodata-card::after { border-color: black; }
                  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              }
          </style>
      </head>
      <body>
          <div class="biodata-card">
              <div class="center-panel">
                  <header>
                      <h1>${fullName}</h1>
                      <div class="subtitle">Matrimonial Biodata</div>
                      <div class="contact-info">
                          <p><strong>📞</strong> ${biodataConfig.phone || '-'} &nbsp;|&nbsp; <strong>✉️</strong> ${biodataConfig.email || '-'}</p>
                          <p><strong>📍</strong> ${biodataConfig.address || '-'}</p>
                      </div>
                  </header>
                  <div class="section">
                      <h2 class="section-title">Personal Details</h2>
                      <div class="info-row"><span class="label">Date of Birth</span><span class="value">${biodataConfig.personal?.dob || '-'}</span></div>
                      <div class="info-row"><span class="label">Time of Birth</span><span class="value">${biodataConfig.personal?.tob || '-'}</span></div>
                      <div class="info-row"><span class="label">Birth Place</span><span class="value">${biodataConfig.personal?.birthPlace || '-'}</span></div>
                      <div class="info-row"><span class="label">Height</span><span class="value">${biodataConfig.personal?.height || '-'}</span></div>
                      <div class="info-row"><span class="label">Religion</span><span class="value">${biodataConfig.personal?.religion || '-'}</span></div>
                      <div class="info-row"><span class="label">Community</span><span class="value">${biodataConfig.personal?.community || '-'}</span></div>
                      <div class="info-row"><span class="label">Nationality</span><span class="value">${biodataConfig.personal?.nationality || '-'}</span></div>
                      <div class="info-row"><span class="label">Marital Status</span><span class="value">${biodataConfig.personal?.maritalStatus || '-'}</span></div>
                  </div>
                  <div class="section">
                      <h2 class="section-title">Career & Lifestyle</h2>
                      <div class="info-row"><span class="label">Education</span><span class="value">${biodataConfig.career?.education || '-'}</span></div>
                      <div class="info-row"><span class="label">Occupation</span><span class="value">${biodataConfig.career?.occupation || '-'}</span></div>
                      <div class="info-row"><span class="label">Hobbies</span><span class="value">${biodataConfig.career?.hobbies || '-'}</span></div>
                      <div class="info-row"><span class="label">Languages</span><span class="value">${biodataConfig.career?.languages || '-'}</span></div>
                  </div>
                  <div class="section">
                      <h2 class="section-title">Family Background</h2>
                      <div class="family-block">
                          <div class="family-role">Father: ${biodataConfig.family?.fatherName || '-'}</div>
                          <div class="family-desc">${biodataConfig.family?.fatherDesc || ''}</div>
                      </div>
                      <div class="family-block">
                          <div class="family-role">Mother: ${biodataConfig.family?.motherName || '-'}</div>
                          <div class="family-desc">${biodataConfig.family?.motherDesc || ''}</div>
                      </div>
                      <div class="family-block">
                          <div class="family-role">Maternal Family</div>
                          <div class="family-desc">${biodataConfig.family?.maternalDesc || '-'}</div>
                      </div>
                  </div>
                  <div class="section">
                      <h2 class="section-title">Roots & Values</h2>
                      <p class="roots-text">${biodataConfig.roots || '-'}</p>
                  </div>
              </div>
          </div>
      </body>
      </html>
    `;
  };

  const htmlContent = biodataConfig.theme === 'theme2' ? getTheme2Html() : getTheme1Html();

  return (
    <div className="flex flex-col h-full bg-slate-100/50 dark:bg-slate-900/50 relative">
      {/* Action Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0 shadow-sm z-10">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <FileText className="w-4 h-4 text-custom-blue" />
          Preview Document
        </h2>
        
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            className="h-8 bg-custom-blue hover:bg-blue-700 text-white shadow-sm flex items-center gap-2"
            onClick={handlePrint}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download PDF</span>
          </Button>
        </div>
      </div>

      {/* iframe container with scrolling */}
      <div className="flex-1 overflow-auto p-8 relative">
        <div className="mx-auto bg-white shadow-2xl" style={{ width: '210mm', minHeight: '297mm' }}>
          <iframe 
            ref={printRef}
            srcDoc={htmlContent}
            style={{ width: '100%', height: '297mm', border: 'none' }}
            title="Biodata Preview"
          />
        </div>
      </div>
    </div>
  );
}
