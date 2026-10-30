import {
  Activity, Building2, ChevronRight, FileText, LayoutDashboard, LogOut, Menu, MonitorSmartphone, Network,
  ScrollText, ShieldCheck, Users, X,
} from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '@/features/auth/store/session';
import { config } from '@/shared/config';
import { Avatar, Toaster } from '@/shared/ui/primitives';
import { ThemeSwitch } from '@/shared/ui/ThemeSwitch';
import { useAdmin } from '../store';

export const isAdmin = (roles?: string[]) => !!roles?.includes('ADMIN');

/** Solo administradores. (Real: el backend valida cada acción; aquí además se oculta la ruta.) */
export function RequireAdmin() {
  const user = useSession((s) => s.user);
  return isAdmin(user?.roles) ? <Outlet /> : <Navigate to="/inicio" replace />;
}

interface Item { to: string; label: string; icon: ReactNode; end?: boolean; badge?: number }

export function AdminShell() {
  const { user, logout } = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const pending = useAdmin((s) => s.devices.filter((d) => d.status === 'PENDING').length);

  useEffect(() => { setOpen(false); }, [pathname]);

  const groups: Array<{ title: string; items: Item[] }> = [
    { title: 'General', items: [{ to: '/admin', label: 'Resumen', icon: <LayoutDashboard className="h-[18px] w-[18px]" />, end: true }] },
    { title: 'Gestión', items: [
      { to: '/admin/usuarios', label: 'Usuarios', icon: <Users className="h-[18px] w-[18px]" /> },
      { to: '/admin/estructura', label: 'Secciones y grupos', icon: <Building2 className="h-[18px] w-[18px]" /> },
      { to: '/admin/documentos', label: 'Documentos', icon: <FileText className="h-[18px] w-[18px]" /> },
    ] },
    { title: 'Seguridad', items: [
      { to: '/admin/dispositivos', label: 'Dispositivos', icon: <MonitorSmartphone className="h-[18px] w-[18px]" />, badge: pending },
      { to: '/admin/sesiones', label: 'Sesiones activas', icon: <Activity className="h-[18px] w-[18px]" /> },
      { to: '/admin/red', label: 'Red y límites', icon: <Network className="h-[18px] w-[18px]" /> },
      { to: '/admin/auditoria', label: 'Auditoría', icon: <ScrollText className="h-[18px] w-[18px]" /> },
    ] },
  ];
  const all = groups.flatMap((g) => g.items);
  const current = all.find((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to)));

  const sidebar = (
    <nav className="flex h-full flex-col bg-surface text-ink-soft shadow-card" aria-label="Menú de administración">
      <div className="flex h-14 items-center gap-3 border-b border-line px-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white"><ShieldCheck className="h-5 w-5" /></span>
        <div className="leading-tight"><p className="text-xl font-extrabold text-brand">SisDoc</p><p className="text-[11px] uppercase tracking-widest text-ink-mute">Administración</p></div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-widest text-ink-soft">{g.title}</p>
            <ul className="space-y-0.5">
              {g.items.map((i) => (
                <li key={i.to}>
                  <NavLink to={i.to} end={i.end}
                    className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-brand-light text-brand' : 'hover:bg-paper hover:text-ink'}`}>
                    {i.icon}{i.label}
                    {!!i.badge && <span className="ml-auto rounded-full bg-amber px-2 py-0.5 text-[11px] font-bold text-white">{i.badge}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="space-y-2 border-t border-line p-3">
        <ThemeSwitch />
        <Link to="/inicio" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-paper hover:text-ink">← Volver a la aplicación</Link>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-full bg-paper">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onMouseDown={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="relative h-full w-64" onMouseDown={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 bg-surface px-4 shadow-card sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button className="icon-btn lg:hidden" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setOpen((v) => !v)}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
            <nav aria-label="Ruta" className="flex min-w-0 items-center gap-1.5 text-sm text-ink-soft">
              <span className="hidden sm:inline">Administración</span><ChevronRight className="hidden h-4 w-4 sm:block" />
              <span className="truncate font-semibold text-ink">{current?.label ?? 'Resumen'}</span>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {config.useMocks && <span className="rounded-full bg-amber px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">Demo</span>}
            <Avatar name={user!.displayName} size="sm" />
            <div className="hidden text-right leading-tight sm:block"><p className="text-sm font-semibold">{user!.displayName}</p><p className="text-xs text-ink-soft">Administrador</p></div>
            <button className="icon-btn" aria-label="Cerrar sesión" onClick={async () => { await logout(); navigate('/login'); }}><LogOut className="h-4 w-4" /></button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 sm:p-6"><Outlet /></main>
      </div>
      <Toaster />
    </div>
  );
}
