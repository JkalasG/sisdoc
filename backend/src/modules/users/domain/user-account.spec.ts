import { ConflictError, ForbiddenError, ValidationError } from '../../../shared/domain/domain-error';
import { RandomPasswordGenerator } from '../infrastructure/random-password.generator';
import { validatePassword } from '../../auth/domain/password-policy';
import {
  Account, assertCanChangeRoles, assertCanDisable, isAdmin, validateNewAccount, validateRoles,
} from './user-account';

const acc = (over: Partial<Account> = {}): Account => ({
  id: 'u1', email: 'a@empresa.com', displayName: 'Ana', status: 'ACTIVE', roles: ['USUARIO'],
  mustChangePassword: false, lockedUntil: null, lastLoginAt: null, createdAt: new Date(), liveSessions: 0, ...over,
});

describe('Datos de un usuario nuevo', () => {
  it('normaliza correo y nombre', () => {
    expect(validateNewAccount({ email: ' ANA@Empresa.COM ', displayName: '  Ana   María ' }, [])).toEqual({
      email: 'ana@empresa.com', displayName: 'Ana María', roles: ['USUARIO'],
    });
  });
  it.each(['', 'sin-arroba', 'a@b', 'a b@c.com', '@c.com'])('rechaza el correo "%s"', (email) => {
    expect(() => validateNewAccount({ email, displayName: 'Ana' }, [])).toThrow(ValidationError);
  });
  it('limita el dominio cuando está configurado', () => {
    expect(() => validateNewAccount({ email: 'a@otro.com', displayName: 'Ana' }, ['empresa.com'])).toThrow(/@empresa.com/);
    expect(validateNewAccount({ email: 'a@empresa.com', displayName: 'Ana' }, ['empresa.com']).email).toBe('a@empresa.com');
  });
  it('el nombre debe tener entre 2 y 120 caracteres', () => {
    expect(() => validateNewAccount({ email: 'a@empresa.com', displayName: ' A ' }, [])).toThrow(ValidationError);
    expect(() => validateNewAccount({ email: 'a@empresa.com', displayName: 'x'.repeat(121) }, [])).toThrow(ValidationError);
  });
});

describe('Roles', () => {
  it('sin roles → USUARIO; quita duplicados; rechaza desconocidos', () => {
    expect(validateRoles()).toEqual(['USUARIO']);
    expect(validateRoles([])).toEqual(['USUARIO']);
    expect(validateRoles(['ADMIN', 'ADMIN'])).toEqual(['ADMIN']);
    expect(() => validateRoles(['ROOT'])).toThrow(ValidationError);
  });
  it('solo un ADMIN activo cuenta como administrador', () => {
    expect(isAdmin({ roles: ['ADMIN'], status: 'ACTIVE' })).toBe(true);
    expect(isAdmin({ roles: ['ADMIN'], status: 'DISABLED' })).toBe(false);
    expect(isAdmin({ roles: ['AUDITOR'], status: 'ACTIVE' })).toBe(false);
  });
});

describe('Protecciones de administración', () => {
  it('no te deshabilitas a ti mismo ni al último admin', () => {
    expect(() => assertCanDisable('u1', acc(), 3)).toThrow(ForbiddenError);
    expect(() => assertCanDisable('otro', acc({ roles: ['ADMIN'] }), 1)).toThrow(ConflictError);
    expect(() => assertCanDisable('otro', acc({ roles: ['ADMIN'] }), 2)).not.toThrow();
    expect(() => assertCanDisable('otro', acc(), 1)).not.toThrow();
  });
  it('no te quitas el rol ADMIN ni se lo quitas al último', () => {
    expect(() => assertCanChangeRoles('u1', acc({ roles: ['ADMIN'] }), ['USUARIO'], 3)).toThrow(ForbiddenError);
    expect(() => assertCanChangeRoles('otro', acc({ roles: ['ADMIN'] }), ['USUARIO'], 1)).toThrow(ConflictError);
    expect(() => assertCanChangeRoles('otro', acc({ roles: ['ADMIN'] }), ['USUARIO'], 2)).not.toThrow();
    expect(() => assertCanChangeRoles('u1', acc({ roles: ['ADMIN'] }), ['ADMIN', 'AUDITOR'], 1)).not.toThrow();
  });
});

describe('Clave temporal', () => {
  const gen = new RandomPasswordGenerator();
  it('cumple la política de contraseñas de auth (12+ caracteres) y tiene los 4 tipos de carácter', () => {
    for (let i = 0; i < 50; i++) {
      const p = gen.generate();
      expect(p).toHaveLength(16);
      expect(validatePassword(p, { email: 'ana@empresa.com' })).toEqual([]);
      expect(p).toMatch(/[A-Z]/); expect(p).toMatch(/[a-z]/); expect(p).toMatch(/[0-9]/); expect(p).toMatch(/[^A-Za-z0-9]/);
    }
  });
  it('no se repite', () => {
    expect(new Set(Array.from({ length: 200 }, () => gen.generate())).size).toBe(200);
  });
});
