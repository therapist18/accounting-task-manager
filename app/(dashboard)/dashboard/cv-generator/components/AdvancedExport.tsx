"use client";

import React, { useState } from "react";
import { X, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { downloadBlob, printElementAsPdf } from "@/lib/documentExport";

interface AdvancedExportProps {
  cvData: any;
  previewRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

export default function AdvancedExport({ cvData, previewRef, onClose }: AdvancedExportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<string>("");

  const exportOptions = [
    { id: 'pdf-with-photo', label: 'PDF with Photo', desc: 'Standard PDF including profile photo', icon: FileText },
    { id: 'pdf-no-photo', label: 'PDF without Photo', desc: 'Clean PDF without profile image', icon: FileText },
    { id: 'ats-pdf', label: 'ATS-Friendly PDF', desc: 'Optimized for ATS parsing', icon: FileText },
    { id: 'linkedin', label: 'LinkedIn Format', desc: 'Summary-style for LinkedIn profile', icon: FileText },
    { id: 'print', label: 'Print-Ready', desc: 'Optimized layout for printing', icon: FileText },
    { id: 'plain-text', label: 'Plain Text', desc: 'Simple text version for copying', icon: FileText },
  ];

  const baseName = () => (cvData.personalInfo?.fullName || "CV").replace(/\s+/g, "_");

  const handleExport = async (type: string) => {
    setExportType(type);
    setIsExporting(true);

    try {
      if (type === 'plain-text') {
        const text = generatePlainText();
        downloadBlob(new Blob([text], { type: 'text/plain' }), `${baseName()}_plain.txt`);
        toast.success("Plain text exported!");
      } else if (type === 'linkedin') {
        const text = generateLinkedInSummary();
        downloadBlob(new Blob([text], { type: 'text/plain' }), `${baseName()}_linkedin.txt`);
        toast.success("LinkedIn summary exported!");
      } else if (type === 'ats-pdf') {
        await exportAtsPdf();
      } else {
        await exportPdf(type);
      }
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
      setExportType("");
    }
  };

  // PDFs use the shared printElementAsPdf on the live preview element — the
  // same element the main "Download PDF" button prints, and the same source of
  // truth (buildCvDocument) that drives the preview, so the exported PDF
  // matches what's on screen instead of a rasterized approximation.
  const exportPdf = async (type: string) => {
    const element = previewRef.current;
    if (!element) throw new Error("Preview not available");

    const hidePhoto = type === 'pdf-no-photo';
    const suffix = hidePhoto ? '_NoPhoto' : type === 'print' ? '_Print' : '';

    await printElementAsPdf({
      element,
      fileName: `${baseName()}${suffix}_CV`,
      bodyClassName: "pdf-mode",
      detach: true,
      onBeforePrint: () => {
        if (hidePhoto) {
          const style = document.createElement("style");
          style.id = "adv-export-hide-photo";
          style.textContent = '#cv-preview-container img[alt="Profile"], #cv-preview-container .cv-photo, #cv-preview-container .cv-photo-wrap { display: none !important; }';
          document.head.appendChild(style);
        }
      },
      onCleanup: () => {
        document.getElementById("adv-export-hide-photo")?.remove();
      },
    });

    toast.success(`${suffix.replace('_', '') || 'PDF'} exported successfully!`);
  };

  // ATS-friendly output is a plain single-column semantic document (no images,
  // no tables, no flex/grid) so text parsers read it in order. Built from
  // cvData directly rather than the themed layout, then printed through the
  // same shared printElementAsPdf path as every other PDF export.
  const exportAtsPdf = async () => {
    const container = document.createElement("div");
    container.id = "cv-preview-container";
    container.innerHTML = `<style>#cv-preview-container{font-family:Arial,Helvetica,sans-serif;color:#000;font-size:11pt;line-height:1.4}#cv-preview-container h1{font-size:18pt;margin:0 0 4pt}#cv-preview-container h2{font-size:13pt;margin:14pt 0 4pt;border-bottom:1px solid #000;padding-bottom:2pt}#cv-preview-container h3{font-size:11pt;margin:10pt 0 2pt}#cv-preview-container p,#cv-preview-container li{margin:2pt 0}</style>${buildAtsHtml()}`;

    await printElementAsPdf({
      element: container,
      fileName: `${baseName()}_ATS_CV`,
      bodyClassName: "pdf-mode",
      detach: true,
      onCleanup: () => container.remove(),
    });

    toast.success("ATS-friendly PDF exported!");
  };

  const escapeHtml = (value: any) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

  const buildAtsHtml = () => {
    const p = cvData.personalInfo || {};
    const sections = [
      `<header><h1>${escapeHtml(p.fullName)}</h1><p>${escapeHtml(p.title)}</p><p>${escapeHtml(p.email)} | ${escapeHtml(p.phone)}</p><p>${escapeHtml(p.location)}</p></header>`,
    ];

    if (cvData.summary) {
      sections.push(`<section><h2>Summary</h2><p>${escapeHtml(cvData.summary)}</p></section>`);
    }

    if (cvData.experience?.length) {
      sections.push(
        '<section><h2>Experience</h2>' +
        cvData.experience
          .map((e: any) =>
            `<h3>${escapeHtml(e.role)}</h3><p>${escapeHtml(e.company)} | ${escapeHtml(e.startDate)} - ${escapeHtml(e.endDate)}</p>` +
            (e.responsibilities?.length ? `<ul>${e.responsibilities.map((r: string) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : '')
          )
          .join('') +
        '</section>'
      );
    }

    if (cvData.skills?.length) {
      sections.push(
        '<section><h2>Skills</h2><ul>' +
        cvData.skills.map((s: any) => `<li>${escapeHtml(s.category)}: ${escapeHtml(s.items)}</li>`).join('') +
        '</ul></section>'
      );
    }

    if (cvData.education?.length) {
      sections.push(
        '<section><h2>Education</h2>' +
        cvData.education.map((e: any) => `<p>${escapeHtml(e.degree)} - ${escapeHtml(e.institution)} (${escapeHtml(e.year)})</p>`).join('') +
        '</section>'
      );
    }

    return sections.join('');
  };

  const generatePlainText = () => {
    const p = cvData.personalInfo || {};
    const lines = [
      p.fullName,
      p.title,
      `${p.email} | ${p.phone}`,
      p.location,
      '',
      '--- SUMMARY ---',
      cvData.summary || '',
      '',
      '--- EXPERIENCE ---',
      ...(cvData.experience || []).flatMap((e: any) => [
        `${e.role} at ${e.company} (${e.startDate} - ${e.endDate})`,
        ...(e.responsibilities || []).map((r: string) => `  • ${r}`),
        '',
      ]),
      '--- SKILLS ---',
      ...(cvData.skills || []).map((s: any) => `${s.category}: ${s.items}`),
      '',
      '--- EDUCATION ---',
      ...(cvData.education || []).map((e: any) => `${e.degree} - ${e.institution} (${e.year})`),
    ];
    return lines.join('\n');
  };

  const generateLinkedInSummary = () => {
    const p = cvData.personalInfo || {};
    const allSkills = (cvData.skills || []).flatMap((s: any) => s.items?.split(',').map((i: string) => i.trim()) || []);
    return [
      `${p.fullName} | ${p.title || 'Professional'}`,
      `${p.location}`,
      '',
      'About',
      cvData.summary || '',
      '',
      'Top Skills',
      allSkills.slice(0, 10).join(', ') || '',
      '',
      'Experience',
      ...(cvData.experience || []).map((e: any) => `${e.role}\n${e.company} | ${e.startDate} - ${e.endDate}`),
      '',
      `LinkedIn: ${p.linkedin || 'N/A'}`,
      `Email: ${p.email}`,
    ].join('\n');
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-custom-blue" />
            <h2 className="text-sm font-bold text-slate-900">Advanced Export</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            {exportOptions.map(opt => {
              const Icon = opt.icon;
              const isLoading = isExporting && exportType === opt.id;
              return (
                <button key={opt.id} onClick={() => handleExport(opt.id)} disabled={isExporting}
                  className={`p-4 rounded-xl border-2 text-left transition-all hover:border-custom-blue hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed ${exportType === opt.id && isExporting ? 'border-custom-blue bg-blue-50' : 'border-slate-200'}`}
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 text-custom-blue animate-spin mb-2" />
                  ) : (
                    <Icon className="h-5 w-5 text-custom-blue mb-2" />
                  )}
                  <div className="text-xs font-bold text-slate-700">{opt.label}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5 leading-tight">{opt.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
