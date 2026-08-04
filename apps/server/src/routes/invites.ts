// ---------------------------------------------------------------------------
// The invite link: a read for the landing page, and the one-click redemption
// behind its Continue button.
//
// UNAUTHENTICATED by necessity — the recipient has no account yet, which makes
// the shape of these two endpoints the whole security story:
//
//   - the token is matched by HASH, so the database never held the raw value
//   - unknown and expired tokens return the SAME 404, so neither endpoint can be
//     used to probe which tokens ever existed
//   - GET grants nothing. It is a read, so a link opened by a mail scanner or a
//     link preview costs the recipient nothing.
//   - POST /accept redeems, and CONSUMES the token doing so. Receiving the email
//     is the proof of mailbox control that the OTP used to supply: the link was
//     sent to that address and nowhere else, and it works exactly once.
//
// WHY THE OTP WENT AWAY. This flow used to be "click the link → we email you a
// SECOND message with a 6-digit code → type it in": two emails and four steps to
// join a newsroom you were invited to, and the code proved the same fact the
// link already had. What is deliberately kept is that redemption needs a
// user ACTION — the page's Continue button — never a bare page load. Mail
// security products follow links in a headless browser; they do not click
// buttons. Auto-redeeming on mount would let a scanner silently burn the
// recipient's one-time token and leave them with a dead link.
//
// `hasAccount` is returned so the page knows whether to ask for a name. It does
// leak whether one address is registered — but only to someone already holding
// a valid invite token naming that exact address, who was told as much by the
// person who invited them.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { db } from '../lib/db.js'
import { signToken } from '../lib/auth.js'
import { SUPERADMIN_SLUG, newReaderFields, withIdentityDefaults } from '../lib/identity.js'
import { resolveAccount, toClientUser } from '../lib/effectiveAccess.js'
import { getRoles } from '../lib/roleRegistry.js'
import { rateLimit } from '../lib/rateLimit.js'
import { COLLECTION as INVITES, findInviteByToken, sanitizeRedirect } from '../lib/invites.js'

type WithMongoId = { _id: string; [key: string]: unknown }
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string }
}

/** The db layer's document type isn't exported, so borrow it from findById. */
type UserDoc = Awaited<ReturnType<ReturnType<typeof db.collection>['findById']>>

/**
 * A display name from an email address, for an invite redeemed with no name given.
 *
 * The link signs people in on click, so there is no form to collect a byline from.
 * "jane.fitzgerald@x.com" → "Jane Fitzgerald" is right often enough to be a better
 * starting point than the raw address, and it is a starting point only — the
 * account holder can be renamed. A caller that DOES have a real name (the accept
 * page, when it chooses to ask) still wins: `displayName` in the body takes
 * precedence over this.
 */
function nameFromEmail(email: string): string {
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

const router = Router()

router.get('/:token', async (req, res) => {
  const invite = await findInviteByToken(String(req.params.token))
  if (!invite) {
    res.status(404).json({ error: 'This invitation link is invalid or has expired.' })
    return
  }

  const role = (await getRoles()).get(invite.role)
  if (!role) {
    res.status(409).json({
      error: 'The role attached to this invitation no longer exists. Ask for a new invite.',
    })
    return
  }

  const email = String(invite.email)
  const hasAccount = (await db.collection('users').find({ email })).length > 0

  res.json({
    invite: {
      email,
      hasAccount,
      expiresAt: invite.expiresAt,
      invitedByName: invite.invitedByName,
      // Re-sanitized on the way OUT as well as in. The row could predate the
      // guard, or have been written by another path, and this value ends up
      // driving a client-side navigation.
      redirectTo: sanitizeRedirect(invite.redirectTo),
      role: { slug: role.slug, label: role.label, description: role.description, color: role.color, icon: role.icon },
    },
  })
})

/**
 * Redeem the invite: create the account if it is new, apply the role, consume
 * the token, and hand back a session — the same `{ token, user }` shape
 * `POST /api/auth/verify-otp` returns, so the client stores it identically.
 *
 * Rate-limited even though a 32-byte token is not guessable: it is the cheap
 * backstop on an unauthenticated endpoint that writes.
 */
router.post('/:token/accept', rateLimit('invite-accept', 20, 5 * 60_000), async (req, res) => {
  const invite = await findInviteByToken(String(req.params.token))
  if (!invite) {
    res.status(404).json({ error: 'This invitation link is invalid or has expired.' })
    return
  }

  const role = (await getRoles()).get(invite.role)
  if (!role) {
    res.status(409).json({
      error: 'The role attached to this invitation no longer exists. Ask for a new invite.',
    })
    return
  }

  const email = String(invite.email)
  let userDoc: UserDoc = (await db.collection('users').find({ email }))[0] ?? null

  if (!userDoc) {
    // A name if one was sent, otherwise one derived from the address. The link
    // signs them in on click, so there is no form in the way to collect it.
    const sent =
      typeof req.body?.displayName === 'string' ? req.body.displayName.trim().slice(0, 80) : ''
    const displayName = sent || nameFromEmail(email)
    const id = await db.collection('users').insertOne({
      email,
      displayName,
      createdAt: new Date().toISOString(),
      ...newReaderFields(),
    })
    userDoc = await db.collection('users').findById(id)
    if (!userDoc) {
      res.status(500).json({ error: 'Could not create your account. Please try again.' })
      return
    }
  }

  // ONE ROLE PER PERSON, so this REPLACES rather than appends — matching
  // `POST /api/roles/:slug/assign` and the existing-account branch of
  // `POST /api/staff`. The one exception is superadmin: an invite must never be
  // the thing that quietly demotes the account that cannot be restored without
  // shell access. Every other path guards that with `checkSuperadminLoss`; there
  // is no acting admin here to report a refusal to, so the invite is simply
  // applied as a no-op and they are signed in.
  const current = withIdentityDefaults(project(userDoc))
  if (current.staffRoleSlug !== SUPERADMIN_SLUG) {
    // P1 dual-write: both axes in one $set, as everywhere else.
    await db
      .collection('users')
      .updateOne(String(userDoc._id), { staffRoles: [role.slug], staffRoleSlug: role.slug })
  }

  // Consume EVERY invite for this address, not just the redeemed one. Leaving a
  // sibling row behind is what makes the role a coin flip: the apply-on-sign-in
  // path in routes/auth.ts unions whatever it finds and takes the first slug, so
  // a second staged invite could silently change the role they just accepted.
  const siblings = await db.collection(INVITES).find({ email })
  await Promise.all(siblings.map((row) => db.collection(INVITES).deleteOne(row._id)))

  const fresh = await db.collection('users').findById(String(userDoc._id))
  const identity = withIdentityDefaults(project(fresh ?? userDoc))
  const session = signToken({
    sub: identity.id,
    email: identity.email,
    // Pins the session to the account's current generation, exactly as sign-in
    // does — so bumping `tokenVersion` still signs this session out.
    v: typeof (fresh ?? userDoc).tokenVersion === 'number' ? (fresh ?? userDoc).tokenVersion : 0,
  })

  res.json({
    token: session,
    user: toClientUser(await resolveAccount(identity)),
    // Re-sanitized on the way out; it drives a client-side navigation.
    redirectTo: sanitizeRedirect(invite.redirectTo),
  })
})

export default router
