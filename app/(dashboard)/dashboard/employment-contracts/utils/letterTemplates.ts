// Employment letters (resignation, termination, dismissal, ...) - the
// "other side" of employment next to contract generation.
//
// A letter type is an acc_portal_kyc row (letterDocumentTypes.ts) and its
// templates are acc_portal_templates rows - the SAME records consultancy
// contract templates are, managed with the same modules
// (consultancy-contracts' ContractTypesSidebar / ContractTemplateList /
// ContractTemplateDialog, hosted by the Job Profiles page's Letter Templates
// tab). A template's content is the whole letter (date, addressee, RE: line,
// body, sign-off - the letterhead comes from the theme) and its placeholders
// column is edited with the shared PlaceholderPanel, so a token can be linked
// to master fields like any other template.
//
// In the Employment Contracts workspace (ContractEditor's Letters tab +
// ContractPreview) a letter is filled from:
//   1. employee/company basics (LetterContext) - lowest
//   2. the same value map as the contract (EC placeholders, master fields,
//      Contract Fields overrides)
//   3. letter fields: every other token - prefilled from its master field
//      link if the template's placeholder has one, otherwise typed in.
//
// STANDARD_LETTERS below are the standard set: the seed content
// "Add standard letters" writes, and the fallback the workspace renders from
// when no letter types exist yet.

import type { Placeholder } from '../../templates/document-template-manager/types';

export type LetterTypeKey =
  | 'resignation'
  | 'acceptance_of_resignation'
  | 'termination'
  | 'dismissal'
  | 'retrenchment'
  | 'retirement'
  | 'end_of_contract'
  | 'probation_termination';

export type LetterFieldType = 'date' | 'text' | 'textarea' | 'number';

export interface LetterField {
  key: string;
  label: string;
  type: LetterFieldType;
  placeholder?: string;
  defaultValue?: string;
  // Prefilled from a master field link (vs typed in from scratch).
  linked?: boolean;
}

export type LetterAuthor = 'employee' | 'employer';

// The wording of a standard letter (and of letter templates saved before
// templates held the whole document) - turned into full template content by
// buildLetterDocument.
interface LetterParts {
  author: LetterAuthor;
  subject: string;
  body: string;
}

interface StandardLetterDef extends LetterParts {
  key: LetterTypeKey;
  title: string;
  description: string;
  fields: LetterField[];
}

// A letter the workspace can render: a template's content + placeholders,
// under the letter type it belongs to.
export interface LetterTemplate {
  // acc_portal_kyc id for a DB letter type, the standard key for the code
  // fallback set.
  key: string;
  // acc_portal_kyc id the generated letter is filed under in the employee's
  // registry record - null for the code fallback set (nothing to file under).
  documentId?: string | null;
  title: string;
  description: string;
  content: string;
  placeholders: Placeholder[];
}

// Values the app already knows from the selected employee and company.
export interface LetterContext {
  employee_name: string;
  employee_number: string;
  national_id: string;
  job_title: string;
  department: string;
  start_date: string;
  company_name: string;
  signatory_name: string;
}

export const LETTER_CONTEXT_LABELS: Record<keyof LetterContext, string> = {
  employee_name: 'Employee Name',
  employee_number: 'Employee No.',
  national_id: 'National ID',
  job_title: 'Job Title',
  department: 'Department',
  start_date: 'Start Date',
  company_name: 'Company',
  signatory_name: 'Signatory',
};

const CONTEXT_ENTITY: Record<keyof LetterContext, 'employee' | 'company'> = {
  employee_name: 'employee',
  employee_number: 'employee',
  national_id: 'employee',
  job_title: 'employee',
  department: 'employee',
  start_date: 'employee',
  company_name: 'company',
  signatory_name: 'company',
};

export const isLetterContextKey = (key: string): key is keyof LetterContext => key in LETTER_CONTEXT_LABELS;

const DATE_FIELD = (key: string, label: string): LetterField => ({ key, label, type: 'date' });
const LETTER_DATE: LetterField = { ...DATE_FIELD('letter_date', 'Letter date'), defaultValue: 'today' };

const STANDARD_LETTER_DEFS: StandardLetterDef[] = [
  {
    key: 'resignation',
    title: 'Resignation Letter',
    description: 'Employee voluntarily leaves the job.',
    author: 'employee',
    subject: 'Resignation from the position of {{job_title}}',
    fields: [
      LETTER_DATE,
      DATE_FIELD('last_working_day', 'Last working day'),
      { key: 'notice_period', label: 'Notice period', type: 'text', placeholder: 'e.g. 30 days' },
      { key: 'reason', label: 'Reason (optional)', type: 'textarea' },
    ],
    body: `
<p>Dear Sir/Madam,</p>
<p>I write to formally tender my resignation from my position as <strong>{{job_title}}</strong> at {{company_name}}, which I have held since {{start_date}}.</p>
<p>In accordance with my contract of employment, I am giving {{notice_period}} notice. My last working day will be <strong>{{last_working_day}}</strong>.</p>
{{reason_paragraph}}
<p>During the notice period I will do my best to hand over my duties and assist with a smooth transition. Kindly advise on the clearance procedure and the settlement of my final dues.</p>
<p>Thank you for the opportunity to have served the company.</p>`,
  },
  {
    key: 'acceptance_of_resignation',
    title: 'Acceptance of Resignation Letter',
    description: "Employer formally accepts an employee's resignation.",
    author: 'employer',
    subject: 'Acceptance of your resignation',
    fields: [
      LETTER_DATE,
      DATE_FIELD('resignation_date', 'Date of resignation letter'),
      DATE_FIELD('last_working_day', 'Last working day'),
      { key: 'handover_notes', label: 'Handover / clearance instructions (optional)', type: 'textarea' },
    ],
    body: `
<p>Dear {{employee_name}},</p>
<p>We acknowledge receipt of your resignation letter dated <strong>{{resignation_date}}</strong> from the position of {{job_title}}, and confirm that the company accepts it.</p>
<p>Your last working day will be <strong>{{last_working_day}}</strong>.</p>
{{handover_notes_paragraph}}
<p>Your final dues will be computed and paid in accordance with your contract of employment and applicable law, subject to completion of the clearance process and return of all company property.</p>
<p>We thank you for your service and wish you every success in your future endeavours.</p>`,
  },
  {
    key: 'termination',
    title: 'Termination Letter',
    description: 'Employer ends the employment.',
    author: 'employer',
    subject: 'Termination of employment',
    fields: [
      LETTER_DATE,
      DATE_FIELD('effective_date', 'Termination effective date'),
      { key: 'notice_period', label: 'Notice given / pay in lieu', type: 'text', placeholder: 'e.g. 1 month notice' },
      { key: 'reason', label: 'Reason for termination', type: 'textarea' },
    ],
    body: `
<p>Dear {{employee_name}},</p>
<p>We regret to inform you that the company has decided to terminate your employment as <strong>{{job_title}}</strong>, with effect from <strong>{{effective_date}}</strong>.</p>
{{reason_paragraph}}
<p>This termination is subject to {{notice_period}}, as provided in your contract of employment.</p>
<p>You are required to hand over all company property, documents and access credentials in your possession and to complete the clearance process before your departure. Your final dues, including any accrued and unpaid salary and leave, will be settled in accordance with your contract and applicable law.</p>
<p>We thank you for your contribution and wish you well.</p>`,
  },
  {
    key: 'dismissal',
    title: 'Dismissal Letter',
    description: 'Employee dismissed for misconduct or serious performance/disciplinary issues.',
    author: 'employer',
    subject: 'Summary dismissal / dismissal following disciplinary process',
    fields: [
      LETTER_DATE,
      DATE_FIELD('effective_date', 'Dismissal effective date'),
      { key: 'grounds', label: 'Grounds for dismissal', type: 'textarea' },
      DATE_FIELD('hearing_date', 'Disciplinary hearing date (if held)'),
      { key: 'appeal_days', label: 'Days allowed to appeal', type: 'number', defaultValue: '14' },
    ],
    body: `
<p>Dear {{employee_name}},</p>
<p>Following the investigation and the disciplinary hearing held on <strong>{{hearing_date}}</strong>, the company has found that you committed the following:</p>
<p>{{grounds}}</p>
<p>Given the seriousness of this matter, the company has decided to dismiss you from the position of <strong>{{job_title}}</strong> with effect from <strong>{{effective_date}}</strong>.</p>
<p>You have the right to appeal this decision in writing within {{appeal_days}} days of receiving this letter.</p>
<p>You are required to return all company property and complete clearance. Any dues owing to you will be paid in accordance with applicable law, less any lawful deductions.</p>`,
  },
  {
    key: 'retrenchment',
    title: 'Retrenchment / Redundancy Letter',
    description: 'Employment ends because the position is eliminated (restructuring, redundancy).',
    author: 'employer',
    subject: 'Notice of redundancy',
    fields: [
      LETTER_DATE,
      DATE_FIELD('effective_date', 'Redundancy effective date'),
      { key: 'notice_period', label: 'Notice period', type: 'text', placeholder: 'e.g. 1 month' },
      { key: 'reason', label: 'Reason / business context', type: 'textarea', placeholder: 'e.g. restructuring of the finance department' },
      { key: 'severance', label: 'Severance / redundancy pay details', type: 'textarea' },
    ],
    body: `
<p>Dear {{employee_name}},</p>
<p>We regret to inform you that, following a review of the company's operations, your position of <strong>{{job_title}}</strong> has been declared redundant.</p>
{{reason_paragraph}}
<p>Your employment will end on <strong>{{effective_date}}</strong>. This letter constitutes {{notice_period}} notice of redundancy.</p>
{{severance_paragraph}}
<p>You will also be paid any accrued and unpaid salary and leave days. Please complete the clearance process and return all company property before your last day.</p>
<p>We sincerely appreciate your service and regret that this action has become necessary.</p>`,
  },
  {
    key: 'retirement',
    title: 'Retirement Letter',
    description: 'Employment ends on reaching retirement age, or by choice of retirement.',
    author: 'employer',
    subject: 'Retirement from service',
    fields: [
      LETTER_DATE,
      DATE_FIELD('effective_date', 'Retirement date'),
      { key: 'retirement_basis', label: 'Basis', type: 'text', placeholder: 'e.g. attaining the retirement age of 60 / voluntary early retirement' },
      { key: 'benefits', label: 'Retirement benefits details (optional)', type: 'textarea' },
    ],
    body: `
<p>Dear {{employee_name}},</p>
<p>This is to confirm that you will retire from the company's service as <strong>{{job_title}}</strong> with effect from <strong>{{effective_date}}</strong>, on the basis of {{retirement_basis}}.</p>
{{benefits_paragraph}}
<p>Your final dues will be settled in accordance with your contract of employment and applicable law, subject to completion of clearance.</p>
<p>On behalf of the company, we thank you for your dedicated service since {{start_date}} and wish you a fulfilling retirement.</p>`,
  },
  {
    key: 'end_of_contract',
    title: 'End of Contract Letter',
    description: "Fixed-term contract expires and isn't renewed.",
    author: 'employer',
    subject: 'Expiry of fixed-term contract',
    fields: [
      LETTER_DATE,
      DATE_FIELD('contract_end_date', 'Contract end date'),
      { key: 'notes', label: 'Additional notes (optional)', type: 'textarea' },
    ],
    body: `
<p>Dear {{employee_name}},</p>
<p>This letter is to remind you that your fixed-term contract of employment as <strong>{{job_title}}</strong>, which began on {{start_date}}, will expire on <strong>{{contract_end_date}}</strong>.</p>
<p>The company has decided not to renew the contract, and your employment will therefore end on that date without further notice.</p>
{{notes_paragraph}}
<p>Please complete the clearance process and return all company property before the contract end date. Your final dues will be settled in accordance with your contract and applicable law.</p>
<p>We thank you for your service during this period and wish you well.</p>`,
  },
  {
    key: 'probation_termination',
    title: 'Probation Termination Letter',
    description: 'Employment ended while the employee is still on probation.',
    author: 'employer',
    subject: 'Termination of employment during probation',
    fields: [
      LETTER_DATE,
      DATE_FIELD('effective_date', 'Termination effective date'),
      { key: 'notice_period', label: 'Notice given', type: 'text', placeholder: 'e.g. 7 days' },
      { key: 'reason', label: 'Reason (optional)', type: 'textarea' },
    ],
    body: `
<p>Dear {{employee_name}},</p>
<p>We refer to your appointment as <strong>{{job_title}}</strong> and the probationary period under your contract of employment.</p>
<p>Having reviewed your performance during the probation period, the company has decided not to confirm your appointment. Your employment is therefore terminated with effect from <strong>{{effective_date}}</strong>, on {{notice_period}} notice.</p>
{{reason_paragraph}}
<p>Please return all company property and complete clearance. Any salary and accrued leave due to you up to the termination date will be paid in accordance with applicable law.</p>
<p>We thank you for your efforts and wish you success in the future.</p>`,
  },
];

const humanize = (key: string) =>
  key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const TOKEN_RE = /\{\{\s*(\w+)\s*\}\}/g;

// Every token in a piece of content, in order of first appearance, with
// {{x_paragraph}} counted as x.
function tokensIn(content: string): string[] {
  return Array.from(new Set(Array.from(content.matchAll(TOKEN_RE), (m) => m[1].replace(/_paragraph$/, ''))));
}

// RE: lines are upper-cased in the document, but not the {{tokens}} inside them.
const upperOutsideTokens = (s: string) =>
  s.split(/(\{\{\s*\w+\s*\}\})/).map((part, i) => (i % 2 ? part : part.toUpperCase())).join('');

// Full template content for a letter's parts - addressee/date header, RE:
// line, body, sign-off. Used to seed standard letters and to convert letter
// templates saved before templates held the whole document.
export function buildLetterDocument({ author, subject, body }: LetterParts): string {
  const re = subject.trim() ? `<p><strong>RE: ${upperOutsideTokens(subject)}</strong></p>` : '';
  if (author === 'employee') {
    return [
      '<p>{{employee_name}}<br>{{job_title}}</p>',
      '<p>{{letter_date}}</p>',
      '<p>The Human Resources Manager<br><strong>{{company_name}}</strong></p>',
      re,
      body.trim(),
      '<p>Yours faithfully,</p>',
      '<p></p>',
      '<p><strong>{{employee_name}}</strong></p>',
    ].filter(Boolean).join('\n');
  }
  return [
    '<p>{{letter_date}}</p>',
    '<p>{{employee_name}}<br>Employee No: {{employee_number}}<br>{{job_title}}, {{department}}</p>',
    re,
    body.trim(),
    '<p>Yours sincerely,</p>',
    '<p></p>',
    '<p><strong>{{signatory_name}}</strong><br>For and on behalf of {{company_name}}</p>',
    '<p>Acknowledgement of receipt:</p>',
    '<p>Name: {{employee_name}} &nbsp;&nbsp; Signature: ____________________ &nbsp;&nbsp; Date: ______________</p>',
  ].filter(Boolean).join('\n');
}

// Placeholders for a letter's content, in the shape the PlaceholderPanel's
// Re-scan produces - labelled/typed from the letter's field definitions,
// scoped to the employee or company, none linked to master fields yet
// (employee/company basics come from LetterContext; anything else can be
// linked from the Placeholders panel). A long-text field keeps a
// letter_input marker so the workspace still offers a multi-line box.
export function lettersFieldsToPlaceholders(fields: LetterField[], content: string, existing: Placeholder[] = []): Placeholder[] {
  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  const existingByName = new Map(existing.map((p) => [p.name, p]));
  return tokensIn(content).map((name) => {
    const prior = existingByName.get(name);
    if (prior) return prior;
    const field = fieldByKey.get(name) || (name === 'letter_date' ? LETTER_DATE : undefined);
    const ctxKey = name as keyof LetterContext;
    const type = field?.type === 'date' || name.endsWith('_date') ? 'date' : field?.type === 'number' ? 'number' : 'text';
    return {
      id: `letter_${name}`,
      name,
      type,
      display_value: field?.label || LETTER_CONTEXT_LABELS[ctxKey] || humanize(name),
      description: field?.placeholder,
      required: true,
      entity_type: [CONTEXT_ENTITY[ctxKey] || 'employee'],
      master_field_ids: [],
      linked_job_question_ids: [],
      linked_requirement_ids: [],
      default_value: field?.defaultValue || '',
      ...(field?.type === 'textarea' && { letter_input: 'textarea' }),
    } as Placeholder;
  });
}

export const STANDARD_LETTERS: LetterTemplate[] = STANDARD_LETTER_DEFS.map((def) => {
  const content = buildLetterDocument(def);
  return {
    key: def.key,
    documentId: null,
    title: def.title,
    description: def.description,
    content,
    placeholders: lettersFieldsToPlaceholders(def.fields, content),
  };
});

// What the workspace renders before any letter type exists in the DB.
export const LETTER_TEMPLATES = STANDARD_LETTERS;

// The standard letter a DB letter type corresponds to, matched on its name -
// supplies seed content and the description.
export function findStandardLetter(name: string | null | undefined): LetterTemplate | null {
  const n = (name || '').trim().toLowerCase();
  return STANDARD_LETTERS.find((t) => t.title.toLowerCase() === n) || null;
}

// Placeholders with a master field link - resolved from the employee/company
// records in the workspace (useEmploymentLetters).
export function linkedLetterPlaceholders(template: Pick<LetterTemplate, 'placeholders'>): Placeholder[] {
  return (template.placeholders || []).filter((p) => (p.master_field_ids || []).length > 0);
}

// Every token the letter uses - what the Letters tab scopes the Contract
// Fields panel to.
export function letterTokenKeys(template: Pick<LetterTemplate, 'content'>): string[] {
  return tokensIn(template.content || '');
}

// The letter fields (Letters tab "Letter" group): every token that isn't a
// LetterContext value and isn't resolved by the contract value map
// (`resolvedElsewhere` - EC placeholders + standard values). Label/type/
// default come from the template's placeholder of the same name; a token the
// template has no placeholder for (not re-scanned yet) is a plain text field.
// letter_date first since the header uses it.
export function letterFieldsFor(
  template: Pick<LetterTemplate, 'content' | 'placeholders'>,
  resolvedElsewhere: Set<string> = new Set()
): LetterField[] {
  const byName = new Map((template.placeholders || []).map((p) => [p.name, p]));
  const keys = tokensIn(template.content || '').filter((k) => !isLetterContextKey(k) && !resolvedElsewhere.has(k));
  keys.sort((a, b) => (a === 'letter_date' ? -1 : b === 'letter_date' ? 1 : 0));
  return keys.map((key): LetterField => {
    const p = byName.get(key);
    if (!p) return key === 'letter_date' ? LETTER_DATE : { key, label: humanize(key), type: key.endsWith('_date') ? 'date' : 'text' };
    const type: LetterFieldType = (p as any).letter_input === 'textarea' ? 'textarea'
      : p.type === 'date' ? 'date'
      : p.type === 'number' ? 'number'
      : 'text';
    return {
      key,
      label: p.display_value || humanize(key),
      type,
      placeholder: p.description || undefined,
      defaultValue: p.default_value || (key === 'letter_date' ? 'today' : undefined),
      linked: (p.master_field_ids || []).length > 0,
    };
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatLetterDate(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatValue(field: LetterField, raw: string): string {
  if (!raw) return '';
  if (field.type === 'date') return formatLetterDate(raw);
  const safe = escapeHtml(raw);
  return field.type === 'textarea' ? safe.replace(/\n/g, '<br/>') : safe;
}

export interface RenderLetterOptions {
  // Preview shows "[Label]" for an empty letter field so it's visible what
  // still needs filling in; the exported document shows a blank line instead,
  // never an internal field name (same split as ContractPreview).
  forExport: boolean;
}

// The template content with only the letter `fields` filled in. Every other
// {{token}} (employee, company, signatory, any EC placeholder) is left for
// ContractPreview to resolve with the contract's value map, after the theme
// is applied - so the theme's letterhead tokens resolve too.
// {{x_paragraph}} renders <p>x</p> only when field x has a value.
export function renderLetterHtml(
  template: Pick<LetterTemplate, 'content'>,
  values: Record<string, string>,
  fields: LetterField[],
  { forExport }: RenderLetterOptions
): string {
  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  const missing = (f: LetterField) =>
    `<span class="ph-entity-missing">${forExport ? '_________________' : `[${escapeHtml(f.label)}]`}</span>`;

  const html = (template.content || '')
    .replace(/\{\{\s*(\w+?)_paragraph\s*\}\}/g, (m, key) => {
      const f = fieldByKey.get(key);
      if (!f) return m;
      const v = formatValue(f, values[key] || '');
      return v ? `<p>${v}</p>` : '';
    })
    .replace(TOKEN_RE, (m, key) => {
      const f = fieldByKey.get(key);
      return f ? formatValue(f, values[key] || '') || missing(f) : m;
    });
  return `<section id="section-letter">\n${html}\n</section>`;
}

// Employee/company basics, straight from the selected employee and company -
// only applied where the contract value map has nothing for the key.
export function letterContextValues(ctx: LetterContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (!value) continue;
    out[key] = key === 'start_date' ? formatLetterDate(value) : escapeHtml(value);
  }
  return out;
}

// A template saved before templates held the whole letter: body-only content
// plus classification.letter { author, subject, fields }. Converted to a full
// document + placeholders (in memory by the store, and persisted when its
// letter type is opened in the Letter Templates tab).
export function isLegacyLetterRow(row: { classification?: Record<string, any> | null }): boolean {
  return !!row.classification?.letter;
}

export function convertLegacyLetter(row: { content?: string | null; placeholders?: Placeholder[] | null; classification?: Record<string, any> | null }) {
  const letter = row.classification?.letter || {};
  const content = buildLetterDocument({
    author: letter.author === 'employee' ? 'employee' : 'employer',
    subject: letter.subject || '',
    body: row.content || '',
  });
  const placeholders = lettersFieldsToPlaceholders(Array.isArray(letter.fields) ? letter.fields : [], content, row.placeholders || []);
  const { letter: _drop, ...classification } = row.classification || {};
  return { content, placeholders, classification };
}
