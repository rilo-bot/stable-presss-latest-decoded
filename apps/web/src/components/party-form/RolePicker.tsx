import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import type { PartyRole, PersonnelSubtype } from '@/types/party';
import {
  PARTY_ROLES,
  PARTY_ROLE_LABELS,
  PERSONNEL_SUBTYPES,
  PERSONNEL_SUBTYPE_LABELS,
} from '@/types/party';

interface RolePickerProps {
  roles: PartyRole[];
  toggleRole: (role: PartyRole) => void;
  rolesError?: string;
  showPersonnelSubtype: boolean;
  personnelSubtypes: PersonnelSubtype[];
  togglePersonnelSubtype: (subtype: PersonnelSubtype) => void;
}

export function RolePicker({
  roles,
  toggleRole,
  rolesError,
  showPersonnelSubtype,
  personnelSubtypes,
  togglePersonnelSubtype,
}: RolePickerProps) {
  return (
    <>
      {/* ── Roles ── */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-[0.1em] font-semibold text-muted-foreground">
          Roles <span className="text-destructive">*</span>
        </Label>
        <p className="text-[11px] text-muted-foreground -mt-1">
          Select all roles this party holds in the racing industry.
        </p>
        <div className="flex flex-wrap gap-2 mt-1" role="group" aria-label="Party roles">
          {PARTY_ROLES.map((role) => {
            const active = roles.includes(role);
            return (
              <button
                key={role}
                type="button"
                aria-pressed={active}
                onClick={() => toggleRole(role)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all border',
                  active
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-card text-muted-foreground border-border hover:border-primary/60 hover:text-foreground'
                )}
              >
                {active && <Check size={10} strokeWidth={3} />}
                {PARTY_ROLE_LABELS[role]}
              </button>
            );
          })}
        </div>
        {rolesError && (
          <p className="text-xs text-destructive mt-1">{rolesError}</p>
        )}
      </div>

      {/* ── Personnel Subtype (revealed only when 'personnel' role is selected) ── */}
      {showPersonnelSubtype && (
        <div className="space-y-2 pl-4 border-l-2 border-primary/30">
          <div>
            <Label className="text-xs uppercase tracking-[0.1em] font-semibold text-muted-foreground">
              Personnel Type
            </Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Select all that apply for this personnel member.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Personnel subtypes">
            {PERSONNEL_SUBTYPES.map((subtype) => {
              const active = personnelSubtypes.includes(subtype);
              return (
                <button
                  key={subtype}
                  type="button"
                  aria-pressed={active}
                  onClick={() => togglePersonnelSubtype(subtype)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all border',
                    active
                      ? 'bg-[hsl(var(--brand-accent))] text-[hsl(var(--brand-accent-foreground))] border-[hsl(var(--brand-accent))] shadow-sm'
                      : 'bg-card text-muted-foreground border-border hover:border-[hsl(var(--brand-accent))]/60 hover:text-foreground'
                  )}
                >
                  {active && <Check size={10} strokeWidth={3} />}
                  {PERSONNEL_SUBTYPE_LABELS[subtype]}
                </button>
              );
            })}
          </div>
          {personnelSubtypes.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {personnelSubtypes.length} subtype{personnelSubtypes.length !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>
      )}
    </>
  );
}
