import { CompensationView } from '../../newsroom/views/CompensationView';
import { usePS } from '../context';

export default function CompensationScreen() {
  const s = usePS();
  return (
    <>
      <CompensationView
        articles={s.articles ?? []}
        currentUserDisplayName={s.currentUser?.displayName}
        onNavigate={s.goToModule}
        onNewInColumn={s.handleNewInColumn}
        onOpenStudio={s.handleOpenStudio}
      />
    </>
  );
}
