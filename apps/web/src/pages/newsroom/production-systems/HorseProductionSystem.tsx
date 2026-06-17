import { Plus, Search, Eye, Link, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { HorsePartyLinkPanel } from '@/components/HorsePartyLinkPanel';
import { cn } from '@/lib/utils';
import type { Horse } from '@/types/horse';
import type { connectionResolver } from '@/lib/horseConnections';

interface HorseProductionSystemProps {
  horses: Horse[];
  filteredHorses: Horse[];
  horseSearch: string;
  setHorseSearch: (v: string) => void;
  expandedHorseId: string | null;
  setExpandedHorseId: React.Dispatch<React.SetStateAction<string | null>>;
  horseConn: ReturnType<typeof connectionResolver>;
  onOpenHorseForm: (horse?: Horse) => void;
}

export function HorseProductionSystem({
  horses,
  filteredHorses,
  horseSearch,
  setHorseSearch,
  expandedHorseId,
  setExpandedHorseId,
  horseConn,
  onOpenHorseForm,
}: HorseProductionSystemProps) {
  const safeHorses = horses ?? [];
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-0.5">
            Stable Press Production System
          </p>
          <p className="text-sm text-muted-foreground">
            {safeHorses.length === 0
              ? 'No thoroughbreds on record yet.'
              : `${safeHorses.length} thoroughbred${safeHorses.length !== 1 ? 's' : ''} in the stables`}
          </p>
        </div>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs"
          onClick={() => onOpenHorseForm()}
        >
          <Plus size={13} />
          Add Thoroughbred
        </Button>
      </div>

      {safeHorses.length > 0 && (
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Search by name, trainer, owner…"
            value={horseSearch}
            onChange={(e) => setHorseSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs border border-input rounded-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Search horses"
          />
        </div>
      )}

      {safeHorses.length === 0 ? (
        <EmptyState
          icon={Plus}
          heading="The stables await their first resident."
          description="No thoroughbred profiles have been entered yet. Add the first horse to begin building the stable record — profiles will appear on the public Thoroughbred hub."
          ctaLabel="Add a Thoroughbred"
          onCta={() => onOpenHorseForm()}
          size="lg"
        />
      ) : filteredHorses.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Search size={24} className="text-muted-foreground mb-3 opacity-40" />
          <p className="text-sm font-semibold text-foreground mb-1">No horses match that search</p>
          <button
            onClick={() => setHorseSearch('')}
            className="text-xs text-primary hover:text-primary/80 transition-colors mt-2"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
          <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
              Thoroughbred Records
            </p>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {filteredHorses.length} {filteredHorses.length === 1 ? 'profile' : 'profiles'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {['Horse', 'Colour / Age', 'Owner', 'Trainer', 'Jockey', 'Country', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredHorses.map((horse, idx) => {
                  const isExpanded = expandedHorseId === horse.id;
                  return (
                    <>
                      <tr
                        key={horse.id}
                        className={cn(
                          'border-b border-border/30 hover:bg-muted/10 transition-colors',
                          isExpanded ? 'bg-primary/5 border-primary/20' : idx % 2 === 0 ? 'bg-card' : 'bg-background'
                        )}
                      >
                        <td className="px-4 py-3 max-w-[160px]">
                          <span className="text-xs font-semibold text-foreground block line-clamp-1">
                            {horse.name}
                          </span>
                          {horse.pullQuote && (
                            <span className="text-[10px] text-muted-foreground italic line-clamp-1 block">
                              {horse.pullQuote}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            {horse.colour && (
                              <span
                                className="text-[9px] uppercase tracking-[0.1em] font-semibold px-1.5 py-0.5 rounded-sm w-fit"
                                style={{
                                  background: 'hsl(var(--brand-accent) / 0.12)',
                                  color: 'hsl(var(--brand-accent))',
                                }}
                              >
                                {horse.colour}
                              </span>
                            )}
                            {horse.age && (
                              <span className="text-[10px] text-muted-foreground">{horse.age}yo</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground line-clamp-1">{horseConn(horse).owner || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">{horseConn(horse).trainer || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">{horseConn(horse).jockey || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          {horse.country ? (
                            <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground border border-border/50 px-1.5 py-0.5 rounded-sm">
                              {horse.country}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => onOpenHorseForm(horse)}
                              className="text-[10px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
                              aria-label={`Edit ${horse.name}`}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                setExpandedHorseId((prev) =>
                                  prev === horse.id ? null : horse.id
                                )
                              }
                              className={cn(
                                'flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] font-semibold transition-colors',
                                isExpanded
                                  ? 'text-primary'
                                  : 'text-muted-foreground hover:text-primary'
                              )}
                              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} party links for ${horse.name}`}
                              aria-expanded={isExpanded}
                            >
                              <Link size={10} />
                              Parties
                              <ChevronDown
                                size={10}
                                className={cn('transition-transform', isExpanded && 'rotate-180')}
                              />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr key={`${horse.id}-links`} className="border-b border-primary/20">
                          <td colSpan={7} className="bg-primary/3 px-0 py-0">
                            <div className="px-6 py-5 border-l-4 border-primary/30 bg-primary/[0.03]">
                              <div className="flex items-center gap-2 mb-4">
                                <Link size={13} className="text-primary flex-shrink-0" />
                                <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-primary">
                                  Party Connections — {horse.name}
                                </span>
                                <button
                                  onClick={() => setExpandedHorseId(null)}
                                  className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
                                  aria-label="Collapse"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                              <HorsePartyLinkPanel
                                horseId={horse.id}
                                horseName={horse.name}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {safeHorses.length > 0 && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-sm border border-border/50 bg-muted/20">
          <Eye size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Profiles added here appear on the public <strong className="text-foreground">Thoroughbred Profiles</strong> page.
            Click <strong className="text-foreground">Parties</strong> on any row to manage party connections — owners, trainers, jockeys, and more.
          </p>
        </div>
      )}
    </div>
  );
}
