/**
 * HorseDetail — the public horse page at `/horses/:id`. Thin wrapper around the
 * shared HorseProfile container in read-only ("view") mode — no edit chrome. The
 * editable twin lives in the private studio at `/studio/horse/:id`
 * (pages/HorseEditor.tsx), which renders the same component in "edit" mode.
 */
import { useParams, Navigate } from 'react-router-dom';
import { HorseProfile } from '@/components/profile/HorseProfile';

export default function HorseDetail() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/horses" replace />;
  return <HorseProfile horseId={id} mode="view" />;
}
