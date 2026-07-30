import { AnalyticsView } from '../../newsroom/views/AnalyticsView';
import { usePS } from '../context';

export default function AnalyticsScreen() {
  const s = usePS();
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
