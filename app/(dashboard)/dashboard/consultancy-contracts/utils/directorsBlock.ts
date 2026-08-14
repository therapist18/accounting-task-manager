import type { CompanyDirector } from '../hooks/useCompanyDirectors';

// The seeded template's "Company Directors Acknowledgement and Acceptance"
// section originally hardcoded exactly two blank Name/Sign/Date rows (see
// 20260813000001_seed_cc_template_and_placeholders.sql). This now generates
// that block instead, one row per director/shareholder chosen in the
// Directors picker - however many that turns out to be, not fixed at two.
// A migration (20260814000000_cc_directors_acknowledgement.sql) swaps the
// original static rows for a single {{directors_acknowledgement_block}}
// token so this renders in place of them; on a template that hasn't been
// migrated yet (or where an admin has since rewritten that section by hand),
// the token simply doesn't appear and this value goes unused - see
// replacePlaceholders in tasks-requirements/utils/templateFormatters.ts.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function directorRowHtml(name: string): string {
  return `<p>Director's Name: ${escapeHtml(name)}</p>\n<p>Sign: __________________________ Date: __________________________</p>`;
}

const BLANK_UNDERSCORE = '____________________________________';

// No directors selected yet (or none exist for this company) falls back to
// the original two-blank-row layout, so clearing the picker never produces
// an empty acknowledgement section.
const FALLBACK_BLOCK = [directorRowHtml(BLANK_UNDERSCORE), directorRowHtml(BLANK_UNDERSCORE)].join('\n');

export function withDirectorsAcknowledgementBlock(
  values: Record<string, string>,
  selectedDirectors: CompanyDirector[]
): Record<string, string> {
  const block = selectedDirectors.length > 0
    ? selectedDirectors.map((d) => directorRowHtml(d.name)).join('\n')
    : FALLBACK_BLOCK;
  return { ...values, directors_acknowledgement_block: block };
}
