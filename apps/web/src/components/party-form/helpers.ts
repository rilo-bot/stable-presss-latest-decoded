import type { PartyRole } from '@/types/party';
import type { RegisterPerson } from '@/lib/register';

/* ─────────────────────────────────────────────
   Props
───────────────────────────────────────────── */
export interface PartyFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When supplied, the form operates in edit mode. */
  party?: RegisterPerson;
  /**
   * When supplied (and not in edit mode), the form opens with this role
   * pre-selected so the user does not have to pick it manually.
   */
  defaultRole?: PartyRole;
  /** Called after a successful save so callers can react (e.g. navigate). */
  onSaved?: (id: string) => void;
}

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_FILE_SIZE_MB = 5;

/** Calculate age in whole years from a YYYY-MM-DD string. Returns null if invalid. */
export function calcAge(dob: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const mDiff = now.getMonth() - birth.getMonth();
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}

export const CURRENT_YEAR = new Date().getFullYear();
