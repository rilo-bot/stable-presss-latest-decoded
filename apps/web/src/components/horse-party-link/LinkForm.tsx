import type { Dispatch, SetStateAction } from 'react';
import type { HorsePartyRelationshipType } from '@/types/horsePartyLink';
import {
  HORSE_PARTY_RELATIONSHIP_TYPES,
  HORSE_PARTY_RELATIONSHIP_LABELS,
} from '@/types/horsePartyLink';
import type { Party } from '@/types/party';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { X, Check, Link } from 'lucide-react';
import type { LinkFormState } from './helpers';

interface LinkFormProps {
  form: LinkFormState;
  setForm: Dispatch<SetStateAction<LinkFormState>>;
  errors: Partial<Record<keyof LinkFormState, string>>;
  editId: string | null;
  horseName: string;
  safeParties: Party[];
  availableParties: Party[];
  onCancel: () => void;
  onSave: () => void;
}

export function LinkForm({
  form,
  setForm,
  errors,
  editId,
  horseName,
  safeParties,
  availableParties,
  onCancel,
  onSave,
}: LinkFormProps) {
  return (
    <div className="border border-primary/25 rounded-sm bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Link size={13} className="text-primary" />
          {editId ? 'Edit Relationship' : `Link Party to ${horseName}`}
        </p>
        <button
          onClick={onCancel}
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
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
            onClick={onSave}
          >
            <Check size={12} />
            {editId ? 'Save Changes' : 'Link Party'}
          </Button>
        </div>
      </div>
    </div>
  );
}
