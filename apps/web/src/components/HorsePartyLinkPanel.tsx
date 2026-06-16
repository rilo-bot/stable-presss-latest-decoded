import { useState, useMemo } from 'react';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { usePartyStore } from '@/stores/partyStore';
import type { HorsePartyLink, HorsePartyRelationshipType } from '@/types/horsePartyLink';
import {
  HORSE_PARTY_RELATIONSHIP_TYPES,
  HORSE_PARTY_RELATIONSHIP_LABELS,
  isCurrentLink,
} from '@/types/horsePartyLink';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Plus,
  X,
  Edit,
  Trash,
  Check,
  Users,
  Calendar,
  Link,
  AlertCircle,
} from 'lucide-react';

interface HorsePartyLinkPanelProps {
  horseId: string;
  horseName: string;
}

interface LinkFormState {
  party_id: string;
  relationship_type: HorsePartyRelationshipType;
  start_date: string;
  end_date: string;
  context: string;
}

const EMPTY_FORM: LinkFormState = {
  party_id: '',
  relationship_type: 'ownership',
  start_date: '',
  end_date: '',
  context: '',
};

const RELATIONSHIP_COLORS: Record<HorsePartyRelationshipType, string> = {
  ownership: 'bg-primary/15 text-primary border-primary/30',
  training: 'bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)/0.3)]',
  riding: 'bg-[hsl(var(--chart-3)/0.15)] text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3)/0.3)]',
  'bred-by': 'bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))] border-[hsl(var(--chart-4)/0.3)]',
  agent: 'bg-[hsl(var(--chart-5)/0.15)] text-[hsl(var(--chart-5))] border-[hsl(var(--chart-5)/0.3)]',
  personnel: 'bg-muted text-muted-foreground border-border',
};

export function HorsePartyLinkPanel({ horseId, horseName }: HorsePartyLinkPanelProps) {
  const links = useHorsePartyLinkStore((s) => s.links);
  const addLink = useHorsePartyLinkStore((s) => s.addLink);
  const updateLink = useHorsePartyLinkStore((s) => s.updateLink);
  const removeLink = useHorsePartyLinkStore((s) => s.removeLink);
  const parties = usePartyStore((s) => s.parties);

  const horseLinks = useMemo(
    () => links.filter((l) => l.horse_id === horseId),
    [links, horseId]
  );

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<LinkFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof LinkFormState, string>>>({});

  const safeParties = parties ?? [];

  /* Parties already linked to this horse (by id) for filtering */
  const linkedPartyIds = useMemo(
    () => new Set(horseLinks.filter((l) => l.id !== editId).map((l) => l.party_id)),
    [horseLinks, editId]
  );

  const availableParties = useMemo(
    () => safeParties.filter((p) => !linkedPartyIds.has(p.id)),
    [safeParties, linkedPartyIds]
  );

  function openAdd() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setShowForm(true);
  }

  function openEdit(link: HorsePartyLink) {
    setEditId(link.id);
    setForm({
      party_id: link.party_id,
      relationship_type: link.relationship_type,
      start_date: link.start_date ?? '',
      end_date: link.end_date ?? '',
      context: link.context ?? '',
    });
    setErrors({});
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
    setErrors({});
  }

  function validate(): boolean {
    const e: Partial<Record<keyof LinkFormState, string>> = {};
    if (!form.party_id) e.party_id = 'Select a party';
    if (!form.start_date) e.start_date = 'Start date is required';
    if (
      form.end_date &&
      form.start_date &&
      form.end_date < form.start_date
    ) {
      e.end_date = 'End date must be after start date';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (!validate()) {
      toast.error('Please fix the errors before saving.');
      return;
    }
    const payload = {
      horse_id: horseId,
      party_id: form.party_id,
      relationship_type: form.relationship_type,
      start_date: form.start_date,
      end_date: form.end_date || null,
      context: form.context || undefined,
    };
    if (editId) {
      updateLink(editId, payload);
      toast.success('Relationship updated.');
    } else {
      addLink(payload);
      toast.success('Party linked to horse.');
    }
    cancelForm();
  }

  function handleDelete(id: string) {
    removeLink(id);
    setDeleteTarget(null);
    toast.success('Link removed.');
  }

  const partyById = useMemo(() => {
    const map = new Map<string, (typeof safeParties)[0]>();
    for (const p of safeParties) map.set(p.id, p);
    return map;
  }, [safeParties]);

  /* Sort: current links first, then by start_date desc */
  const sortedLinks = useMemo(
    () =>
      [...horseLinks].sort((a, b) => {
        const aCur = isCurrentLink(a) ? 1 : 0;
        const bCur = isCurrentLink(b) ? 1 : 0;
        if (aCur !== bCur) return bCur - aCur;
        return (b.start_date ?? '').localeCompare(a.start_date ?? '');
      }),
    [horseLinks]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-0.5">
            Party Connections
          </p>
          <p className="text-sm text-muted-foreground">
            {sortedLinks.length === 0
              ? `No parties linked to ${horseName} yet.`
              : `${sortedLinks.length} connection${sortedLinks.length !== 1 ? 's' : ''} on record`}
          </p>
        </div>
        {!showForm && (
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs"
            onClick={openAdd}
            disabled={safeParties.length === 0}
          >
            <Plus size={13} />
            Link a Party
          </Button>
        )}
      </div>

      {safeParties.length === 0 && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-sm border border-border/50 bg-muted/20">
          <AlertCircle size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            No parties exist yet. Add parties via the{' '}
            <strong className="text-foreground">Parties Production System</strong> before linking them to a horse.
          </p>
        </div>
      )}

      {/* Inline form */}
      {showForm && (
        <div className="border border-primary/25 rounded-sm bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Link size={13} className="text-primary" />
              {editId ? 'Edit Relationship' : `Link Party to ${horseName}`}
            </p>
            <button
              onClick={cancelForm}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Party selector */}
            <div className="space-y-1 sm:col-span-2">
              <label
                htmlFor="hp-party"
                className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground"
              >
                Party <span className="text-destructive">*</span>
              </label>
              <select
                id="hp-party"
                value={form.party_id}
                onChange={(e) => setForm((f) => ({ ...f, party_id: e.target.value }))}
                className={cn(
                  'w-full px-3 py-2 text-xs border rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring',
                  errors.party_id ? 'border-destructive' : 'border-input'
                )}
              >
                <option value="">— Select a party —</option>
                {/* When editing, include the currently linked party even if already "taken" */}
                {editId && (() => {
                  const current = safeParties.find((p) => p.id === form.party_id);
                  if (current && !availableParties.find((p) => p.id === current.id)) {
                    return (
                      <option key={current.id} value={current.id}>
                        {current.name}
                      </option>
                    );
                  }
                  return null;
                })()}
                {availableParties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {errors.party_id && (
                <p className="text-[10px] text-destructive">{errors.party_id}</p>
              )}
            </div>

            {/* Relationship type */}
            <div className="space-y-1">
              <label
                htmlFor="hp-rel"
                className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground"
              >
                Relationship Type <span className="text-destructive">*</span>
              </label>
              <select
                id="hp-rel"
                value={form.relationship_type}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    relationship_type: e.target.value as HorsePartyRelationshipType,
                  }))
                }
                className="w-full px-3 py-2 text-xs border border-input rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {HORSE_PARTY_RELATIONSHIP_TYPES.map((rt) => (
                  <option key={rt} value={rt}>
                    {HORSE_PARTY_RELATIONSHIP_LABELS[rt]}
                  </option>
                ))}
              </select>
            </div>

            {/* Start date */}
            <div className="space-y-1">
              <label
                htmlFor="hp-start"
                className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground"
              >
                Start Date <span className="text-destructive">*</span>
              </label>
              <input
                id="hp-start"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                className={cn(
                  'w-full px-3 py-2 text-xs border rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring',
                  errors.start_date ? 'border-destructive' : 'border-input'
                )}
              />
              {errors.start_date && (
                <p className="text-[10px] text-destructive">{errors.start_date}</p>
              )}
            </div>

            {/* End date */}
            <div className="space-y-1">
              <label
                htmlFor="hp-end"
                className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground"
              >
                End Date{' '}
                <span className="text-muted-foreground/60 normal-case text-[9px]">
                  (leave blank if current)
                </span>
              </label>
              <input
                id="hp-end"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                className={cn(
                  'w-full px-3 py-2 text-xs border rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring',
                  errors.end_date ? 'border-destructive' : 'border-input'
                )}
              />
              {errors.end_date && (
                <p className="text-[10px] text-destructive">{errors.end_date}</p>
              )}
            </div>

            {/* Context text */}
            <div className="space-y-1 sm:col-span-2">
              <label
                htmlFor="hp-context"
                className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground"
              >
                Context{' '}
                <span className="text-muted-foreground/60 normal-case text-[9px]">
                  (optional — notes about this relationship)
                </span>
              </label>
              <textarea
                id="hp-context"
                value={form.context}
                onChange={(e) => setForm((f) => ({ ...f, context: e.target.value }))}
                rows={2}
                placeholder="e.g. Purchased at Easter Yearling Sale for $480,000. Retained full ownership."
                className="w-full px-3 py-2 text-xs border border-input rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                aria-label="Context notes"
              />
            </div>
          </div>

          {/* Form footer */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-border/40">
            {!form.end_date && form.start_date && (
              <span className="flex items-center gap-1.5 text-[10px] text-primary font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                Will be marked as Current
              </span>
            )}
            {form.end_date && (
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground inline-block" />
                Will be marked as Former
              </span>
            )}
            {!form.start_date && <span />}
            <div className="flex items-center gap-2 ml-auto">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={cancelForm}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
                onClick={handleSave}
              >
                <Check size={12} />
                {editId ? 'Save Changes' : 'Link Party'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="border border-destructive/30 rounded-sm bg-destructive/5 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-foreground">
            Remove this party link from{' '}
            <span className="font-semibold">{horseName}</span>? This cannot be undone.
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="text-xs"
              onClick={() => handleDelete(deleteTarget)}
            >
              Remove
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {sortedLinks.length === 0 && !showForm && safeParties.length > 0 && (
        <div className="flex flex-col items-center py-10 text-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Users size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">
              No parties linked to {horseName} yet.
            </p>
            <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
              Link owners, trainers, jockeys, and other connections to build the full
              relationship history for this horse.
            </p>
          </div>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs mt-1"
            onClick={openAdd}
          >
            <Plus size={13} />
            Link First Party
          </Button>
        </div>
      )}

      {/* Links table */}
      {sortedLinks.length > 0 && (
        <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
          <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
              Linked Parties
            </p>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {sortedLinks.length} {sortedLinks.length === 1 ? 'connection' : 'connections'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {['Party', 'Relationship', 'From', 'Until', 'Status', 'Context', 'Actions'].map((h) => (
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
                {sortedLinks.map((link, idx) => {
                  const party = partyById.get(link.party_id);
                  const current = isCurrentLink(link);
                  return (
                    <tr
                      key={link.id}
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
                            onClick={() => openEdit(link)}
                            className="text-[10px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
                            aria-label={`Edit link`}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteTarget(link.id)}
                            className="text-[10px] uppercase tracking-[0.08em] font-semibold text-destructive hover:text-destructive/80 transition-colors"
                            aria-label={`Remove link`}
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
    </div>
  );
}
