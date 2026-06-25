"use client";

import React, { useState, useEffect } from "react";
import { X, FileText as CoverLetterIcon, Loader2, Download, Sparkles, Copy, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface SavedLetter {
  id: string;
  companyName: string;
  jobTitle: string;
  letterType: string;
  content: string;
  createdAt: string;
}

interface CoverLetterProps {
  cvData: any;
  onClose: () => void;
}

export default function CoverLetterGenerator({ cvData, onClose }: CoverLetterProps) {
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [hiringManager, setHiringManager] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [letterType, setLetterType] = useState<"cover" | "motivation" | "application">("cover");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLetter, setGeneratedLetter] = useState("");
  const [savedLetters, setSavedLetters] = useState<SavedLetter[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('cv_generator_savedLetters');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem('cv_generator_savedLetters', JSON.stringify(savedLetters)); }
    catch { /* ignore */ }
  }, [savedLetters]);

  const generateLetter = async () => {
    if (!companyName.trim() || !jobTitle.trim()) {
      toast.error("Please enter company name and job title");
      return;
    }
    setIsGenerating(true);
    try {
      const res = await fetch("/api/cv/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvData,
          companyName,
          jobTitle,
          hiringManager,
          additionalNotes,
          letterType,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const letter = data.result || "";
      setGeneratedLetter(letter);
      // Auto-save to localStorage
      const saved: SavedLetter = {
        id: Date.now().toString(36),
        companyName,
        jobTitle,
        letterType,
        content: letter,
        createdAt: new Date().toISOString(),
      };
      setSavedLetters(prev => [saved, ...prev].slice(0, 20));
      toast.success(`${letterType.charAt(0).toUpperCase() + letterType.slice(1)} letter generated!`);
    } catch (err: any) {
      toast.error(`Generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedLetter);
    toast.success("Copied to clipboard!");
  };

  const deleteSavedLetter = (id: string) => {
    setSavedLetters(prev => prev.filter(l => l.id !== id));
    toast.success("Letter removed");
  };

  const loadSavedLetter = (letter: SavedLetter) => {
    setGeneratedLetter(letter.content);
    setCompanyName(letter.companyName);
    setJobTitle(letter.jobTitle);
    setLetterType(letter.letterType as any);
    toast.success("Loaded saved letter");
  };

  const downloadLetter = () => {
    const blob = new Blob([generatedLetter], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${letterType}_letter_${companyName.replace(/\s+/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Letter downloaded!");
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CoverLetterIcon className="h-5 w-5 text-green-600" />
            <h2 className="text-sm font-bold text-slate-900">Cover Letter Generator</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Type selector */}
          <div className="flex gap-2">
            {(["cover", "motivation", "application"] as const).map(type => (
              <button key={type} onClick={() => { setLetterType(type); setGeneratedLetter(""); }}
                className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${letterType === type ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-600 border-slate-200 hover:border-green-300'}`}
              >{type.charAt(0).toUpperCase() + type.slice(1)} Letter</button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Company Name *</label>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Google" className="w-full h-8 text-xs border border-slate-200 rounded-md px-3" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Job Title *</label>
              <input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Software Engineer" className="w-full h-8 text-xs border border-slate-200 rounded-md px-3" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Hiring Manager (optional)</label>
              <input value={hiringManager} onChange={e => setHiringManager(e.target.value)} placeholder="e.g. John Smith" className="w-full h-8 text-xs border border-slate-200 rounded-md px-3" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Additional Notes (optional)</label>
              <input value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} placeholder="e.g. Referred by Jane" className="w-full h-8 text-xs border border-slate-200 rounded-md px-3" />
            </div>
          </div>

          <Button onClick={generateLetter} disabled={isGenerating} className="w-full bg-green-600 hover:bg-green-700 h-9 text-xs">
            {isGenerating ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating...</> : <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate {letterType.charAt(0).toUpperCase() + letterType.slice(1)} Letter</>}
          </Button>

          {generatedLetter && (
            <div className="space-y-3 border-t border-slate-200 pt-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Generated Letter</span>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={copyToClipboard} className="h-7 text-[10px]"><Copy className="h-3 w-3 mr-1" /> Copy</Button>
                  <Button size="sm" variant="outline" onClick={downloadLetter} className="h-7 text-[10px]"><Download className="h-3 w-3 mr-1" /> Download</Button>
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{generatedLetter}</pre>
              </div>
            </div>
          )}

          {/* Saved Letters */}
          {savedLetters.length > 0 && (
            <div className="space-y-2 border-t border-slate-200 pt-4">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Saved Letters ({savedLetters.length})</span>
              <div className="max-h-36 overflow-y-auto space-y-1.5">
                {savedLetters.map(letter => (
                  <div key={letter.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <button onClick={() => loadSavedLetter(letter)} className="flex-1 text-left">
                      <div className="text-[11px] font-semibold text-slate-700">{letter.companyName} — {letter.jobTitle}</div>
                      <div className="flex items-center gap-2 text-[9px] text-slate-400">
                        <span className="capitalize">{letter.letterType} letter</span>
                        <Clock className="h-2.5 w-2.5" />
                        <span>{new Date(letter.createdAt).toLocaleDateString()}</span>
                      </div>
                    </button>
                    <button onClick={() => deleteSavedLetter(letter.id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="h-3 w-3 text-red-400" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
