"use client";

import React, { useState, useMemo } from "react";
import { X, Crosshair, Upload, Loader2, CheckCircle2, AlertCircle, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface JobMatchProps {
  cvData: any;
  onClose: () => void;
}

export default function JobMatch({ cvData, onClose }: JobMatchProps) {
  const [jobDescription, setJobDescription] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [matchResult, setMatchResult] = useState<{
    score: number;
    matchedSkills: string[];
    missingSkills: string[];
    matchedKeywords: string[];
    missingKeywords: string[];
    suggestions: string[];
  } | null>(null);

  const cvText = useMemo(() => {
    return [
      cvData.summary || "",
      ...(cvData.experience || []).flatMap((e: any) => [e.companyDesc || "", ...(e.responsibilities || [])]),
      ...(cvData.skills || []).map((s: any) => `${s.category} ${s.items}`),
      ...(cvData.education || []).map((e: any) => `${e.degree} ${e.institution} ${e.details}`),
      ...(cvData.certifications || []).map((c: any) => `${c.name} ${c.issuer}`),
      ...(cvData.languages || []).map((l: any) => l.language),
    ].join(" ").toLowerCase();
  }, [cvData]);

  const analyzeMatch = () => {
    if (!jobDescription.trim()) {
      toast.error("Please paste a job description first");
      return;
    }

    setIsAnalyzing(true);
    setTimeout(() => {
      try {
        const jdWords = jobDescription.toLowerCase().split(/[\s,;.()]+/).filter(w => w.length > 3);
        const cvWords = new Set(cvText.split(/[\s,;.()]+/));

        const skillPatterns = [
          'python', 'javascript', 'typescript', 'react', 'angular', 'vue', 'node.js', 'node',
          'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'sql', 'nosql', 'mongodb', 'postgresql',
          'git', 'jenkins', 'terraform', 'ansible', 'linux', 'agile', 'scrum', 'rest', 'graphql',
          'machine learning', 'deep learning', 'nlp', 'data science', 'analytics', 'tableau',
          'power bi', 'excel', 'sap', 'quickbooks', 'erp', 'crm', 'seo', 'sem', 'content',
          'leadership', 'management', 'communication', 'teamwork', 'problem-solving',
        ];

        const matchedSkills = skillPatterns.filter(s => {
          const words = s.split(' ');
          return words.every(w => jdWords.includes(w));
        }).filter(s => {
          const words = s.split(' ');
          return words.some(w => cvWords.has(w));
        });

        const missingSkills = skillPatterns.filter(s => {
          const words = s.split(' ');
          return words.every(w => jdWords.includes(w));
        }).filter(s => {
          const words = s.split(' ');
          return !words.some(w => cvWords.has(w));
        });

        const jdKeywords = jdWords.filter(w => w.length > 4 && !['this', 'that', 'with', 'from', 'have', 'been', 'will', 'were', 'their', 'what', 'about', 'which'].includes(w));
        const matchedKeywords = jdKeywords.filter(w => cvWords.has(w));
        const missingKeywords = jdKeywords.filter(w => !cvWords.has(w)).slice(0, 10);

        const totalKeywords = jdKeywords.length;
        const matchScore = totalKeywords > 0 ? Math.round((matchedKeywords.length / totalKeywords) * 100) : 0;

        const suggestions: string[] = [];
        if (missingSkills.length > 0) suggestions.push(`Add skills: ${missingSkills.slice(0, 5).join(', ')}`);
        if (missingKeywords.length > 0) suggestions.push(`Include keywords like ${missingKeywords.slice(0, 5).join(', ')} in your CV`);
        if (!cvData.summary) suggestions.push("Add a professional summary targeting this role");
        if (matchScore < 50) suggestions.push("Consider tailoring your experience bullet points to this job description");

        setMatchResult({
          score: Math.min(100, matchScore),
          matchedSkills: [...new Set(matchedSkills)],
          missingSkills: [...new Set(missingSkills)],
          matchedKeywords: [...new Set(matchedKeywords.slice(0, 10))],
          missingKeywords: [...new Set(missingKeywords)],
          suggestions,
        });
      } catch {
        toast.error("Analysis failed");
      } finally {
        setIsAnalyzing(false);
      }
    }, 1200);
  };

  const getColor = (score: number) => {
    if (score >= 70) return 'text-emerald-600';
    if (score >= 40) return 'text-amber-600';
    return 'text-red-500';
  };

  const getBarColor = (score: number) => {
    if (score >= 70) return 'bg-emerald-500';
    if (score >= 40) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crosshair className="h-5 w-5 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">Job Description Match</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Paste Job Description</label>
            <Textarea rows={6} value={jobDescription} onChange={e => setJobDescription(e.target.value)} placeholder="Paste the full job description here..." />
          </div>
          <Button onClick={analyzeMatch} disabled={isAnalyzing || !jobDescription.trim()} className="w-full bg-blue-600 hover:bg-blue-700 h-9 text-xs">
            {isAnalyzing ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Analyzing...</> : <><Crosshair className="h-3.5 w-3.5 mr-1.5" /> Analyze Match</>}
          </Button>

          {matchResult && (
            <div className="space-y-4 border-t border-slate-200 pt-4">
              <div className={`p-4 rounded-xl border text-center ${matchResult.score >= 70 ? 'bg-emerald-50 border-emerald-200' : matchResult.score >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                <div className={`text-4xl font-extrabold ${getColor(matchResult.score)}`}>{matchResult.score}%</div>
                <div className="text-xs font-semibold text-slate-500 mt-1">Match Score</div>
                <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${getBarColor(matchResult.score)}`} style={{ width: `${matchResult.score}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 border border-emerald-200 bg-emerald-50 rounded-lg">
                  <div className="text-xs font-bold text-emerald-700 mb-1">Matched Skills</div>
                  <div className="flex flex-wrap gap-1">
                    {matchResult.matchedSkills.length > 0 ? matchResult.matchedSkills.map(s => (
                      <span key={s} className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full"><CheckCircle2 className="h-2 w-2 inline mr-0.5" />{s}</span>
                    )) : <span className="text-[10px] text-emerald-500 italic">None found</span>}
                  </div>
                </div>
                <div className="p-3 border border-red-200 bg-red-50 rounded-lg">
                  <div className="text-xs font-bold text-red-600 mb-1">Missing Skills</div>
                  <div className="flex flex-wrap gap-1">
                    {matchResult.missingSkills.length > 0 ? matchResult.missingSkills.slice(0, 6).map(s => (
                      <span key={s} className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full"><AlertCircle className="h-2 w-2 inline mr-0.5" />{s}</span>
                    )) : <span className="text-[10px] text-red-400 italic">None!</span>}
                  </div>
                </div>
              </div>

              {matchResult.suggestions.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Suggestions</span>
                  {matchResult.suggestions.map((s, i) => (
                    <div key={i} className="flex gap-2 text-xs text-slate-600 bg-blue-50 p-2.5 rounded-lg border border-blue-100">
                      <Lightbulb className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
