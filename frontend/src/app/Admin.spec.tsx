import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import * as adminData from '@/features/admin/data';
import { useAdmin } from '@/features/admin/store';
import { useSession } from '@/features/auth/store/session';
import { GROUPS, NOTICES, POSTS, STORIES } from '@/features/social/data';
import { useSocial } from '@/features/social/store';
import { mockControls } from '@/shared/api/mock/router';
import { App } from './App';

const T = { timeout: 4000 };
const ADMIN = ['admin@empresa.com', 'Clave-Segura-2026'] as const;

function renderApp(path = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
    </QueryClientProvider>,
  );
}
async function signIn(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Correo', undefined, T), email);
  await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  return user;
}
const feed = () => screen.findByRole('region', { name: 'Crear publicación' }, T);
const sidebar = () => screen.getByRole('navigation', { name: 'Menú de administración' });

beforeEach(() => {
  mockControls.reset();
  useSession.setState({ status: 'loading', user: null, notice: null });
  useSocial.setState({ posts: POSTS, stories: STORIES, groups: GROUPS, notices: NOTICES });
  useAdmin.setState({
    users: adminData.USERS, devices: adminData.DEVICES, sessions: adminData.SESSIONS,
    events: adminData.EVENTS, ipRules: adminData.IP_RULES, countries: adminData.COUNTRIES,
  });
});

async function asAdmin() {
  renderApp();
  const user = await signIn(...ADMIN);
  await feed();
  await user.click(screen.getByRole('button', { name: 'Menú de cuenta' }));
  await user.click(screen.getByRole('menuitem', { name: /Panel administrativo/ }));
  await screen.findByRole('heading', { name: 'Resumen' }, T);
  return user;
}

describe('Panel administrativo (prototipo)', () => {
  it('un usuario normal NO ve la opción en el menú y /admin lo devuelve al inicio', async () => {
    renderApp('/admin');
    const user = await signIn('ana@empresa.com', 'Clave-Segura-2026');
    await feed(); // fue redirigido al inicio, no al panel
    expect(screen.queryByRole('heading', { name: 'Resumen' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Menú de cuenta' }));
    expect(screen.queryByRole('menuitem', { name: /Panel administrativo/ })).not.toBeInTheDocument();
  });

  it('el administrador abre el panel desde el menú de la cuenta y ve el menú lateral formal', async () => {
    await asAdmin();
    for (const item of ['Resumen', 'Usuarios', 'Secciones y grupos', 'Documentos', 'Dispositivos', 'Sesiones activas', 'Red y límites', 'Auditoría']) {
      expect(within(sidebar()).getByRole('link', { name: new RegExp(item) })).toBeInTheDocument();
    }
    expect(within(sidebar()).getByRole('link', { name: /Volver a la aplicación/ })).toBeInTheDocument();
    expect(screen.getByText('Dispositivos pendientes')).toBeInTheDocument();
  });

  it('desde el resumen se aprueba un dispositivo pendiente, baja el contador y queda en la auditoría', async () => {
    const user = await asAdmin();
    const before = useAdmin.getState().devices.filter((d) => d.status === 'PENDING').length;
    await user.click(screen.getByRole('button', { name: 'Aprobar dispositivo de Pablo Rivas' }));
    expect(useAdmin.getState().devices.filter((d) => d.status === 'PENDING').length).toBe(before - 1);
    expect(useAdmin.getState().events[0].type).toBe('DEVICE_APPROVED');
  });

  it('usuarios: deshabilitar cierra sus sesiones y queda auditado; crear agrega un usuario', async () => {
    const user = await asAdmin();
    await user.click(within(sidebar()).getByRole('link', { name: /Usuarios/ }));
    expect(await screen.findByRole('table', { name: 'Usuarios' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Deshabilitar a Luis Mamani' }));
    expect(useAdmin.getState().users.find((u) => u.name === 'Luis Mamani')!.status).toBe('Deshabilitado');
    expect(useAdmin.getState().sessions.some((x) => x.user === 'Luis Mamani')).toBe(false);
    expect(useAdmin.getState().events[0]).toMatchObject({ type: 'USER_DISABLED', user: 'Luis Mamani' });

    await user.click(screen.getByRole('button', { name: /Nuevo usuario/ }));
    await user.type(screen.getByLabelText('Nombre completo'), 'Sofía Mendoza');
    await user.type(screen.getByLabelText('Correo institucional'), 'sofia@empresa.com');
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }));
    expect(await screen.findByText('Sofía Mendoza')).toBeInTheDocument();
  });

  it('usuarios: desbloquear a un usuario bloqueado y buscar por nombre', async () => {
    const user = await asAdmin();
    await user.click(within(sidebar()).getByRole('link', { name: /Usuarios/ }));
    await user.click(await screen.findByRole('button', { name: 'Desbloquear a Mario Flores' }));
    expect(useAdmin.getState().users.find((u) => u.name === 'Mario Flores')!.status).toBe('Activo');
    await user.type(screen.getByLabelText('Buscar usuario, correo o sección'), 'marta');
    const table = screen.getByRole('table', { name: 'Usuarios' });
    expect(within(table).getAllByRole('row')).toHaveLength(2); // encabezado + Marta
  });

  it('dispositivos: pestañas por estado; bloquear cierra las sesiones de ese equipo', async () => {
    const user = await asAdmin();
    await user.click(within(sidebar()).getByRole('link', { name: /Dispositivos/ }));
    await user.click(await screen.findByRole('tab', { name: /Aprobados/ }));
    await user.click(screen.getByRole('button', { name: 'Bloquear dispositivo de Luis Mamani' }));
    expect(useAdmin.getState().sessions.some((x) => x.user === 'Luis Mamani')).toBe(false);
    await user.click(screen.getByRole('tab', { name: /Bloqueados/ }));
    expect(screen.getByRole('button', { name: 'Aprobar dispositivo de Mario Flores' })).toBeInTheDocument(); // «Reactivar»
  });

  it('sesiones activas: se puede cerrar la sesión de un usuario', async () => {
    const user = await asAdmin();
    await user.click(within(sidebar()).getByRole('link', { name: /Sesiones activas/ }));
    const n = useAdmin.getState().sessions.length;
    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión de Carla Soto' }));
    expect(useAdmin.getState().sessions.length).toBe(n - 1);
  });

  it('auditoría: filtra por tipo de evento', async () => {
    const user = await asAdmin();
    await user.click(within(sidebar()).getByRole('link', { name: /Auditoría/ }));
    await user.selectOptions(await screen.findByLabelText('Filtrar por tipo de evento'), 'REFRESH_REUSE');
    const table = screen.getByRole('table', { name: 'Eventos de seguridad' });
    expect(within(table).getAllByRole('row')).toHaveLength(2); // encabezado + 1 evento
    expect(within(table).getByText('Token reutilizado')).toBeInTheDocument();
  });

  it('documentos: muestra el historial de descargas con usuario, IP y canal', async () => {
    const user = await asAdmin();
    await user.click(within(sidebar()).getByRole('link', { name: /Documentos/ }));
    await user.click(await screen.findByRole('tab', { name: /Historial de descargas/ }));
    const table = screen.getByRole('table', { name: 'Historial de descargas' });
    expect(within(table).getAllByText('Chat').length).toBeGreaterThan(0);
    expect(within(table).getAllByText(/^\d+\.\d+\.\d+\.\d+$/).length).toBeGreaterThan(0);
  });

  it('red: valida el CIDR antes de crear una regla y la agrega a la lista', async () => {
    const user = await asAdmin();
    await user.click(within(sidebar()).getByRole('link', { name: /Red y límites/ }));
    await user.click(await screen.findByRole('button', { name: /Nueva regla/ }));
    await user.type(screen.getByLabelText('IP o rango (CIDR)'), 'no-es-ip');
    await user.type(screen.getByLabelText('Descripción'), 'Sucursal Oeste');
    expect(screen.getByRole('button', { name: 'Guardar regla' })).toBeDisabled();
    await user.clear(screen.getByLabelText('IP o rango (CIDR)'));
    await user.type(screen.getByLabelText('IP o rango (CIDR)'), '200.10.5.0/24');
    await user.click(screen.getByRole('button', { name: 'Guardar regla' }));
    expect(await screen.findByText('200.10.5.0/24')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Perfiles de límite/ }));
    expect(screen.getByRole('table', { name: 'Perfiles de límite' })).toBeInTheDocument();
  });

  it('volver a la aplicación regresa al inicio', async () => {
    const user = await asAdmin();
    await user.click(screen.getAllByRole('link', { name: /Volver a la aplicación/ })[0]);
    expect(await feed()).toBeInTheDocument();
  });
});
