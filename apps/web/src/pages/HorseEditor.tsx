/**
 * HorseEditor — the editable horse page at `/horses/:id/edit` (under RequireAuth).
 * Renders the shared HorseProfile container in "edit" mode. HorseProfile itself
 * redirects a signed-in non-owner to the public `/horses/:id` once links load.
 */
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { HorseProfile } from '@/components/profile/HorseProfile';

export default function HorseEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return <Navigate to="/horses" replace />;
  return <HorseProfile horseId={id} mode="edit" onBack={() => navigate(-1)} />;
}
