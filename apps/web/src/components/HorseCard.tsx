import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Horse } from '@/types/horse';
import { useNavigate } from 'react-router-dom';
import { usePartyStore } from '@/stores/partyStore';
import { connectionResolver } from '@/lib/horseConnections';
import { useRegister } from '@/lib/register';

/* No fallback photograph.
 *
 * This card used to hotlink one Pexels photo of an anonymous thoroughbred and
 * substitute it whenever a horse had no image of its own — with `alt` set to
 * THAT horse's name. So a grid of ten photo-less horses was ten distinct names
 * over ten copies of the same animal, presented as a record. On a site whose
 * whole claim is the accuracy of the record, a stand-in photograph is a lie the
 * reader cannot detect.
 *
 * A horse with no photograph now shows an empty frame, and a broken URL falls
 * back to the same frame rather than to a different horse. */

interface HorseCardProps {
  horse: Horse;
  className?: string;
}

export function HorseCard({ horse, className }: HorseCardProps) {
  const navigate = useNavigate();
  const parties = useRegister();
  const conn = connectionResolver(parties)(horse);
  const imageSrc = horse.imageUrl?.trim() ? horse.imageUrl : null;
  // Set when the real photo fails to load, so the frame replaces it.
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = imageSrc !== null && !imageFailed;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/horses/${horse.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/horses/${horse.id}`)}
      aria-label={`View profile for ${horse.name}`}
      className={cn(
        'group relative bg-card border border-border/60 rounded-sm overflow-hidden cursor-pointer',
        'transition-all duration-200 ease-out',
        'hover:border-primary/40 hover:shadow-[0_4px_24px_0_hsl(var(--primary)/0.10)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'motion-reduce:transition-none',
        className
      )}
    >
      {/* ── Hero image zone ─────────────────────────────── */}
      <div className="relative w-full h-44 overflow-hidden bg-muted/40">
        {showImage ? (
          <img
            src={imageSrc}
            alt={`${horse.name} — thoroughbred racehorse`}
            crossOrigin="anonymous"
            className={cn(
              'w-full h-full object-cover transition-transform duration-300 ease-out',
              'group-hover:scale-[1.03] motion-reduce:transform-none'
            )}
            onError={() => setImageFailed(true)}
          />
        ) : (
          /* No photograph on record. Says so, rather than showing another horse. */
          <div
            className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground/40"
            aria-hidden="true"
          >
            <ImageOff size={22} strokeWidth={1.5} />
            <span className="text-[11px] tracking-[0.06em]">No photograph on record</span>
          </div>
        )}

        {/* Gradient scrim so text overlays stay legible */}
        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--background)/0.82)] via-transparent to-transparent" />

        {/* Country + colour pills anchored bottom-left over the scrim */}
        <div className="absolute bottom-2.5 left-3 flex items-center gap-1.5 flex-wrap">
          {horse.country && (
            <span className="text-[9px] uppercase tracking-[0.14em] font-bold bg-card/90 text-foreground border border-border/60 rounded-sm px-1.5 py-0.5 backdrop-blur-sm">
              {horse.country}
            </span>
          )}
          {horse.colour && (
            <span
              className="text-[9px] uppercase tracking-[0.14em] font-bold rounded-sm px-1.5 py-0.5 backdrop-blur-sm"
              style={{
                background: 'hsl(var(--brand-accent) / 0.85)',
                color: 'hsl(var(--primary-foreground))',
              }}
            >
              {horse.colour}
            </span>
          )}
        </div>

        {/* Age badge anchored top-right */}
        {horse.age && (
          <div className="absolute top-2.5 right-3">
            <span className="text-[9px] uppercase tracking-[0.1em] font-semibold bg-card/80 text-muted-foreground border border-border/40 rounded-sm px-1.5 py-0.5 backdrop-blur-sm">
              {horse.age}yo
            </span>
          </div>
        )}
      </div>

      {/* ── Content zone ────────────────────────────────── */}
      <div className="p-4">
        {/* Accent stripe + name row */}
        <div className="flex items-start gap-2.5 mb-2.5">
          <div
            className="mt-1 flex-shrink-0 w-[3px] h-full self-stretch min-h-[1.4rem] rounded-full"
            style={{ background: 'hsl(var(--brand-accent))' }}
          />
          <h2
            className={cn(
              'font-[family-name:var(--font-display)] text-xl font-bold leading-tight text-foreground',
              'group-hover:text-primary transition-colors duration-150 motion-reduce:transition-none'
            )}
          >
            {horse.name}
          </h2>
        </div>

        {/* Masthead rule */}
        <div className="h-px bg-border/60 mb-3" />

        {/* Role grid */}
        <dl className="grid grid-cols-2 gap-y-2 gap-x-4 mb-3">
          <div>
            <dt className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-semibold mb-0.5">
              Owner
            </dt>
            <dd className="text-[13px] text-foreground leading-snug truncate">{conn.owner || '—'}</dd>
          </div>
          <div>
            <dt className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-semibold mb-0.5">
              Trainer
            </dt>
            <dd className="text-[13px] text-foreground leading-snug truncate">{conn.trainer || '—'}</dd>
          </div>
          <div>
            <dt className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-semibold mb-0.5">
              Jockey
            </dt>
            <dd className="text-[13px] text-foreground leading-snug truncate">{conn.jockey || '—'}</dd>
          </div>
          <div>
            <dt className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-semibold mb-0.5">
              Breeder
            </dt>
            <dd className="text-[13px] text-foreground leading-snug truncate">{conn.breeder || '—'}</dd>
          </div>
        </dl>

        {/* Pull-quote teaser */}
        {horse.pullQuote && (
          <p
            className="font-[family-name:var(--font-display)] italic text-[12px] text-muted-foreground leading-relaxed line-clamp-2 border-l-2 pl-2.5 mb-3"
            style={{ borderColor: 'hsl(var(--brand-accent))' }}
          >
            {horse.pullQuote}
          </p>
        )}

        {/* CTA row */}
        <div className="flex items-center justify-end pt-1">
          <span
            className="text-[10px] uppercase tracking-[0.12em] font-semibold transition-colors duration-150 group-hover:opacity-80 motion-reduce:transition-none"
            style={{ color: 'hsl(var(--brand-accent))' }}
          >
            View Profile →
          </span>
        </div>
      </div>
    </article>
  );
}
