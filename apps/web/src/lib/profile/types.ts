import type { PartyRole } from '@/types/party';
import type { Horse } from '@/types/horse';
import type { RegisterPerson } from '@/lib/register';

/** A party resolved for a profile tile, with relationship dating. */
export interface PanelParty {
  party: RegisterPerson;
  startDate?: string;
  endDate?: string | null;
  context?: string;
  isCurrent: boolean;
}

/** The subject a profile page centralises on. */
export type ProfileSubject =
  | { kind: 'horse'; horse: Horse }
  | { kind: 'party'; party: RegisterPerson; role: PartyRole };

/** Aggregate career numbers shown in the central summary strip. */
export interface CentralSummary {
  horseCount: number;
  totalWinnings: number;
  wins: number;
  topRating?: number;
}
