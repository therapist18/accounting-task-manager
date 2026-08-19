import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Settings2 } from 'lucide-react';
import type { Individual } from '../../individuals/database';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface BiodataEditorProps {
  selectedIndividual: Individual | null;
  biodataConfig: any;
  setBiodataConfig: (config: any) => void;
}

export function BiodataEditor({ selectedIndividual, biodataConfig, setBiodataConfig }: BiodataEditorProps) {
  if (!selectedIndividual) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500">
        Select an individual from the sidebar to start configuring.
      </div>
    );
  }

  const updateConfig = (key: string, value: any) => {
    setBiodataConfig((prev: any) => ({ ...prev, [key]: value }));
  };

  const updateNestedConfig = (section: string, key: string, value: any) => {
    setBiodataConfig((prev: any) => ({
      ...prev,
      [section]: {
        ...(prev[section] || {}),
        [key]: value
      }
    }));
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-custom-blue" />
          Biodata Configuration
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Theme Selection */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Appearance</h3>
          <div className="space-y-2">
            <Label>Theme</Label>
            <Select 
              value={biodataConfig.theme || 'theme1'} 
              onValueChange={(val) => updateConfig('theme', val)}
            >
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

        {/* Contact Info */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Header Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input 
                value={biodataConfig.phone || ''} 
                onChange={(e) => updateConfig('phone', e.target.value)} 
                placeholder="+1 (123) 456-7890" 
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input 
                value={biodataConfig.email || ''} 
                onChange={(e) => updateConfig('email', e.target.value)} 
                placeholder="email@example.com" 
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Address</Label>
              <Input 
                value={biodataConfig.address || ''} 
                onChange={(e) => updateConfig('address', e.target.value)} 
                placeholder="123 Main St, City, Country" 
              />
            </div>
          </div>
        </div>

        {/* Personal Details */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Personal Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Date of Birth</Label>
              <Input 
                value={biodataConfig.personal?.dob || ''} 
                onChange={(e) => updateNestedConfig('personal', 'dob', e.target.value)} 
                placeholder="4th October 2000" 
              />
            </div>
            <div className="space-y-1">
              <Label>Time of Birth</Label>
              <Input 
                value={biodataConfig.personal?.tob || ''} 
                onChange={(e) => updateNestedConfig('personal', 'tob', e.target.value)} 
                placeholder="06:30 PM" 
              />
            </div>
            <div className="space-y-1">
              <Label>Birth Place</Label>
              <Input 
                value={biodataConfig.personal?.birthPlace || ''} 
                onChange={(e) => updateNestedConfig('personal', 'birthPlace', e.target.value)} 
                placeholder="City, Country" 
              />
            </div>
            <div className="space-y-1">
              <Label>Height</Label>
              <Input 
                value={biodataConfig.personal?.height || ''} 
                onChange={(e) => updateNestedConfig('personal', 'height', e.target.value)} 
                placeholder="6'0&quot; (183 cm)" 
              />
            </div>
            <div className="space-y-1">
              <Label>Religion</Label>
              <Input 
                value={biodataConfig.personal?.religion || ''} 
                onChange={(e) => updateNestedConfig('personal', 'religion', e.target.value)} 
                placeholder="Hindu" 
              />
            </div>
            <div className="space-y-1">
              <Label>Community</Label>
              <Input 
                value={biodataConfig.personal?.community || ''} 
                onChange={(e) => updateNestedConfig('personal', 'community', e.target.value)} 
                placeholder="Levua Patidar" 
              />
            </div>
            <div className="space-y-1">
              <Label>Nationality</Label>
              <Input 
                value={biodataConfig.personal?.nationality || ''} 
                onChange={(e) => updateNestedConfig('personal', 'nationality', e.target.value)} 
                placeholder="Kenyan" 
              />
            </div>
            <div className="space-y-1">
              <Label>Marital Status</Label>
              <Input 
                value={biodataConfig.personal?.maritalStatus || ''} 
                onChange={(e) => updateNestedConfig('personal', 'maritalStatus', e.target.value)} 
                placeholder="Single" 
              />
            </div>
          </div>
        </div>

        {/* Career & Lifestyle */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Career & Lifestyle</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Education</Label>
              <Input 
                value={biodataConfig.career?.education || ''} 
                onChange={(e) => updateNestedConfig('career', 'education', e.target.value)} 
              />
            </div>
            <div className="space-y-1">
              <Label>Occupation</Label>
              <Input 
                value={biodataConfig.career?.occupation || ''} 
                onChange={(e) => updateNestedConfig('career', 'occupation', e.target.value)} 
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Hobbies</Label>
              <Input 
                value={biodataConfig.career?.hobbies || ''} 
                onChange={(e) => updateNestedConfig('career', 'hobbies', e.target.value)} 
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Languages</Label>
              <Input 
                value={biodataConfig.career?.languages || ''} 
                onChange={(e) => updateNestedConfig('career', 'languages', e.target.value)} 
              />
            </div>
          </div>
        </div>

        {/* Family Background */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Family Background</h3>
          <div className="space-y-4">
            <div className="space-y-2 border p-3 rounded-md">
              <Label className="font-semibold text-custom-blue">Father Details</Label>
              <Input placeholder="Name" value={biodataConfig.family?.fatherName || ''} onChange={(e) => updateNestedConfig('family', 'fatherName', e.target.value)} />
              <Input placeholder="Occupation & Details" value={biodataConfig.family?.fatherDesc || ''} onChange={(e) => updateNestedConfig('family', 'fatherDesc', e.target.value)} />
            </div>
            <div className="space-y-2 border p-3 rounded-md">
              <Label className="font-semibold text-custom-blue">Mother Details</Label>
              <Input placeholder="Name" value={biodataConfig.family?.motherName || ''} onChange={(e) => updateNestedConfig('family', 'motherName', e.target.value)} />
              <Input placeholder="Occupation & Details" value={biodataConfig.family?.motherDesc || ''} onChange={(e) => updateNestedConfig('family', 'motherDesc', e.target.value)} />
            </div>
            <div className="space-y-2 border p-3 rounded-md">
              <Label className="font-semibold text-custom-blue">Maternal Family</Label>
              <Textarea 
                placeholder="Maternal family details..." 
                value={biodataConfig.family?.maternalDesc || ''} 
                onChange={(e) => updateNestedConfig('family', 'maternalDesc', e.target.value)} 
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* Roots */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Roots & Values</h3>
          <div className="space-y-1">
            <Textarea 
              placeholder="Describe your roots and values..." 
              value={biodataConfig.roots || ''} 
              onChange={(e) => updateConfig('roots', e.target.value)} 
              rows={4}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
