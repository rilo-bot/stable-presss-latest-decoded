import { useNavigate } from 'react-router-dom';

import { MagazineStudio } from '../../newsroom/production-systems/MagazineStudio';
import { PS_BASE } from '../../newsroom/constants';
import { usePS } from '../context';

/**
 * Reached from Overview rather than the sidebar. MagazineStudio renders its own
 * header, so this screen deliberately omits PageHeader — and now that it is a
 * real route, the "Back to Workflow" button it used to need is just the
 * browser's back button.
 */
export default function MagazineStudioScreen() {
  const s = usePS();
  const navigate = useNavigate();
  return (
    <MagazineStudio
      magazines={s.magazines}
      magIssues={s.magIssues}
      onNewMagazine={s.handleNewMagazine}
      onOpenMagazine={(id) => navigate(`${PS_BASE}/magazine/${id}`)}
      onDeleteMagazine={s.deleteMagazine}
      onUpdateEdition={s.handleUpdateEdition}
      onUnpublishEdition={s.handleUnpublishEdition}
      onDeleteEdition={s.handleDeleteEdition}
    />
  );
}
