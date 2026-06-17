import { useState, useMemo } from 'react';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { usePartyStore } from '@/stores/partyStore';
import type { HorsePartyLink } from '@/types/horsePartyLink';
import { isCurrentLink } from '@/types/horsePartyLink';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Plus, Users, AlertCircle } from 'lucide-react';
import type { LinkFormState } from './horse-party-link/helpers';
import { EMPTY_FORM, validateForm } from './horse-party-link/helpers';
import { LinkForm } from './horse-party-link/LinkForm';
import { LinkItem } from './horse-party-link/LinkItem';

interface HorsePartyLinkPanelProps {
  horseId: string;
  horseName: string;
}

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
    const e = validateForm(form);
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

  async function handleDelete(id: string) {
    const ok = await removeLink(id);
    setDeleteTarget(null);
    if (ok) toast.success('Link removed.');
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
        <LinkForm
          form={form}
          setForm={setForm}
          errors={errors}
          editId={editId}
          horseName={horseName}
          safeParties={safeParties}
          availableParties={availableParties}
          onCancel={cancelForm}
          onSave={handleSave}
        />
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
                {sortedLinks.map((link, idx) => (
                  <LinkItem
                    key={link.id}
                    link={link}
                    party={partyById.get(link.party_id)}
                    idx={idx}
                    onEdit={openEdit}
                    onRequestDelete={setDeleteTarget}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
