/** Maps each page type to its locked layout component (used by editor + viewer). */

import type { FC } from 'react';
import type { PageTypeKey } from '@/types/magazine';
import { CoverPage, PresidentPage, EditorLetterPage, DiscussionPage, HeadlinePage, YoungOwnersPage } from './pagesA';
import { WomenPage, RegionNorthPage, RegionSouthPage, LoungePage, KarakaPage, CelebrationPage } from './pagesB';
import { FuturePage, BreederPage, WelfarePage, BusinessPage, LeaderboardsPage, GamificationPage } from './pagesC';
import { PredictionsPage, FollowupPage, EducationPage, WinningPage, VoicePage, BackCoverPage } from './pagesD';
import { CoverPremium, HeadlinePremium, PresidentPremium, EditorPremium, DiscussionPremium, YoungOwnersPremium } from './premium/pages';
import { WomenPremium } from './premium/women.page';
import { RegionNorthPremium } from './premium/regionNorth.page';
import { RegionSouthPremium } from './premium/regionSouth.page';
import { LoungePremium } from './premium/lounge.page';
import { KarakaPremium } from './premium/karaka.page';
import { CelebrationPremium } from './premium/celebration.page';
import { FuturePremium } from './premium/future.page';
import { BreederPremium } from './premium/breeder.page';
import { WelfarePremium } from './premium/welfare.page';
import { BusinessPremium } from './premium/business.page';
import { LeaderboardsPremium } from './premium/leaderboards.page';
import { GamificationPremium } from './premium/gamification.page';
import { PredictionsPremium } from './premium/predictions.page';
import { FollowupPremium } from './premium/followup.page';
import { EducationPremium } from './premium/education.page';
import { WinningPremium } from './premium/winning.page';
import { VoicePremium } from './premium/voice.page';
import { BackCoverPremium } from './premium/backCover.page';

export const PAGE_COMPONENTS: Record<PageTypeKey, FC> = {
  cover: CoverPage,
  'president-update': PresidentPage,
  'editor-letter': EditorLetterPage,
  'important-discussion': DiscussionPage,
  'headline-story': HeadlinePage,
  'young-owners': YoungOwnersPage,
  'women-in-racing': WomenPage,
  'regional-north': RegionNorthPage,
  'regional-south': RegionSouthPage,
  'owners-lounge': LoungePage,
  'karaka-sales': KarakaPage,
  'celebration-wall': CelebrationPage,
  'future-together': FuturePage,
  'breeder-feature': BreederPage,
  'horse-welfare': WelfarePage,
  'business-owners': BusinessPage,
  leaderboards: LeaderboardsPage,
  gamification: GamificationPage,
  predictions: PredictionsPage,
  'predictions-followup': FollowupPage,
  'ownership-education': EducationPage,
  'winning-moments': WinningPage,
  'owners-voice': VoicePage,
  'back-cover': BackCoverPage,
  // Premium template (#2)
  'cover-px': CoverPremium,
  'headline-px': HeadlinePremium,
  'president-px': PresidentPremium,
  'editor-px': EditorPremium,
  'discussion-px': DiscussionPremium,
  'young-owners-px': YoungOwnersPremium,
  'women-in-racing-px': WomenPremium,
  'regional-north-px': RegionNorthPremium,
  'regional-south-px': RegionSouthPremium,
  'owners-lounge-px': LoungePremium,
  'karaka-sales-px': KarakaPremium,
  'celebration-wall-px': CelebrationPremium,
  'future-together-px': FuturePremium,
  'breeder-feature-px': BreederPremium,
  'horse-welfare-px': WelfarePremium,
  'business-owners-px': BusinessPremium,
  'leaderboards-px': LeaderboardsPremium,
  'gamification-px': GamificationPremium,
  'predictions-px': PredictionsPremium,
  'predictions-followup-px': FollowupPremium,
  'ownership-education-px': EducationPremium,
  'winning-moments-px': WinningPremium,
  'owners-voice-px': VoicePremium,
  'back-cover-px': BackCoverPremium,
};
