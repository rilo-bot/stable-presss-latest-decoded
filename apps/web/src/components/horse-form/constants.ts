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
