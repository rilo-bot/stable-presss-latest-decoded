/**
 * MagazineStudio — the full-screen magazine editor on its OWN route
 * (`/production-system/magazine/:id`), separate from the Newsroom workflow page. This makes
 * an edit session deep-linkable (e.g. to share with a collaborator), keeps the
 * browser Back button and refresh working, and decouples the heavyweight editor
 * from the Newsroom component tree.
 *
 * Staff-gating is handled by the parent route (RequireStaff); per-magazine access
 * (owner/collaborator, page scope, not-found) is resolved inside MagazineEditor.
 */
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { MagazineEditor } from '@/editor/MagazineEditor';

export default function MagazineStudio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) return <Navigate to="/production-system" replace />;

  return <MagazineEditor magazineId={id} onClose={() => navigate('/production-system')} />;
}
