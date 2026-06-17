/**
 * HorseEditor — the editable horse page in the private studio namespace at
 * `/studio/horse/:id` (under RequireAuth), separate from the read-only public
 * page `/horses/:id`. Renders the shared HorseProfile container in "edit" mode.
 * HorseProfile redirects a signed-in non-owner to the public page once links load.
 */
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { HorseProfile } from '@/components/profile/HorseProfile';

export default function HorseEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return <Navigate to="/horses" replace />;
  return <HorseProfile horseId={id} mode="edit" onBack={() => navigate(-1)} />;
}
