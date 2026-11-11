import type { CatalogSurface } from './types.js'

// Operator catalog — 'registers' pack. See ./types.ts for the contract.
//
// Web side: apps/web/src/pages/production-system/operator-team/
// useRegisterOperatorActions.ts, one hook per register screen (screens/*Screen.tsx).
// Names and arg shapes here MUST match the zod schemas there.
export const SURFACES: CatalogSurface[] = [
  {
    id: 'registers-horses',
    title: 'Thoroughbreds register',
    route: '/production-system/horses',
    who: 'staff with Horses view; Horses create to add',
    purpose:
      "Every thoroughbred profile, with its owners, trainers, jockeys and breeders. Search the list, or add a horse via the quick form. A horse NEEDS at least one owner and one trainer who already exist in the People register with that role — add missing people first (registers.addPerson). Each row's studioPath (/studio/horse/:id) opens the horse's editable studio, where profile.askStudio can fill pedigree, racing and more.",
    actions: [
      {
        name: 'registers.searchHorses',
        description: 'Type a query into the horse search box (name, trainer, owner, jockey, country) and return matching rows with ids, connections, profilePath and studioPath. query "" lists all.',
        args: '{ query: string }',
      },
      {
        name: 'registers.addHorse',
        description:
          "Add a horse with the quick form, typing each field and picking connections from the People register. sex: Colt|Filly|Mare|Stallion|Gelding|Rig. colour: Bay|Dark Bay / Brown|Chestnut|Grey|Roan|Black|Brown|… country: Australia|New Zealand|Ireland|United Kingdom|France|United States|Japan|Hong Kong|… dob must be a full date — if only the foaling year is known, omit dob and tell the user.",
        args: '{ name: string; sex?: string; dob?: string /* YYYY-MM-DD */; colour?: string; country?: string; sire?: string; dam?: string; owners: string[]; trainers: string[]; jockeys?: string[]; breeders?: string[] /* people names */ }',
      },
    ],
    anchors: [
      'reg.add-horse',
      'reg.add-horse-quick',
      'reg.add-horse-guided',
      'reg.horse-search',
      'reg.horse-row-<horseId>',
      'reg.horse-edit-<horseId>',
      'reg.horse-form',
      'reg.horse-name',
      'reg.horse-sex',
      'reg.horse-dob',
      'reg.horse-colour',
      'reg.horse-country',
      'reg.horse-section-pedigree',
      'reg.horse-sire',
      'reg.horse-dam',
      'reg.horse-section-connections',
      'reg.horse-conn-<role>',
      'reg.horse-save',
    ],
  },
  {
    id: 'registers-people',
    title: 'People register',
    route: '/production-system/people',
    who: 'staff with People view; People create to add',
    purpose:
      "The industry directory: owners, trainers, jockeys, breeders, bloodstock agents, syndicate managers and personnel. A person can hold several roles. Search it, or add someone. Each row's studioPath (/studio/:id) opens their editable profile studio.",
    actions: [
      {
        name: 'registers.searchPeople',
        description: 'Type a query into the people search box (name, profession, location) and return matching rows (id, name, roles, profilePath, studioPath). Optional role narrows the result.',
        args: "{ query: string; role?: 'owner'|'trainer'|'jockey'|'breeder'|'bloodstock agent'|'syndicate manager'|'personnel' }",
      },
      {
        name: 'registers.addPerson',
        description: 'Add a person: opens the Add to the Register form, types the name and details, toggles their roles, saves. Refuses an exact-name duplicate.',
        args: "{ name: string; roles: Array<'owner'|'trainer'|'jockey'|'breeder'|'bloodstock agent'|'syndicate manager'|'personnel'>; profession?: string; dob?: string /* YYYY-MM-DD */; countryOfBirth?: string; baseLocation?: string; startedYear?: number }",
      },
    ],
    anchors: [
      'reg.add-person',
      'reg.person-search',
      'reg.person-row-<personId>',
      'reg.person-edit-<personId>',
      'reg.person-form',
      'reg.person-name',
      'reg.person-profession',
      'reg.person-role-<role>',
      'reg.person-dob',
      'reg.person-country',
      'reg.person-base',
      'reg.person-started-year',
      'reg.person-save',
    ],
  },
  {
    id: 'registers-media',
    title: 'Media Records register',
    route: '/production-system/media-records',
    who: 'staff with Media Records view',
    purpose:
      'Articles, photos, videos, press releases and publications attached to horses. Search and filter here, or add a record with registers.addMediaRecord (it fills the Add Media Record form visibly). A record needs a URL or an uploaded file: without a url the action leaves the form open on its File Upload tab with reg.media-file anchored — attach the file there with the upload tool (or ask the user), then click reg.media-save.',
    actions: [
      {
        name: 'registers.searchMedia',
        description: 'Type a query into the media search box and/or filter by horse, then return matching records.',
        args: '{ query?: string; horse?: string /* name or id; "" = all */ }',
      },
      {
        name: 'registers.addMediaRecord',
        description:
          "Add a media record to a horse: opens Add Media Record, picks the horse, types subject/title/source/date, chooses the type, adds featured people and a linked article, then saves when a url is given. Without url it returns saved:false, needsFile:true and leaves the form open for a file upload on reg.media-file. featured names must already be in the People register.",
        args: "{ horse: string /* name or id */; title: string; subject: string; mediaType?: 'Article'|'Photo'|'Video'|'Press Release'|'Publication' /* default Article */; sourcePublication?: string; publishedDate?: string /* YYYY-MM-DD */; url?: string; featured?: string[] /* people names */; linkedArticle?: string /* article title or id */ }",
      },
    ],
    anchors: [
      'reg.add-media',
      'reg.media-search',
      'reg.media-horse-filter',
      'reg.media-row-<mediaId>',
      'reg.media-form',
      'reg.media-horse',
      'reg.media-subject',
      'reg.media-type-<article|photo|video|press-release|publication>',
      'reg.media-title',
      'reg.media-source',
      'reg.media-date',
      'reg.media-mode-url',
      'reg.media-mode-file',
      'reg.media-url',
      'reg.media-file',
      'reg.media-featured',
      'reg.media-article',
      'reg.media-save',
      'reg.media-cancel',
    ],
  },
  {
    id: 'registers-racing',
    title: 'Racing Records register',
    route: '/production-system/racing-records',
    who: 'staff with Racing Records view',
    purpose:
      'Race entries and results per horse. Search and filter here, or add an entry/result with registers.addRacingRecord (it fills the Add Racing Record form visibly and saves).',
    actions: [
      {
        name: 'registers.searchRacing',
        description: 'Type a query into the racing search box (race, venue, subject, country) and/or filter by horse, then return matching records.',
        args: '{ query?: string; horse?: string /* name or id; "" = all */ }',
      },
      {
        name: 'registers.addRacingRecord',
        description:
          'Add a race entry or result for a horse: opens Add Racing Record, fills each field, picks jockey/trainer, saves. status defaults to Finished when finishPosition is given, else Entered. subject defaults to "<horse> — <race>, <venue>". jockey/trainer must already hold that role in the People register.',
        args: "{ horse: string /* name or id */; raceName: string; raceDate: string /* YYYY-MM-DD */; venue: string; subject?: string; status?: 'Entered'|'Accepted'|'Scratched'|'Declared'|'Finished'; country?: string; classGrade?: string; distance?: string; trackCondition?: string; finishPosition?: number; margin?: string; time?: string; prizeMoney?: number /* AUD */; barrier?: number; weightCarried?: string; jockey?: string; trainer?: string /* people names */ }",
      },
    ],
    anchors: [
      'reg.add-racing',
      'reg.racing-search',
      'reg.racing-horse-filter',
      'reg.racing-row-<entryId>',
      'reg.racing-form',
      'reg.racing-horse',
      'reg.racing-subject',
      'reg.racing-race-name',
      'reg.racing-status',
      'reg.racing-date',
      'reg.racing-venue',
      'reg.racing-finish',
      'reg.racing-jockey',
      'reg.racing-trainer',
      'reg.racing-save',
      'reg.racing-cancel',
    ],
  },
  {
    id: 'registers-horse-records',
    title: 'Horse Records (sales & documents)',
    route: '/production-system/horse-records',
    who: 'staff with Horse Records view',
    purpose: 'Sale results and paperwork (vet reports, registrations …) per horse. Read-only for the Operator.',
    actions: [
      {
        name: 'registers.listHorseRecords',
        description: 'List sale records and documents/reports, optionally for one horse.',
        args: '{ horse?: string /* name or id */ }',
      },
    ],
  },
]
