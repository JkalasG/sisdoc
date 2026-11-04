import { ConflictError, ForbiddenError, ValidationError } from '../../../shared/domain/domain-error';

export const ROLES = ['ADMIN', 'MODERADOR', 'AUDITOR', 'USUARIO'] as const;
export type Role = (typeof ROLES)[number];
export type AccountStatus = 'ACTIVE' | 'DISABLED' | 'PENDING'; // PENDING = registrada con Google, a la espera de un administrador

export interface Account {
  id: string;
  email: string;
  displayName: string;
  status: AccountStatus;
  roles: string[];
  mustChangePassword: boolean;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  liveSessions: number;
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Valida y normaliza los datos de un usuario nuevo. `allowedDomains` vacío = cualquier dominio. */
export function validateNewAccount(
  input: { email: string; displayName: string; roles?: string[] },
  allowedDomains: readonly string[],
): { email: string; displayName: string; roles: Role[] } {
  const email = normalizeEmail(input.email);
  if (email.length > 254 || !EMAIL.test(email)) throw new ValidationError('El correo no es válido');
  const domain = email.split('@')[1];
  if (allowedDomains.length && !allowedDomains.includes(domain)) {
    throw new ValidationError(`El correo debe pertenecer a: ${allowedDomains.map((d) => `@${d}`).join(', ')}`);
  }
  const displayName = input.displayName.trim().replace(/\s+/g, ' ');
  if (displayName.length < 2 || displayName.length > 120) throw new ValidationError('El nombre debe tener entre 2 y 120 caracteres');
  return { email, displayName, roles: validateRoles(input.roles) };
}

/** Sin roles → USUARIO. Se rechazan roles desconocidos y se quitan duplicados. */
export function validateRoles(roles?: string[]): Role[] {
  if (!roles?.length) return ['USUARIO'];
  const unknown = roles.filter((r) => !(ROLES as readonly string[]).includes(r));
  if (unknown.length) throw new ValidationError(`Rol no válido: ${unknown.join(', ')}`);
  return [...new Set(roles)] as Role[];
}

export const isAdmin = (a: { roles: string[]; status: AccountStatus }): boolean =>
  a.status === 'ACTIVE' && a.roles.includes('ADMIN');

export const isLocked = (a: { lockedUntil: Date | null }, now: Date): boolean =>
  a.lockedUntil !== null && a.lockedUntil.getTime() > now.getTime();

/** Deshabilitar: no a ti mismo, y nunca al último administrador activo. */
export function assertCanDisable(actorId: string, target: Account, activeAdmins: number): void {
  if (actorId === target.id) throw new ForbiddenError('No puedes deshabilitar tu propia cuenta');
  if (isAdmin(target) && activeAdmins <= 1) throw new ConflictError('No se puede deshabilitar al último administrador activo');
}

/** Quitar el rol ADMIN: no a ti mismo, y nunca al último administrador activo. */
export function assertCanChangeRoles(actorId: string, target: Account, newRoles: readonly string[], activeAdmins: number): void {
  const losesAdmin = target.roles.includes('ADMIN') && !newRoles.includes('ADMIN');
  if (!losesAdmin) return;
  if (actorId === target.id) throw new ForbiddenError('No puedes quitarte a ti mismo el rol de administrador');
  if (isAdmin(target) && activeAdmins <= 1) throw new ConflictError('No se puede quitar el rol al último administrador activo');
}
