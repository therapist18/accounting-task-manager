import type { GuestPersonDraft } from './guestPerson';
import type { EcJobProfile } from './jobProfileData';
import type { DocumentTab } from '../hooks/useEmploymentLetters';

// ----------------------------------------------------------------------
// Staged session progress for the Employment Contracts workspace.
//
// Everything the user types/SELECTS here is local until they click
// Generate ("Save to DB"): the employment offer only reaches
// ec_employment_offers and the generated document only reaches
// acc_portal_directors_documents inside ContractPreview.handleSaveToDb.
// Until then a page reload would throw all of it away - so the whole
// unsaved session (selection, guest person draft, offer edits, theme,
// typed letter values, active tab) is snapshotted into localStorage here
// and restored on the next mount.
//
// One slot per context (company + person, or company + external-person
// draft) so switching between people doesn't destroy either side's
// progress; the most recently touched slot is what a fresh page load
// restores. Nothing in this file ever writes to the database - it is a
// pure staging area complementing the Generate-time DB writes.
// ----------------------------------------------------------------------

export interface SessionProgress {
  companyId: string | null;
  // Registry person, or null in guest mode (the external person is then
  // identified by guestDraft).
  employeeId: string | null;
  guestMode: boolean;
  guestDraft: GuestPersonDraft;
  documentTab: DocumentTab;
  // { employee, offer, metadata } - exactly ContractEditor's contractData.
  contractData: any;
  jobProfile: EcJobProfile | null;
  letterKey: string;
  letterValuesByType: Record<string, Record<string, string>>;
  savedAt: number;
}

const STORAGE_KEY = 'ec-session-progress:v1';
// Cap the map so abandoned contexts can't grow the entry without bound.
const MAX_CONTEXTS = 8;

const isBrowser = () => typeof window !== 'undefined';

const readAll = (): Record<string, SessionProgress> => {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Corrupt JSON or a storage-denied environment (private mode/quota) -
    // staging is a convenience, never a reason to break the workspace.
    return {};
  }
};

const writeAll = (map: Record<string, SessionProgress>) => {
  if (!isBrowser()) return;
  try {
    // Keep only the newest contexts if the map outgrew the cap.
    const entries = Object.entries(map).sort((a, b) => b[1].savedAt - a[1].savedAt);
    const trimmed = Object.fromEntries(entries.slice(0, MAX_CONTEXTS));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Quota exceeded / storage unavailable - skip staging silently.
  }
};

// Slot key for a session. Guests are keyed by their registry id once saved
// (stable across the save), otherwise by the typed name so starting a
// different person never inherits the previous person's staged offer - an
// empty draft gets its own namespace and is never restored from staging
// (see ContractEditor's guest infrastructure effect).
export function progressContextKey(p: {
  companyId: string | null;
  employeeId: string | null;
  guestMode: boolean;
  guestDraft?: GuestPersonDraft | null;
}): string {
  if (p.guestMode) {
    const draft = p.guestDraft;
    const identity = draft?.individualId
      ? `id:${draft.individualId}`
      : `name:${(draft?.fullName || '').trim().toLowerCase().replace(/\s+/g, '-')}`;
    return `guest:${p.companyId || '-'}:${identity}`;
  }
  return `emp:${p.companyId || '-'}:${p.employeeId || '-'}`;
}

// The staged session for one context, or undefined when that context has
// never been staged (or staging was unavailable).
export function readProgress(
  p: Parameters<typeof progressContextKey>[0]
): SessionProgress | undefined {
  return readAll()[progressContextKey(p)];
}

// Snapshot the current unsaved session under its context slot. Called
// debounced from page.tsx whenever session state changes.
export function saveProgress(progress: SessionProgress): void {
  const map = readAll();
  map[progressContextKey(progress)] = progress;
  writeAll(map);
}

// What a fresh page load restores: the most recently edited session.
export function loadLatestProgress(): SessionProgress | null {
  const entries = Object.values(readAll());
  if (entries.length === 0) return null;
  return entries.reduce((newest, p) => (p.savedAt > newest.savedAt ? p : newest));
}

// True when a snapshot carries nothing worth remembering - used so an
// untouched workspace doesn't fill the map with empty slots.
export function isEmptyProgress(p: SessionProgress): boolean {
  const hasOffer = !!p.contractData?.offer;
  const hasGuestDraft =
    !!p.guestDraft && !!(p.guestDraft.individualId || p.guestDraft.fullName.trim());
  const hasLetterValues = Object.values(p.letterValuesByType || {}).some(
    (values) => Object.keys(values).length > 0
  );
  return (
    !p.companyId &&
    !p.guestMode &&
    !hasGuestDraft &&
    !hasOffer &&
    !p.jobProfile &&
    p.documentTab === 'contract' &&
    !hasLetterValues
  );
}
