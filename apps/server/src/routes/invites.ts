// ---------------------------------------------------------------------------
// Public invite lookup — what the /invite/:token landing page reads.
//
// UNAUTHENTICATED by necessity: the recipient has no account yet. That makes
// the shape of this response the whole security story:
//
//   - the token is matched by HASH, so the database never held the raw value
//   - unknown and expired tokens return the SAME 404, so the endpoint cannot be
//     used to probe which tokens ever existed
//   - nothing is granted here. This is a read. The role is applied by the
//     normal OTP sign-in path, which requires control of the mailbox, so a
//     forwarded link gets the reader a nice page and nothing else.
//
// `hasAccount` is returned so the page knows whether to ask for a name. It does
// leak whether one address is registered — but only to someone already holding
// a valid invite token naming that exact address, who was told as much by the
// person who invited them.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { db } from '../lib/db.js'
import { getRoles } from '../lib/roleRegistry.js'
import { findInviteByToken, sanitizeRedirect } from '../lib/invites.js'

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

export default router
