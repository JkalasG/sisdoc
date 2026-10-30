import { DomainError } from '../../../shared/domain/domain-error';

/** Mismo mensaje para "no existe", "contraseña errónea", "deshabilitado" y "bloqueado": evita enumerar usuarios. */
export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('Credenciales inválidas o cuenta temporalmente bloqueada', 'INVALID_CREDENTIALS');
  }
}
export class UnauthenticatedError extends DomainError {
  constructor() {
    super('Sesión no válida', 'UNAUTHENTICATED');
  }
}
export class SessionLimitReachedError extends DomainError {
  constructor(max: number) {
    super(`Ya tienes ${max} sesiones abiertas. Cierra una para continuar.`, 'SESSION_LIMIT');
  }
}
export class DeviceBlockedError extends DomainError {
  constructor() {
    super('Este dispositivo no está autorizado', 'DEVICE_BLOCKED');
  }
}
export class PasswordChangeRequiredError extends DomainError {
  constructor() {
    super('Debes cambiar tu contraseña antes de continuar', 'PASSWORD_CHANGE_REQUIRED');
  }
}
