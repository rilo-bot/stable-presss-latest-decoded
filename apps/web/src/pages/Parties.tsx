import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom';
import { Plus, Search, User, Building2, Edit, Trash, Users, MapPin, Globe, CalendarDays, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { PartyForm } from '@/components/PartyForm';
import { usePartyStore } from '@/stores/partyStore';
import type { Party, PartyRole } from '@/types/party';
import { PARTY_ROLE_LABELS } from '@/types/party';

/* ── Role colour map ─────────────────────────────── */
const ROLE_COLORS: Record<PartyRole, string> = {
  owner: 'bg-primary/15 text-primary border-primary/30',
  trainer: 'bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)/0.3)]',
  jockey: 'bg-[hsl(var(--chart-3)/0.15)] text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3)/0.3)]',
  breeder: 'bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))] border-[hsl(var(--chart-4)/0.3)]',
  'bloodstock agent': 'bg-[hsl(var(--chart-5)/0.15)] text-[hsl(var(--chart-5))] border-[hsl(var(--chart-5)/0.3)]',
  'syndicate manager': 'bg-[hsl(var(--brand-accent)/0.15)] text-[hsl(var(--brand-accent))] border-[hsl(var(--brand-accent)/0.3)]',
  personnel: 'bg-muted text-muted-foreground border-border',
};

/* ── Party card ─────────────────────────────────── */
function PartyCard({ party, onEdit, onDelete, onOpen }: { party: Party; onEdit: () => void; onDelete: () => void; onOpen: () => void }) {
  const currentYear = new Date().getFullYear();
  const yearsActive = party.started_year ? currentYear - party.started_year : null;

  return (
    <div onClick={onOpen} role="link" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }} className="bg-card border border-border/60 rounded-md overflow-hidden flex flex-col hover:border-primary/40 hover:shadow-sm transition-all group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {/* Photo / Avatar area */}
      <div className="relative bg-muted/30 h-40 flex items-center justify-center overflow-hidden">
        {party.photo ? (
          <img
            src={party.photo}
            alt={party.name}
            crossOrigin="anonymous"
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            {party.party_type === 'person' ? (
              <User size={36} strokeWidth={1.25} />
            ) : (
              <Building2 size={36} strokeWidth={1.25} />
            )}
          </div>
        )}
        {/* Type pill */}
        <span
          className={cn(
            'absolute top-2 left-2 text-[9px] uppercase tracking-[0.12em] font-bold px-2 py-0.5 rounded-full border',
            party.party_type === 'person'
              ? 'bg-primary/90 text-primary-foreground border-primary'
              : 'bg-[hsl(var(--brand-accent)/0.9)] text-[hsl(var(--brand-accent-foreground))] border-[hsl(var(--brand-accent)/0.5)]'
          )}
        >
          {party.party_type === 'person' ? 'Individual' : 'Organisation'}
        </span>
        {/* Action buttons (visible on hover) */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            aria-label={`Edit ${party.name}`}
            className="h-7 w-7 rounded-full bg-card/90 text-foreground flex items-center justify-center shadow hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            <Edit size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            aria-label={`Delete ${party.name}`}
            className="h-7 w-7 rounded-full bg-card/90 text-foreground flex items-center justify-center shadow hover:bg-destructive hover:text-destructive-foreground transition-colors"
          >
            <Trash size={13} />
          </button>
        </div>
      </div>

      {/* Card body */}
      <div className="px-4 py-3 flex-1 flex flex-col gap-2">
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground leading-tight line-clamp-1">
            {party.name}
          </h3>
          {party.profession && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{party.profession}</p>
          )}
        </div>

        {/* Roles */}
        <div className="flex flex-wrap gap-1">
          {(party.roles ?? []).map((role) => (
            <span
              key={role}
              className={cn(
                'inline-block text-[9px] uppercase tracking-[0.1em] font-bold px-2 py-0.5 rounded-full border',
                ROLE_COLORS[role]
              )}
            >
              {PARTY_ROLE_LABELS[role]}
            </span>
          ))}
        </div>

        {/* Extra meta row */}
        {(party.base_location || party.country_of_birth || party.started_year) && (
          <div className="mt-1 flex flex-col gap-1 border-t border-border/40 pt-2">
            {party.base_location && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <MapPin size={10} className="flex-shrink-0 text-primary/60" />
                <span className="truncate">{party.base_location}</span>
              </div>
            )}
            {party.country_of_birth && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Globe size={10} className="flex-shrink-0 text-primary/60" />
                <span className="truncate">{party.country_of_birth}</span>
              </div>
            )}
            {party.started_year && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CalendarDays size={10} className="flex-shrink-0 text-primary/60" />
                <span>
                  Since {party.started_year}
                  {yearsActive !== null && yearsActive > 0 && (
                    <span className="ml-1 text-primary font-semibold">· {yearsActive}y</span>
                  )}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Delete confirm dialog ─────────────────────── */
function DeleteConfirm({ party, open, onOpenChange, onConfirm }: {
  party: Party | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" aria-describedby="delete-party-desc">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-display)] text-lg font-bold">
            Remove party?
          </DialogTitle>
        </DialogHeader>
        <p id="delete-party-desc" className="text-sm text-muted-foreground leading-relaxed">
          This will permanently remove{' '}
          <span className="font-semibold text-foreground">{party?.name}</span> from Stable Press.
          This action cannot be undone.
        </p>
        <DialogFooter className="mt-2 flex gap-2 justify-end">
          <DialogClose asChild>
            <Button variant="outline" type="button">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" type="button" onClick={onConfirm}>
            Remove Party
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── All-role filter options ─────────────────────── */
const FILTER_ROLES: Array<{ value: PartyRole | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'owner', label: 'Owners' },
  { value: 'trainer', label: 'Trainers' },
  { value: 'jockey', label: 'Jockeys' },
  { value: 'breeder', label: 'Breeders' },
  { value: 'bloodstock agent', label: 'Bloodstock' },
  { value: 'syndicate manager', label: 'Syndicate Mgrs' },
  { value: 'personnel', label: 'Personnel' },
];

/* ── Google Map section ──────────────────────────── */
function PartiesMapSection() {
  return (
    <div className="mt-14 mb-2">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <MapPin size={15} className="text-primary" />
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground leading-tight">
              Parties Map
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Explore the global racing community
            </p>
          </div>
        </div>
        <a
          href="https://www.google.com/maps"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          aria-label="Open Google Maps"
        >
          <ExternalLink size={12} />
          Open in Maps
        </a>
      </div>

      {/* Map embed */}
      <div className="rounded-md border border-border/60 overflow-hidden shadow-sm">
        {/* Brand stripe at top */}
        <div className="h-1 w-full bg-primary" />

        <div className="relative">
          {/* Overlay badge */}
          <div className="absolute top-3 left-3 z-10 pointer-events-none">
            <div className="px-3 py-1.5 bg-card/95 backdrop-blur-sm border border-border rounded-sm shadow-sm flex items-center gap-2">
              <MapPin size={12} className="text-primary flex-shrink-0" />
              <span className="font-[family-name:var(--font-display)] text-xs font-bold text-foreground">
                Racing Connections — Worldwide
              </span>
            </div>
          </div>

          <iframe
            title="Stable Press — Parties Map"
            src="https://maps.google.com/maps?q=thoroughbred+racing&t=m&z=3&ie=UTF8&iwloc=B&output=embed"
            width="100%"
            height="480"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="block border-0 w-full"
            style={{ height: '480px' }}
            aria-label="Google Map showing global racing locations"
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-muted/20 border-t border-border/60 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Track where your owners, trainers, jockeys and breeders are based across the globe.
          </p>
          <a
            href="https://www.google.com/maps"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] font-semibold text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <ExternalLink size={10} />
            Full Map
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────── */
export default function Parties() {
  // === auto fetch-on-mount (backend planner) ===
  const fetchParties = usePartyStore((s) => s.fetchParties);
  useEffect(() => {
    fetchParties();
  }, [fetchParties]);
  // === end auto fetch-on-mount ===

  const parties = usePartyStore((s) => s.parties);
  const removeParty = usePartyStore((s) => s.removeParty);
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<PartyRole | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'person' | 'organisation'>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editParty, setEditParty] = useState<Party | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Party | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const safeParties = parties ?? [];

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return safeParties.filter((p) => {
      if (typeFilter !== 'all' && p.party_type !== typeFilter) return false;
      if (roleFilter !== 'all' && !(p.roles ?? []).includes(roleFilter)) return false;
      if (q && !p.name?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [safeParties, query, roleFilter, typeFilter]);

  const openEdit = (party: Party) => {
    setEditParty(party);
    setFormOpen(true);
  };

  const openDelete = (party: Party) => {
    setDeleteTarget(party);
    setDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    removeParty(deleteTarget.id);
    toast.success(`${deleteTarget.name} has been removed.`);
    setDeleteOpen(false);
    setDeleteTarget(null);
  };

  const handleAddClick = () => {
    setEditParty(undefined);
    setFormOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-10">
      {/* ── Page header ── */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 flex-col sm:flex-row sm:items-end mb-3">
          <div>
            <span className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-foreground block mb-2">
              Connections
            </span>
            <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-bold text-foreground leading-tight">
              Parties
            </h1>
          </div>
          <div className="flex items-center gap-3 pb-0.5">
            {safeParties.length > 0 && (
              <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold hidden sm:block">
                <span
                  className="font-[family-name:var(--font-display)] font-bold text-base tabular-nums"
                  style={{ color: 'hsl(var(--brand-accent))' }}
                >
                  {safeParties.length}
                </span>{' '}
                {safeParties.length === 1 ? 'party' : 'parties'} registered
              </span>
            )}
            <Button onClick={handleAddClick} size="sm" className="gap-1.5">
              <Plus size={14} />
              Add Party
            </Button>
          </div>
        </div>
        <div className="h-px bg-border/60 mt-1 mb-6" />

        {/* ── Filters row ── */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-sm min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name…"
              className="pl-8 text-sm"
              aria-label="Search parties"
            />
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(['all', 'person', 'organisation'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  'text-[10px] uppercase tracking-[0.08em] font-semibold px-3 py-1.5 rounded-sm border transition-all',
                  typeFilter === t
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                )}
              >
                {t === 'all' ? 'All Types' : t === 'person' ? 'Individuals' : 'Organisations'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Role filter chips ── */}
        <div className="flex flex-wrap gap-2 mt-3">
          {FILTER_ROLES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setRoleFilter(value)}
              className={cn(
                'text-[9px] uppercase tracking-[0.1em] font-bold px-2.5 py-1 rounded-full border transition-all',
                roleFilter === value
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'bg-card text-muted-foreground border-border/60 hover:border-primary/30 hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      {safeParties.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
            style={{ background: 'hsl(var(--primary) / 0.08)' }}
          >
            <Users size={36} className="text-primary" strokeWidth={1.25} />
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground mb-2">
            No parties registered yet.
          </h2>
          <div className="h-px w-12 mx-auto mb-4" style={{ background: 'hsl(var(--brand-accent))' }} />
          <p className="text-sm text-muted-foreground max-w-sm leading-relaxed italic font-[family-name:var(--font-display)] mb-6">
            Add owners, trainers, jockeys and other racing connections to build your industry directory.
          </p>
          <Button onClick={handleAddClick} className="gap-2">
            <Plus size={15} />
            Add Your First Party
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        /* No search results */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
            style={{ background: 'hsl(var(--primary) / 0.08)' }}
          >
            <Search size={28} className="text-primary" />
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground mb-2">
            No parties match that search
          </h2>
          <div className="h-px w-12 mb-4" style={{ background: 'hsl(var(--brand-accent))' }} />
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed italic font-[family-name:var(--font-display)]">
            Try adjusting your search or filter to find the right party.
          </p>
          <button
            onClick={() => { setQuery(''); setRoleFilter('all'); setTypeFilter('all'); }}
            className="mt-5 text-xs uppercase tracking-[0.1em] font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {(query || roleFilter !== 'all' || typeFilter !== 'all') && (
            <p className="text-xs text-muted-foreground uppercase tracking-[0.08em] mb-4">
              {filtered.length} {filtered.length === 1 ? 'party' : 'parties'} found
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((party, i) => (
              <motion.div
                key={party.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.18, ease: 'easeOut' }}
              >
                <PartyCard
                  party={party}
                  onEdit={() => openEdit(party)}
                  onDelete={() => openDelete(party)}
                  onOpen={() => navigate(`/parties/${party.id}`)}
                />
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* ── Google Map ── */}
      <PartiesMapSection />

      {/* ── Forms & dialogs ── */}
      <PartyForm
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditParty(undefined);
        }}
        party={editParty}
      />

      <DeleteConfirm
        party={deleteTarget}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
