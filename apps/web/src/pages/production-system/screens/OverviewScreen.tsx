import { OverviewView } from '../../newsroom/views/OverviewView';
import { usePS } from '../context';

export default function OverviewScreen() {
  const s = usePS();
  return (
    <OverviewView
      isContributor={s.isContributor}
      myStories={s.myStories}
      totalStories={s.totalStories}
      roleLabel={s.roleLabel}
      accentColor={s.accentColor}
      pendingReview={s.pendingReview}
      onNavigate={s.goToModule}
      setActiveColumn={s.setActiveColumn}
      mediaItems={s.ps.mediaItems ?? []}
      racingEntries={s.ps.racingEntries ?? []}
      scheduledCount={s.scheduledCount}
      publishedCount={s.publishedCount}
      buckets={s.buckets}
      onNewInColumn={s.handleNewInColumn}
      onOpenStudio={s.handleOpenStudio}
      filteredArticles={s.filteredArticles}
      currentUserDisplayName={s.currentUser?.displayName}
      onEdit={s.handleEdit}
    />
  );
}
