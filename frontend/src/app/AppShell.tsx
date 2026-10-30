import { useQuery } from '@tanstack/react-query';
import { Bell, FileText, Home, KeyRound, LayoutDashboard, LogOut, MessageCircle, Search, ShieldCheck, User, Users } from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { isAdmin } from '@/features/admin/components/AdminShell';
import { IdleGuard } from '@/features/auth/components/IdleGuard';
import { useSession } from '@/features/auth/store/session';
import { chatApi } from '@/features/chat/api/chat.api';
import { unreadNotices, useSocial } from '@/features/social/store';
import { config } from '@/shared/config';
import { Avatar, Toaster, proto } from '@/shared/ui/primitives';
import { ThemeSwitch } from '@/shared/ui/ThemeSwitch';

const Badge = ({ n }: { n: number }) =>
  n > 0 ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">{n > 9 ? '9+' : n}</span> : null;

export function AppShell() {
  const { user, logout } = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notices = useSocial((s) => s.notices);

  const { data: conversations } = useQuery({ queryKey: ['conversations'], queryFn: chatApi.conversations, refetchInterval: 60_000 });
  const unreadChats = conversations?.filter((c) => c.unread > 0 && !c.muted).length ?? 0;
  const unreadNots = unreadNotices(notices);

  useEffect(() => { setMenu(false); }, [pathname]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const inChatThread = /^\/mensajes\/.+/.test(pathname);
  const tabs: Array<{ to: string; label: string; icon: ReactNode; badge?: number }> = [
    { to: '/inicio', label: 'Inicio', icon: <Home className="h-6 w-6" /> },
    { to: '/grupos', label: 'Grupos', icon: <Users className="h-6 w-6" /> },
    { to: '/documentos', label: 'Documentos', icon: <FileText className="h-6 w-6" /> },
  ];

  const doLogout = async () => { await logout(); navigate('/login'); };

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 bg-surface px-3 shadow-card">
        {/* izquierda */}
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/inicio" className="flex items-center gap-2" aria-label="SisDoc, ir al inicio">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white"><ShieldCheck className="h-6 w-6" /></span>
            <span className="hidden text-xl font-extrabold text-brand lg:block">SisDoc</span>
          </Link>
          {config.useMocks && <span className="rounded-full bg-amber px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white" title="Sin servidor: datos de demostración">Demo</span>}
          <div className="relative hidden sm:block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
            <input className="w-56 rounded-full bg-paper py-2.5 pl-10 pr-4 text-[15px] placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-brand/30 lg:w-64"
              placeholder="Buscar en SisDoc" aria-label="Buscar" onFocus={(e) => { e.currentTarget.blur(); proto('La búsqueda global'); }} />
          </div>
          <button className="icon-btn sm:hidden" aria-label="Buscar" onClick={() => proto('La búsqueda global')}><Search className="h-5 w-5" /></button>
        </div>

        {/* centro (escritorio) */}
        <nav className="absolute left-1/2 hidden h-full -translate-x-1/2 md:flex" aria-label="Principal">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} aria-label={t.label} title={t.label}
              className={({ isActive }) => `relative flex h-full w-20 items-center justify-center border-b-[3px] transition lg:w-28 ${isActive ? 'border-brand text-brand' : 'border-transparent text-ink-soft hover:bg-paper'}`}>
              {t.icon}
            </NavLink>
          ))}
        </nav>

        {/* derecha */}
        <div className="flex items-center gap-2">
          <NavLink to="/mensajes" className="icon-btn relative" aria-label="Mensajes" title="Mensajes"><MessageCircle className="h-5 w-5" /><Badge n={unreadChats} /></NavLink>
          <NavLink to="/notificaciones" className="icon-btn relative hidden md:inline-flex" aria-label="Notificaciones" title="Notificaciones"><Bell className="h-5 w-5" /><Badge n={unreadNots} /></NavLink>
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenu((v) => !v)} aria-label="Menú de cuenta" aria-expanded={menu} className="rounded-full"><Avatar name={user!.displayName} /></button>
            {menu && (
              <div className="animate-rise absolute right-0 top-12 w-80 rounded-xl bg-surface p-2 shadow-pop" role="menu">
                <Link to="/perfil" className="flex items-center gap-3 rounded-lg p-2.5 shadow-card hover:bg-paper" role="menuitem">
                  <Avatar name={user!.displayName} size="lg" />
                  <span className="min-w-0"><span className="block truncate font-semibold">{user!.displayName}</span><span className="text-sm text-ink-soft">Ver tu perfil</span></span>
                </Link>
                <Link to="/cambiar-clave" className="mt-1 flex items-center gap-3 rounded-lg p-2.5 hover:bg-paper" role="menuitem"><span className="icon-btn !h-9 !w-9"><KeyRound className="h-4 w-4" /></span>Cambiar contraseña</Link>
                <Link to="/perfil" className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-paper md:hidden" role="menuitem"><span className="icon-btn !h-9 !w-9"><User className="h-4 w-4" /></span>Mi perfil</Link>
                {isAdmin(user!.roles) && (
                  <Link to="/admin" className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-paper" role="menuitem">
                    <span className="icon-btn !h-9 !w-9 !bg-brand-light !text-brand"><LayoutDashboard className="h-4 w-4" /></span>Panel administrativo
                    <span className="ml-auto rounded-full bg-brand-light px-2 py-0.5 text-[10px] font-bold uppercase text-brand">Admin</span>
                  </Link>
                )}
                <div className="px-1 pb-1 pt-2"><p className="label !mb-1 px-1">Apariencia</p><ThemeSwitch /></div>
                <button onClick={doLogout} className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-paper" role="menuitem"><span className="icon-btn !h-9 !w-9"><LogOut className="h-4 w-4" /></span>Cerrar sesión</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className={inChatThread ? '' : 'pb-16 md:pb-0'}><Outlet /></main>

      {/* barra inferior (móvil / app) */}
      {!inChatThread && (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface md:hidden" aria-label="Principal móvil">
          {[...tabs, { to: '/mensajes', label: 'Mensajes', icon: <MessageCircle className="h-6 w-6" />, badge: unreadChats },
            { to: '/notificaciones', label: 'Avisos', icon: <Bell className="h-6 w-6" />, badge: unreadNots }].map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${isActive ? 'text-brand' : 'text-ink-mute'}`}>
              <span className="relative">{t.icon}<Badge n={t.badge ?? 0} /></span>{t.label}
            </NavLink>
          ))}
        </nav>
      )}
      <Toaster />
      <IdleGuard />
    </div>
  );
}
