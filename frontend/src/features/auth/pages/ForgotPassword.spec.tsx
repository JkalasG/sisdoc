import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { useSession } from '@/features/auth/store/session';
import { mockControls } from '@/shared/api/mock/router';
import { useNotify } from '@/shared/ui/notify';

const T = { timeout: 4000 };
const NUEVA = 'Otra-Clave-Muy-Segura-9';

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockControls.reset();
  useNotify.getState().clear();
  useSession.setState({ status: 'loading', user: null, notice: null });
});
afterEach(() => { delete window.turnstile; });

const emailField = () => screen.findByLabelText('Correo', undefined, T);
async function requestCode(email = 'ana@empresa.com') {
  const user = userEvent.setup();
  await user.type(await emailField(), email);
  const send = screen.getByRole('button', { name: 'Enviar código' });
  await waitFor(() => expect(send).toBeEnabled());
  await user.click(send);
  await screen.findByLabelText('Código de 6 dígitos', undefined, T);
  return user;
}

describe('Enlace "¿Olvidaste tu contraseña?" en el login', () => {
  it('aparece cuando la recuperación está habilitada y lleva a /recuperar', async () => {
    renderAt('/login');
    const link = await screen.findByRole('link', { name: '¿Olvidaste tu contraseña?' }, T);
    expect(link).toHaveAttribute('href', '/recuperar');
    expect(screen.queryByText(/próximamente/)).not.toBeInTheDocument();
  });

  it('se OCULTA cuando el servidor no puede enviar correos', async () => {
    mockControls.set({ passwordResetEnabled: false });
    renderAt('/login');
    await screen.findByLabelText('Correo', undefined, T);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled());
    expect(screen.queryByRole('link', { name: '¿Olvidaste tu contraseña?' })).not.toBeInTheDocument();
  });
});

describe('Pantalla de recuperación', () => {
  it('paso 1: pide el correo y avisa con una notificación (sin confirmar si existe)', async () => {
    renderAt('/recuperar');
    await requestCode('quien-sea@otra.com'); // un correo inexistente recibe el mismo trato
    expect(await screen.findByRole('alert', undefined, T)).toHaveTextContent(/Si el correo está registrado/);
    expect(screen.getByText(/El código vence en 10 minutos/)).toBeInTheDocument();
  });

  it('paso 2: el botón se habilita solo con 6 dígitos, contraseña válida y coincidente', async () => {
    renderAt('/recuperar');
    const user = await requestCode();
    const boton = screen.getByRole('button', { name: 'Cambiar contraseña' });
    expect(boton).toBeDisabled();
    await user.type(screen.getByLabelText('Código de 6 dígitos'), '123456');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'corta');
    expect(boton).toBeDisabled();
    await user.clear(screen.getByLabelText('Nueva contraseña'));
    await user.type(screen.getByLabelText('Nueva contraseña'), NUEVA);
    await user.type(screen.getByLabelText('Repite la contraseña'), 'otra-distinta-123');
    expect(boton).toBeDisabled();
    await user.clear(screen.getByLabelText('Repite la contraseña'));
    await user.type(screen.getByLabelText('Repite la contraseña'), NUEVA);
    expect(boton).toBeEnabled();
  });

  it('el campo del código solo acepta dígitos (máximo 6) y pide el teclado numérico', async () => {
    renderAt('/recuperar');
    const user = await requestCode();
    const campo = screen.getByLabelText('Código de 6 dígitos');
    expect(campo).toHaveAttribute('inputmode', 'numeric');
    expect(campo).toHaveAttribute('autocomplete', 'one-time-code');
    await user.type(campo, '12ab34 56789');
    expect(campo).toHaveValue('123456');
  });

  it('con el código correcto cambia la contraseña, avisa y vuelve al login, donde ya entra con la nueva', async () => {
    renderAt('/recuperar');
    const user = await requestCode();
    await user.type(screen.getByLabelText('Código de 6 dígitos'), '123456');
    await user.type(screen.getByLabelText('Nueva contraseña'), NUEVA);
    await user.type(screen.getByLabelText('Repite la contraseña'), NUEVA);
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' }, T)).toBeInTheDocument();
    expect(await screen.findByText(/Contraseña actualizada/, undefined, T)).toBeInTheDocument();
    await user.type(await emailField(), 'ana@empresa.com');
    await user.type(screen.getByLabelText('Contraseña'), NUEVA);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('region', { name: 'Crear publicación' }, T)).toBeInTheDocument();
  });

  it('con un código incorrecto muestra el error del servidor y se queda en el formulario', async () => {
    renderAt('/recuperar');
    const user = await requestCode();
    await user.type(screen.getByLabelText('Código de 6 dígitos'), '000000');
    await user.type(screen.getByLabelText('Nueva contraseña'), NUEVA);
    await user.type(screen.getByLabelText('Repite la contraseña'), NUEVA);
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByText(/El código es incorrecto o venció/, undefined, T)).toBeInTheDocument();
    expect(screen.getByLabelText('Código de 6 dígitos')).toBeInTheDocument();
  });

  it('reenviar: bloqueado durante 60 s con cuenta regresiva visible', async () => {
    renderAt('/recuperar');
    await requestCode();
    expect(screen.getByRole('button', { name: /Reenviar código \(\d+ s\)/ })).toBeDisabled();
  });

  it('"Usar otro correo" vuelve al paso 1 y borra lo escrito', async () => {
    renderAt('/recuperar');
    const user = await requestCode();
    await user.type(screen.getByLabelText('Código de 6 dígitos'), '123');
    await user.click(screen.getByRole('button', { name: 'Usar otro correo' }));
    expect(await screen.findByRole('button', { name: 'Enviar código' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Código de 6 dígitos')).not.toBeInTheDocument();
  });

  it('si la recuperación está apagada, explica que no está disponible y ofrece volver', async () => {
    mockControls.set({ passwordResetEnabled: false });
    renderAt('/recuperar');
    expect(await screen.findByText(/Esta opción no está disponible/, undefined, T)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a iniciar sesión' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: 'Enviar código' })).not.toBeInTheDocument();
  });
});

describe('Recuperación con captcha activado', () => {
  it('"Enviar código" queda bloqueado hasta resolver el captcha, y este se reinicia tras cada envío', async () => {
    mockControls.set({ captchaEnabled: true });
    let callback: ((t: string) => void) | undefined;
    const api = { render: vi.fn((_e: HTMLElement, o: Record<string, unknown>) => { callback = o.callback as (t: string) => void; return 'w'; }), reset: vi.fn(), remove: vi.fn() };
    window.turnstile = api;
    renderAt('/recuperar');
    const user = userEvent.setup();
    await user.type(await emailField(), 'ana@empresa.com');
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    const enviar = screen.getByRole('button', { name: 'Enviar código' });
    expect(enviar).toBeDisabled();
    act(() => callback!('token-ok'));
    await waitFor(() => expect(enviar).toBeEnabled());
    await user.click(enviar);
    await screen.findByLabelText('Código de 6 dígitos', undefined, T);
    expect(api.reset).toHaveBeenCalled();
  });
});
