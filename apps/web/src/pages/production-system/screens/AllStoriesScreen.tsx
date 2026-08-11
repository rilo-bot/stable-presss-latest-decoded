import { AllStoriesView } from '../../newsroom/views/AllStoriesView';
import { usePS } from '../context';

export default function AllStoriesScreen() {
  const s = usePS();
  return (
    <AllStoriesView
      isContributor={s.isContributor}
      roleLabel={s.roleLabel}
      accentColor={s.accentColor}
      searchQuery={s.searchQuery}
      setSearchQuery={s.setSearchQuery}
      filteredArticles={s.filteredArticles}
      onNewInColumn={s.handleNewInColumn}
      onOpenStudio={s.handleOpenStudio}
      currentUserDisplayName={s.currentUser?.name}
      onEdit={s.handleEdit}
    />
  );
}
