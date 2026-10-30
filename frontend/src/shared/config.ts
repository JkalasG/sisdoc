export const config = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1',
  useMocks: import.meta.env.VITE_USE_MOCKS === 'true',
  // Debe coincidir con la política del backend (SESSION_POLICY).
  idleTimeoutMs: 30 * 60_000,
  idleWarningMs: 60_000,
};

// Salvaguarda: un build de producción jamás debe funcionar con un backend simulado.
if (config.useMocks && import.meta.env.PROD) {
  throw new Error('VITE_USE_MOCKS=true no está permitido en un build de producción');
}

/** Atajo para quien solo necesita saber si el backend es simulado (`config.useMocks`). */
export const USE_MOCKS = config.useMocks;
