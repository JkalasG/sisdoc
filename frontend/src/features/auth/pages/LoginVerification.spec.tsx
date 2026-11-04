import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { useSession } from '@/features/auth/store/session';
import { mockControls } from '@/shared/api/mock/router';

const T = { timeout: 4000 };

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}><App /></MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Cloudflare Turnstile de mentira: guarda el callback para "resolver" el captcha desde la prueba. */
function stubTurnstile() {
  const state: { cb?: (t: string) => void; expired?: () => void; opts?: Record<string, unknown> } = {};
  const api = {
    render: vi.fn((_el: HTMLElement, opts: Record<string, unknown>) => {
      state.cb = opts.callback as (t: string) => void;
      state.expired = opts['expired-callback'] as () => void;
      state.opts = opts;
      return 'w1';
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  window.turnstile = api;
  return { api, state };
}

/** Google Identity Services de mentira. */
function stubGoogle() {
  const state: { cb?: (r: { credential?: string }) => void; init?: Record<string, unknown> } = {};
  const id = {
    initialize: vi.fn((cfg: { client_id: string; callback: (r: { credential?: string }) => void }) => { state.cb = cfg.callback; state.init = cfg; }),
    renderButton: vi.fn(),
  };
  window.google = { accounts: { id } };
  return { id, state };
}

beforeEach(() => {
  mockControls.reset();
  useSession.setState({ status: 'loading', user: null, notice: null });
});
afterEach(() => { delete window.turnstile; delete window.google; });

const emailField = () => screen.findByLabelText('Correo', undefined, T);
async function fillCredentials() {
  const user = userEvent.setup();
  await user.type(await emailField(), 'ana@empresa.com');
  await user.type(screen.getByLabelText('Contraseña'), 'Clave-Segura-2026');
  return user;
}
const enterButton = () => screen.getByRole('button', { name: 'Entrar' });
const feed = () => screen.findByRole('region', { name: 'Crear publicación' }, T);

describe('Login con captcha y Google APAGADOS (por defecto)', () => {
  it('no muestra captcha ni botón de Google, y se entra solo con correo y contraseña', async () => {
    renderLogin();
    const user = await fillCredentials();
    expect(screen.queryByTestId('captcha-widget')).not.toBeInTheDocument();
    expect(screen.queryByTestId('google-button')).not.toBeInTheDocument();
    expect(screen.queryByText(/continuar con google/i)).not.toBeInTheDocument();
    await waitFor(() => expect(enterButton()).toBeEnabled());
    await user.click(enterButton());
    expect(await feed()).toBeInTheDocument();
  });
});

describe('Avisos del login', () => {
  it('contraseña incorrecta: sale como notificación arriba a la derecha, NO dentro del formulario', async () => {
    renderLogin();
    const user = userEvent.setup();
    await user.type(await emailField(), 'ana@empresa.com');
    await user.type(screen.getByLabelText('Contraseña'), 'incorrecta-123456');
    await waitFor(() => expect(enterButton()).toBeEnabled());
    await user.click(enterButton());
    const aviso = await screen.findByRole('alert', undefined, T);
    expect(aviso).toHaveTextContent(/incorrectos, o la cuenta está bloqueada/);
    expect(aviso.parentElement).toHaveClass('fixed', 'right-4', 'top-4');
    expect(screen.getByRole('main').querySelector('form [role="alert"]')).toBeNull();
  });

  it('cuenta pendiente: UN solo mensaje (el panel); al volver al login no queda ninguna alerta', async () => {
    mockControls.set({ googleEnabled: true });
    const { id, state } = stubGoogle();
    renderLogin();
    await emailField();
    await waitFor(() => expect(id.renderButton).toHaveBeenCalled());
    await act(async () => state.cb!({ credential: 'mock:nuevo@empresa.com' }));
    await screen.findByText('Tu cuenta aún no está activada', undefined, T);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    await emailField();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('la sesión expirada también sale como notificación', async () => {
    renderLogin();
    await emailField();
    act(() => useSession.setState({ notice: 'Tu sesión expiró. Inicia sesión nuevamente.' }));
    expect(await screen.findByRole('alert', undefined, T)).toHaveTextContent('Tu sesión expiró');
  });
});

describe('Autocompletado del navegador', () => {
  /** Simula a Chrome: pone el valor en el campo SIN disparar eventos, así React no se entera. */
  const autofill = (el: HTMLElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
  };

  it('con los campos autocompletados el botón NO queda bloqueado y el login funciona', async () => {
    renderLogin();
    autofill(await emailField(), 'ana@empresa.com');
    autofill(screen.getByLabelText('Contraseña'), 'Clave-Segura-2026');
    await waitFor(() => expect(enterButton()).toBeEnabled());
    await userEvent.click(enterButton());
    expect(await feed()).toBeInTheDocument();
  });

  it('con los campos realmente vacíos avisa en vez de enviar', async () => {
    renderLogin();
    await emailField();
    await waitFor(() => expect(enterButton()).toBeEnabled());
    await userEvent.click(enterButton());
    expect(await screen.findByRole('alert', undefined, T)).toHaveTextContent('Ingresa tu correo y tu contraseña.');
  });
});

describe('Captcha ACTIVADO', () => {
  beforeEach(() => mockControls.set({ captchaEnabled: true }));

  it('muestra el widget con la site key del servidor y bloquea "Entrar" hasta resolverlo', async () => {
    const { api, state } = stubTurnstile();
    renderLogin();
    const user = await fillCredentials();
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    expect(state.opts).toMatchObject({ sitekey: 'mock-site-key', language: 'es' });
    expect(screen.getByTestId('captcha-widget')).toBeInTheDocument();
    expect(enterButton()).toBeDisabled();

    act(() => state.cb!('token-ok'));
    await waitFor(() => expect(enterButton()).toBeEnabled());
    await user.click(enterButton());
    expect(await feed()).toBeInTheDocument();
  });

  it('si el token vence, "Entrar" vuelve a bloquearse', async () => {
    const { api, state } = stubTurnstile();
    renderLogin();
    await fillCredentials();
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    act(() => state.cb!('token-ok'));
    await waitFor(() => expect(enterButton()).toBeEnabled());
    act(() => state.expired!());
    await waitFor(() => expect(enterButton()).toBeDisabled());
  });

  it('si Cloudflare rechaza el dominio, el widget explica el motivo y permite reintentar (no se queda mudo)', async () => {
    const { api, state } = stubTurnstile();
    renderLogin();
    await fillCredentials();
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    act(() => (state.opts!['error-callback'] as (c: string) => void)('110200'));
    const aviso = await screen.findByText(/no está autorizado en tu widget de Turnstile/);
    expect(aviso).toHaveTextContent('110200');
    expect(enterButton()).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(api.reset).toHaveBeenCalled();
    expect(screen.queryByText(/no está autorizado/)).not.toBeInTheDocument();
  });

  it('tras un intento fallido se reinicia el widget (el token sirve una sola vez)', async () => {
    const { api, state } = stubTurnstile();
    renderLogin();
    const user = userEvent.setup();
    await user.type(await emailField(), 'ana@empresa.com');
    await user.type(screen.getByLabelText('Contraseña'), 'incorrecta-123456');
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    act(() => state.cb!('token-ok'));
    await waitFor(() => expect(enterButton()).toBeEnabled());
    await user.click(enterButton());
    expect(await screen.findByRole('alert', undefined, T)).toHaveTextContent(/incorrectos/);
    expect(api.reset).toHaveBeenCalled();
    await waitFor(() => expect(enterButton()).toBeDisabled());
  });
});

describe('Google ACTIVADO', () => {
  beforeEach(() => mockControls.set({ googleEnabled: true }));

  it('muestra el botón oficial inicializado con el Client ID del servidor', async () => {
    const { id, state } = stubGoogle();
    renderLogin();
    await emailField();
    await waitFor(() => expect(id.renderButton).toHaveBeenCalled());
    expect(state.init).toMatchObject({ client_id: 'mock-client-id' });
    expect(screen.getByTestId('google-button')).toBeInTheDocument();
  });

  it('un error de Google NO reinicia el captcha (su token no se gastó)', async () => {
    mockControls.set({ captchaEnabled: true });
    const turnstile = stubTurnstile();
    const { id, state } = stubGoogle();
    renderLogin();
    await emailField();
    await waitFor(() => expect(id.renderButton).toHaveBeenCalled());
    await waitFor(() => expect(turnstile.api.render).toHaveBeenCalled());
    act(() => turnstile.state.cb!('token-ok'));
    mockControls.set({ googleAutoRegister: false });
    await act(async () => state.cb!({ credential: 'mock:intruso@gmail.com' }));
    expect(await screen.findByRole('alert', undefined, T)).toHaveTextContent(/incorrectos/);
    expect(turnstile.api.reset).not.toHaveBeenCalled();
  });

  it('con la credencial de Google inicia sesión', async () => {
    const { id, state } = stubGoogle();
    renderLogin();
    await emailField();
    await waitFor(() => expect(id.renderButton).toHaveBeenCalled());
    await act(async () => state.cb!({ credential: 'mock:ana@empresa.com' }));
    expect(await feed()).toBeInTheDocument();
  });

  it('primer ingreso con Google: se registra y ve el bloqueo "cuenta no activada, contacta a un administrador"', async () => {
    const { id, state } = stubGoogle();
    renderLogin();
    await emailField();
    await waitFor(() => expect(id.renderButton).toHaveBeenCalled());
    await act(async () => state.cb!({ credential: 'mock:nuevo@empresa.com' }));
    const aviso = await screen.findByRole('alert', undefined, T);
    expect(aviso).toHaveTextContent('Tu cuenta aún no está activada');
    expect(aviso).toHaveTextContent(/Contacta a un administrador/);
    expect(screen.queryByRole('region', { name: 'Crear publicación' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Correo')).not.toBeInTheDocument(); // el formulario se reemplaza por el aviso
    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(await emailField()).toBeInTheDocument(); // se puede volver al login
  });

  it('con el registro automático apagado, una cuenta que el administrador no creó muestra el error genérico y no entra', async () => {
    mockControls.set({ googleAutoRegister: false });
    const { id, state } = stubGoogle();
    renderLogin();
    await emailField();
    await waitFor(() => expect(id.renderButton).toHaveBeenCalled());
    await act(async () => state.cb!({ credential: 'mock:intruso@gmail.com' }));
    expect(await screen.findByRole('alert', undefined, T)).toHaveTextContent(/incorrectos/);
    expect(screen.queryByText('Tu cuenta aún no está activada')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Crear publicación' })).not.toBeInTheDocument();
  });

  it('dispositivo nuevo por Google → pantalla de "pendiente de autorización"', async () => {
    mockControls.set({ deviceKnown: false });
    const { id, state } = stubGoogle();
    renderLogin();
    await emailField();
    await waitFor(() => expect(id.renderButton).toHaveBeenCalled());
    await act(async () => state.cb!({ credential: 'mock:ana@empresa.com' }));
    expect(await screen.findByText('Dispositivo pendiente de autorización', undefined, T)).toBeInTheDocument();
  });

  it('no pide captcha al usuario si solo Google está activo', async () => {
    stubGoogle();
    renderLogin();
    await fillCredentials();
    expect(screen.queryByTestId('captcha-widget')).not.toBeInTheDocument();
    await waitFor(() => expect(enterButton()).toBeEnabled());
  });
});

describe('Configuración del servidor', () => {
  it('si no se puede leer, avisa con opción de reintentar y no deja enviar el formulario', async () => {
    mockControls.set({ serverDown: true });
    renderLogin();
    await fillCredentials();
    expect(await screen.findByText(/No se pudo cargar la configuración de acceso/, undefined, T)).toBeInTheDocument();
    expect(enterButton()).toBeDisabled();
    mockControls.set({ serverDown: false });
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(enterButton()).toBeEnabled());
  });
});
