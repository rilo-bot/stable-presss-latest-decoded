import type { Horse } from '@/types/horse';

export const SEX_OPTIONS = ['Colt', 'Filly', 'Mare', 'Stallion', 'Gelding', 'Rig'];

export const COLOUR_OPTIONS = [
  'Bay', 'Dark Bay / Brown', 'Chestnut', 'Grey', 'Roan', 'Black',
  'Brown', 'Palomino', 'Dun', 'Buckskin', 'Cremello', 'Pinto',
];

export const COUNTRY_OPTIONS = [
  'Australia', 'New Zealand', 'Ireland', 'United Kingdom',
  'France', 'United States', 'Japan', 'Hong Kong', 'South Africa',
  'Germany', 'Canada', 'Argentina', 'UAE', 'Singapore',
];

export const CURRENT_YEAR = new Date().getFullYear();

/* ────────────────────────────
    Height conversion helpers
    Hands use the equine convention where the decimal is inches (0–3),
    e.g. "16.2" = 16 hands + 2 inches. 1 hand = 4 inches, 1 inch = 2.54 cm.
    ──────────────────────────── */
const CM_PER_INCH = 2.54;

export function handsToCm(hands: number): number | undefined {
  if (!Number.isFinite(hands) || hands <= 0) return undefined;
  const whole = Math.floor(hands);
  const inches = Math.round((hands - whole) * 10);
  const totalInches = whole * 4 + inches;
  return Math.round(totalInches * CM_PER_INCH);
}

export function cmToHands(cm: number): number | undefined {
  if (!Number.isFinite(cm) || cm <= 0) return undefined;
  const totalInches = cm / CM_PER_INCH;
  let whole = Math.floor(totalInches / 4);
  let inches = Math.round(totalInches - whole * 4);
  if (inches >= 4) {
    whole += 1;
    inches = 0;
  }
  return Math.round((whole + inches / 10) * 10) / 10;
}

export type FormData = Omit<Horse, 'id' | 'createdAt'>;

export const empty = (): FormData => ({
  name: '',
  isUnnamed: false,
  sex: '',
  dob: '',
  colour: '',
  country: '',
  handsSize: undefined,
  metricSize: undefined,
  sire: '',
  sireSire: '',
  sireDam: '',
  dam: '',
  damYob: undefined,
  damSire: '',
  damDam: '',
  // Generation 3 — great-grandparents
  sireSireSire: '',
  sireSireDam: '',
  sireDamSire: '',
  sireDamDam: '',
  damSireSire: '',
  damSireDam: '',
  damDamSire: '',
  damDamDam: '',
  // Stud Book registry
  studBook: '',
  registrationNumber: '',
  microchip: '',
  brandFreeze: '',
  passportNumber: '',
  // Party ID arrays
  ownerIds: [],
  trainerIds: [],
  jockeyIds: [],
  breederIds: [],
  bloodstockAgentIds: [],
  syndicateManagerIds: [],
  personnelIds: [],
  careerRecord: '',
  careerWinnings: undefined,
  lastTenForm: '',
  seasonRecord: '',
  currentRating: undefined,
  pedigreeNotes: '',
  pullQuote: '',
  imageUrl: '',
  age: undefined,
});
