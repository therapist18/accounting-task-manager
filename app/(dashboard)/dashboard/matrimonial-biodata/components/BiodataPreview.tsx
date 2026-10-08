import { FileText, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRef, useState } from 'react';
import { downloadPdf } from '@/lib/documentExport';
import type { Individual } from '../../individuals/database';
import type { Placeholder } from '../../templates/document-template-manager/types';

interface BiodataPreviewProps {
  selectedIndividual: Individual | null;
  placeholders: Placeholder[];
  values: Record<string, string>;
  theme: string;
  images: string[];
}

export function BiodataPreview({ selectedIndividual, placeholders, values, theme, images }: BiodataPreviewProps) {
  const printRef = useRef<HTMLIFrameElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  if (!selectedIndividual) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
        <FileText className="w-12 h-12 text-slate-300 mb-4" />
        <p>No preview available</p>
      </div>
    );
  }

  const fullName = values.full_name || selectedIndividual.full_name;
  const v = (key: string) => values[key] || '-';

  // The theme HTML is already a complete document with its own @page and
  // fonts, so it goes to the server render as-is (downloadPdf passes full
  // documents through). Falls back to printing the preview iframe if the
  // render fails.
  const handlePrint = async () => {
    setIsDownloading(true);
    try {
      await downloadPdf({
        html: htmlContent,
        fileName: `${(fullName || 'Biodata').replace(/\s+/g, '_')}_Biodata`,
      });
    } catch (err) {
      console.error('Server PDF render failed, falling back to the print dialog', err);
      printRef.current?.contentWindow?.print();
    } finally {
      setIsDownloading(false);
    }
  };

  // 'grid' sections (Personal Details, Career & Lifestyle) render every
  // placeholder currently registered under that section - a new placeholder
  // added from Settings shows up here with no theme code changes needed.
  const renderGridRows = (sectionKey: string) =>
    placeholders
      .filter((p) => p.section_key === sectionKey)
      .map((p) => `<div class="info-row"><span class="label">${p.display_value || p.name}</span><span class="value">${v(p.name)}</span></div>`)
      .join('');

  const personalRows = renderGridRows('personal');
  const careerRows = renderGridRows('career');

  // Safe mapping of images from the saved entry, or default placeholders.
  const galleryImages = images.length > 0 ? images : [
    'extracted_content/images/dhruv 2.jpg',
    'extracted_content/images/dhruv 3.jpg',
    'extracted_content/images/dhruv 4.jpg',
    'extracted_content/images/dhruv 5.jpg',
    'extracted_content/images/dhruv 1.jpg'
  ];

  const profileImg = galleryImages[0] || 'https://via.placeholder.com/300x300?text=Profile';
  const galleryImg1 = galleryImages[1] || 'https://via.placeholder.com/300x300?text=Image+1';
  const galleryImg2 = galleryImages[2] || 'https://via.placeholder.com/300x200?text=Image+2';
  const galleryImg3 = galleryImages[3] || 'https://via.placeholder.com/300x200?text=Image+3';
  const galleryImg4 = galleryImages[4] || 'https://via.placeholder.com/300x400?text=Image+4';

  const getTheme1Html = () => {
    // Theme 1: Royal Blue & Gold Layout
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>Biodata - ${fullName}</title>
          <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Great+Vibes&family=Montserrat:wght@300;400;600&display=swap" rel="stylesheet">
          <style>
              :root {
                  --royal-blue: #0a1e3d;
                  --accent-blue: #1e3a8a;
                  --gold: #d4af37;
                  --soft-gold: #fcf6ba;
                  --cream: #fffdf5;
              }
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { background-color: #f0f0f0; font-family: 'Montserrat', sans-serif; display: flex; justify-content: center; padding: 20px 0; }

              .biodata-card {
                  width: 210mm;
                  min-height: 297mm;
                  background: var(--royal-blue);
                  position: relative;
                  color: white;
                  padding: 20px 32px;
                  overflow: visible;
                  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
                  border: 6px double var(--gold);
              }
              .biodata-card::before {
                  content: "";
                  position: absolute;
                  top: -10%;
                  right: -10%;
                  width: 80%;
                  height: 60%;
                  background-image: url('https://www.transparenttextures.com/patterns/mandala.png');
                  opacity: 0.15;
                  pointer-events: none;
              }
              header {
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  gap: 30px;
                  position: relative;
                  z-index: 2;
                  margin-bottom: 14px;
                  padding-bottom: 14px;
                  border-bottom: 1px solid rgba(212, 175, 55, 0.3);
              }
              .profile-section { flex-shrink: 0; }
              .image-outer-frame {
                  padding: 5px;
                  border: 2px solid var(--gold);
                  border-radius: 50% 50% 0 0;
                  position: relative;
                  background: var(--royal-blue);
              }
              .profile-img {
                  width: 200px;
                  height: 200px;
                  object-fit: cover;
                  object-position: center 20%;
                  border-radius: 50% 50% 0 0;
                  border: 3px solid var(--gold);
                  display: block;
              }
              .header-info { display: flex; flex-direction: column; align-items: flex-start; }
              .header-info h2 {
                  font-family: 'Great Vibes', cursive;
                  font-size: 2.4rem;
                  color: var(--gold);
                  margin-bottom: 0px;
                  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
                  line-height: 1.1;
              }
              .header-divider {
                  width: 100%;
                  height: 2px;
                  background: linear-gradient(to right, var(--gold), transparent);
                  margin: 6px 0;
              }
              .subtitle {
                  letter-spacing: 4px;
                  font-weight: 300;
                  font-size: 0.75rem;
                  color: var(--soft-gold);
                  margin-bottom: 12px;
              }
              .header-contact { display: flex; flex-direction: column; gap: 6px; font-size: 0.75rem; }
              .header-contact span { display: flex; align-items: center; gap: 8px; color: var(--gold); font-weight: 600; }
              .header-contact .address { color: var(--soft-gold); font-weight: 400; opacity: 0.9; }

              .details-grid {
                  display: grid;
                  grid-template-columns: 1fr 1fr;
                  gap: 14px;
                  position: relative;
                  z-index: 2;
              }
              .detail-box {
                  background: rgba(255, 255, 255, 0.05);
                  border: 1px solid rgba(212, 175, 55, 0.3);
                  padding: 10px 16px;
                  border-radius: 12px;
                  backdrop-filter: blur(5px);
              }
              .section-title {
                  font-family: 'Cinzel', serif;
                  color: var(--gold);
                  font-size: 0.9rem;
                  border-bottom: 1px solid var(--gold);
                  padding-bottom: 4px;
                  margin-bottom: 7px;
                  text-align: center;
                  letter-spacing: 1.5px;
              }
              .info-row {
                  display: flex;
                  justify-content: space-between;
                  gap: 10px;
                  margin-bottom: 4px;
                  font-size: 0.75rem;
              }
              .label { color: var(--soft-gold); font-weight: 300; flex-shrink: 0; }
              .value { font-weight: 600; text-align: right; max-width: 62%; }

              .family-section { grid-column: span 2; margin-top: 5px; }
              .family-content { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
              .family-member-title { color: var(--gold); font-weight: 600; margin-bottom: 3px; display: block; font-size: 0.85rem; }
              .family-content p, .roots-text { font-size: 0.75rem; line-height: 1.4; }
              .maternal-block {
                  margin-top: 6px;
                  padding-top: 6px;
                  border-top: 1px solid rgba(212, 175, 55, 0.2);
              }
              .maternal-block p { font-size: 0.75rem; line-height: 1.4; }
              .roots-text { text-align: justify; line-height: 1.6; color: var(--soft-gold); }

              .gallery-section { grid-column: span 2; margin-top: 5px; }
              .gallery-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 5px; }
              .gallery-img {
                  width: 100%;
                  height: 142px;
                  object-fit: cover;
                  object-position: center 22%;
                  border-radius: 8px;
                  border: 2px solid var(--gold);
                  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35);
              }

              .corner { position: absolute; width: 70px; height: 70px; border: 2px solid var(--gold); opacity: 0.5; }
              .top-left { top: 14px; left: 14px; border-right: none; border-bottom: none; }
              .top-right { top: 14px; right: 14px; border-left: none; border-bottom: none; }
              .bottom-left { bottom: 14px; left: 14px; border-right: none; border-top: none; }
              .bottom-right { bottom: 14px; right: 14px; border-left: none; border-top: none; }

              @media print {
                  @page { size: A4; margin: 0; }
                  body { padding: 0; }
                  .biodata-card { box-shadow: none; }
                  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              }
          </style>
      </head>
      <body>
          <div class="biodata-card">
              <div class="corner top-left"></div>
              <div class="corner top-right"></div>
              <div class="corner bottom-left"></div>
              <div class="corner bottom-right"></div>

              <header>
                  <div class="profile-section">
                      <div class="image-outer-frame">
                          <img src="${profileImg}" alt="Profile Image" class="profile-img">
                      </div>
                  </div>
                  <div class="header-info">
                      <h2>${fullName}</h2>
                      <div class="header-divider"></div>
                      <p class="subtitle">MATRIMONIAL BIODATA</p>
                      <div class="header-contact">
                          <span>📞 ${v('phone')}</span>
                          <span>✉️ ${v('email')}</span>
                          <span class="address">📍 ${v('address')}</span>
                      </div>
                  </div>
              </header>

              <div class="details-grid">
                  <div class="detail-box">
                      <h3 class="section-title">Personal Details</h3>
                      ${personalRows}
                  </div>

                  <div class="detail-box">
                      <h3 class="section-title">Career & Lifestyle</h3>
                      ${careerRows}
                  </div>

                  <div class="detail-box family-section">
                      <h3 class="section-title">Family Background</h3>
                      <div class="family-content">
                          <div>
                              <span class="family-member-title">Father</span>
                              <p>${v('father_name')}</p>
                              <p style="color: var(--soft-gold);">${values.father_desc || ''}</p>
                          </div>
                          <div>
                              <span class="family-member-title">Mother</span>
                              <p>${v('mother_name')}</p>
                              <p style="color: var(--soft-gold);">${values.mother_desc || ''}</p>
                          </div>
                      </div>
                      <div class="maternal-block">
                          <span class="family-member-title">Maternal Family</span>
                          <p>${v('maternal_desc')}</p>
                      </div>
                  </div>

                  <div class="detail-box family-section">
                      <h3 class="section-title">Community & Roots</h3>
                      <p class="roots-text">${v('roots_text')}</p>
                  </div>

                  <div class="detail-box gallery-section">
                      <h3 class="section-title">Gallery</h3>
                      <div class="gallery-grid">
                          <img src="${galleryImg1}" alt="Gallery Image 1" class="gallery-img">
                          <img src="${galleryImg2}" alt="Gallery Image 2" class="gallery-img">
                          <img src="${galleryImg3}" alt="Gallery Image 3" class="gallery-img">
                      </div>
                  </div>
              </div>
          </div>
      </body>
      </html>
    `;
  };

  const getTheme2Html = () => {
    // Theme 2: Warm Ivory & Burgundy (2-Column Sidebar Layout)
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>Biodata - ${fullName}</title>
          <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,500;0,700;1,500&display=swap" rel="stylesheet">
          <style>
              :root {
                  --bg-color: #FDFBF7;
                  --primary-dark: #4A1525;
                  --gold: #C5A059;
                  --text-main: #333333;
                  --text-light: #666666;
              }
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { background-color: #e0e0e0; font-family: 'Montserrat', sans-serif; display: flex; justify-content: center; padding: 20px 0; }

              .biodata-card {
                  width: 210mm;
                  min-height: 297mm;
                  background-color: var(--bg-color);
                  background-image: url('https://www.transparenttextures.com/patterns/cream-paper.png');
                  position: relative;
                  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.2);
                  padding: 22px 20px;
                  overflow: visible;
                  display: grid;
                  grid-template-columns: 32% 1fr;
                  align-items: start;
                  gap: 20px;
              }
              .biodata-card::after {
                  content: "";
                  position: absolute;
                  top: 15px;
                  left: 15px;
                  right: 15px;
                  bottom: 15px;
                  border: 1px solid var(--gold);
                  pointer-events: none;
                  z-index: 10;
              }

              .photo-sidebar { display: flex; flex-direction: column; gap: 14px; padding-top: 6px; z-index: 2; }
              .img-wrapper { border-radius: 8px; overflow: hidden; }
              .img-wrapper img { width: 100%; object-fit: cover; display: block; }

              .img-wrapper.profile-shot img { height: 248px; object-position: center 20%; }
              .img-wrapper.portrait-shot img { height: 195px; object-position: center 20%; }
              .img-wrapper.square-shot img { height: 178px; object-position: center 25%; }
              .img-wrapper.landscape-shot img { height: 180px; object-position: center 30%; }

              .center-panel {
                  background: rgba(255, 255, 255, 0.6);
                  border: 2px solid rgba(197, 160, 89, 0.3);
                  border-radius: 15px;
                  padding: 20px 30px;
                  z-index: 2;
                  backdrop-filter: blur(5px);
                  display: flex;
                  flex-direction: column;
                  gap: 14px;
                  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
              }
              header { text-align: center; border-bottom: 1px solid var(--gold); padding-bottom: 10px; position: relative; }
              header::after {
                  content: "❖";
                  color: var(--gold);
                  font-size: 14px;
                  position: absolute;
                  bottom: -10px;
                  left: 50%;
                  transform: translateX(-50%);
                  background: var(--bg-color);
                  padding: 0 10px;
              }
              header h1 {
                  font-family: 'Playfair Display', serif;
                  color: var(--primary-dark);
                  font-size: 1.85rem;
                  line-height: 1.2;
                  margin-bottom: 6px;
              }
              .subtitle {
                  font-size: 0.8rem;
                  letter-spacing: 3px;
                  color: var(--gold);
                  font-weight: 500;
                  text-transform: uppercase;
              }
              .contact-info { text-align: center; font-size: 0.8rem; color: var(--text-main); line-height: 1.55; margin-top: 7px; }
              .contact-info p { display: flex; justify-content: center; align-items: center; gap: 8px; }

              .section { margin-top: 5px; }
              .section-title {
                  font-family: 'Playfair Display', serif;
                  font-size: 1.15rem;
                  color: var(--primary-dark);
                  font-style: italic;
                  margin-bottom: 9px;
                  display: flex;
                  align-items: center;
                  gap: 10px;
              }
              .section-title::after {
                  content: "";
                  flex: 1;
                  height: 1px;
                  background: linear-gradient(to right, var(--gold), transparent);
              }
              .info-row {
                  display: grid;
                  grid-template-columns: 38% 62%;
                  padding: 4px 0;
                  border-bottom: 1px dashed rgba(197, 160, 89, 0.4);
                  font-size: 0.8rem;
              }
              .info-row:last-child { border-bottom: none; }
              .label { color: var(--text-light); font-weight: 500; }
              .value { color: var(--text-main); font-weight: 600; }

              .family-block { margin-bottom: 8px; font-size: 0.8rem; line-height: 1.42; }
              .family-role { font-weight: 600; color: var(--primary-dark); }
              .family-desc { color: var(--text-light); padding-left: 10px; border-left: 2px solid var(--gold); margin-top: 3px; }
              .roots-text { font-size: 0.8rem; line-height: 1.6; color: var(--text-main); text-align: justify; }

              @media print {
                  @page { size: A4; margin: 0; }
                  body { padding: 0; background: none; }
                  .biodata-card { box-shadow: none; }
                  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              }
          </style>
      </head>
      <body>
          <div class="biodata-card">
              <!-- Left Sidebar: Photo Gallery -->
              <div class="photo-sidebar">
                  <div class="img-wrapper profile-shot">
                      <img src="${profileImg}" alt="Profile Shot">
                  </div>
                  <div class="img-wrapper square-shot">
                      <img src="${galleryImg1}" alt="Gallery Image 1">
                  </div>
                  <div class="img-wrapper landscape-shot">
                      <img src="${galleryImg2}" alt="Gallery Image 2">
                  </div>
                  <div class="img-wrapper landscape-shot">
                      <img src="${galleryImg3}" alt="Gallery Image 3">
                  </div>
                  <div class="img-wrapper portrait-shot">
                      <img src="${galleryImg4}" alt="Gallery Image 4">
                  </div>
              </div>

              <!-- Right Center Panel: Detailed Content -->
              <div class="center-panel">
                  <header>
                      <h1>${fullName}</h1>
                      <div class="subtitle">Matrimonial Biodata</div>
                      <div class="contact-info">
                          <p><strong>📞</strong> ${v('phone')} &nbsp;|&nbsp; <strong>✉️</strong> ${v('email')}</p>
                          <p><strong>📍</strong> ${v('address')}</p>
                      </div>
                  </header>

                  <div class="section">
                      <h2 class="section-title">Personal Details</h2>
                      <div class="info-row"><span class="label">Full Name</span><span class="value">${fullName}</span></div>
                      ${personalRows}
                  </div>

                  <div class="section">
                      <h2 class="section-title">Career & Lifestyle</h2>
                      ${careerRows}
                  </div>

                  <div class="section">
                      <h2 class="section-title">Family Background</h2>
                      <div class="family-block">
                          <div class="family-role">Father: ${v('father_name')}</div>
                          <div class="family-desc">${values.father_desc || ''}</div>
                      </div>
                      <div class="family-block">
                          <div class="family-role">Mother: ${v('mother_name')}</div>
                          <div class="family-desc">${values.mother_desc || ''}</div>
                      </div>
                      <div class="family-block">
                          <div class="family-role">Maternal Family</div>
                          <div class="family-desc">${v('maternal_desc')}</div>
                      </div>
                  </div>

                  <div class="section">
                      <h2 class="section-title">Roots & Values</h2>
                      <p class="roots-text">${v('roots_text')}</p>
                  </div>
              </div>
          </div>
      </body>
      </html>
    `;
  };

  const htmlContent = theme === 'theme2' ? getTheme2Html() : getTheme1Html();

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
            disabled={isDownloading}
          >
            {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
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
