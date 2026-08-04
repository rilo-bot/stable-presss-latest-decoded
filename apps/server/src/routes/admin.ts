import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../lib/db.js';
import { withIdentityDefaults, newReaderFields } from '../lib/identity.js';
import { SUPERADMIN_SLUG, superadminHolderCount } from '../lib/roleRegistry.js';
import { rateLimit } from '../lib/rateLimit.js';
import { seedRoles } from '../lib/seedRoles.js';

const router = Router();

/**
 * Compare a submitted secret without leaking it through timing.
 *
 * Both sides are SHA-256'd to a fixed 32 bytes first. That is not for secrecy —
 * it is so `timingSafeEqual` gets two equal-length buffers (it throws otherwise)
 * without the guard itself branching on length, which would leak how long the
 * real secret is.
 */
export function secretMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string' || given.length === 0) return false;
  const a = crypto.createHash('sha256').update(given, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

// Minting a superadmin was the ONLY unthrottled write in the product — magazine
// saves are capped at 300/min and AI chat at 20/min, while unlimited guesses at
// SETUP_SECRET were free. Keyed by IP here, since there is no account yet.
const seedLimit = rateLimit('admin-seed', 5, 15 * 60_000);

/**
 * Bootstrap the FIRST superadmin. Guarded by SETUP_SECRET (disabled if unset)
 * AND self-disabling once a superadmin exists.
 *
 * This is the only way the first superadmin can exist — every other role grant
 * requires an already-authenticated account holding `roles.manage`. Superadmin
 * short-circuits `accountCan` before any registry lookup, so an account seeded
 * here keeps full access even if the `roles` collection is empty or corrupt.
 *
 * WHY IT SELF-DISABLES. While SETUP_SECRET is set this route is an unauthenticated
 * path to unrestricted platform access, and the previous advice — "unset the env
 * var once you've seeded" — made that a standing backdoor if anyone forgot. Now it
 * refuses the moment `superadminHolderCount()` is non-zero, so it closes itself
 * the instant it has done its job. The count is one indexed query (P2), which is
 * what makes checking it on every attempt free.
 *
 * RECOVERY, if you are locked out: `npx tsx scripts/grant-superadmin.ts <email>`.
 * That deliberately requires MONGODB_URI — i.e. infrastructure access — rather
 * than being reachable over HTTP. Re-opening this endpoint would recreate exactly
 * the backdoor it just closed.
 *
 * The staff role is ONE per user (docs/USER-MODEL-PLAN.md §1.2), so seeding
 * REPLACES whatever staff role the target held. Multiple superadmin *accounts* are
 * still supported — each is its own user row with `staffRoleSlug: 'superadmin'` —
 * but this route only ever creates the first one.
 *
 *   POST /api/admin/seed  { secret, email, displayName? }
 */
router.post('/seed', seedLimit, async (req, res) => {
  const secret = process.env.SETUP_SECRET;
  if (!secret) {
    res.status(403).json({ error: 'Admin seeding is disabled (SETUP_SECRET not set).' });
    return;
  }
  if (!secretMatches(req.body?.secret, secret)) {
    res.status(403).json({ error: 'Invalid setup secret.' });
    return;
  }

  // Checked AFTER the secret so an anonymous caller cannot use this endpoint to
  // discover whether the platform has been set up yet.
  const holders = await superadminHolderCount();
  if (holders > 0) {
    res.status(409).json({
      error:
        'A superadmin already exists, so this bootstrap endpoint is closed. Grant further ' +
        'roles from Roles & Permissions, or run scripts/grant-superadmin.ts if you are locked out.',
    });
    return;
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'A valid email is required.' });
    return;
  }
  const displayName =
    typeof req.body?.displayName === 'string' && req.body.displayName.trim()
      ? req.body.displayName.trim()
      : email.split('@')[0];

  // Make sure the superadmin role row exists before anyone is given the slug,
  // so the Roles screen can render it immediately after seeding.
  await seedRoles();

  const now = new Date().toISOString();
  const existing = (await db.collection('users').find({ email }))[0];

  if (existing) {
    const previous = existing.staffRoleSlug ? String(existing.staffRoleSlug) : null;

    // `staffRoleSlug` is CANONICAL since P2, and the staff axis is one-per-user. The
    // array is SET, not appended to: `addToSet` was the pre-P2 multi-role write, and
    // it left rows like `staffRoles: ['editor','superadmin']` disagreeing with the
    // field beside them — the exact drift the model change removed, on the one path
    // that hands out unrestricted access. `withIdentityDefaults` derives the array
    // from the field anyway, so this only keeps the stored document honest until P3
    // drops it.
    const update: Record<string, unknown> = {
      staffRoleSlug: SUPERADMIN_SLUG,
      staffRoles: [SUPERADMIN_SLUG],
      updatedAt: now,
    };

    // A suspended account is refused by isRevoked() on every request, so promoting
    // one used to report success while leaving them unable to sign in at all. Being
    // named superadmin is an explicit decision to let this person in.
    const wasSuspended = existing.status === 'suspended';
    if (wasSuspended) update.status = 'active';

    await db.collection('users').updateOne(String(existing._id), update);
    const fresh = await db.collection('users').findById(existing._id);

    // The only audit trail available: by definition there is no other superadmin to
    // notify, and no acting account to attribute it to. A loud server-log line is
    // what makes the grant visible after the fact.
    console.warn(
      `[admin] SUPERADMIN GRANTED to existing user ${email} (id ${String(existing._id)}) ` +
        `from ${req.ip ?? 'unknown ip'} at ${now}` +
        (previous ? ` — replaced staff role "${previous}"` : '') +
        (wasSuspended ? ' — account was SUSPENDED and has been reactivated' : ''),
    );

    res.json({
      user: withIdentityDefaults({ id: fresh!._id, ...fresh }),
      created: false,
      replacedStaffRole: previous,
      reactivated: wasSuspended,
    });
    return;
  }

  const id = await db.collection('users').insertOne({
    email,
    displayName,
    createdAt: now,
    updatedAt: now,
    ...newReaderFields(),
    // Overrides newReaderFields()'s nulls. Both written so the stored document and
    // the derived read agree; the field is what anything actually reads.
    staffRoles: [SUPERADMIN_SLUG],
    staffRoleSlug: SUPERADMIN_SLUG,
  });
  const doc = await db.collection('users').findById(id);
  console.warn(
    `[admin] SUPERADMIN GRANTED to NEW account ${email} (id ${String(id)}) ` +
      `from ${req.ip ?? 'unknown ip'} at ${now}`,
  );
  res.status(201).json({ user: withIdentityDefaults({ id: doc!._id, ...doc }), created: true });
});

export default router;
