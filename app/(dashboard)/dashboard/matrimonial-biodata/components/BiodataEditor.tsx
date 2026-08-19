import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Settings2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Individual } from '../../individuals/database';
import type { Placeholder } from '../../templates/document-template-manager/types';
import { BIODATA_SECTIONS } from '../utils/biodataStructure';

interface BiodataEditorProps {
  selectedIndividual: Individual | null;
  placeholders: Placeholder[];
  values: Record<string, string>;
  theme: string;
  images: string[];
  loading: boolean;
  saving: boolean;
  onValueChange: (key: string, value: string) => void;
  onThemeChange: (theme: string) => void;
  onImagesChange: (images: string[]) => void;
  onSave: () => void;
}

// Fields long enough that a single-line Input would be awkward - everything
// else in a 'grid' section gets a plain Input.
const MULTILINE_FIELDS = new Set(['father_desc', 'mother_desc', 'maternal_desc', 'roots_text', 'address']);

export function BiodataEditor({
  selectedIndividual, placeholders, values, theme, images, loading, saving,
  onValueChange, onThemeChange, onImagesChange, onSave,
}: BiodataEditorProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, Placeholder[]>();
    for (const p of placeholders) {
      const key = p.section_key || BIODATA_SECTIONS[0].key;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return BIODATA_SECTIONS.map((section) => ({ section, items: map.get(section.key) || [] }));
  }, [placeholders]);

  if (!selectedIndividual) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500">
        Select an individual from the sidebar to start configuring.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-custom-blue" />
          Biodata Configuration
        </h2>
        <Button size="sm" className="h-8" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
          Save
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            {/* Theme Selection */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Appearance</h3>
              <div className="space-y-2">
                <Label>Theme</Label>
                <Select value={theme || 'theme1'} onValueChange={onThemeChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select theme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="theme1">Royal Blue & Gold</SelectItem>
                    <SelectItem value="theme2">Elegant Ivory & Maroon</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {grouped
              .filter(({ section }) => section.key !== 'gallery')
              .map(({ section, items }) => (
                <div key={section.key} className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{section.title}</h3>
                  {items.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No placeholders in this section yet - add one from Settings.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {items.map((p) => (
                        <div
                          key={p.id}
                          className={MULTILINE_FIELDS.has(p.name) ? 'space-y-1 col-span-2' : 'space-y-1'}
                        >
                          <Label>{p.display_value || p.name}</Label>
                          {MULTILINE_FIELDS.has(p.name) ? (
                            <Textarea
                              value={values[p.name] || ''}
                              onChange={(e) => onValueChange(p.name, e.target.value)}
                              rows={3}
                            />
                          ) : (
                            <Input
                              value={values[p.name] || ''}
                              onChange={(e) => onValueChange(p.name, e.target.value)}
                              placeholder={p.default_value || ''}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

            {/* Gallery */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Gallery</h3>
              <Textarea
                placeholder="One image URL/path per line - first is the profile photo."
                value={images.join('\n')}
                onChange={(e) => onImagesChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
                rows={5}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
