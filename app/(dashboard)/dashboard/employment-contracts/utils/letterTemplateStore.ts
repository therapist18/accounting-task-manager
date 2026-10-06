import supabase from '@/lib/supabase/client';
import { fetchTemplatesForDocument, updateTemplate } from '../../consultancy-contracts/utils/ccTemplate';
import { fetchLetterDocumentTypes, createLetterDocumentType, LetterDocumentType } from './letterDocumentTypes';
import {
  LETTER_TEMPLATES, findStandardLetter, isLegacyLetterRow, convertLegacyLetter,
  type LetterTemplate,
} from './letterTemplates';

// Letter templates are acc_portal_templates rows keyed by the letter type's
// acc_portal_kyc id - the same rows/shape as consultancy contract templates,
// so they're listed/edited with consultancy-contracts' ContractTemplateList/
// ContractTemplateDialog and read/written through ccTemplate.ts. This file
// only adds what's letter-specific: seeding the standard letters, converting
// pre-full-document rows, and the workspace's catalog.

interface TemplateRowLike {
  id: string;
  document_id: string;
  content?: string | null;
  placeholders?: any[] | null;
  classification?: Record<string, any> | null;
  created_at?: string;
}

// A row as full content + placeholders, converting a pre-full-document
// (classification.letter) row in memory.
function rowLetter(row: TemplateRowLike) {
  if (isLegacyLetterRow(row)) return convertLegacyLetter(row);
  return { content: row.content || '', placeholders: row.placeholders || [], classification: row.classification || {} };
}

// Persists the conversion for every pre-full-document template of a letter
// type - run when the type is opened in the Letter Templates tab, so the
// template editor (ContractTemplateDialog) shows the whole letter.
export async function convertLegacyLetterTemplates(documentId: string): Promise<void> {
  const rows = await fetchTemplatesForDocument(documentId);
  await Promise.all(rows.filter(isLegacyLetterRow).map((row) => {
    const { content, placeholders, classification } = convertLegacyLetter(row);
    return updateTemplate(row.id, { content, placeholders, classification }).catch((err) => {
      console.error('Error converting letter template:', err);
    });
  }));
}

// A new template for a letter type, seeded from the standard letter of the
// same name when there is one. Not flagged default - same rule as
// ccTemplate.ts's createTemplateVariant; the earliest-row fallback covers it.
export async function createLetterTemplate(documentId: string, fileName: string, letterTypeName?: string) {
  const standard = findStandardLetter(letterTypeName);
  const { data, error } = await supabase
    .from('acc_portal_templates')
    .insert([{
      document_id: documentId,
      file_name: fileName,
      content: standard?.content || '<p>{{letter_date}}</p>\n<p>Dear {{employee_name}},</p>\n<p></p>',
      file_type: 'text/html',
      placeholders: standard?.placeholders || [],
      entity_types: ['employee'],
      classification: { theme_settings: {} },
      use_letterhead: false,
    }])
    .select()
    .single();

  if (error) {
    console.error('Error creating letter template:', error);
    return null;
  }
  return data;
}

const pickDefault = (rows: TemplateRowLike[]) =>
  rows.find((r) => r.classification?.is_default) || rows[0] || null;

export function toLetterTemplate(type: LetterDocumentType, row: TemplateRowLike | null): LetterTemplate {
  const title = type.display_name || type.name;
  const standard = findStandardLetter(title);
  const { content, placeholders } = row ? rowLetter(row) : { content: standard?.content || '', placeholders: standard?.placeholders || [] };
  return {
    key: type.id,
    documentId: type.id,
    title,
    description: standard?.description || (row || standard ? '' : 'No template yet - add one in Letter Templates.'),
    content,
    placeholders,
  };
}

// What the workspace's Letters tab offers: every letter type, each rendered
// from its default template (or, before one exists, the standard letter of
// the same name). Falls back to the standard set in code when no letter
// types exist yet - those just can't be filed to the registry.
export async function loadLetterCatalog(): Promise<LetterTemplate[]> {
  const types = await fetchLetterDocumentTypes();
  if (types.length === 0) return LETTER_TEMPLATES;

  const { data, error } = await supabase
    .from('acc_portal_templates')
    .select('*')
    .in('document_id', types.map((t) => t.id))
    .order('created_at', { ascending: true });
  if (error) console.error('Error fetching letter templates:', error);

  const rowsByType = new Map<string, TemplateRowLike[]>();
  for (const row of (data || []) as TemplateRowLike[]) {
    rowsByType.set(row.document_id, [...(rowsByType.get(row.document_id) || []), row]);
  }
  return types.map((t) => toLetterTemplate(t, pickDefault(rowsByType.get(t.id) || [])));
}

// Standard letters with no letter type of the same name yet.
export function missingStandardLetters(types: LetterDocumentType[]): LetterTemplate[] {
  const existing = new Set(types.map((t) => (t.display_name || t.name).trim().toLowerCase()));
  return LETTER_TEMPLATES.filter((t) => !existing.has(t.title.toLowerCase()));
}

// Creates a letter type plus a "Standard" template for each missing standard
// letter. Matched on name, so running it again only fills gaps.
export async function seedStandardLetters(types: LetterDocumentType[]): Promise<LetterDocumentType[]> {
  const created: LetterDocumentType[] = [];
  for (const standard of missingStandardLetters(types)) {
    const type = await createLetterDocumentType(standard.title);
    if (!type) continue;
    await createLetterTemplate(type.id, 'Standard', standard.title);
    created.push(type);
  }
  return created;
}
