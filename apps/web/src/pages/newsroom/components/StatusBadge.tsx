import { cn } from '@/lib/utils';

/* ── Status badge ─────────────────────────────────────── */

export function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; style?: React.CSSProperties }> = {
    draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
    submitted: { label: 'Submitted', className: 'bg-primary/10 text-primary' },
    editorial_review: { label: 'Editorial Review', className: 'bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))]' },
    revision: { label: 'Revision', className: '', style: { background: 'rgba(232,160,32,0.15)', color: '#e8a020' } },
    legal_review: { label: 'Legal Review', className: 'bg-[hsl(var(--chart-3)/0.15)] text-[hsl(var(--chart-3))]' },
    compliance: { label: 'Compliance', className: 'bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))]' },
    approved: { label: 'Approved', className: '', style: { background: 'rgba(93,168,84,0.15)', color: '#5da854' } },
    publisher_review: { label: 'Publisher Review', className: 'bg-[hsl(var(--brand-accent)/0.15)] text-[hsl(var(--brand-accent))]' },
    scheduled: { label: 'Scheduled', className: 'bg-primary/10 text-primary' },
    published: { label: 'Published', className: 'bg-primary text-primary-foreground' },
    newsletter: { label: 'Newsletter', className: 'bg-[hsl(var(--chart-1)/0.15)] text-[hsl(var(--chart-1))]' },
    bulletin: { label: 'Bulletin', className: 'bg-primary/20 text-primary' },
    archived: { label: 'Archived', className: 'bg-muted text-muted-foreground' },
  };
  const c = config[status] ?? config['draft'];
  return (
    <span
      className={cn('text-[11px] uppercase tracking-[0.1em] font-bold px-2 py-0.5 rounded-sm whitespace-nowrap', c.className)}
      style={c.style}
    >
      {c.label}
    </span>
  );
}
