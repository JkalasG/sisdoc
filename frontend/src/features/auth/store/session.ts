import { create } from 'zustand';
import { authHooks } from '@/shared/api/http';
import type { CurrentUser } from '@/shared/api/types';
import { authApi } from '../api/auth.api';

type Status = 'loading' | 'anon' | 'authed';
export type LoginOutcome = 'OK' | 'DEVICE_PENDING';

interface SessionState {
  status: Status;
  user: CurrentUser | null;
  notice: string | null; // mensaje a mostrar en el login (ej. "tu sesión expiró")
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  logout: () => Promise<void>;
  passwordChanged: () => void;
  clearNotice: () => void;
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  user: null,
  notice: null,

  async bootstrap() {
    try {
      set({ status: 'authed', user: await authApi.me() });
    } catch {
      set({ status: 'anon', user: null });
    }
  },

  async login(email, password) {
    const { status, data } = await authApi.login(email, password);
    if (status === 202 || data.status === 'DEVICE_PENDING') return 'DEVICE_PENDING';
    if (data.status === 'OK') set({ status: 'authed', user: data.user, notice: null });
    return 'OK';
  },

  async logout() {
    try { await authApi.logout(); } catch { /* aunque falle la red, se cierra localmente */ }
    set({ status: 'anon', user: null, notice: null });
  },

  passwordChanged() {
    const u = get().user;
    if (u) set({ user: { ...u, mustChangePassword: false } });
  },

  clearNotice: () => set({ notice: null }),
}));

// El cliente HTTP avisa aquí cuando el servidor da por perdida la sesión o exige cambiar la clave.
authHooks.onSessionLost = () => {
  // Solo se avisa "expiró" si había una sesión abierta; un visitante nuevo no debe ver ese mensaje.
  const wasLoggedIn = useSession.getState().status === 'authed';
  useSession.setState({ status: 'anon', user: null, notice: wasLoggedIn ? 'Tu sesión expiró. Inicia sesión nuevamente.' : null });
};
authHooks.onPasswordChangeRequired = () => {
  const u = useSession.getState().user;
  if (u) useSession.setState({ user: { ...u, mustChangePassword: true } });
};
