// Maintained set of Matrimonial Biodata sections - the biodata equivalent of
// employment-contracts/utils/contractStructure.ts's CONTRACT_SECTIONS.
// Sections themselves are fixed in code; users add/link placeholders WITHIN
// a section from the Settings page, never new sections.
export type BiodataSectionLayout = 'grid' | 'custom';

export interface BiodataSection {
  key: string;
  title: string;
  // 'grid' sections render as a dynamic label:value row list in the print
  // themes (BiodataPreview.tsx) - any placeholder added here shows up on the
  // printed document automatically. 'custom' sections (header photo/contact
  // block, family bios, roots paragraph, photo gallery) keep their current
  // hand-styled markup, sourced by well-known placeholder keys instead.
  layout: BiodataSectionLayout;
}

export const BIODATA_SECTIONS: BiodataSection[] = [
  { key: 'header', title: 'Header Information', layout: 'custom' },
  { key: 'personal', title: 'Personal Details', layout: 'grid' },
  { key: 'career', title: 'Career & Lifestyle', layout: 'grid' },
  { key: 'family', title: 'Family Background', layout: 'custom' },
  { key: 'roots', title: 'Roots & Values', layout: 'custom' },
  { key: 'gallery', title: 'Gallery', layout: 'custom' },
];

export function getBiodataSection(key: string | undefined | null): BiodataSection | undefined {
  return BIODATA_SECTIONS.find((s) => s.key === key);
}
