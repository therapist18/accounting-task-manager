"use client";

import React, { useState } from "react";
import { X, Download, FileText, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

  const handleExport = async (type: string) => {
    setExportType(type);
    setIsExporting(true);

    try {
      if (type === 'plain-text') {
        const text = generatePlainText();
        const blob = new Blob([text], { type: 'text/plain' });
        downloadBlob(blob, `${cvData.personalInfo?.fullName?.replace(/\s+/g, '_') || 'CV'}_plain.txt`);
        toast.success("Plain text exported!");
      } else if (type === 'linkedin') {
        const text = generateLinkedInSummary();
        const blob = new Blob([text], { type: 'text/plain' });
        downloadBlob(blob, `${cvData.personalInfo?.fullName?.replace(/\s+/g, '_') || 'CV'}_linkedin.txt`);
        toast.success("LinkedIn summary exported!");
      } else if (type === 'pdf-no-photo') {
        const element = previewRef.current;
        if (!element) { toast.error("Preview not available"); return; }
        await generatePdf(element, { hidePhoto: true });
      } else if (type === 'ats-pdf') {
        const element = previewRef.current;
        if (!element) { toast.error("Preview not available"); return; }
        await generatePdf(element, { atsOptimized: true });
      } else if (type === 'print') {
        const element = previewRef.current;
        if (!element) { toast.error("Preview not available"); return; }
        await generatePdf(element, { printOptimized: true });
      } else {
        const element = previewRef.current;
        if (!element) { toast.error("Preview not available"); return; }
        await generatePdf(element, {});
      }
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
      setExportType("");
    }
  };

  const generatePdf = async (element: HTMLElement, opts: { hidePhoto?: boolean; atsOptimized?: boolean; printOptimized?: boolean }) => {
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");

    const originalOverflow = element.style.overflow;
    const originalStyle = element.style.transform;

    if (opts.hidePhoto) {
      const photos = element.querySelectorAll('img[alt="Profile"]');
      photos.forEach(p => (p as HTMLElement).style.display = 'none');
    }

    element.style.transform = "none";
    element.style.overflow = "visible";

    const canvas = await html2canvas(element, {
      scale: opts.atsOptimized ? 1.5 : 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: 0,
    });

    element.style.transform = originalStyle;
    element.style.overflow = originalOverflow;

    if (opts.hidePhoto) {
      const photos = element.querySelectorAll('img[alt="Profile"]');
      photos.forEach(p => (p as HTMLElement).style.display = '');
    }

    const imgData = canvas.toDataURL("image/jpeg", opts.atsOptimized ? 0.8 : 1.0);
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const imgHeight = (canvasHeight * pageWidth) / canvasWidth;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "JPEG", 0, position, pageWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, pageWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const suffix = opts.atsOptimized ? '_ATS' : opts.printOptimized ? '_Print' : opts.hidePhoto ? '_NoPhoto' : '';
    const fileName = `${(cvData.personalInfo?.fullName || "CV").replace(/\s+/g, "_")}${suffix}_CV.pdf`;
    pdf.save(fileName);
    toast.success(`${suffix.replace('_', '') || 'PDF'} exported successfully!`);
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
    const topExp = (cvData.experience || [])[0] || {};
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

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
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
