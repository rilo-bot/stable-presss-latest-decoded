export type RaceStatus = 'upcoming' | 'open' | 'closed' | 'resolved';

export interface RaceEntrant {
  horseId: string;
  horseName: string;
  jockey: string;
  odds: number; // decimal odds, e.g. 3.5 = 3/1 plus stake
  barrierNumber: number;
}

export interface Race {
  id: string;
  name: string;
  venue: string;
  distance: string;
  scheduledAt: string; // ISO string
  status: RaceStatus;
  entrants: RaceEntrant[];
  winnerHorseId: string | null;
  createdAt: string;
  /** Venue coordinates for the map view */
  lat?: number;
  lng?: number;
}

export interface Tip {
  id: string;
  userId: string;
  raceId: string;
  horseName: string;
  horseId: string;
  wager: number;
  odds: number;
  payout: number | null; // null until resolved
  result: 'pending' | 'won' | 'lost';
  createdAt: string;
}

export interface TipperProfile {
  /** Backend record id (present once persisted to /api/tipperProfiles). */
  id?: string;
  userId: string;
  displayName: string;
  coinBalance: number;
  totalWon: number;
  totalWagered: number;
  tipsPlaced: number;
}
