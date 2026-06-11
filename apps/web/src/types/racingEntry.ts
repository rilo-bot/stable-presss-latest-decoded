export type RaceStatus = 'Entered' | 'Accepted' | 'Scratched' | 'Declared' | 'Finished';

export const RACE_STATUSES: RaceStatus[] = [
  'Entered',
  'Accepted',
  'Scratched',
  'Declared',
  'Finished',
];

export const RACE_STATUS_LABELS: Record<RaceStatus, string> = {
  Entered: 'Entered',
  Accepted: 'Accepted',
  Scratched: 'Scratched',
  Declared: 'Declared',
  Finished: 'Finished',
};

export interface RacingEntry {
  id: string;
  createdAt: Date;

  /** Required — Horse ID this entry is attached to */
  horse_id: string;

  /** Required — Brief description of the race entry or record */
  subject: string;

  /** Required — Official race name */
  race_name: string;

  /** Required — ISO date string YYYY-MM-DD */
  race_date: string;

  /** Required — Racecourse or venue name */
  venue: string;

  /** Optional — Country where the race is held */
  country?: string;

  /** Optional — Race classification or grade (e.g. Gr.1, Listed, Benchmark 88) */
  class_grade?: string;

  /** Optional — Race distance (e.g. 2000m, 1600m) */
  distance?: string;

  /** Optional — Track conditions (e.g. Good, Soft, Heavy) */
  track_condition?: string;

  /** Required — Race lifecycle status */
  status: RaceStatus;

  /** Optional — Finishing position (numeric) */
  finish_position?: number;

  /** Optional — Winning or beaten margin */
  margin?: string;

  /** Optional — Official race time */
  time?: string;

  /** Optional — Prize money earned in AUD */
  prize_money?: number;

  /** Optional — Barrier draw number */
  barrier?: number;

  /** Optional — Weight carried (e.g. 57kg, 56.5kg) */
  weight_carried?: string;

  /** Optional — Party ID of the jockey for this race */
  jockey_id?: string;

  /** Optional — Party ID of the trainer for this race */
  trainer_id?: string;
}
