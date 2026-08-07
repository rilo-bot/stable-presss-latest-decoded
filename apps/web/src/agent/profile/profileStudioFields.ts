// The selectable "data boxes" of a horse profile — the units the member clicks
// (purple ring) and the Stable Studio assistant focuses on. A box groups one or
// more editable field keys (the keys the setField tool accepts), the photo, or a
// connection role. Shared by the StudioField wrappers, the context/selection
// builder, and (by key + field list) the server prompt. Keys align with the
// onboarding step keys (photo / basics / pedigree, and conn:<rel> for each role)
// so the guided flow can light up the same box.

import { ROLE_BOXES } from '@/components/profile/RoleConnectionBox';
import type { PartyRole } from '@/types/party';

export type StudioBoxKind = 'image' | 'fields' | 'connection';

export interface StudioBoxDef {
  /** Stable key used as the selection id + sent to the assistant. */
  key: string;
  /** Short human label shown on the purple selection tag and in AI context. */
  label: string;
  kind: StudioBoxKind;
  /** Editable field keys this box covers (empty for photo / connection boxes). */
  fields: string[];
  /** For connection boxes — the role setConnection should use. */
  role?: PartyRole;
}

const FIELD_BOXES: StudioBoxDef[] = [
  { key: 'photo', label: 'Photo', kind: 'image', fields: ['imageUrl'] },
  { key: 'basics', label: 'Identity', kind: 'fields', fields: ['name', 'sex', 'colour', 'dob', 'country'] },
  { key: 'pedigree', label: 'Pedigree', kind: 'fields', fields: ['sire', 'sireSire', 'sireDam', 'dam', 'damSire', 'damDam'] },
  { key: 'racing', label: 'Racing Summary', kind: 'fields', fields: ['careerRecord', 'careerWinnings', 'lastTenForm', 'seasonRecord', 'currentRating'] },
  { key: 'studbook', label: 'Stud Book', kind: 'fields', fields: ['studBook', 'registrationNumber', 'microchip', 'brandFreeze', 'passportNumber'] },
  { key: 'notes', label: 'Notes', kind: 'fields', fields: ['pullQuote', 'pedigreeNotes'] },
];

// One connection box per racing role. Keyed conn:<role> to match the
// every role is selectable now.— the party edge carries the role directly, so
// every role is selectable now.
const CONNECTION_BOXES: StudioBoxDef[] = ROLE_BOXES.map((d) => ({
  key: `conn:${d.role}`,
  label: d.label.replace(/\s*Data$/i, '').replace(/\(s\)/i, 's'),
  kind: 'connection' as const,
  fields: [],
  role: d.role,
}));

export const PROFILE_BOXES: StudioBoxDef[] = [...FIELD_BOXES, ...CONNECTION_BOXES];

export function profileBoxDef(key: string | null | undefined): StudioBoxDef | undefined {
  return key ? PROFILE_BOXES.find((b) => b.key === key) : undefined;
}
