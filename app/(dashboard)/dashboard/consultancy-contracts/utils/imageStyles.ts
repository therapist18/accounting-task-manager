// Per-instance image display overrides set from the Data & Values panel's
// image controls (see DataValuesPanel.tsx's ImageSizeControls), mirroring
// TemplateGenerationDialog's own imageStyles/ImagePlaceholderControls. Keyed
// by field key - a top-level placeholder's own key, or
// `${blockName}_${rowIdx}_${childKey}` for one row's image inside a
// repeating block (e.g. one director's signature) - so each occurrence of
// the same image placeholder can be sized independently.
export interface ImageStyle {
  imageWidth?: number;
  imageHeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  maxWidth?: string;
}

export type ImageStyleMap = Record<string, ImageStyle>;

export function blockImageFieldKey(blockName: string, rowIdx: number, childKey: string): string {
  return `${blockName}_${rowIdx}_${childKey}`;
}
