import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '@/shared/ui/primitives';
import { useSession } from '../store/session';

/** Protege rutas: sin sesión → login; con "debe cambiar contraseña" → solo la pantalla de cambio. */
export function RequireAuth() {
  const { status, user } = useSession();
  const location = useLocation();

  if (status === 'loading') {
    return <div className="flex h-full items-center justify-center text-brand"><Spinner className="h-7 w-7" /></div>;
  }
  if (status === 'anon') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user?.mustChangePassword && location.pathname !== '/cambiar-clave') return <Navigate to="/cambiar-clave" replace />;
  return <Outlet />;
}
