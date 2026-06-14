/**
 * Studio — the member's dedicated editing screen, on its OWN route (`/studio/:id`),
 * separate from the public `/parties/:id` page. It renders PartyStudio: the same
 * ornate magazine UI as the details page, but as an editable form-first hub.
 * Only the owner (or staff) may open it; everyone else is sent to the public page.
 */
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { canManageParty, isStaff } from '@/rbac/can';
import { PartyStudio } from '@/components/PartyStudio';

export default function Studio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser);

  if (!id) return <Navigate to="/dashboard" replace />;
  if (!canManageParty(currentUser, id) && !isStaff(currentUser)) {
    return <Navigate to={`/parties/${id}`} replace />;
  }

  return <PartyStudio partyId={id} onBack={() => navigate('/dashboard')} />;
}
