import { create } from 'zustand';
import {
  ADMIN_GROUPS, COUNTRIES, DEVICES, DOCS, DOWNLOADS, EVENTS, IP_RULES, PROFILES, SECTIONS, SESSIONS, USERS,
} from './data';
import type {
  AdminDevice, AdminEvent, AdminSession, AdminUser, Country, DeviceStatus, EventType, IpRule, Role,
} from './data';

// PROTOTIPO: estado en memoria. Cada acción agrega su evento a la auditoría, como haría el backend.
interface AdminState {
  users: AdminUser[]; devices: AdminDevice[]; sessions: AdminSession[]; events: AdminEvent[];
  ipRules: IpRule[]; countries: Country[];
  docs: typeof DOCS; downloads: typeof DOWNLOADS; profiles: typeof PROFILES; sections: typeof SECTIONS; groups: typeof ADMIN_GROUPS;
  setDevice: (id: string, status: DeviceStatus) => void;
  toggleUser: (id: string) => void;
  unlockUser: (id: string) => void;
  resetPassword: (id: string) => void;
  createUser: (u: { name: string; email: string; role: Role; section: string }) => void;
  closeSession: (id: string) => void;
  addIpRule: (r: Omit<IpRule, 'id' | 'source'>) => void;
  removeIpRule: (id: string) => void;
  toggleCountry: (code: string) => void;
}

const ev = (type: EventType, user: string, detail?: string): AdminEvent => ({
  id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type, user, ip: '10.0.0.2', device: 'Chrome en Windows', at: new Date().toISOString(), detail,
});

export const useAdmin = create<AdminState>((set) => ({
  users: USERS, devices: DEVICES, sessions: SESSIONS, events: EVENTS, ipRules: IP_RULES, countries: COUNTRIES,
  docs: DOCS, downloads: DOWNLOADS, profiles: PROFILES, sections: SECTIONS, groups: ADMIN_GROUPS,

  setDevice: (id, status) => set((s) => {
    const d = s.devices.find((x) => x.id === id)!;
    return {
      devices: s.devices.map((x) => (x.id === id ? { ...x, status } : x)),
      sessions: status === 'BLOCKED' ? s.sessions.filter((x) => !(x.user === d.user && x.device === d.label)) : s.sessions,
      events: [ev(status === 'TRUSTED' ? 'DEVICE_APPROVED' : 'DEVICE_BLOCKED', d.user, `${d.label} · ${d.ip}`), ...s.events],
    };
  }),

  toggleUser: (id) => set((s) => {
    const u = s.users.find((x) => x.id === id)!;
    const disabling = u.status !== 'Deshabilitado';
    return {
      users: s.users.map((x) => (x.id === id ? { ...x, status: disabling ? 'Deshabilitado' : 'Activo', sessions: disabling ? 0 : x.sessions } : x)),
      sessions: disabling ? s.sessions.filter((x) => x.user !== u.name) : s.sessions,
      events: disabling ? [ev('USER_DISABLED', u.name, 'Sus sesiones se cerraron'), ...s.events] : s.events,
    };
  }),

  unlockUser: (id) => set((s) => ({ users: s.users.map((x) => (x.id === id && x.status === 'Bloqueado' ? { ...x, status: 'Activo' } : x)) })),

  resetPassword: (id) => set((s) => {
    const u = s.users.find((x) => x.id === id)!;
    return {
      users: s.users.map((x) => (x.id === id ? { ...x, mustChange: true, sessions: 0 } : x)),
      sessions: s.sessions.filter((x) => x.user !== u.name),
      events: [ev('PASSWORD_RESET', u.name, 'Contraseña temporal emitida'), ...s.events],
    };
  }),

  createUser: (u) => set((s) => ({
    users: [{ id: `a-${Date.now()}`, ...u, status: 'Activo', mustChange: true, google: false, sessions: 0 }, ...s.users],
  })),

  closeSession: (id) => set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),
  addIpRule: (r) => set((s) => ({ ipRules: [{ ...r, id: `i-${Date.now()}`, source: 'MANUAL' }, ...s.ipRules] })),
  removeIpRule: (id) => set((s) => ({ ipRules: s.ipRules.filter((x) => x.id !== id) })),
  toggleCountry: (code) => set((s) => ({ countries: s.countries.map((c) => (c.code === code ? { ...c, allowed: !c.allowed } : c)) })),
}));
