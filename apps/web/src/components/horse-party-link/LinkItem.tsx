import type { HorsePartyLink } from '@/types/horsePartyLink';
import { HORSE_PARTY_RELATIONSHIP_LABELS, isCurrentLink } from '@/types/horsePartyLink';
import type { Party } from '@/types/party';
import { cn } from '@/lib/utils';
import { Calendar } from 'lucide-react';
import { RELATIONSHIP_COLORS } from './helpers';

interface LinkItemProps {
  link: HorsePartyLink;
  party: Party | undefined;
  idx: number;
  onEdit: (link: HorsePartyLink) => void;
  onRequestDelete: (id: string) => void;
}

export function LinkItem({ link, party, idx, onEdit, onRequestDelete }: LinkItemProps) {
  const current = isCurrentLink(link);
  return (
    <tr
      className={cn(
        'border-b border-border/30 hover:bg-muted/10 transition-colors',
        idx % 2 === 0 ? 'bg-card' : 'bg-background'
      )}
    >
      {/* Party */}
      <td className="px-4 py-3 max-w-[180px]">
        {party ? (
          <div>
            <span className="text-xs font-semibold text-foreground block line-clamp-1">
              {party.name}
            </span>
            {party.profession && (
              <span className="text-[10px] text-muted-foreground truncate block">
                {party.profession}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/50 italic">
            Party removed
          </span>
        )}
      </td>

      {/* Relationship type */}
      <td className="px-4 py-3">
        <span
          className={cn(
            'text-[9px] uppercase tracking-[0.08em] font-bold px-2 py-0.5 rounded-full border',
            RELATIONSHIP_COLORS[link.relationship_type]
          )}
        >
          {HORSE_PARTY_RELATIONSHIP_LABELS[link.relationship_type]}
        </span>
      </td>

      {/* Start date */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar size={10} className="flex-shrink-0 text-primary/50" />
          <span>
            {link.start_date
              ? new Date(link.start_date).toLocaleDateString('en-AU', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              : '—'}
          </span>
        </div>
      </td>

      {/* End date */}
      <td className="px-4 py-3">
        {link.end_date ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar size={10} className="flex-shrink-0 text-muted-foreground/40" />
            <span>
              {new Date(link.end_date).toLocaleDateString('en-AU', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground/40 text-xs">—</span>
        )}
      </td>

      {/* is_current badge */}
      <td className="px-4 py-3">
        {current ? (
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.08em] text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
            Current
          </span>
        ) : (
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Former
          </span>
        )}
      </td>

      {/* Context */}
      <td className="px-4 py-3 max-w-[200px]">
        {link.context ? (
          <span className="text-[10px] text-muted-foreground line-clamp-2 leading-snug">
            {link.context}
          </span>
        ) : (
          <span className="text-muted-foreground/30 text-xs">—</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onEdit(link)}
            className="text-[10px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
            aria-label={`Edit link`}
          >
            Edit
          </button>
          <button
            onClick={() => onRequestDelete(link.id)}
            className="text-[10px] uppercase tracking-[0.08em] font-semibold text-destructive hover:text-destructive/80 transition-colors"
            aria-label={`Remove link`}
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}
