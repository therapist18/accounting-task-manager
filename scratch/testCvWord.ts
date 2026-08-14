import fs from 'fs';
import { JSDOM } from 'jsdom';
import { buildCvDocument } from '../lib/cvThemeEngine';
import { buildWordDocBlob } from '../lib/documentExport';

// Minimal DOMParser polyfill backed by jsdom, so this Node script can exercise
// the exact same DOM-manipulation branch page.tsx's buildCvWordOutput runs in
// the browser (it's gated on `typeof DOMParser !== 'undefined'`).
(global as any).DOMParser = new JSDOM().window.DOMParser;

function extractCssRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  return match ? match[1].trim() : '';
}

async function buildCvWordOutput(cvData: any, cvSettings: any, selectedLayout: string) {
  const doc = await buildCvDocument(cvData, cvSettings, selectedLayout, { wordSafe: true });
  let bodyContent = doc.bodyHtml;

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(`<div>${bodyContent}</div>`, 'text/html');

    parsed.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
      const div = parsed.createElement('div');
      for (const attr of Array.from(h.attributes)) div.setAttribute(attr.name, (attr as Attr).value);
      div.className = `mso-${h.tagName.toLowerCase()} ${div.className || ''}`.trim();
      const existingStyle = div.getAttribute('style');
      div.setAttribute('style', `${existingStyle ? `${existingStyle};` : ''}font-family: ${doc.fontFamily};`);
      while (h.firstChild) div.appendChild(h.firstChild);
      h.replaceWith(div);
    });

    parsed.querySelectorAll('table').forEach((table) => {
      table.setAttribute('cellpadding', '0');
      table.setAttribute('cellspacing', '0');
      table.setAttribute('width', '100%');
    });

    parsed.querySelectorAll('.mso-h1, .mso-h2, .mso-h3, .mso-h4, .mso-h5, .mso-h6').forEach((h) => {
      const tagMatch = h.className.match(/mso-(h[1-6])/);
      if (!tagMatch) return;
      const tag = tagMatch[1];
      const baseDecls = extractCssRule(doc.css, `.cv-theme .mso-${tag}`);
      const themeDecls = extractCssRule(doc.css, `.cv-theme-${doc.layout} .mso-${tag}`);
      const prev = h.getAttribute('style') ? `${h.getAttribute('style')};` : '';
      h.setAttribute('style', `${prev}${baseDecls ? `; ${baseDecls}` : ''}${themeDecls ? `; ${themeDecls}` : ''}`.trim());
    });

    bodyContent = parsed.body.firstElementChild?.innerHTML ?? bodyContent;
  }

  return {
    blob: buildWordDocBlob({
      title: doc.title,
      html: bodyContent,
      css: doc.css,
      pageSize: doc.pageSize,
      pageMargin: doc.pageMargin,
    }),
    fileName: doc.fileName,
  };
}

async function run() {
  const cvData = {
    personalInfo: { fullName: "AJAY YADAV", title: "SOFTWARE ENGINEER" },
    summary: "Results-driven software engineer.",
    experience: [{ role: "Business Owner", company: "Velvet Furniture", startDate: "2023", endDate: "Present", responsibilities: ["Founded and manage a rental business."] }],
    education: [{ degree: "BCA", institution: "SS Jain Subodh PG College", year: "2019" }],
    skills: [
      { category: "Software & Programming", items: "Python, SQL, JavaScript" },
      { category: "Frameworks & Tools", items: "Streamlit, Flask, React" },
    ],
    languages: [{ language: "English", proficiency: "Professional" }],
  };
  const cvSettings = { primaryColor: "#2c3e50", accentColor: "#3498db" };

  const output = await buildCvWordOutput(cvData, cvSettings, "cv_corporate");
  const text = await output.blob.text();
  fs.writeFileSync("scratch/word_output.html", text);
  console.log("Wrote scratch/word_output.html, length:", text.length);
}

run().catch((e) => { console.error(e); process.exit(1); });
