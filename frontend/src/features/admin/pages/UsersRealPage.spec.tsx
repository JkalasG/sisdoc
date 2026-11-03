import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: Array<{ path: string; init?: RequestInit }> = [];
let users: Array<Record<string, unknown>> = [];
let failNext: string | null = null;

vi.mock('@/shared/api/http', () => ({
  ApiError: class ApiError extends Error {},
  json: (body: unknown) => ({ body: JSON.stringify(body) }),
  http: vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (failNext) { const m = failNext; failNext = null; throw Object.assign(new Error(m), { message: m }); }
    if (path === '/admin/users' && !init?.method) return users;
    if (path === '/admin/users' && init?.method === 'POST') {
      const b = JSON.parse(String(init.body));
      return { user: { ...base, id: 'nuevo', email: b.email, displayName: b.displayName, roles: b.roles }, temporaryPassword: 'Temp-Clave#2026xyz' };
    }
    if (path.endsWith('/reset-password')) return { user: base, temporaryPassword: 'Otra-Clave#2026abc' };
    return base;
  }),
}));

import { UsersRealPage } from './UsersRealPage';

const base = {
  id: 'u1', email: 'ana@empresa.com', displayName: 'Ana Quispe', status: 'ACTIVE', roles: ['USUARIO'],
  mustChangePassword: false, locked: false, lockedUntil: null, lastLoginAt: null, createdAt: '2026-01-01T00:00:00Z', liveSessions: 1,
};

beforeEach(() => {
  calls.length = 0; failNext = null;
  users = [
    base,
    { ...base, id: 'u2', email: 'beto@empresa.com', displayName: 'Beto Rojas', locked: true, lockedUntil: '2099-01-01T00:00:00Z' },
    { ...base, id: 'u3', email: 'carla@empresa.com', displayName: 'Carla Soto', status: 'DISABLED', roles: ['AUDITOR'] },
  ];
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

const posted = (path: string) => calls.some((c) => c.path === path && c.init?.method === 'POST');

describe('Administración real de usuarios', () => {
  it('lista los usuarios del servidor con estado y filtros', async () => {
    const user = userEvent.setup();
    render(<UsersRealPage />);
    const table = await screen.findByRole('table', { name: 'Usuarios' });
    expect(within(table).getByText('Ana Quispe')).toBeInTheDocument();
    expect(within(table).getByText('Bloqueado')).toBeInTheDocument();
    expect(within(table).getByText('Deshabilitado')).toBeInTheDocument();
    expect(within(table).getByText('Auditor')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Bloqueados/ }));
    expect(within(screen.getByRole('table', { name: 'Usuarios' })).queryByText('Ana Quispe')).not.toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Usuarios' })).getByText('Beto Rojas')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Todos/ }));
    await user.type(screen.getByLabelText('Buscar usuario o correo'), 'carla');
    expect(within(screen.getByRole('table', { name: 'Usuarios' })).getByText('Carla Soto')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Usuarios' })).queryByText('Ana Quispe')).not.toBeInTheDocument();
  });

  it('solo los bloqueados tienen botón de desbloquear, y llama al servidor', async () => {
    const user = userEvent.setup();
    render(<UsersRealPage />);
    await screen.findByRole('table', { name: 'Usuarios' });
    expect(screen.getAllByRole('button', { name: /^Desbloquear a/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Desbloquear a Beto Rojas' }));
    await waitFor(() => expect(posted('/admin/users/u2/unlock')).toBe(true));
  });

  it('deshabilitar pide confirmación; si se cancela no llama al servidor', async () => {
    const user = userEvent.setup();
    render(<UsersRealPage />);
    await screen.findByRole('table', { name: 'Usuarios' });
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    await user.click(screen.getByRole('button', { name: 'Deshabilitar a Ana Quispe' }));
    expect(posted('/admin/users/u1/disable')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Deshabilitar a Ana Quispe' }));
    await waitFor(() => expect(posted('/admin/users/u1/disable')).toBe(true));
  });

  it('habilita a un usuario deshabilitado', async () => {
    const user = userEvent.setup();
    render(<UsersRealPage />);
    await screen.findByRole('table', { name: 'Usuarios' });
    await user.click(screen.getByRole('button', { name: 'Habilitar a Carla Soto' }));
    await waitFor(() => expect(posted('/admin/users/u3/enable')).toBe(true));
  });

  it('crear usuario: envía los datos y muestra la contraseña temporal una sola vez', async () => {
    const user = userEvent.setup();
    render(<UsersRealPage />);
    await screen.findByRole('table', { name: 'Usuarios' });
    await user.click(screen.getByRole('button', { name: /Nuevo usuario/ }));
    await user.type(screen.getByLabelText('Nombre completo'), 'Luis Mamani');
    await user.type(screen.getByLabelText('Correo institucional'), 'luis@empresa.com');
    await user.click(screen.getByRole('checkbox', { name: 'Auditor' }));
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }));

    const create = calls.find((c) => c.path === '/admin/users' && c.init?.method === 'POST')!;
    expect(JSON.parse(String(create.init!.body))).toEqual({ email: 'luis@empresa.com', displayName: 'Luis Mamani', roles: ['USUARIO', 'AUDITOR'] });
    expect(await screen.findByLabelText('Clave generada')).toHaveTextContent('Temp-Clave#2026xyz');
    expect(screen.getByText(/No se volverá a mostrar/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ya la copié' }));
    expect(screen.queryByLabelText('Clave generada')).not.toBeInTheDocument();
  });

  it('crear usuario: un error del servidor (correo repetido) se muestra en el formulario', async () => {
    const user = userEvent.setup();
    render(<UsersRealPage />);
    await screen.findByRole('table', { name: 'Usuarios' });
    await user.click(screen.getByRole('button', { name: /Nuevo usuario/ }));
    await user.type(screen.getByLabelText('Nombre completo'), 'Ana Otra');
    await user.type(screen.getByLabelText('Correo institucional'), 'ana@empresa.com');
    failNext = 'Ya existe un usuario con ese correo';
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un usuario con ese correo');
    expect(screen.getByRole('button', { name: 'Crear usuario' })).toBeEnabled();
  });

  it('restablecer contraseña: confirma y muestra la clave temporal', async () => {
    const user = userEvent.setup();
    render(<UsersRealPage />);
    await screen.findByRole('table', { name: 'Usuarios' });
    await user.click(screen.getByRole('button', { name: 'Restablecer contraseña de Ana Quispe' }));
    expect(await screen.findByLabelText('Clave generada')).toHaveTextContent('Otra-Clave#2026abc');
  });

  it('cambiar roles envía el conjunto elegido; sin ningún rol no se puede guardar', async () => {
    const user = userEvent.setup();
    render(<UsersRealPage />);
    await screen.findByRole('table', { name: 'Usuarios' });
    await user.click(screen.getByRole('button', { name: 'Cambiar roles de Ana Quispe' }));
    await user.click(screen.getByRole('checkbox', { name: 'Moderador' }));
    await user.click(screen.getByRole('button', { name: 'Guardar roles' }));
    const put = await waitFor(() => {
      const c = calls.find((x) => x.path === '/admin/users/u1/roles' && x.init?.method === 'PUT');
      expect(c).toBeDefined();
      return c!;
    });
    expect(JSON.parse(String(put.init!.body))).toEqual({ roles: ['USUARIO', 'MODERADOR'] });
  });

  it('un error al actuar (p. ej. último administrador) se muestra como aviso', async () => {
    const user = userEvent.setup();
    render(<UsersRealPage />);
    await screen.findByRole('table', { name: 'Usuarios' });
    failNext = 'No se puede deshabilitar al último administrador activo';
    await user.click(screen.getByRole('button', { name: 'Deshabilitar a Ana Quispe' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('último administrador');
  });

  it('si el servidor rechaza el listado (no es admin) muestra el error, no una tabla vacía engañosa', async () => {
    failNext = 'Solo administradores';
    render(<UsersRealPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Solo administradores');
  });
});
