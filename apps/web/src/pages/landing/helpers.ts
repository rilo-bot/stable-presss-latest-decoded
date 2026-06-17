/* ── Formatting helpers ──────────────────────────────────── */

export function fmtMinutes(seconds: number): string {
  const min = Math.max(1, Math.round((seconds || 0) / 60));
  return `${min} min`;
}

export function fmtShortDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}
