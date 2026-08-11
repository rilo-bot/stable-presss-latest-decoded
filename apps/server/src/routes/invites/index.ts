// The invite link. UNAUTHENTICATED by necessity - the recipient has no account.
//
//   - the token is matched by HASH, so the raw value is never stored
//   - unknown and expired tokens return the SAME 404, so neither can be probed
//   - GET grants nothing, so a mail scanner opening the link costs nothing
//   - POST /accept redeems and CONSUMES the token. Redemption needs a user
//     ACTION (the Continue button): scanners follow links, they do not click.

import { Router } from 'express'
import { db } from '../../lib/db.js'
import { findOrCreateUser, issueSession, markSignedIn } from '../../lib/session.js'

import { rateLimit } from '../../lib/rateLimit.js'
import { findInviteByToken, sanitizeRedirect } from '../../lib/invites.js'
import { INVITES, USERS } from '../../lib/collections.js'
import { assignRole, getRoles, roleOfUser } from '../../lib/roleRegistry.js'

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
  const hasAccount = (await db.collection(USERS).find({ email })).length > 0

  res.json({
    invite: {
      email,
      hasAccount,
      expiresAt: invite.expiresAt,
      invitedByName: invite.invitedByName,
      // Re-sanitized on the way out: the row could predate the guard.
      redirectTo: sanitizeRedirect(invite.redirectTo),
      role: { name: role.name, label: role.label, description: role.description, color: role.color, icon: role.icon },
    },
  })
})

/** Redeem: create the account if new, apply the role, consume the token, sign in. */
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
  // Same account creator as sign-in: a new account starts with no role, and the
  // invited role is applied deliberately, just below.
  const sent = typeof req.body?.name === 'string' ? req.body.name : undefined
  const { user: userDoc } = await findOrCreateUser(email, sent)

  // ONE ROLE PER PERSON, so this REPLACES rather than appends — matching
  // `POST /api/roles/:slug/assign` and the existing-account branch of
  // `POST /api/staff`. The one exception is superadmin: an invite must never be
  // the thing that quietly demotes the account that cannot be restored without
  // shell access. Every other path guards that with `checkSuperadminLoss`; there
  // is no acting admin here to report a refusal to, so the invite is simply
  // applied as a no-op and they are signed in.
  const held = await roleOfUser(userDoc)
  if (held?.isSuper !== true) {
    await assignRole(String(userDoc._id), role.id)
  }

  // EVERY invite for this address: a sibling row would make the role a coin flip.
  const siblings = await db.collection(INVITES).find({ email })
  await Promise.all(siblings.map((row) => db.collection(INVITES).deleteOne(row._id)))

  // Re-read so the session reflects the role just applied.
  //
  // `markSignedIn` because redeeming an invite IS a sign-in — this was the one
  // door that issued a session without stamping `lastLogin`, so everyone who
  // joined by link read as "never signed in" on the Team screen until their
  // next OTP login. Same order as /auth/verify: stamp, then issue.
  const fresh = await db.collection(USERS).findById(String(userDoc._id))
  res.json({
    ...(await issueSession(await markSignedIn(fresh ?? userDoc))),
    redirectTo: sanitizeRedirect(invite.redirectTo),
  })
})

export default router
