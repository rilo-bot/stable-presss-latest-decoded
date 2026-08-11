// The account lifecycle: find-or-create an account, and turn one into a session.
//
// WHY THIS FILE EXISTS. Four routes and a CLI script each hand-rolled the same
// two sequences — `USERS.insertOne` with the right defaults, and
// project → sign → resolve → toClientUser. The leaf helpers were always single
// (`signToken`, `assignRole`, `resolveAccount`), but nobody had named the
// SEQUENCE, so every caller retyped it and the copies drifted: the invite route
// refused to overwrite a superadmin, the sign-in route did the same assignment
// with no guard at all.
//
// Everything that mints an account or issues a session goes through here now.

import { db } from './db.js'
import { USERS } from './collections.js'
import { signToken } from './auth.js'
import { newUserFields, withIdentityDefaults } from './identity.js'
import { resolveAccount, toClientUser } from './effectiveAccess.js'
import { project, type WithMongoId } from './project.js'

/** The db layer's document type isn't exported, so borrow it from findById. */
export type UserDoc = NonNullable<
  Awaited<ReturnType<ReturnType<typeof db.collection>['findById']>>
>

/** What every sign-in path returns to the client. */
export interface Session {
  token: string
  user: Record<string, unknown>
}

/** "jane.fitzgerald@x.com" → "Jane Fitzgerald". A starting point; renameable. */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const words = local
    .split(/[._\-+]+/)
    .filter(Boolean)
    // Strip a trailing disambiguator ("jane.f2") rather than title-casing digits.
    .map((w) => w.replace(/\d+$/, ''))
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  return words.join(' ').slice(0, 80) || email.slice(0, 80)
}

export async function findUserByEmail(email: string): Promise<UserDoc | null> {
  if (!email) return null
  return (await db.collection(USERS).find({ email }))[0] ?? null
}

/**
 * THE account creator. Every path that can bring an account into existence —
 * sign-in, invite redemption, the bootstrap seed, the CLI — calls this one.
 *
 * A brand-new account holds NO role: `newUserFields()` sets `isAdmin: false`, and
 * no `adminRoles` link row is written. Becoming an admin is always a separate,
 * deliberate act by someone who already has the right to perform it.
 *
 * The duplicate-key catch is not belt-and-braces — it is the actual concurrency
 * fix. Every caller previously did find-then-insert, which has a window where
 * two simultaneous requests both see "no account" and both insert. The unique
 * partial index on `users.email` is what closes it, so losing that race is a
 * normal outcome here and simply re-reads the winner.
 */
export async function findOrCreateUser(
  email: string,
  name?: string,
): Promise<{ user: UserDoc; created: boolean }> {
  const existing = await findUserByEmail(email)
  if (existing) return { user: existing, created: false }

  const now = new Date().toISOString()
  try {
    const id = await db.collection(USERS).insertOne({
      email,
      name: (name ?? '').trim().slice(0, 80) || nameFromEmail(email),
      createdAt: now,
      updatedAt: now,
      ...newUserFields(),
    })
    const created = await db.collection(USERS).findById(id)
    if (!created) throw new Error(`[session] user ${id} was not readable right after insert`)
    return { user: created, created: true }
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      const winner = await findUserByEmail(email)
      if (winner) return { user: winner, created: false }
    }
    throw err
  }
}

/**
 * THE session issuer. Turns a user document into `{ token, user }`.
 *
 * The JWT carries `{ sub, email, v }` and NOTHING about authorization — every
 * permission is resolved live per request, so a role change lands on the next
 * call rather than the next sign-in.
 */
export async function issueSession(userDoc: UserDoc): Promise<Session> {
  const identity = withIdentityDefaults(project(userDoc as WithMongoId))
  const token = signToken({
    sub: identity.id,
    email: identity.email,
    v: typeof userDoc.tokenVersion === 'number' ? userDoc.tokenVersion : 0,
  })
  return { token, user: toClientUser(await resolveAccount(identity)) }
}

/** The ONE writer of `lastLogin`, and only once every sign-in gate has passed. */
export async function markSignedIn(userDoc: UserDoc): Promise<UserDoc> {
  const lastLogin = new Date().toISOString()
  await db.collection(USERS).updateOne(String(userDoc._id), { lastLogin })
  return { ...userDoc, lastLogin }
}

/**
 * End EVERY session for this account, including ones on other devices.
 *
 * THE ONLY WAY TO REVOKE A BEARER JWT. Once signed, a token cannot be taken
 * back, so `attachAccount` compares the token's `v` against `users.tokenVersion`
 * on every request; bumping the stored number strands every token issued before
 * it. `resolveAccount` already loads the document, so the check is free.
 *
 * This existed as a CHECK with no WRITER — `isRevoked` has always read
 * `tokenVersion`, the comments described "sign out everywhere", and nothing in
 * the codebase ever incremented it. A leaked token was therefore good for its
 * full 7 days and the only remedy was soft-deleting the account, which also
 * takes their bylines and uploads.
 *
 * Returns the new version. Read-modify-write rather than `$inc` because the db
 * wrapper only issues `$set`; the race (two revokes at once landing the same
 * number) is harmless — both intended to invalidate the same prior tokens.
 */
export async function revokeAllSessions(userId: string): Promise<number> {
  if (!userId) throw new Error('revokeAllSessions needs a userId')
  const doc = await db.collection(USERS).findById(userId)
  if (!doc) throw new Error(`revokeAllSessions: no account ${userId}`)
  const next = (typeof doc.tokenVersion === 'number' ? doc.tokenVersion : 0) + 1
  await db.collection(USERS).updateOne(userId, {
    tokenVersion: next,
    updatedAt: new Date().toISOString(),
  })
  return next
}
