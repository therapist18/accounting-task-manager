"use client";

import React, { useState } from "react";
import { Sparkles, X, Loader2, RefreshCw, Check, ChevronDown, ChevronRight, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface AIWriterModuleProps {
  cvData: any;
  setCvData: (data: any) => void;
  onClose: () => void;
}

type WriterMode = "summary" | "experience" | "skills";

export default function AIWriterModule({ cvData, setCvData, onClose }: AIWriterModuleProps) {
  const [mode, setMode] = useState<WriterMode>("summary");
  const [industry, setIndustry] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSummary, setGeneratedSummary] = useState("");
  const [generatedExperiences, setGeneratedExperiences] = useState<any[]>([]);
  const [generatedSkills, setGeneratedSkills] = useState<any[]>([]);
  const [expandedModes, setExpandedModes] = useState<Record<string, boolean>>({ summary: true, experience: false, skills: false });

  const generateSummary = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/cv/ai-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "summary",
          currentSummary: cvData.summary || "",
          experience: cvData.experience || [],
          skills: cvData.skills || [],
          industry,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGeneratedSummary(data.result || "");
      toast.success("Professional summary generated!");
    } catch (err: any) {
      toast.error(`Generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateExperience = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/cv/ai-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "enhance-experience",
          experience: cvData.experience || [],
          jobDescription,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGeneratedExperiences(data.result || []);
      toast.success("Experience enhanced!");
    } catch (err: any) {
      toast.error(`Enhancement failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateSkills = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/cv/ai-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "suggest-skills",
          currentSkills: cvData.skills || [],
          summary: cvData.summary || "",
          experience: cvData.experience || [],
          industry,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGeneratedSkills(data.result || []);
      toast.success("Skills suggestions generated!");
    } catch (err: any) {
      toast.error(`Generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const applySummary = () => {
    if (!generatedSummary) return;
    setCvData({ ...cvData, summary: generatedSummary });
    toast.success("Summary applied to CV");
    setGeneratedSummary("");
  };

  const applyExperiences = () => {
    if (!generatedExperiences.length) return;
    setCvData({ ...cvData, experience: generatedExperiences });
    toast.success("Enhanced experiences applied to CV");
    setGeneratedExperiences([]);
  };

  const applySkills = () => {
    if (!generatedSkills.length) return;
    setCvData({ ...cvData, skills: [...(cvData.skills || []), ...generatedSkills] });
    toast.success("New skill categories added to CV");
    setGeneratedSkills([]);
  };

  const modes: { key: WriterMode; label: string; description: string }[] = [
    { key: "summary", label: "Professional Summary", description: "Generate a compelling summary based on your experience" },
    { key: "experience", label: "Experience Enhancement", description: "Rewrite experience bullet points professionally" },
    { key: "skills", label: "Skills Suggestions", description: "Get industry-relevant skill recommendations" },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenLine className="h-5 w-5 text-purple-600" />
            <h2 className="text-sm font-bold text-slate-900">AI Writer</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {modes.map((m) => (
            <div key={m.key} className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedModes(prev => ({ ...prev, [m.key]: !prev[m.key] }))}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  {expandedModes[m.key] ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                  <span className="text-sm font-semibold text-slate-700">{m.label}</span>
                </div>
                <span className="text-[10px] text-slate-400">{m.description}</span>
              </button>
              {expandedModes[m.key] && (
                <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
                  {m.key === "summary" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Industry (optional)</label>
                        <input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. Fintech, Healthcare, Accounting" className="w-full h-8 text-xs border border-slate-200 rounded-md px-3" />
                      </div>
                      {generatedSummary && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                          <p className="text-xs text-slate-700">{generatedSummary}</p>
                          <div className="flex gap-2 mt-2">
                            <Button size="sm" onClick={applySummary} className="h-7 text-[10px] bg-purple-600 hover:bg-purple-700"><Check className="h-3 w-3 mr-1" /> Apply</Button>
                            <Button size="sm" variant="outline" onClick={() => setGeneratedSummary("")} className="h-7 text-[10px]"><X className="h-3 w-3 mr-1" /> Discard</Button>
                          </div>
                        </div>
                      )}
                      <Button size="sm" onClick={generateSummary} disabled={isGenerating} className="bg-purple-600 hover:bg-purple-700 h-8 text-xs">
                        {isGenerating ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Generating...</> : <><Sparkles className="h-3 w-3 mr-1" /> Generate Summary</>}
                      </Button>
                    </>
                  )}
                  {m.key === "experience" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Job Description (paste for targeted enhancement)</label>
                        <Textarea rows={4} value={jobDescription} onChange={e => setJobDescription(e.target.value)} placeholder="Paste the job description here for targeted enhancement..." />
                      </div>
                      {generatedExperiences.length > 0 && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                          {generatedExperiences.map((exp: any, i: number) => (
                            <div key={i} className="text-xs text-slate-700 border-b border-purple-100 pb-1 last:border-0"><strong>{exp.company}</strong> — {exp.responsibilities?.join("; ")}</div>
                          ))}
                          <Button size="sm" onClick={applyExperiences} className="h-7 text-[10px] bg-purple-600 hover:bg-purple-700"><Check className="h-3 w-3 mr-1" /> Apply All</Button>
                        </div>
                      )}
                      <Button size="sm" onClick={generateExperience} disabled={isGenerating} className="bg-purple-600 hover:bg-purple-700 h-8 text-xs">
                        {isGenerating ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Enhancing...</> : <><RefreshCw className="h-3 w-3 mr-1" /> Enhance Experiences</>}
                      </Button>
                    </>
                  )}
                  {m.key === "skills" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Target Industry</label>
                        <input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. Data Science, DevOps, Accounting" className="w-full h-8 text-xs border border-slate-200 rounded-md px-3" />
                      </div>
                      {generatedSkills.length > 0 && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                          {generatedSkills.map((sk: any, i: number) => (
                            <div key={i} className="text-xs text-slate-700"><strong>{sk.category}:</strong> {typeof sk.items === 'string' ? sk.items : sk.items?.join(", ")}</div>
                          ))}
                          <Button size="sm" onClick={applySkills} className="h-7 text-[10px] bg-purple-600 hover:bg-purple-700"><Check className="h-3 w-3 mr-1" /> Add to CV</Button>
                        </div>
                      )}
                      <Button size="sm" onClick={generateSkills} disabled={isGenerating} className="bg-purple-600 hover:bg-purple-700 h-8 text-xs">
                        {isGenerating ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Analyzing...</> : <><Sparkles className="h-3 w-3 mr-1" /> Suggest Skills</>}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
