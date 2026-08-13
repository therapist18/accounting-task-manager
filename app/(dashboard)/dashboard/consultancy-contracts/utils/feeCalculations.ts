// Fees in the standard agreement are quoted Net/VAT/Gross (see the sample
// contract's fee table - e.g. Ksh 30,000 net + Ksh 4,800 VAT = Ksh 34,800
// gross, a 16% rate). The admin only ever enters the Net figure per company;
// VAT and Gross are always derived here, never stored, so there's no risk of
// the three numbers drifting out of arithmetic sync.
export const VAT_RATE = 0.16;

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatKes(amount: number): string {
  return `Ksh. ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// Any resolved placeholder value ending in _net_fee gets matching
// _vat_fee/_gross_fee siblings computed and merged in - values already
// present under those exact keys (e.g. a placeholder deliberately configured
// as static) are left alone rather than overwritten.
export function withDerivedFeeValues(values: Record<string, string>): Record<string, string> {
  const derived: Record<string, string> = {};
  for (const [key, raw] of Object.entries(values)) {
    if (!key.endsWith('_net_fee')) continue;
    const net = parseAmount(raw);
    if (net == null) continue;
    const base = key.slice(0, -'_net_fee'.length);
    const vatKey = `${base}_vat_fee`;
    const grossKey = `${base}_gross_fee`;
    if (!(vatKey in values)) derived[vatKey] = formatKes(net * VAT_RATE);
    if (!(grossKey in values)) derived[grossKey] = formatKes(net * (1 + VAT_RATE));
    if (!(key in derived)) derived[key] = formatKes(net);
  }
  return { ...values, ...derived };
}
