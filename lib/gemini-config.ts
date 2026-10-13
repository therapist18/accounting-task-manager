/**
 * Gemini model policy shared by client and server code.
 *
 * The task manager and the scanner app share the same Supabase project, so the
 * SuperAdmin-selected model is read from the same `acc_scanner_settings` row
 * (`sys_config:gemini_model`) that the scanner uses. Server code reads it
 * directly; browser code goes through `/api/gemini-model`.
 */

export interface GeminiModelOption {
  id: string;
  label: string;
  /** Google list price, USD per 1M tokens. Editable in settings if it changes. */
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  note: string;
}

export const GEMINI_MODEL_OPTIONS: readonly GeminiModelOption[] = [
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    inputPerMillionUsd: 0.25,
    outputPerMillionUsd: 1.5,
    note: 'Newest Flash-Lite; best extraction accuracy of the Lite tier.',
  },
] as const;

export const DEFAULT_GEMINI_MODEL = GEMINI_MODEL_OPTIONS[0].id;

export function getGeminiModelOption(id: unknown): GeminiModelOption | undefined {
  return GEMINI_MODEL_OPTIONS.find((option) => option.id === id);
}

export function resolveGeminiModel(id: unknown): string {
  return getGeminiModelOption(id)?.id ?? DEFAULT_GEMINI_MODEL;
}

const CLIENT_CACHE_MS = 60_000;
let clientCache: { model: string; at: number } | null = null;
let clientInflight: Promise<string> | null = null;

/** Browser-side lookup of the SuperAdmin-selected model (cached for 60s). */
export async function fetchGeminiModel(): Promise<string> {
  if (clientCache && Date.now() - clientCache.at < CLIENT_CACHE_MS) return clientCache.model;
  if (clientInflight) return clientInflight;

  clientInflight = (async () => {
    try {
      const res = await fetch('/api/gemini-model', { cache: 'no-store' });
      const body = res.ok ? await res.json() : null;
      const model = resolveGeminiModel(body?.model);
      clientCache = { model, at: Date.now() };
      return model;
    } catch {
      return clientCache?.model ?? DEFAULT_GEMINI_MODEL;
    } finally {
      clientInflight = null;
    }
  })();
  return clientInflight;
}

let serverCache: { model: string; at: number } | null = null;

/**
 * Works in both bundles without importing server-only modules: the browser
 * goes through /api/gemini-model, the server reads Supabase REST directly.
 */
export async function getActiveGeminiModel(): Promise<string> {
  if (typeof window !== 'undefined') return fetchGeminiModel();
  if (serverCache && Date.now() - serverCache.at < CLIENT_CACHE_MS) return serverCache.model;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return DEFAULT_GEMINI_MODEL;
  try {
    const res = await fetch(
      `${url}/rest/v1/acc_scanner_settings?select=value&key=eq.${encodeURIComponent('sys_config:gemini_model')}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' },
    );
    const rows = res.ok ? await res.json() : [];
    let raw = rows?.[0]?.value;
    try { raw = JSON.parse(raw); } catch { /* stored unquoted */ }
    const model = resolveGeminiModel(raw);
    serverCache = { model, at: Date.now() };
    return model;
  } catch {
    return serverCache?.model ?? DEFAULT_GEMINI_MODEL;
  }
}