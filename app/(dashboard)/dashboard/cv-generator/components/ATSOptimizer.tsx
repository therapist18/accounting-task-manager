"use client";

import React, { useState, useMemo } from "react";
import { X, BarChart3, CheckCircle2, AlertCircle, Lightbulb, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ATSOptimizerProps {
  cvData: any;
  onClose: () => void;
}

const ATS_KEYWORDS = [
  'achieved', 'implemented', 'developed', 'managed', 'led', 'created', 'designed',
  'optimized', 'delivered', 'improved', 'reduced', 'increased', 'generated', 'built',
  'launched', 'negotiated', 'coordinated', 'established', 'mentored', 'trained',
];

export default function ATSOptimizer({ cvData, onClose }: ATSOptimizerProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const analysis = useMemo(() => {
    const text = [
      cvData.summary || "",
      ...(cvData.experience || []).flatMap((e: any) => [e.companyDesc || "", ...(e.responsibilities || [])]),
      ...(cvData.skills || []).map((s: any) => `${s.category} ${s.items}`),
    ].join(" ").toLowerCase();

    const foundKeywords = ATS_KEYWORDS.filter(kw => text.includes(kw));
    const missingKeywords = ATS_KEYWORDS.filter(kw => !text.includes(kw));
    const keywordScore = Math.round((foundKeywords.length / ATS_KEYWORDS.length) * 100);

    const experienceCount = (cvData.experience || []).length;
    const hasSummary = !!cvData.summary;
    const hasEducation = (cvData.education || []).length > 0;
    const hasSkills = (cvData.skills || []).length > 0;
    const hasContact = !!cvData.personalInfo?.email && !!cvData.personalInfo?.phone;
    const sectionsPresent = [hasSummary, hasEducation, hasSkills, hasContact, experienceCount > 0];
    const sectionsScore = Math.round((sectionsPresent.filter(Boolean).length / sectionsPresent.length) * 100);

    const totalLines = text.split('\n').length;
    const avgLineLength = text.length / Math.max(totalLines, 1);
    const readabilityScore = avgLineLength > 200 ? 40 : avgLineLength > 100 ? 65 : avgLineLength > 50 ? 85 : 95;
    const hasBullets = text.includes('•') || text.includes('-') || text.match(/\d+\.\s/);
    const readabilityAdjusted = hasBullets ? Math.min(100, readabilityScore + 10) : readabilityScore;

    const atsScore = Math.round((keywordScore * 0.3) + (sectionsScore * 0.3) + (readabilityAdjusted * 0.4));

    const suggestions: string[] = [];
    if (missingKeywords.length > 3) suggestions.push(`Add ${missingKeywords.slice(0, 5).join(', ')} to your experience bullet points`);
    if (!hasSummary) suggestions.push("Add a professional summary to improve ATS matching");
    if (!hasContact) suggestions.push("Ensure email and phone are filled in");
    if (readabilityAdjusted < 70) suggestions.push("Break long paragraphs into bullet points for better readability");
    if (experienceCount === 0) suggestions.push("Add work experience entries");
    if (!hasEducation) suggestions.push("Add education details");
    if (!hasBullets) suggestions.push("Use bullet points for responsibilities instead of paragraphs");

    return { atsScore, keywordScore, sectionsScore, readabilityAdjusted, foundKeywords, missingKeywords, suggestions };
  }, [cvData]);

  const getColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-500';
  };

  const getBg = (score: number) => {
    if (score >= 80) return 'bg-emerald-50 border-emerald-200';
    if (score >= 60) return 'bg-amber-50 border-amber-200';
    return 'bg-red-50 border-red-200';
  };

  const getBarColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 60) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-amber-600" />
            <h2 className="text-sm font-bold text-slate-900">ATS Optimization</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Overall Score */}
          <div className={`p-4 rounded-xl border ${getBg(analysis.atsScore)} text-center`}>
            <div className="text-4xl font-extrabold ${getColor(analysis.atsScore)}">{analysis.atsScore}</div>
            <div className="text-xs font-semibold text-slate-500 mt-1">/ 100 — ATS Score</div>
            <div className="mt-3 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${getBarColor(analysis.atsScore)}`} style={{ width: `${analysis.atsScore}%` }} />
            </div>
          </div>

          {/* Sub-scores */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Keywords', score: analysis.keywordScore, desc: `${analysis.foundKeywords.length}/${ATS_KEYWORDS.length} found` },
              { label: 'Sections', score: analysis.sectionsScore, desc: 'Completeness' },
              { label: 'Readability', score: analysis.readabilityAdjusted, desc: 'Format & clarity' },
            ].map(item => (
              <div key={item.label} className="p-3 border border-slate-200 rounded-lg text-center">
                <div className={`text-lg font-extrabold ${getColor(item.score)}`}>{item.score}</div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">{item.label}</div>
                <div className="text-[9px] text-slate-400 mt-0.5">{item.desc}</div>
                <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${getBarColor(item.score)}`} style={{ width: `${item.score}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Keywords */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Found Keywords</span>
            <div className="flex flex-wrap gap-1.5">
              {analysis.foundKeywords.length > 0 ? analysis.foundKeywords.map(kw => (
                <span key={kw} className="text-[10px] font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200"><CheckCircle2 className="h-2.5 w-2.5 inline mr-0.5" />{kw}</span>
              )) : <span className="text-xs text-slate-400 italic">None yet</span>}
            </div>
            {analysis.missingKeywords.length > 0 && (
              <>
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider mt-3 block">Missing Keywords</span>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.missingKeywords.slice(0, 10).map(kw => (
                    <span key={kw} className="text-[10px] font-medium bg-red-50 text-red-600 px-2 py-0.5 rounded-full border border-red-200"><AlertCircle className="h-2.5 w-2.5 inline mr-0.5" />{kw}</span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Suggestions */}
          {showSuggestions && analysis.suggestions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Suggestions</span>
              </div>
              <div className="space-y-1.5">
                {analysis.suggestions.map((s, i) => (
                  <div key={i} className="flex gap-2 text-xs text-slate-600 bg-amber-50/50 p-2.5 rounded-lg border border-amber-100">
                    <span className="text-amber-500 font-bold mt-0.5">•</span>
                    <span>{s}</span>
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
