"use client";

import React, { useMemo } from "react";
import { X, BarChart3, FileText, Percent, Eye, AlignLeft, Target, Award } from "lucide-react";

interface ResumeAnalyticsProps {
  cvData: any;
  onClose: () => void;
}

export default function ResumeAnalytics({ cvData, onClose }: ResumeAnalyticsProps) {
  const analytics = useMemo(() => {
    const allText = [
      cvData.summary || "",
      ...(cvData.experience || []).flatMap((e: any) => [e.companyDesc || "", ...(e.responsibilities || [])]),
      ...(cvData.internships || []).flatMap((e: any) => [e.companyDesc || "", ...(e.responsibilities || [])]),
      ...(cvData.skills || []).map((s: any) => `${s.category} ${s.items}`),
      ...(cvData.education || []).map((e: any) => `${e.degree} ${e.institution} ${e.details}`),
      ...(cvData.projects || []).map((p: any) => `${p.title} ${p.description}`),
      ...(cvData.certifications || []).map((c: any) => `${c.name} ${c.issuer}`),
      ...(cvData.achievements || []).map((a: any) => `${a.title} ${a.description}`),
    ].join(" ");

    const words = allText.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const charCount = allText.length;

    const totalSections = 10;
    const filledSections = [
      !!cvData.personalInfo?.fullName,
      !!cvData.summary,
      (cvData.experience || []).length > 0,
      (cvData.education || []).length > 0,
      (cvData.skills || []).length > 0,
      (cvData.certifications || []).length > 0,
      (cvData.languages || []).length > 0,
      (cvData.projects || []).length > 0,
      (cvData.references || []).length > 0,
      !!cvData.declaration,
    ];
    const completionPercent = Math.round((filledSections.filter(Boolean).length / totalSections) * 100);

    const actionVerbs = ['achieved', 'built', 'created', 'delivered', 'designed', 'developed', 'established', 'generated', 'implemented', 'improved', 'increased', 'initiated', 'launched', 'led', 'managed', 'optimized', 'organized', 'produced', 'reduced', 'transformed'];
    const actionVerbCount = actionVerbs.filter(v => allText.toLowerCase().includes(v)).length;
    const bulletCount = (allText.match(/[•\-]\s/g) || []).length;
    const hasQuantified = /\d+%|\d+x|\d+\s*(million|k|users|clients|projects|people|revenue)/i.test(allText);

    const keywordDensity: Record<string, number> = {};
    const commonWords = words.filter(w => w.length > 4).map(w => w.toLowerCase().replace(/[^a-z]/g, ''));
    commonWords.forEach(w => { keywordDensity[w] = (keywordDensity[w] || 0) + 1; });
    const topKeywords = Object.entries(keywordDensity).sort((a, b) => b[1] - a[1]).slice(0, 10);

    return {
      wordCount,
      charCount,
      completionPercent,
      actionVerbCount,
      bulletCount,
      hasQuantified,
      topKeywords,
      totalExperience: (cvData.experience || []).length,
      totalProjects: (cvData.projects || []).length,
      totalSkills: (cvData.skills || []).reduce((acc: number, s: any) => acc + (s.items ? s.items.split(',').length : 0), 0),
      totalCertifications: (cvData.certifications || []).length,
    };
  }, [cvData]);

  const getColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-red-500';
  };

  const stats = [
    { label: 'Word Count', value: analytics.wordCount, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Completion', value: `${analytics.completionPercent}%`, icon: Percent, color: getColor(analytics.completionPercent), bg: 'bg-emerald-50' },
    { label: 'Action Verbs', value: analytics.actionVerbCount, icon: Eye, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Bullet Points', value: analytics.bulletCount, icon: AlignLeft, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Skills Count', value: analytics.totalSkills, icon: Target, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Certifications', value: analytics.totalCertifications, icon: Award, color: 'text-rose-600', bg: 'bg-rose-50' },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-slate-600" />
            <h2 className="text-sm font-bold text-slate-900">Resume Analytics</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            {stats.map(stat => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className={`${stat.bg} p-3 rounded-xl border border-slate-200 text-center`}>
                  <Icon className={`h-4 w-4 ${stat.color} mx-auto`} />
                  <div className={`text-lg font-extrabold ${stat.color} mt-1`}>{stat.value}</div>
                  <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</div>
                </div>
              );
            })}
          </div>

          {/* Completion bar */}
          <div className="p-3 border border-slate-200 rounded-lg">
            <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1.5">
              <span>Section Completion</span>
              <span className={getColor(analytics.completionPercent)}>{analytics.completionPercent}%</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${analytics.completionPercent >= 80 ? 'bg-emerald-500' : analytics.completionPercent >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${analytics.completionPercent}%` }} />
            </div>
            <div className="flex justify-between text-[9px] text-slate-400 mt-1.5">
              <span>Contact</span>
              <span>Summary</span>
              <span>Experience</span>
              <span>Education</span>
              <span>Skills</span>
              <span>More...</span>
            </div>
          </div>

          {/* Quality indicators */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Quality Checks</span>
            <div className="space-y-1.5">
              {[
                { label: 'Action verbs used', pass: analytics.actionVerbCount >= 5, detail: `${analytics.actionVerbCount} found (aim for 5+)` },
                { label: 'Bullet points in experience', pass: analytics.bulletCount >= 3, detail: `${analytics.bulletCount} found (aim for 3+)` },
                { label: 'Quantified achievements', pass: analytics.hasQuantified, detail: analytics.hasQuantified ? 'Found metrics like %, $, numbers' : 'Add metrics (% growth, $ revenue, etc.)' },
                { label: 'Section completion', pass: analytics.completionPercent >= 70, detail: `${analytics.completionPercent}% complete` },
                { label: 'Word count', pass: analytics.wordCount >= 300 && analytics.wordCount <= 800, detail: `${analytics.wordCount} words (ideal: 300-800)` },
              ].map(check => (
                <div key={check.label} className={`flex items-center justify-between p-2 rounded-lg text-xs ${check.pass ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  <span className="font-semibold">{check.label}</span>
                  <span className="text-[10px]">{check.detail}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Keywords */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Top Keywords (by frequency)</span>
            <div className="flex flex-wrap gap-1.5">
              {analytics.topKeywords.map(([word, count]) => (
                <span key={word} className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                  {word} <span className="text-slate-400 font-bold">({count})</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
