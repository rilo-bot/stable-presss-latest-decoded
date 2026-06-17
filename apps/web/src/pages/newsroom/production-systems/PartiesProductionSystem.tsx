import { Plus, Search, Eye, User, MapPin, Globe, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Party } from '@/types/party';
import { PARTY_ROLE_LABELS } from '@/types/party';
import { ROLE_COLORS } from '../constants';

interface PartiesProductionSystemProps {
  safeParties: Party[];
  filteredParties: Party[];
  partySearch: string;
  setPartySearch: (v: string) => void;
  onOpenPartyForm: (party?: Party) => void;
  onPartyDelete: (party: Party) => void;
  partyDeleteConfirm: boolean;
  partyDeleteTarget: Party | null;
  setPartyDeleteConfirm: (v: boolean) => void;
  setPartyDeleteTarget: (v: Party | null) => void;
  confirmPartyDelete: () => void;
}

export function PartiesProductionSystem({
  safeParties,
  filteredParties,
  partySearch,
  setPartySearch,
  onOpenPartyForm,
  onPartyDelete,
  partyDeleteConfirm,
  partyDeleteTarget,
  setPartyDeleteConfirm,
  setPartyDeleteTarget,
  confirmPartyDelete,
}: PartiesProductionSystemProps) {
  const currentYear = new Date().getFullYear();
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-0.5">
            Stable Press Production System
          </p>
          <p className="text-sm text-muted-foreground">
            {safeParties.length === 0
              ? 'No parties on record yet.'
              : `${safeParties.length} ${safeParties.length === 1 ? 'party' : 'parties'} registered`}
          </p>
        </div>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs"
          onClick={() => onOpenPartyForm()}
        >
          <Plus size={13} />
          Add Party
        </Button>
      </div>

      {safeParties.length > 0 && (
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Search by name, role, location…"
            value={partySearch}
            onChange={(e) => setPartySearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs border border-input rounded-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Search parties"
          />
        </div>
      )}

      {safeParties.length === 0 ? (
        <EmptyState
          icon={Users}
          heading="No parties registered yet."
          description="Add owners, trainers, jockeys and other racing connections to build your industry directory. Parties can be linked to thoroughbred profiles and editorial coverage."
          ctaLabel="Add Your First Party"
          onCta={() => onOpenPartyForm()}
          size="lg"
        />
      ) : filteredParties.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Search size={24} className="text-muted-foreground mb-3 opacity-40" />
          <p className="text-sm font-semibold text-foreground mb-1">No parties match that search</p>
          <button
            onClick={() => setPartySearch('')}
            className="text-xs text-primary hover:text-primary/80 transition-colors mt-2"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
          <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
              Party Records
            </p>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {filteredParties.length} {filteredParties.length === 1 ? 'party' : 'parties'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {['Party', 'Type', 'Roles', 'Location', 'Since', 'Actions'].map((h) => (
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
                {filteredParties.map((party, idx) => {
                  const yearsActive = party.started_year ? currentYear - party.started_year : null;
                  return (
                    <tr
                      key={party.id}
                      className={cn(
                        'border-b border-border/30 hover:bg-muted/10 transition-colors',
                        idx % 2 === 0 ? 'bg-card' : 'bg-background'
                      )}
                    >
                      <td className="px-4 py-3 max-w-[200px]">
                        <div className="flex items-center gap-2.5">
                          {party.photo ? (
                            <img
                              src={party.photo}
                              alt={party.name}
                              crossOrigin="anonymous"
                              className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-border/40"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 border border-primary/20">
                              <User size={12} className="text-primary" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-foreground block line-clamp-1">
                              {party.name}
                            </span>
                            {party.profession && (
                              <span className="text-[10px] text-muted-foreground truncate block">
                                {party.profession}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[9px] uppercase tracking-[0.1em] font-bold px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/25">
                          Individual
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {(party.roles ?? []).slice(0, 2).map((role) => (
                            <span
                              key={role}
                              className={cn(
                                'text-[8px] uppercase tracking-[0.08em] font-bold px-1.5 py-0.5 rounded-full border',
                                ROLE_COLORS[role]
                              )}
                            >
                              {PARTY_ROLE_LABELS[role]}
                            </span>
                          ))}
                          {(party.roles ?? []).length > 2 && (
                            <span className="text-[8px] text-muted-foreground font-semibold">
                              +{(party.roles ?? []).length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {party.base_location ? (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin size={10} className="flex-shrink-0 text-primary/50" />
                            <span className="truncate max-w-[120px]">{party.base_location}</span>
                          </div>
                        ) : party.country_of_birth ? (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Globe size={10} className="flex-shrink-0 text-primary/50" />
                            <span className="truncate max-w-[120px]">{party.country_of_birth}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {party.started_year ? (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarDays size={10} className="flex-shrink-0 text-primary/50" />
                            <span>{party.started_year}</span>
                            {yearsActive !== null && yearsActive > 0 && (
                              <span className="text-primary font-semibold">·{yearsActive}y</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => onOpenPartyForm(party)}
                            className="text-[10px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
                            aria-label={`Edit ${party.name}`}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => onPartyDelete(party)}
                            className="text-[10px] uppercase tracking-[0.08em] font-semibold text-destructive hover:text-destructive/80 transition-colors"
                            aria-label={`Remove ${party.name}`}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {partyDeleteConfirm && partyDeleteTarget && (
        <div className="border border-destructive/30 rounded-sm bg-destructive/5 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-foreground">
            Remove{' '}
            <span className="font-semibold">{partyDeleteTarget.name}</span>
            {' '}from Stable Press? This cannot be undone.
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => { setPartyDeleteConfirm(false); setPartyDeleteTarget(null); }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="text-xs"
              onClick={confirmPartyDelete}
            >
              Remove
            </Button>
          </div>
        </div>
      )}

      {safeParties.length > 0 && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-sm border border-border/50 bg-muted/20">
          <Eye size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Parties added here can be linked to thoroughbreds via the <strong className="text-foreground">Thoroughbred Production System</strong>.
            Each record can be associated with thoroughbred profiles and editorial coverage across the platform.
          </p>
        </div>
      )}
    </div>
  );
}
