// ---------------------------------------------------------------------------
// Public site metrics for the landing page.
//
// These are COMPUTED live from real collections — there is no stored "metrics"
// document and nothing to manage. GET is public (the marketing hero renders
// them); there are no writes.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { db } from '../../lib/db.js';

const router = Router();

// Article statuses that count as "published" on the public site.
const PUBLISHED_STATUSES = ['published', 'newsletter', 'bulletin'];

// GET /api/metrics — site-wide counts derived from live data.
router.get('/', async (_req, res) => {
  // P2: counts, not fetches. This is a PUBLIC, uncached endpoint that was pulling
  // every user, article, tip and tipper profile into the API process just to read
  // four `.length` values — the worst per-request cost of the ten scan sites.
  const [activeMembers, articlesPublished, tipsPlaced, leaderboardLeaders] = await Promise.all([
    db.collection('users').count(),
    db.collection('articles').count({ status: { $in: PUBLISHED_STATUSES } }),
    db.collection('tips').count(),
    db.collection('tipperProfiles').count(),
  ]);

  res.json({ activeMembers, articlesPublished, tipsPlaced, leaderboardLeaders });
});

export default router;
