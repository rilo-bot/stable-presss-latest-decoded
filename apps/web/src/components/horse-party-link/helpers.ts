import type { HorsePartyRelationshipType } from '@/types/horsePartyLink';

export interface LinkFormState {
  party_id: string;
  relationship_type: HorsePartyRelationshipType;
  start_date: string;
  end_date: string;
  context: string;
}

export const EMPTY_FORM: LinkFormState = {
  party_id: '',
  relationship_type: 'ownership',
  start_date: '',
  end_date: '',
  context: '',
};

export const RELATIONSHIP_COLORS: Record<HorsePartyRelationshipType, string> = {
  ownership: 'bg-primary/15 text-primary border-primary/30',
  training: 'bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)/0.3)]',
  riding: 'bg-[hsl(var(--chart-3)/0.15)] text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3)/0.3)]',
  'bred-by': 'bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))] border-[hsl(var(--chart-4)/0.3)]',
  agent: 'bg-[hsl(var(--chart-5)/0.15)] text-[hsl(var(--chart-5))] border-[hsl(var(--chart-5)/0.3)]',
  personnel: 'bg-muted text-muted-foreground border-border',
};

/** Pure validation — returns the errors map (empty when valid). */
export function validateForm(
  form: LinkFormState
): Partial<Record<keyof LinkFormState, string>> {
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
  return e;
}
