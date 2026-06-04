import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export function ProtectedRoute() {
  const currentUser = useAuthStore((s) => s.currentUser);
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
