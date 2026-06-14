// ---------------------------------------------------------------------------
// Public site metrics for the landing page.
//
// These are COMPUTED live from real collections — there is no stored "metrics"
// document and nothing to manage. GET is public (the marketing hero renders
// them); there are no writes.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { db } from '../lib/db.js';

const router = Router();

// Article statuses that count as "published" on the public site.
const PUBLISHED_STATUSES = ['published', 'newsletter', 'bulletin'];

// GET /api/metrics — site-wide counts derived from live data.
router.get('/', async (_req, res) => {
  const [users, articles, tips, tipperProfiles] = await Promise.all([
    db.collection('users').find(),
    db.collection('articles').find(),
    db.collection('tips').find(),
    db.collection('tipperProfiles').find(),
  ]);

  res.json({
    activeMembers: users.length,
    articlesPublished: articles.filter((a) => PUBLISHED_STATUSES.includes(String(a.status))).length,
    tipsPlaced: tips.length,
    leaderboardLeaders: tipperProfiles.length,
  });
});

export default router;
