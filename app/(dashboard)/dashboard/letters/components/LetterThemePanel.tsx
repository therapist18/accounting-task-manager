import { Palette, X } from 'lucide-react';
import { ContractThemeEditor } from '../../employment-contracts/components/ContractThemePanel';
import type { GeneralLetterThemeSettings } from '../utils/letterThemeEngine';

// Slide-over shell for the General letter's theme controls - "handle themes
// the same way as the contract module" means reusing <ContractThemeEditor>
// verbatim (same Theme/Color/Font/Header tabs, same 8 presets) rather than
// forking a near-identical editor just for letters. Only this shell (the
// header bar + backdrop + panel chrome) is letter-specific, mirroring
// ContractThemePanel.tsx's own shell.
interface LetterThemePanelProps {
  open: boolean;
  onClose: () => void;
  settings: GeneralLetterThemeSettings;
  onChange: (settings: GeneralLetterThemeSettings) => void;
}

export function LetterThemePanel({ open, onClose, settings, onChange }: LetterThemePanelProps) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-72 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-40 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Palette className="h-4 w-4 text-blue-600" /> Letter Theme
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
