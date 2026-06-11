/** Maps each page type to its locked layout component (used by editor + viewer). */

import type { FC } from 'react';
import type { PageTypeKey } from '@/types/magazine';
import { CoverPage, PresidentPage, EditorLetterPage, DiscussionPage, HeadlinePage, YoungOwnersPage } from './pagesA';
import { WomenPage, RegionNorthPage, RegionSouthPage, LoungePage, KarakaPage, CelebrationPage } from './pagesB';
import { FuturePage, BreederPage, WelfarePage, BusinessPage, LeaderboardsPage, GamificationPage } from './pagesC';
import { PredictionsPage, FollowupPage, EducationPage, WinningPage, VoicePage, BackCoverPage } from './pagesD';

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
};
