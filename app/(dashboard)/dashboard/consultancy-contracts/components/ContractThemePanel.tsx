import { useState } from 'react';
import { Palette, X, Layout, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ContractThemeSettings,
  DocumentTheme,
  BrandingStrategy,
  THEME_DEFAULTS,
  COLOR_PRESETS,
  FONT_OPTIONS,
} from '../utils/themeEngine';

const TABS = [
  { key: 'theme', label: 'Theme' },
  { key: 'color', label: 'Color' },
  { key: 'font', label: 'Font' },
  { key: 'header', label: 'Header' },
] as const;

const BRANDING_OPTIONS: { id: BrandingStrategy; label: string; description: string }[] = [
  { id: 'none', label: 'None', description: 'No header, just the contract body' },
  { id: 'company_letterhead', label: 'Company Letterhead', description: "Prepend the client company's name and address" },
  { id: 'embedded', label: 'Embedded', description: 'Type your own heading directly in the template body (e.g. an H1) - each theme styles it automatically' },
];

// This module's own theme/color/font/header editor - deliberately a
// separate component from employment-contracts/components/ContractThemePanel.tsx
// (not a reused import), since it's wired to THIS module's own 3-theme
// engine (utils/themeEngine.ts: consulting_standard/modern_agency/
// classic_legal), not Employment Contracts' 8. Same shape/UX otherwise, so
// nothing about the editing experience needs relearning.
export function ContractThemeEditor({ settings, onChange, variant = 'panel' }: {
  settings: ContractThemeSettings;
  onChange: (settings: ContractThemeSettings) => void;
  variant?: 'panel' | 'inline';
}) {
  const [activeTab, setActiveTab] = useState<typeof TABS[number]['key']>('theme');

  const update = (patch: Partial<ContractThemeSettings>) => onChange({ ...settings, ...patch });

  return (
    <>
      <div className={cn("flex gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 shrink-0", variant === 'panel' && "mx-3 mt-3")}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 text-xs font-semibold py-1.5 rounded-md transition-all",
              activeTab === tab.key ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={variant === 'panel' ? "flex-1 overflow-y-auto p-4 space-y-4" : "p-4 space-y-4"}>
        {activeTab === 'theme' && (
          <div className="space-y-3">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Document Theme</span>
            <div className="grid grid-cols-1 gap-2">
              {(Object.keys(THEME_DEFAULTS) as DocumentTheme[]).map(id => {
                const def = THEME_DEFAULTS[id];
                const isActive = settings.theme === id;
                return (
                  <button
                    key={id}
                    onClick={() => update({ theme: id })}
                    className={cn(
                      "p-2.5 rounded-lg border-2 text-left transition-all flex items-center gap-2.5",
                      isActive ? "border-custom-blue bg-blue-50 dark:bg-blue-900/20" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                    )}
                  >
                    <span
                      className="h-6 w-6 rounded-md shrink-0"
                      style={{ background: `linear-gradient(135deg, ${def.primaryColor} 50%, ${def.accentColor} 50%)` }}
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">{def.label}</span>
                      <span className="block text-xs text-slate-400 truncate">{def.description}</span>
                    </span>
                    {isActive && <Check className="h-3.5 w-3.5 text-custom-blue ml-auto shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'color' && (
          <div className="space-y-3">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Color Scheme</span>
            <div className="grid grid-cols-4 gap-2">
              {COLOR_PRESETS.map(preset => {
                const isActive = settings.primaryColor === preset.primary && settings.accentColor === preset.accent;
                return (
                  <button
                    key={preset.name}
                    title={preset.name}
                    onClick={() => update({ primaryColor: preset.primary, accentColor: preset.accent })}
                    className="relative w-full aspect-square rounded-xl border-2 transition-all hover:scale-105"
                    style={{
                      background: `linear-gradient(135deg, ${preset.primary} 50%, ${preset.accent} 50%)`,
                      borderColor: isActive ? '#376bae' : 'transparent',
                    }}
                  >
                    {isActive && <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />}
                  </button>
                );
              })}
            </div>
            <div className="space-y-1.5">
              <span className="text-xs text-slate-500">Primary</span>
              <input type="color" value={settings.primaryColor} onChange={(e) => update({ primaryColor: e.target.value })} className="w-full h-8 rounded border border-slate-200 p-0.5 cursor-pointer" />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs text-slate-500">Accent</span>
              <input type="color" value={settings.accentColor} onChange={(e) => update({ accentColor: e.target.value })} className="w-full h-8 rounded border border-slate-200 p-0.5 cursor-pointer" />
            </div>
          </div>
        )}

        {activeTab === 'font' && (
          <div className="space-y-3">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Font Family</span>
            <div className="grid grid-cols-2 gap-2">
              {FONT_OPTIONS.map(f => (
                <button
                  key={f.name}
                  onClick={() => update({ fontFamily: f.family })}
                  className={cn(
                    "p-2.5 rounded-lg border-2 text-left transition-all",
                    settings.fontFamily === f.family ? "border-custom-blue bg-blue-50 dark:bg-blue-900/20" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                  )}
                >
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200" style={{ fontFamily: f.family }}>{f.name}</div>
                  <div className="text-xs text-slate-400">{f.desc}</div>
                </button>
              ))}
            </div>
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block mt-2">Font Size</span>
            <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden h-8 bg-white dark:bg-slate-800">
              {([0.9, 1, 1.1] as const).map((s, i) => (
                <button
                  key={s}
                  onClick={() => update({ fontScale: s })}
                  className={cn(
                    "flex-1 text-xs font-bold h-full transition-colors",
                    settings.fontScale === s ? "bg-custom-blue text-white" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700",
                    i > 0 && "border-l border-slate-200 dark:border-slate-700"
                  )}
                >
                  {['Sm', 'Md', 'Lg'][i]}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'header' && (
          <div className="space-y-3">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Header / Branding</span>
            <div className="grid grid-cols-1 gap-2">
              {BRANDING_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => update({ brandingStrategy: opt.id })}
                  className={cn(
                    "p-2.5 rounded-lg border-2 text-left transition-all",
                    settings.brandingStrategy === opt.id ? "border-custom-blue bg-blue-50 dark:bg-blue-900/20" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                  )}
                >
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Layout className={cn("h-3.5 w-3.5", settings.brandingStrategy === opt.id ? "text-custom-blue" : "text-slate-400")} />
                    {opt.label}
                  </div>
                  <div className="text-xs text-slate-400">{opt.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

interface ContractThemePanelProps {
  open: boolean;
  onClose: () => void;
  settings: ContractThemeSettings;
  onChange: (settings: ContractThemeSettings) => void;
}

export function ContractThemePanel({ open, onClose, settings, onChange }: ContractThemePanelProps) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-72 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-40 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Palette className="h-4 w-4 text-custom-blue" /> Contract Theme
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <ContractThemeEditor settings={settings} onChange={onChange} variant="panel" />
      </div>
    </>
  );
}
