// PROTOTIPO: datos de demostración del panel administrativo.
// Se reemplazan por llamadas a la API cuando existan los módulos de usuarios, roles y auditoría del backend.

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

export type Role = 'Administrador' | 'Auditor' | 'Moderador' | 'Usuario';
export type UserStatus = 'Activo' | 'Deshabilitado' | 'Bloqueado';
export interface AdminUser {
  id: string; name: string; email: string; role: Role; section: string; status: UserStatus;
  lastLogin?: string; mustChange: boolean; google: boolean; sessions: number;
}
export type DeviceStatus = 'PENDING' | 'TRUSTED' | 'BLOCKED';
export interface AdminDevice { id: string; user: string; email: string; label: string; ip: string; status: DeviceStatus; firstSeen: string; lastSeen: string }
export interface AdminSession { id: string; user: string; device: string; ip: string; startedAt: string; lastActivity: string; expiresAt: string }
export type EventType =
  | 'LOGIN_OK' | 'LOGIN_FAIL' | 'ACCOUNT_LOCKED' | 'DEVICE_NEW' | 'DEVICE_APPROVED' | 'DEVICE_BLOCKED'
  | 'REFRESH_REUSE' | 'PASSWORD_CHANGED' | 'PASSWORD_RESET' | 'LOGOUT' | 'USER_DISABLED';
export interface AdminEvent { id: string; type: EventType; user: string; ip: string; device: string; at: string; detail?: string }
export interface AdminDoc { id: string; title: string; owner: string; status: string; versions: number; downloads: number; lastAccess: string; size: string }
export interface AdminDownload { id: string; doc: string; user: string; version: number; ip: string; channel: string; at: string }
export interface IpRule { id: string; type: 'ALLOW' | 'DENY'; cidr: string; label: string; profile?: string; source: 'MANUAL' | 'AUTO'; expires?: string }
export interface RateProfile { id: string; name: string; general: number; write: number; upload: number; download: number; auth: number; ws: number; users: number }
export interface Country { code: string; name: string; allowed: boolean }
export interface Section { id: string; name: string; head: string; members: number; groups: number }
export interface AdminGroup { id: string; name: string; section: string; members: number; privacy: 'Privado' | 'Público' }

export const EVENT_LABEL: Record<EventType, { label: string; tone: 'ok' | 'warn' | 'bad' | 'info' }> = {
  LOGIN_OK: { label: 'Inicio de sesión', tone: 'ok' },
  LOGIN_FAIL: { label: 'Intento fallido', tone: 'warn' },
  ACCOUNT_LOCKED: { label: 'Cuenta bloqueada', tone: 'bad' },
  DEVICE_NEW: { label: 'Dispositivo nuevo', tone: 'info' },
  DEVICE_APPROVED: { label: 'Dispositivo aprobado', tone: 'ok' },
  DEVICE_BLOCKED: { label: 'Dispositivo bloqueado', tone: 'bad' },
  REFRESH_REUSE: { label: 'Token reutilizado', tone: 'bad' },
  PASSWORD_CHANGED: { label: 'Cambio de contraseña', tone: 'info' },
  PASSWORD_RESET: { label: 'Contraseña restablecida', tone: 'info' },
  LOGOUT: { label: 'Cierre de sesión', tone: 'info' },
  USER_DISABLED: { label: 'Usuario deshabilitado', tone: 'warn' },
};

export const USERS: AdminUser[] = [
  { id: 'a1', name: 'Ana Quispe', email: 'ana@empresa.com', role: 'Usuario', section: 'Contabilidad', status: 'Activo', lastLogin: ago(4), mustChange: false, google: true, sessions: 2 },
  { id: 'a2', name: 'Luis Mamani', email: 'luis@empresa.com', role: 'Usuario', section: 'Compras', status: 'Activo', lastLogin: ago(35), mustChange: false, google: false, sessions: 1 },
  { id: 'a3', name: 'Marta Rojas', email: 'marta@empresa.com', role: 'Moderador', section: 'Contabilidad', status: 'Activo', lastLogin: ago(120), mustChange: false, google: true, sessions: 1 },
  { id: 'a4', name: 'Jorge Vargas', email: 'jorge@empresa.com', role: 'Usuario', section: 'Logística', status: 'Activo', lastLogin: ago(60 * 7), mustChange: false, google: false, sessions: 0 },
  { id: 'a5', name: 'Carla Soto', email: 'carla@empresa.com', role: 'Usuario', section: 'Sucursal Norte', status: 'Activo', lastLogin: ago(60 * 26), mustChange: false, google: true, sessions: 1 },
  { id: 'a6', name: 'Diego Pérez', email: 'diego@empresa.com', role: 'Usuario', section: 'Sucursal Norte', status: 'Activo', lastLogin: ago(60 * 30), mustChange: false, google: false, sessions: 0 },
  { id: 'a7', name: 'Elena Torres', email: 'elena@empresa.com', role: 'Auditor', section: 'Auditoría interna', status: 'Activo', lastLogin: ago(60 * 3), mustChange: false, google: false, sessions: 1 },
  { id: 'a8', name: 'Pablo Rivas', email: 'pablo@empresa.com', role: 'Usuario', section: 'Recursos Humanos', status: 'Activo', lastLogin: ago(60 * 52), mustChange: false, google: false, sessions: 0 },
  { id: 'a9', name: 'Administrador', email: 'admin@empresa.com', role: 'Administrador', section: 'Sistemas', status: 'Activo', lastLogin: ago(1), mustChange: false, google: true, sessions: 1 },
  { id: 'a10', name: 'Usuario Nuevo', email: 'nueva@empresa.com', role: 'Usuario', section: 'Recursos Humanos', status: 'Activo', mustChange: true, google: false, sessions: 0 },
  { id: 'a11', name: 'Rosa Choque', email: 'rosa@empresa.com', role: 'Usuario', section: 'Logística', status: 'Deshabilitado', lastLogin: ago(60 * 24 * 20), mustChange: false, google: false, sessions: 0 },
  { id: 'a12', name: 'Mario Flores', email: 'mario@empresa.com', role: 'Usuario', section: 'Compras', status: 'Bloqueado', lastLogin: ago(60 * 5), mustChange: false, google: false, sessions: 0 },
];

export const DEVICES: AdminDevice[] = [
  { id: 'd1', user: 'Pablo Rivas', email: 'pablo@empresa.com', label: 'Chrome en Windows', ip: '200.87.14.55', status: 'PENDING', firstSeen: ago(12), lastSeen: ago(3) },
  { id: 'd2', user: 'Usuario Nuevo', email: 'nueva@empresa.com', label: 'Edge en Windows', ip: '10.0.0.88', status: 'PENDING', firstSeen: ago(95), lastSeen: ago(95) },
  { id: 'd3', user: 'Carla Soto', email: 'carla@empresa.com', label: 'Chrome en Android', ip: '190.129.3.8', status: 'PENDING', firstSeen: ago(60 * 5), lastSeen: ago(60 * 5) },
  { id: 'd4', user: 'Ana Quispe', email: 'ana@empresa.com', label: 'Chrome en Windows', ip: '10.0.0.5', status: 'TRUSTED', firstSeen: ago(60 * 24 * 40), lastSeen: ago(4) },
  { id: 'd5', user: 'Ana Quispe', email: 'ana@empresa.com', label: 'Safari en iOS', ip: '190.129.3.20', status: 'TRUSTED', firstSeen: ago(60 * 24 * 12), lastSeen: ago(60 * 22) },
  { id: 'd6', user: 'Luis Mamani', email: 'luis@empresa.com', label: 'Firefox en Linux', ip: '10.0.0.12', status: 'TRUSTED', firstSeen: ago(60 * 24 * 30), lastSeen: ago(35) },
  { id: 'd7', user: 'Marta Rojas', email: 'marta@empresa.com', label: 'Chrome en Windows', ip: '200.87.14.31', status: 'TRUSTED', firstSeen: ago(60 * 24 * 70), lastSeen: ago(120) },
  { id: 'd8', user: 'Mario Flores', email: 'mario@empresa.com', label: 'Chrome en Windows', ip: '45.77.12.9', status: 'BLOCKED', firstSeen: ago(60 * 24 * 2), lastSeen: ago(60 * 5) },
];

export const SESSIONS: AdminSession[] = [
  { id: 's1', user: 'Administrador', device: 'Chrome en Windows', ip: '10.0.0.2', startedAt: ago(40), lastActivity: ago(1), expiresAt: ago(-60 * 11) },
  { id: 's2', user: 'Ana Quispe', device: 'Chrome en Windows', ip: '10.0.0.5', startedAt: ago(95), lastActivity: ago(4), expiresAt: ago(-60 * 10) },
  { id: 's3', user: 'Ana Quispe', device: 'Safari en iOS', ip: '190.129.3.20', startedAt: ago(60 * 22), lastActivity: ago(60 * 21), expiresAt: ago(-30) },
  { id: 's4', user: 'Luis Mamani', device: 'Firefox en Linux', ip: '10.0.0.12', startedAt: ago(180), lastActivity: ago(18), expiresAt: ago(-60 * 9) },
  { id: 's5', user: 'Marta Rojas', device: 'Chrome en Windows', ip: '200.87.14.31', startedAt: ago(60 * 3), lastActivity: ago(2), expiresAt: ago(-60 * 9) },
  { id: 's6', user: 'Elena Torres', device: 'Edge en Windows', ip: '10.0.0.40', startedAt: ago(60 * 2), lastActivity: ago(9), expiresAt: ago(-60 * 10) },
  { id: 's7', user: 'Carla Soto', device: 'Chrome en Android', ip: '190.129.3.8', startedAt: ago(60 * 6), lastActivity: ago(25), expiresAt: ago(-60 * 6) },
];

export const EVENTS: AdminEvent[] = [
  { id: 'e1', type: 'LOGIN_OK', user: 'Administrador', ip: '10.0.0.2', device: 'Chrome en Windows', at: ago(40) },
  { id: 'e2', type: 'DEVICE_NEW', user: 'Pablo Rivas', ip: '200.87.14.55', device: 'Chrome en Windows', at: ago(12), detail: 'Pendiente de aprobación' },
  { id: 'e3', type: 'LOGIN_FAIL', user: 'Mario Flores', ip: '45.77.12.9', device: 'Chrome en Windows', at: ago(60 * 5 + 6), detail: 'Contraseña incorrecta' },
  { id: 'e4', type: 'LOGIN_FAIL', user: 'Mario Flores', ip: '45.77.12.9', device: 'Chrome en Windows', at: ago(60 * 5 + 5), detail: 'Contraseña incorrecta' },
  { id: 'e5', type: 'LOGIN_FAIL', user: 'Mario Flores', ip: '45.77.12.9', device: 'Chrome en Windows', at: ago(60 * 5 + 4), detail: 'Contraseña incorrecta' },
  { id: 'e6', type: 'ACCOUNT_LOCKED', user: 'Mario Flores', ip: '45.77.12.9', device: 'Chrome en Windows', at: ago(60 * 5), detail: 'Bloqueo de 15 min (nivel 1)' },
  { id: 'e7', type: 'LOGIN_OK', user: 'Ana Quispe', ip: '10.0.0.5', device: 'Chrome en Windows', at: ago(95) },
  { id: 'e8', type: 'LOGIN_OK', user: 'Luis Mamani', ip: '10.0.0.12', device: 'Firefox en Linux', at: ago(180) },
  { id: 'e9', type: 'REFRESH_REUSE', user: 'Carla Soto', ip: '181.115.4.77', device: 'Chrome en Android', at: ago(60 * 8), detail: 'Se revocó la sesión completa' },
  { id: 'e10', type: 'DEVICE_NEW', user: 'Carla Soto', ip: '190.129.3.8', device: 'Chrome en Android', at: ago(60 * 5), detail: 'Pendiente de aprobación' },
  { id: 'e11', type: 'PASSWORD_CHANGED', user: 'Marta Rojas', ip: '200.87.14.31', device: 'Chrome en Windows', at: ago(60 * 24) },
  { id: 'e12', type: 'DEVICE_APPROVED', user: 'Marta Rojas', ip: '200.87.14.31', device: 'Chrome en Windows', at: ago(60 * 24 * 70), detail: 'Por Administrador' },
  { id: 'e13', type: 'USER_DISABLED', user: 'Rosa Choque', ip: '10.0.0.2', device: '—', at: ago(60 * 24 * 20), detail: 'Por Administrador' },
  { id: 'e14', type: 'PASSWORD_RESET', user: 'Usuario Nuevo', ip: '10.0.0.2', device: '—', at: ago(60 * 24 * 2), detail: 'Contraseña temporal emitida' },
  { id: 'e15', type: 'LOGOUT', user: 'Diego Pérez', ip: '10.0.0.61', device: 'Chrome en Windows', at: ago(60 * 30) },
];

export const DOCS: AdminDoc[] = [
  { id: 'x1', title: 'Contrato de servicios 2026', owner: 'Ana Quispe', status: 'En revisión', versions: 3, downloads: 7, lastAccess: ago(22), size: '85 KB' },
  { id: 'x2', title: 'Presupuesto trimestral Q2', owner: 'Ana Quispe', status: 'Aprobado', versions: 2, downloads: 15, lastAccess: ago(60 * 26), size: '210 KB' },
  { id: 'x3', title: 'Manual de inducción', owner: 'Ana Quispe', status: 'Borrador', versions: 1, downloads: 2, lastAccess: ago(60 * 24 * 8), size: '1.4 MB' },
  { id: 'x4', title: 'Acta de reunión – Comité de compras', owner: 'Marta Rojas', status: 'Aprobado', versions: 1, downloads: 11, lastAccess: ago(60 * 3), size: '313 KB' },
  { id: 'x5', title: 'Política de gastos de viaje', owner: 'Jorge Vargas', status: 'Rechazado', versions: 1, downloads: 4, lastAccess: ago(60 * 24 * 2), size: '62 KB' },
  { id: 'x6', title: 'Inventario de activos 2026', owner: 'Luis Mamani', status: 'Aprobado', versions: 5, downloads: 28, lastAccess: ago(60 * 6), size: '640 KB' },
];

export const DOWNLOADS: AdminDownload[] = [
  { id: 'dl1', doc: 'Contrato de servicios 2026', user: 'Luis Mamani', version: 3, ip: '10.0.0.12', channel: 'chat', at: ago(22) },
  { id: 'dl2', doc: 'Inventario de activos 2026', user: 'Elena Torres', version: 5, ip: '10.0.0.40', channel: 'documentos', at: ago(60 * 6) },
  { id: 'dl3', doc: 'Acta de reunión – Comité de compras', user: 'Ana Quispe', version: 1, ip: '10.0.0.5', channel: 'chat', at: ago(60 * 3) },
  { id: 'dl4', doc: 'Presupuesto trimestral Q2', user: 'Marta Rojas', version: 2, ip: '200.87.14.31', channel: 'documentos', at: ago(60 * 27) },
  { id: 'dl5', doc: 'Política de gastos de viaje', user: 'Ana Quispe', version: 1, ip: '10.0.0.5', channel: 'documentos', at: ago(60 * 24 * 2) },
  { id: 'dl6', doc: 'Inventario de activos 2026', user: 'Carla Soto', version: 4, ip: '190.129.3.8', channel: 'chat', at: ago(60 * 30) },
  { id: 'dl7', doc: 'Manual de inducción', user: 'Pablo Rivas', version: 1, ip: '200.87.14.55', channel: 'documentos', at: ago(60 * 24 * 8) },
];

export const IP_RULES: IpRule[] = [
  { id: 'i1', type: 'ALLOW', cidr: '10.0.0.0/24', label: 'Oficina central', profile: 'Sucursal', source: 'MANUAL' },
  { id: 'i2', type: 'ALLOW', cidr: '200.87.14.0/27', label: 'Sucursal Norte', profile: 'Sucursal', source: 'MANUAL' },
  { id: 'i3', type: 'ALLOW', cidr: '190.129.3.0/28', label: 'Sucursal Sur', profile: 'Sucursal', source: 'MANUAL' },
  { id: 'i4', type: 'DENY', cidr: '45.77.12.9/32', label: 'Intentos masivos de login', source: 'AUTO', expires: ago(-60 * 20) },
  { id: 'i5', type: 'DENY', cidr: '185.220.101.0/24', label: 'Red anónima (Tor)', source: 'MANUAL' },
];

export const PROFILES: RateProfile[] = [
  { id: 'p1', name: 'Estándar', general: 120, write: 40, upload: 10, download: 30, auth: 10, ws: 10, users: 22 },
  { id: 'p2', name: 'Sucursal', general: 400, write: 120, upload: 30, download: 90, auth: 40, ws: 25, users: 0 },
  { id: 'p3', name: 'Administrador', general: 300, write: 100, upload: 30, download: 60, auth: 10, ws: 20, users: 2 },
  { id: 'p4', name: 'Restringido', general: 40, write: 10, upload: 2, download: 8, auth: 5, ws: 3, users: 1 },
];

export const COUNTRIES: Country[] = [
  { code: 'BO', name: 'Bolivia', allowed: true }, { code: 'AR', name: 'Argentina', allowed: false },
  { code: 'BR', name: 'Brasil', allowed: false }, { code: 'CL', name: 'Chile', allowed: false },
  { code: 'PE', name: 'Perú', allowed: false }, { code: 'PY', name: 'Paraguay', allowed: false },
  { code: 'US', name: 'Estados Unidos', allowed: false }, { code: 'ES', name: 'España', allowed: false },
];

export const SECTIONS: Section[] = [
  { id: 'sec1', name: 'Contabilidad', head: 'Marta Rojas', members: 18, groups: 2 },
  { id: 'sec2', name: 'Compras', head: 'Luis Mamani', members: 9, groups: 1 },
  { id: 'sec3', name: 'Logística', head: 'Jorge Vargas', members: 22, groups: 2 },
  { id: 'sec4', name: 'Recursos Humanos', head: 'Pablo Rivas', members: 7, groups: 1 },
  { id: 'sec5', name: 'Sucursal Norte', head: 'Carla Soto', members: 34, groups: 3 },
];
export const ADMIN_GROUPS: AdminGroup[] = [
  { id: 'ag1', name: 'Contabilidad', section: 'Contabilidad', members: 18, privacy: 'Privado' },
  { id: 'ag2', name: 'Cierres contables', section: 'Contabilidad', members: 6, privacy: 'Privado' },
  { id: 'ag3', name: 'Proyecto Alfa', section: 'Compras', members: 9, privacy: 'Privado' },
  { id: 'ag4', name: 'Logística', section: 'Logística', members: 22, privacy: 'Privado' },
  { id: 'ag5', name: 'Sucursal Norte', section: 'Sucursal Norte', members: 34, privacy: 'Público' },
  { id: 'ag6', name: 'Deporte y bienestar', section: 'Recursos Humanos', members: 41, privacy: 'Público' },
];

export const LOGINS_7D = [
  { day: 'Lun', ok: 24, fail: 3 }, { day: 'Mar', ok: 27, fail: 2 }, { day: 'Mié', ok: 29, fail: 6 }, { day: 'Jue', ok: 26, fail: 1 },
  { day: 'Vie', ok: 30, fail: 4 }, { day: 'Sáb', ok: 9, fail: 0 }, { day: 'Hoy', ok: 18, fail: 5 },
];
