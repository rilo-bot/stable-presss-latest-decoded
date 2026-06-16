/**
 * HorseDetail — the public horse page at `/horses/:id`. Thin wrapper around the
 * shared HorseProfile container in read-only ("view") mode. The editable twin is
 * `/horses/:id/edit` (pages/HorseEditor.tsx), which renders the same component in
 * "edit" mode.
 */
import { useParams, Navigate } from 'react-router-dom';
import { HorseProfile } from '@/components/profile/HorseProfile';

export default function HorseDetail() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/horses" replace />;
  return <HorseProfile horseId={id} mode="view" />;
}
