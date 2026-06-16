/**
 * Studio — the member's editable profile at its own route (`/studio/:id`),
 * separate from the public `/parties/:id`. Renders the shared PartyProfile
 * container in "edit" mode. Only the owner (or staff) may open it; everyone else
 * is sent to the public page.
 */
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { canManageParty, isStaff } from '@/rbac/can';
import { PartyProfile } from '@/components/profile/PartyProfile';

export default function Studio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser);

  if (!id) return <Navigate to="/dashboard" replace />;
  if (!canManageParty(currentUser, id) && !isStaff(currentUser)) {
    return <Navigate to={`/parties/${id}`} replace />;
  }

  return <PartyProfile partyId={id} mode="edit" onBack={() => navigate('/dashboard')} />;
}
