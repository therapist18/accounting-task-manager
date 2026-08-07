import { replacePlaceholders } from '../../tasks-requirements/utils/templateFormatters';
import { CONTRACT_SECTIONS, type ContractSectionDef, type ContractSectionKey } from './contractStructure';

// Mirrors ec_job_profiles (at any of its 3 scopes - company/department/position)
// and ec_employment_offers row shapes (see
// supabase/migrations/20260722000000_employment_contract_engine.sql) - only
// the fields the engine actually reads. The caller assembles the layer array
// in cascade order (company-scope row, department-scope row, position-scope
// row, then the employment offer); this module doesn't care which table or
// scope a layer came from, just the order it's passed in.
export interface SettingsLayer {
  settings?: Record<string, any> | null;
}

export interface ClauseLayer {
  section_clauses?: Record<string, string> | null; // section_key -> clause_id
}

export interface EcClauseRow {
  id: string;
  section_key: string;
  content: string;
  is_default: boolean;
}

export interface ClauseSuggestionCondition {
  employment_type?: string;
  job_level?: string;
  work_arrangement?: string;
  department?: string;
}

// suggest_conditions/suggest_priority live directly on ec_clauses (no
// separate rules table) and are only consulted when authoring a Job
// Profile, to pre-fill a suggested clause per section - never re-evaluated
// at contract-generation time. A clause matches if ANY of its condition-sets
// is satisfied (each condition-set's fields are AND-ed); among matching
// clauses for a section, highest suggest_priority wins.
export function suggestClauseForSection(
  clauses: EcClauseRow[],
  sectionKey: string,
  facts: ClauseSuggestionCondition
): EcClauseRow | undefined {
  const candidates = (clauses as Array<EcClauseRow & { suggest_conditions?: ClauseSuggestionCondition[]; suggest_priority?: number }>)
    .filter((c) => c.section_key === sectionKey)
    .filter((c) =>
      (c.suggest_conditions || []).some((cond) =>
        Object.entries(cond).every(([key, value]) => !value || facts[key as keyof ClauseSuggestionCondition] === value)
      )
    );
  candidates.sort((a, b) => (b.suggest_priority || 0) - (a.suggest_priority || 0));
  return candidates[0];
}

/**
 * Cascade merge for settings values (working hours, notice period, benefits, ...).
 * Layers are applied in the order given - later layers win on key conflicts,
 * matching the Company Defaults -> Department Defaults -> Job Profile ->
 * Employment Offer inheritance order. Null/undefined layers are skipped.
 */
export function resolveEffectiveSettings(layers: Array<SettingsLayer | null | undefined>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const layer of layers) {
    if (!layer?.settings) continue;
    Object.assign(result, layer.settings);
  }
  return result;
}

/**
 * Builds a section_key -> clause_id lookup of each section's is_default clause,
 * used as the final fallback when no layer in the cascade specifies a clause
 * for that section.
 */
export function buildDefaultClauseMap(clauses: EcClauseRow[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const clause of clauses) {
    if (clause.is_default && !map[clause.section_key]) {
      map[clause.section_key] = clause.id;
    }
  }
  return map;
}

/**
 * Cascade merge for section -> clause selection, same precedence as
 * resolveEffectiveSettings. Deliberately does NOT fall back to each
 * section's `is_default` clause when nothing in the cascade picked one -
 * an unconfigured section stays unresolved (assembleContractHtml renders
 * "[No clause configured]" for it) so a profile/contract with nothing
 * explicitly linked can never be mistaken for one that's fully configured.
 * Applying a section's default clause is only ever an explicit user action
 * (see "Apply Defaults" in job-profiles/page.tsx), never a silent fallback.
 *
 * Falsy entries (e.g. '' from a "Use section default" picker - see
 * JobProfileEditor.tsx) are skipped rather than assigned, so they behave as
 * "no override" instead of clobbering a valid clause id from an earlier
 * layer with an empty string that then fails assembleContractHtml's
 * `clauseId ? ... : undefined` check and renders as "[No clause configured]".
 */
export function resolveEffectiveClauses(
  layers: Array<ClauseLayer | null | undefined>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const layer of layers) {
    if (!layer?.section_clauses) continue;
    for (const [key, value] of Object.entries(layer.section_clauses)) {
      if (value) result[key] = value;
    }
  }
  return result;
}

export interface AssembleContractHtmlParams {
  sectionKeys: ContractSectionKey[] | string[]; // ordered, from ec_contract_templates.section_keys
  clausesById: Record<string, EcClauseRow>;
  effectiveClauses: Record<string, string>; // section_key -> clause_id
  effectiveSettings: Record<string, any>;
  employeePlaceholderValues: Record<string, string>; // from utils/standardPlaceholders.ts
  includeToc?: boolean;
  includeSectionNumbers?: boolean;
  // When true, an unconfigured section is omitted entirely instead of
  // rendering the "[No clause configured]" warning - for the actual
  // exported/submitted document (PDF, Word, the copy saved to storage),
  // which shouldn't carry an internal authoring warning meant for whoever
  // is still assembling the contract. The live editing preview keeps this
  // false so gaps stay visible while the contract is being put together.
  hideMissingClauses?: boolean;
}

/**
 * Assembles the full contract body from resolved clauses + placeholder values.
 * Employee/company identity values win over settings on key collisions (e.g.
 * a badly-named settings key should never shadow {{employee_name}}).
 * Returns plain section-wrapped HTML - theme is applied separately by the
 * caller via applyThemeToHtml (utils/themeEngine.ts), keeping content and
 * presentation resolution as two distinct steps.
 */
export function assembleContractHtml({
  sectionKeys,
  clausesById,
  effectiveClauses,
  effectiveSettings,
  employeePlaceholderValues,
  includeToc = true,
  includeSectionNumbers = true,
  hideMissingClauses = false,
}: AssembleContractHtmlParams): string {
  const mergedValues = { ...effectiveSettings, ...employeePlaceholderValues };

  const orderedSections = sectionKeys
    .map((key) => CONTRACT_SECTIONS.find((s) => s.key === key))
    .filter((s): s is ContractSectionDef => !!s)
    .sort((a, b) => a.order - b.order);

  // A section only counts as "in" the document if it actually resolved a
  // clause - an unconfigured section renders as a [No clause configured]
  // placeholder (see the `!clause` branch below) but shouldn't occupy a
  // number or a Table of Contents entry, since neither should imply content
  // that was never actually selected.
  const hasClause = (key: string) => {
    const id = effectiveClauses[key];
    return !!(id && clausesById[id]);
  };

  // Build sequential numbering: heading and unconfigured sections get none,
  // appendices get letters, rest get 1, 2, 3… - skipping unconfigured
  // sections so numbers stay consecutive over only what's actually resolved.
  let clauseNum = 0;
  let appendixIdx = 0;
  const numMap: Record<string, string> = {};
  for (const s of orderedSections) {
    if (s.key === 'heading' || !hasClause(s.key)) {
      numMap[s.key] = '';
    } else if (s.key.startsWith('appendix_')) {
      appendixIdx++;
      numMap[s.key] = String.fromCharCode(64 + appendixIdx); // A, B, C …
    } else {
      clauseNum++;
      numMap[s.key] = String(clauseNum);
    }
  }

  // ── Table of Contents ──
  let toc = '';
  if (includeToc) {
    const items = orderedSections
      .filter((s) => s.key !== 'heading' && hasClause(s.key))
      .map((s) => {
        const n = numMap[s.key];
        const isAppendix = s.key.startsWith('appendix_');
        const prefix = isAppendix ? `Appendix ${n}` : `${n}.`;
        return `<li class="cs-toc-item"><a class="cs-toc-link" href="#section-${s.key}"><span class="cs-toc-num">${prefix}</span> ${s.title}</a></li>`;
      })
      .join('\n');
    toc = `<nav class="cs-toc"><div class="cs-toc-heading">Table of Contents</div><ol class="cs-toc-list">${items}</ol></nav>`;
  }

  // ── Sections ──
  const sectionHtml: Record<string, string> = {};
  for (const section of orderedSections) {
    const clauseId = effectiveClauses[section.key];
    const clause = clauseId ? clausesById[clauseId] : undefined;
    const n = numMap[section.key];
    const isAppendix = section.key.startsWith('appendix_');

    const idAttr = `id="section-${section.key}"`;
    const cls = `cs-section cs-${section.key}`;
    const dataAttr = `data-section="${section.key}"`;

    if (!clause) {
      sectionHtml[section.key] = hideMissingClauses
        ? ''
        : `<section ${idAttr} class="${cls}" ${dataAttr}><p class="cs-missing-clause">[No clause configured for "${section.title}"]</p></section>`;
      continue;
    }

    const renderedContent = replacePlaceholders(clause.content, mergedValues);

    // Prepend a numbered heading unless the clause content already starts with
    // an h1/h2/h3 (in which case we inject the number into the existing tag).
    let headingPrefix = '';
    if (includeSectionNumbers && n) {
      headingPrefix = isAppendix ? `Appendix ${n}. ${section.title}` : `${n}. ${section.title}`;
    }

    const contentHasOwnHeading = /^\s*<h[1-3]/i.test(renderedContent);
    let body = renderedContent;
    if (headingPrefix && !contentHasOwnHeading) {
      body = `<h2 class="cs-section-heading">${headingPrefix}</h2>${renderedContent}`;
    } else if (headingPrefix && contentHasOwnHeading) {
      // Inject number before existing heading text
      body = renderedContent.replace(/(<h[1-3][^>]*>)([^<]*)/, `$1${n}. $2`);
    }

    sectionHtml[section.key] = `<section ${idAttr} class="${cls}" ${dataAttr}>${body}</section>`;
  }

  // The Contract Heading always leads the document, ahead of the Table of
  // Contents - the ToC lists the sections that follow it, so it reads oddly
  // sitting above the title itself.
  const headingHtml = sectionHtml['heading'] || '';
  const bodyHtml = orderedSections
    .filter((s) => s.key !== 'heading')
    .map((s) => sectionHtml[s.key])
    .join('\n');

  return headingHtml + toc + bodyHtml;
}
