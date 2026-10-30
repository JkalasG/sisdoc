/** Errores de negocio. La capa de presentación los traduce a HTTP (403, 404, 409...). */
export class DomainError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
  }
}
export class NotFoundError extends DomainError {
  constructor(what: string) {
    super(`${what} no encontrado`, 'NOT_FOUND');
  }
}
export class ForbiddenError extends DomainError {
  constructor(message = 'No tienes permiso para esta acción') {
    super(message, 'FORBIDDEN');
  }
}
export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION');
  }
}
export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT');
  }
}
