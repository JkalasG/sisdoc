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
/** Otra pestaña acaba de rotar este refresh: el cliente debe reintentar con la cookie nueva. NO revoca la sesión. */
export class RefreshRaceError extends DomainError {
  constructor() {
    super('La sesión se está renovando; reintenta', 'REFRESH_IN_PROGRESS');
  }
}
/** El captcha falta o no es válido. Se evalúa ANTES de mirar las credenciales, así no revela nada de la cuenta. */
export class CaptchaFailedError extends DomainError {
  constructor() {
    super('Completa la verificación de seguridad e inténtalo de nuevo', 'CAPTCHA_FAILED');
  }
}
/** La identidad de Google es válida pero un administrador aún no activó la cuenta. Solo se dice tras verificar a Google. */
export class AccountPendingActivationError extends DomainError {
  constructor() {
    super('Tu cuenta aún no está activada. Contacta a un administrador para que la active.', 'ACCOUNT_PENDING_ACTIVATION');
  }
}
export class InvalidResetCodeError extends DomainError {
  constructor() {
    super('El código es incorrecto o venció. Solicita uno nuevo.', 'INVALID_RESET_CODE');
  }
}
export class PasswordResetDisabledError extends DomainError {
  constructor() {
    super('La recuperación de contraseña no está habilitada', 'PASSWORD_RESET_DISABLED');
  }
}
export class GoogleLoginDisabledError extends DomainError {
  constructor() {
    super('El acceso con Google no está habilitado', 'GOOGLE_DISABLED');
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
