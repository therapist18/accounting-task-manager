"use client";

import { Check, Layout, Palette, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { COLOR_PRESETS } from "@/lib/documentTheme";
import type { CvSettings } from "../utils/cvGeneratorData";

interface DesignPanelProps {
  showDesignPanel: boolean;
  setShowDesignPanel: (v: boolean) => void;
  activeDesignTab: string;
  setActiveDesignTab: (tab: string) => void;
  selectedLayout: string;
  setSelectedLayout: (layout: string) => void;
  cvSettings: CvSettings;
  updateCvSetting: <K extends string>(key: K, value: any) => void;
}

export function DesignPanel({
  showDesignPanel,
  setShowDesignPanel,
  activeDesignTab,
  setActiveDesignTab,
  selectedLayout,
  setSelectedLayout,
  cvSettings,
  updateCvSetting,
}: DesignPanelProps) {
  if (!showDesignPanel) return null;

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={() => setShowDesignPanel(false)} />
      <div className="fixed right-0 top-[56px] bottom-0 w-72 bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Palette className="h-4 w-4 text-custom-blue" /> Design Panel</h3>
          <button onClick={() => setShowDesignPanel(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5 mx-3 mt-3 shrink-0">
          {[{ key: 'theme', label: 'Layout' }, { key: 'colors', label: 'Color' }, { key: 'font', label: 'Font' }, { key: 'photo', label: 'Photo' }].map(tab => (
            <button key={tab.key} onClick={() => setActiveDesignTab(tab.key)}
              className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-all ${activeDesignTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >{tab.label}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeDesignTab === 'theme' && (
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">CV Layout</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "theme1", label: "Classic", desc: "Two-column sidebar" },
                  { key: "theme2", label: "Modern", desc: "Top-header layout" },
                  { key: "theme3", label: "Minimal", desc: "Single column" },
                  { key: "theme4", label: "Executive", desc: "Bold leadership" },
                  { key: "theme5", label: "Creative", desc: "Split accent bar" },
                  { key: "theme6", label: "Academic", desc: "Scholar format" },
                  { key: "theme7", label: "Timeline", desc: "Vertical timeline" },
                  { key: "cv_corporate", label: "Corporate", desc: "Classic corporate style" },
                  { key: "cv_legal", label: "Legal", desc: "Formal legal style" },
                ].map(t => (
                  <button key={t.key} onClick={() => setSelectedLayout(t.key)}
                    className={`p-2.5 rounded-lg border-2 text-left transition-all ${selectedLayout === t.key ? 'border-custom-blue bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <Layout className={`h-3.5 w-3.5 mb-1 ${selectedLayout === t.key ? 'text-custom-blue' : 'text-slate-400'}`} />
                    <div className="text-xs font-bold text-slate-700">{t.label}</div>
                    <div className="text-xs text-slate-400">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {activeDesignTab === 'colors' && (
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Color Scheme</span>
              <div className="grid grid-cols-4 gap-2">
                {COLOR_PRESETS.map(preset => (
                  <button key={preset.name} title={preset.name}
                    onClick={() => { updateCvSetting('primaryColor', preset.primary); updateCvSetting('accentColor', preset.accent); }}
                    className="relative w-full aspect-square rounded-xl border-2 transition-all hover:scale-105"
                    style={{ background: `linear-gradient(135deg, ${preset.primary} 50%, ${preset.accent} 50%)`, borderColor: (cvSettings.primaryColor === preset.primary && cvSettings.accentColor === preset.accent) ? '#376bae' : 'transparent' }}
                  >
                    {(cvSettings.primaryColor === preset.primary && cvSettings.accentColor === preset.accent) && <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5"><span className="text-xs text-slate-500">Primary</span><input type="color" value={cvSettings.primaryColor} onChange={e => updateCvSetting('primaryColor', e.target.value)} className="w-full h-8 rounded border border-slate-200 p-0.5 cursor-pointer" /></div>
              <div className="space-y-1.5"><span className="text-xs text-slate-500">Accent</span><input type="color" value={cvSettings.accentColor} onChange={e => updateCvSetting('accentColor', e.target.value)} className="w-full h-8 rounded border border-slate-200 p-0.5 cursor-pointer" /></div>
            </div>
          )}
          {activeDesignTab === 'font' && (
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Font Family</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: 'Inter', family: 'Inter, sans-serif', desc: 'Clean modern' },
                  { name: 'Roboto', family: 'Roboto, sans-serif', desc: 'Versatile' },
                  { name: 'Poppins', family: 'Poppins, sans-serif', desc: 'Friendly' },
                  { name: 'Lato', family: 'Lato, sans-serif', desc: 'Professional' },
                  { name: 'Merriweather', family: 'Merriweather, serif', desc: 'Elegant' },
                  { name: 'System', family: '-apple-system, sans-serif', desc: 'Default' },
                ].map(f => (
                  <button key={f.name} onClick={() => updateCvSetting('fontFamily', f.family)}
                    className={`p-2.5 rounded-lg border-2 text-left transition-all ${(cvSettings as any).fontFamily === f.family ? 'border-custom-blue bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="text-xs font-bold text-slate-700" style={{ fontFamily: f.family }}>{f.name}</div>
                    <div className="text-xs text-slate-400">{f.desc}</div>
                  </button>
                ))}
              </div>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block mt-2">Font Size</span>
              <div className="flex items-center border border-slate-200 rounded-md overflow-hidden h-8 bg-white">
                {([0.85, 1, 1.15] as const).map((s, i) => (
                  <button key={s} onClick={() => updateCvSetting('fontScale', s)} className={`flex-1 text-xs font-bold h-full transition-colors ${cvSettings.fontScale === s ? 'bg-custom-blue text-white' : 'text-slate-500 hover:bg-slate-50'} ${i > 0 ? 'border-l border-slate-200' : ''}`}>{['Sm', 'Md', 'Lg'][i]}</button>
                ))}
              </div>
            </div>
          )}
          {activeDesignTab === 'photo' && (
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Photo Shape</span>
              <div className="flex gap-2">
                {(['circle', 'rounded', 'square'] as const).map(shape => (
                  <button key={shape} onClick={() => updateCvSetting('photoShape', shape)}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border-2 capitalize transition-all ${cvSettings.photoShape === shape ? 'border-custom-blue bg-blue-50 text-custom-blue' : 'border-slate-200 text-slate-500'}`}
                  >{shape}</button>
                ))}
              </div>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Photo Size</span>
              <div className="flex gap-2">
                {([{ label: 'S', val: '80px' }, { label: 'M', val: '110px' }, { label: 'L', val: '140px' }]).map(sz => (
                  <button key={sz.val} onClick={() => updateCvSetting('photoSize', sz.val)}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border-2 transition-all ${cvSettings.photoSize === sz.val ? 'border-custom-blue bg-blue-50 text-custom-blue' : 'border-slate-200 text-slate-500'}`}
                  >{sz.label}</button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Checkbox id="showPhoto" checked={(cvSettings as any).showPhoto !== false} onCheckedChange={v => updateCvSetting('showPhoto', v)} />
                <label htmlFor="showPhoto" className="text-xs font-semibold text-slate-700 cursor-pointer">Show Photo</label>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
