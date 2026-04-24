// @ts-nocheck

import { AlignLeft, AlignCenter, AlignRight, Expand } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface ImagePlaceholderControlsProps {
  styles: {
    textAlign?: string;
    maxWidth?: string;
    imageWidth?: number;
    imageHeight?: number;
  };
  onStyleChange: (key: string, value: any) => void;
}

export const ImagePlaceholderControls = ({ styles, onStyleChange }: ImagePlaceholderControlsProps) => {
  const sizeMap = { small: '25%', medium: '50%', large: '75%', 'full-width': '100%' };
  const currentSizeKey = Object.keys(sizeMap).find(key => sizeMap[key] === styles.maxWidth) || 'full-width';

  return (
    <div className="space-y-3 pt-2 border-t mt-2">
      <div className="flex items-center gap-2">
        <ToggleGroup
          type="single"
          value={styles.textAlign || 'center'}
          onValueChange={(align) => align && onStyleChange('textAlign', align)}
          className="bg-background rounded-md border h-8"
        >
          <ToggleGroupItem value="left" className="px-2"><AlignLeft className="h-3 w-3" /></ToggleGroupItem>
          <ToggleGroupItem value="center" className="px-2"><AlignCenter className="h-3 w-3" /></ToggleGroupItem>
          <ToggleGroupItem value="right" className="px-2"><AlignRight className="h-3 w-3" /></ToggleGroupItem>
        </ToggleGroup>
        <Select value={currentSizeKey} onValueChange={(size) => onStyleChange('maxWidth', sizeMap[size])}>
          <SelectTrigger className="w-14 h-8"><SelectValue><Expand className="h-3 w-3" /></SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="small">25%</SelectItem>
            <SelectItem value="medium">50%</SelectItem>
            <SelectItem value="large">75%</SelectItem>
            <SelectItem value="full-width">100%</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">Width (px)</Label>
          <Input
            type="number"
            min="50"
            max="600"
            value={styles.imageWidth || 300}
            onChange={(e) => onStyleChange('imageWidth', parseInt(e.target.value) || 300)}
            className="h-7 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px]">Height (px)</Label>
          <Input
            type="number"
            min="50"
            max="600"
            value={styles.imageHeight || 200}
            onChange={(e) => onStyleChange('imageHeight', parseInt(e.target.value) || 200)}
            className="h-7 text-xs"
          />
        </div>
      </div>
    </div>
  );
};
