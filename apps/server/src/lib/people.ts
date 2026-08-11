// A person in the racing world. Stored ONCE, referenced by every party edge.
//
// This is not an account. A person may have no login at all (most do not) - the
// link to an account is `parties.userId`, set when somebody claims the edge.

import { db } from './db.js'
import { PEOPLE } from './collections.js'

export type PersonnelSubtype =
  | 'trackwork rider'
  | 'strapper'
  | 'vet'
  | 'farrier'
  | 'horse breaker'
  | 'stud/yearling manager'

const PERSONNEL_SUBTYPES: PersonnelSubtype[] = [
  'trackwork rider',
  'strapper',
  'vet',
  'farrier',
  'horse breaker',
  'stud/yearling manager',
]

export interface Person {
  id: string
  name: string
  imageUrl?: string
  profession?: string
  /** ISO date, YYYY-MM-DD. */
  dateOfBirth?: string
  countryOfBirth?: string
  baseLocation?: string
  startedYear?: number
  personnelSubtype: PersonnelSubtype[]
}

export function projectPerson(doc: Record<string, any>): Person {
  return {
    id: String(doc._id ?? doc.id ?? ''),
    name: String(doc.name ?? ''),
    imageUrl: doc.imageUrl ? String(doc.imageUrl) : undefined,
    profession: doc.profession ? String(doc.profession) : undefined,
    dateOfBirth: doc.dateOfBirth ? String(doc.dateOfBirth) : undefined,
    countryOfBirth: doc.countryOfBirth ? String(doc.countryOfBirth) : undefined,
    baseLocation: doc.baseLocation ? String(doc.baseLocation) : undefined,
    startedYear: typeof doc.startedYear === 'number' ? doc.startedYear : undefined,
    personnelSubtype: Array.isArray(doc.personnelSubtype)
      ? doc.personnelSubtype.filter((s: unknown): s is PersonnelSubtype =>
          PERSONNEL_SUBTYPES.includes(s as PersonnelSubtype),
        )
      : [],
  }
}

const str = (v: unknown, max: number): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : undefined
}

/** Validate the writable body of a person. `name` is the only required field. */
export function readPersonBody(body: unknown): Omit<Person, 'id'> | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const name = str(b.name, 120)
  if (!name) return { error: 'A name is required.' }

  const year = Number(b.startedYear)
  const thisYear = new Date().getFullYear()
  const startedYear =
    Number.isInteger(year) && year >= 1900 && year <= thisYear ? year : undefined

  const dob = str(b.dateOfBirth, 10)

  return {
    name,
    imageUrl: str(b.imageUrl, 2048),
    profession: str(b.profession, 120),
    dateOfBirth: dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : undefined,
    countryOfBirth: str(b.countryOfBirth, 80),
    baseLocation: str(b.baseLocation, 120),
    startedYear,
    personnelSubtype: Array.isArray(b.personnelSubtype)
      ? (b.personnelSubtype as unknown[]).filter((s): s is PersonnelSubtype =>
          PERSONNEL_SUBTYPES.includes(s as PersonnelSubtype),
        )
      : [],
  }
}

/**
 * Resolve many people in ONE query, keyed by id.
 *
 * Every read that returns party edges goes through this rather than storing the
 * name on the edge - that is the duplication the split exists to prevent.
 */
export async function loadPeople(ids: Array<string | undefined>): Promise<Map<string, Person>> {
  const docs = await db.collection(PEOPLE).findByIds(ids.filter((v): v is string => !!v))
  return new Map(docs.map((d) => [String(d._id), projectPerson(d)]))
}

export async function loadPerson(id: string | undefined): Promise<Person | undefined> {
  if (!id) return undefined
  const doc = await db.collection(PEOPLE).findById(id)
  return doc ? projectPerson(doc) : undefined
}
