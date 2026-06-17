/* ── Racing status badge ──────────────────────────────── */

export function RacingStatusBadge({ status }: { status: string }) {
  const configs: Record<string, { bg: string; text: string }> = {
    Entered:   { bg: 'hsl(var(--primary) / 0.12)', text: 'hsl(var(--primary))' },
    Accepted:  { bg: 'rgba(93,168,84,0.15)', text: '#5da854' },
    Scratched: { bg: 'hsl(var(--destructive) / 0.12)', text: 'hsl(var(--destructive))' },
    Declared:  { bg: 'hsl(var(--chart-2) / 0.15)', text: 'hsl(var(--chart-2))' },
    Finished:  { bg: 'hsl(var(--brand-accent) / 0.15)', text: 'hsl(var(--brand-accent))' },
  };
  const c = configs[status] ?? configs['Entered'];
  return (
    <span
      className="text-[11px] uppercase tracking-[0.1em] font-bold px-2 py-0.5 rounded-sm whitespace-nowrap"
      style={{ background: c.bg, color: c.text }}
    >
      {status}
    </span>
  );
}
