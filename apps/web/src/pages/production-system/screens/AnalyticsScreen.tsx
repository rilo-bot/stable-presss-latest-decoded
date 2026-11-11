import { AnalyticsView } from '../../newsroom/views/AnalyticsView';
import { usePS } from '../context';
import { useAnalyticsOperatorActions } from '../operator-community/useAnalyticsOperatorActions';

export default function AnalyticsScreen() {
  const s = usePS();
  // The Stable Hand reads the same four figures the tiles show.
  useAnalyticsOperatorActions({
    publishedCount: s.publishedCount,
    scheduledCount: s.scheduledCount,
    totalStories: s.totalStories,
    pendingReview: s.pendingReview,
  });
  return (
    <>
      <AnalyticsView
        publishedCount={s.publishedCount}
        scheduledCount={s.scheduledCount}
        totalStories={s.totalStories}
        pendingReview={s.pendingReview}
      />
    </>
  );
}
