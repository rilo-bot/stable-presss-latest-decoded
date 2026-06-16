/**
 * PartyDetail — the public party page at `/parties/:id`. Thin wrapper around the
 * shared PartyProfile container in read-only ("view") mode. The editable twin is
 * `/studio/:id` (pages/Studio.tsx), which renders the same component in "edit".
 */
import { useParams, Navigate } from 'react-router-dom';
import { PartyProfile } from '@/components/profile/PartyProfile';

export default function PartyDetail() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/parties" replace />;
  return <PartyProfile partyId={id} mode="view" />;
}
