import { useState, useMemo } from 'react';
import type { PartyRole } from '@/types/party';
import { PARTY_ROLE_LABELS } from '@/types/party';
import { Label } from '@/components/ui/label';
import { X, ChevronDown, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PartyForm } from '@/components/PartyForm';
import type { RegisterPerson } from '@/lib/register';

/* ── RegisterPerson multi-select picker ── */
export function PartyPicker({
  label,
  roleFilter,
  selectedIds,
  onChange,
  allParties,
  required,
  hint,
}: {
  label: string;
  roleFilter: PartyRole | PartyRole[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  allParties: RegisterPerson[];
  required?: boolean;
  hint?: string;
}) {
  const roles = Array.isArray(roleFilter) ? roleFilter : [roleFilter];
  const filtered = useMemo(
    () => allParties.filter((p) => p.roles.some((r) => roles.includes(r))),
    [allParties, roles]
  );

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Role + label used when creating a new party inline. When the picker filters
  // on multiple roles, the first is the one a freshly-created party is given so
  // it immediately matches this picker's filter.
  const createRole = roles[0];
  const createLabel = PARTY_ROLE_LABELS[createRole] ?? label;

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next);
  };

  const selectedParties = useMemo(
    () => allParties.filter((p) => selectedIds.includes(p.id)),
    [allParties, selectedIds]
  );

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>

      {/* Selected chips */}
      {selectedParties.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {selectedParties.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-primary/10 text-primary text-[11px] font-medium border border-primary/20"
            >
              {p.name}
              <button
                type="button"
                onClick={() => toggle(p.id)}
                className="ml-0.5 hover:text-destructive transition-colors"
                aria-label={`Remove ${p.name}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm border border-input rounded-sm bg-background hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-ring transition-colors text-left"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="text-muted-foreground text-xs">
            {filtered.length === 0
              ? `No ${createLabel.toLowerCase()} yet — create one below`
              : selectedIds.length === 0
              ? `Select ${label.toLowerCase()}…`
              : `${selectedIds.length} selected`}
          </span>
          <ChevronDown size={13} className={cn('text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>

        {open && filtered.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-sm shadow-lg max-h-48 overflow-y-auto">
            {filtered.map((p) => {
              const isSelected = selectedIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-primary/5 transition-colors',
                    isSelected && 'bg-primary/10'
                  )}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className={cn(
                    'w-4 h-4 rounded-[3px] border flex items-center justify-center flex-shrink-0 transition-colors',
                    isSelected ? 'bg-primary border-primary' : 'border-input'
                  )}>
                    {isSelected && <Check size={10} className="text-primary-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-xs truncate">{p.name}</p>
                    {p.profession && (
                      <p className="text-[10px] text-muted-foreground truncate">{p.profession}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 flex-shrink-0">
                    {p.roles.filter((r) => roles.includes(r)).map((r) => (
                      <span key={r} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[9px] font-semibold uppercase tracking-wide">
                        {r}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}

            {/* Sticky inline-create row — always reachable while the list is open */}
            <button
              type="button"
              onClick={() => { setOpen(false); setCreating(true); }}
              className="sticky bottom-0 w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-primary bg-card border-t border-border hover:bg-primary/5 transition-colors"
            >
              <Plus size={12} className="flex-shrink-0" />
              Add new {createLabel.toLowerCase()}…
            </button>
          </div>
        )}

        {/* Click-away dismissal */}
        {open && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        )}
      </div>

      {filtered.length === 0 && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="text-[11px] font-semibold text-primary flex items-center gap-1 hover:underline"
        >
          <Plus size={11} />
          Create {createLabel.toLowerCase()}
        </button>
      )}
      {hint && filtered.length > 0 && (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      )}

      {/* Inline party creation — reuses the full Parties form; the new party is
          auto-selected here on save and appears in the dropdown immediately. */}
      <PartyForm
        open={creating}
        onOpenChange={setCreating}
        defaultRole={createRole}
        onSaved={(id) => { if (id) onChange([...selectedIds, id]); }}
      />
    </div>
  );
}
