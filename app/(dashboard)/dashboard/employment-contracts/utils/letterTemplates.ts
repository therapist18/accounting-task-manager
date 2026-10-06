// Employment letters (resignation, termination, dismissal, ...) - the
// "other side" of employment next to contract generation. Templates live in
// code for now (body markup + the fields each letter asks for); they use the
// same {{token}} syntax as contract clauses, but are resolved by
// renderLetterHtml below instead of the clause/placeholder engine, since a
// letter is a single self-contained document rather than an assembly of
// library clauses.

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
}

export interface LetterTemplate {
  key: LetterTypeKey;
  title: string;
  description: string;
  // Who authors the letter: 'employee' letters are addressed to the company
  // and signed by the employee; 'employer' letters are addressed to the
  // employee and signed by the company signatory.
  author: 'employee' | 'employer';
  fields: LetterField[];
  // Body paragraphs/lists only - the letterhead, date, addressee, subject and
  // sign-off are added around it by renderLetterHtml.
  body: string;
  subject: string;
}

// Values the app already knows - never asked for in the form.
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

const DATE_FIELD = (key: string, label: string): LetterField => ({ key, label, type: 'date' });
const LETTER_DATE: LetterField = { ...DATE_FIELD('letter_date', 'Letter date'), defaultValue: 'today' };

export const LETTER_TEMPLATES: LetterTemplate[] = [
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

export function getLetterTemplate(key: LetterTypeKey): LetterTemplate {
  return LETTER_TEMPLATES.find((t) => t.key === key) || LETTER_TEMPLATES[0];
}

// Optional-paragraph tokens: {{x_paragraph}} renders <p>{{x}}</p> only when x
// has a value, so an optional field left blank doesn't leave an empty gap.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatLetterDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatValue(field: LetterField | undefined, raw: string): string {
  if (!raw) return '';
  if (field?.type === 'date') return formatLetterDate(raw);
  const safe = escapeHtml(raw);
  return field?.type === 'textarea' ? safe.replace(/\n/g, '<br/>') : safe;
}

export interface RenderLetterOptions {
  // Preview shows "[Label]" for a missing required fact so it's visible what
  // still needs filling in; the exported document shows a blank line instead,
  // never an internal field name (same split as ContractPreview).
  forExport: boolean;
}

export function renderLetterHtml(
  template: LetterTemplate,
  values: Record<string, string>,
  ctx: LetterContext,
  { forExport }: RenderLetterOptions
): string {
  const labels: Record<string, string> = {
    employee_name: 'Employee Name', job_title: 'Job Title', start_date: 'Start Date',
    company_name: 'Company', employee_number: 'Employee No.', national_id: 'National ID',
    department: 'Department', signatory_name: 'Signatory',
  };
  const fieldByKey = new Map(template.fields.map((f) => [f.key, f]));
  for (const f of template.fields) labels[f.key] = f.label;

  const missing = (key: string) =>
    `<span class="ph-entity-missing">${forExport ? '_________________' : `[${escapeHtml(labels[key] || key)}]`}</span>`;

  const resolve = (key: string): string => {
    if (key in ctx) {
      const raw = (ctx as any)[key] as string;
      const v = key === 'start_date' ? formatLetterDate(raw) : escapeHtml(raw || '');
      return v || missing(key);
    }
    const v = formatValue(fieldByKey.get(key), values[key] || '');
    return v || missing(key);
  };

  const fill = (html: string) =>
    html
      .replace(/\{\{(\w+?)_paragraph\}\}/g, (_m, key) => {
        const v = formatValue(fieldByKey.get(key), values[key] || '');
        return v ? `<p>${v}</p>` : '';
      })
      .replace(/\{\{(\w+)\}\}/g, (_m, key) => resolve(key));

  const letterDate = fill('{{letter_date}}');
  const subject = fill(template.subject);
  const isEmployeeAuthor = template.author === 'employee';

  const header = isEmployeeAuthor
    ? `<p>${resolve('employee_name')}<br/>${resolve('job_title')}</p>
       <p>${letterDate}</p>
       <p>The Human Resources Manager<br/><strong>${resolve('company_name')}</strong></p>`
    : `<p><strong>${resolve('company_name')}</strong></p>
       <p>${letterDate}</p>
       <p>${resolve('employee_name')}<br/>${ctx.employee_number ? `Employee No: ${escapeHtml(ctx.employee_number)}<br/>` : ''}${resolve('job_title')}${ctx.department ? `, ${escapeHtml(ctx.department)}` : ''}</p>`;

  const signOff = isEmployeeAuthor
    ? `<p>Yours faithfully,</p><br/><br/><p><strong>${resolve('employee_name')}</strong></p>`
    : `<p>Yours sincerely,</p><br/><br/><p><strong>${resolve('signatory_name')}</strong><br/>For and on behalf of ${resolve('company_name')}</p>
       <p style="margin-top:2em">Acknowledgement of receipt:<br/><br/>Name: ${resolve('employee_name')}&nbsp;&nbsp;&nbsp; Signature: ____________________&nbsp;&nbsp;&nbsp; Date: ______________</p>`;

  return `<section id="section-letter">
${header}
<p><strong style="text-transform:uppercase">RE: ${subject}</strong></p>
${fill(template.body)}
${signOff}
</section>`;
}
