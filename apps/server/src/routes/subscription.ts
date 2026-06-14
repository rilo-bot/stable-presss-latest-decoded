import { Router } from 'express';
import { db } from '../lib/db.js';
import { attachAccount } from '../lib/auth.js';
import { withIdentityDefaults, type SubscriptionTier } from '../lib/identity.js';

const router = Router();
router.use(attachAccount);

const TIERS: SubscriptionTier[] = ['free', 'standard', 'premium'];

/**
 * Set the current user's subscription tier. Manual for now (no billing) — this
 * is the seam a real payment flow plugs into later. See RBAC.md §8 / §10.
 *
 *   POST /api/subscription  { tier }
 */
router.post('/', async (req, res) => {
  const account = req.account!;
  const tier = req.body?.tier as SubscriptionTier;
  if (!TIERS.includes(tier)) {
    res.status(400).json({ error: 'A valid subscription tier is required.' });
    return;
  }
  await db.collection('users').updateOne(account.id, { subscriptionTier: tier });
  const fresh = await db.collection('users').findById(account.id);
  res.json({ user: withIdentityDefaults({ id: fresh!._id, ...fresh }) });
});

export default router;
