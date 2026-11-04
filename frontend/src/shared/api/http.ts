import { config } from '@/shared/config';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export interface TransportResponse {
  status: number;
  data?: unknown;
  blob?: Blob;
}
export type Transport = (path: string, init: RequestInit) => Promise<TransportResponse>;

/** Transporte real: fetch con cookies de sesión y cabecera anti-CSRF. */
const fetchTransport: Transport = async (path, init) => {
  const res = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body instanceof FormData || init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      'X-Requested-With': 'XMLHttpRequest', // exigido por el backend (protección CSRF)
      ...init.headers,
    },
  });
  if ((res.headers.get('content-type') ?? '').includes('application/json')) {
    return { status: res.status, data: await res.json() };
  }
  if (res.status === 204 || !res.ok) return { status: res.status };
  return { status: res.status, blob: await res.blob() };
};

// La app habla con UN transporte. En modo mock es el backend simulado; la lógica de abajo (errores,
// refresco de sesión, reintentos) es la MISMA en ambos modos, así los mocks ejercitan el código real.
// El mock se importa dinámicamente: con VITE_USE_MOCKS=false esta rama se elimina y el mock no entra al bundle.
const transport: Transport = config.useMocks
  ? (path, init) => import('./mock/router').then((m) => m.mockTransport(path, init))
  : fetchTransport;

/** Ganchos que registra el store de sesión (evita dependencias circulares). */
export const authHooks = {
  onSessionLost: () => {},
  onPasswordChangeRequired: () => {},
};

// Otra pestaña puede estar renovando la misma sesión: el servidor lo avisa con REFRESH_IN_PROGRESS y,
// en cuanto esa pestaña deja la cookie nueva, el reintento sale con ella.
const RACE_RETRIES = 3;
const RACE_DELAY_MS = 300;

async function refreshOnce(): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    const r = await transport('/auth/refresh', { method: 'POST' });
    if (r.status === 200) return true;
    const raced = r.status === 401 && (r.data as { code?: string } | undefined)?.code === 'REFRESH_IN_PROGRESS';
    if (!raced || attempt >= RACE_RETRIES) return false;
    await new Promise((resolve) => setTimeout(resolve, RACE_DELAY_MS));
  }
}

let refreshing: Promise<boolean> | null = null;
function refreshSession(): Promise<boolean> {
  refreshing ??= refreshOnce()
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function call(path: string, init: RequestInit, retried = false): Promise<TransportResponse> {
  let res: TransportResponse;
  try {
    res = await transport(path, init);
  } catch {
    throw new ApiError(0, 'NETWORK', 'No se pudo conectar con el servidor. Revisa tu conexión.');
  }

  if (res.status === 401 && !retried && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    if (await refreshSession()) return call(path, init, true); // renovación silenciosa
    authHooks.onSessionLost();
  }
  if (res.status >= 400) {
    const body = (res.data ?? {}) as { code?: string; message?: string | string[] };
    const code = body.code ?? 'ERROR';
    if (code === 'PASSWORD_CHANGE_REQUIRED') authHooks.onPasswordChangeRequired();
    const message = Array.isArray(body.message) ? body.message.join('. ') : body.message ?? 'Ocurrió un error inesperado';
    throw new ApiError(res.status, code, message);
  }
  return res;
}

export async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await call(path, init);
  return (res.data ?? undefined) as T;
}

/** Como `http`, pero conserva el código HTTP (login responde 200 o 202). */
export async function httpWithStatus<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T }> {
  const res = await call(path, init);
  return { status: res.status, data: res.data as T };
}

export async function httpBlob(path: string): Promise<Blob> {
  const res = await call(path, {});
  if (!res.blob) throw new ApiError(res.status, 'NO_FILE', 'El servidor no devolvió un archivo');
  return res.blob;
}

export const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });
