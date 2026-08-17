import { useEffect, useState } from "react";
import { DocumentViewer, type DocumentViewerHandle } from "@/components/contracts/DocumentViewer";
import { buildCvDocument, type CvDocument } from "@/app/(dashboard)/dashboard/cv-generator/utils/cvThemeEngine";
import { Loader2 } from "lucide-react";

interface CvPreviewPanelProps {
  cvData: any;
  cvSettings: any;
  selectedLayout: string;
  previewRef: any;
  title?: string;
}

export function CvPreviewPanel({
  cvData,
  cvSettings,
  selectedLayout,
  previewRef,
  title = "Live Preview",
}: CvPreviewPanelProps) {
  const [doc, setDoc] = useState<CvDocument | null>(null);
  const [loading, setLoading] = useState(true);

  // Build the themed document (shared with the .doc export via buildCvDocument)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    buildCvDocument(cvData, cvSettings, selectedLayout).then((d) => {
      if (!cancelled) {
        setDoc(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cvData, cvSettings, selectedLayout]);

  const combinedHtml = doc
    ? `<style>${doc.css}</style><div id="cv-preview-container" style="width: 210mm; min-height: 297mm; background: white;">${doc.bodyHtml}</div>`
    : "";

  return (
    <DocumentViewer
      ref={previewRef}
      html={combinedHtml}
      loading={loading}
      leading={
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-2 hidden sm:inline">
          {title}
        </span>
      }
      empty={
        <div className="flex items-center justify-center h-full">
          <span className="text-xs font-medium text-slate-400">Rendering preview…</span>
        </div>
      }
    />
  );
}
