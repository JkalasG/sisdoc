import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../shared/domain/domain-error';
import { buildUsers } from '../testing/fakes';

describe('ManageUsersUseCase', () => {
  describe('quién puede administrar', () => {
    it('un usuario sin rol ADMIN no puede listar ni crear', async () => {
      const { repo, useCase } = buildUsers();
      const ana = repo.add({ email: 'ana@empresa.com' });
      await expect(useCase.list(ana.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(useCase.create({ actorId: ana.id }, { email: 'x@empresa.com', displayName: 'Xavier' })).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('un administrador deshabilitado ya no puede administrar', async () => {
      const { repo, useCase } = buildUsers();
      const viejo = repo.add({ email: 'viejo@empresa.com', roles: ['ADMIN'], status: 'DISABLED' });
      await expect(useCase.list(viejo.id)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('un actor que no existe es rechazado', async () => {
      const { useCase } = buildUsers();
      await expect(useCase.list('no-existe')).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('crear usuario', () => {
    it('crea la cuenta con clave temporal, obliga a cambiarla y deja evento', async () => {
      const { useCase, ctx, repo, events } = buildUsers();
      const r = await useCase.create(ctx, { email: '  Luis@Empresa.com ', displayName: ' Luis  Pérez ' });
      expect(r.user.email).toBe('luis@empresa.com');
      expect(r.user.displayName).toBe('Luis Pérez');
      expect(r.user.roles).toEqual(['USUARIO']);
      expect(r.user.mustChangePassword).toBe(true);
      expect(r.temporaryPassword).toMatch(/^Temp-1/);
      expect(repo.history).toHaveLength(1);
      expect(repo.history[0].hash).toBe(`h:${r.temporaryPassword}`); // se guarda el hash, nunca la clave
      expect(events.types()).toContain('USER_CREATED');
    });

    it('rechaza un correo repetido (sin distinguir mayúsculas)', async () => {
      const { useCase, ctx } = buildUsers();
      await useCase.create(ctx, { email: 'luis@empresa.com', displayName: 'Luis' });
      await expect(useCase.create(ctx, { email: 'LUIS@empresa.com', displayName: 'Otro Luis' })).rejects.toBeInstanceOf(ConflictError);
    });

    it('rechaza correo mal formado, nombre corto y roles desconocidos', async () => {
      const { useCase, ctx } = buildUsers();
      await expect(useCase.create(ctx, { email: 'no-es-correo', displayName: 'Luis' })).rejects.toBeInstanceOf(ValidationError);
      await expect(useCase.create(ctx, { email: 'a@empresa.com', displayName: 'L' })).rejects.toBeInstanceOf(ValidationError);
      await expect(useCase.create(ctx, { email: 'a@empresa.com', displayName: 'Ana', roles: ['SUPERUSUARIO'] })).rejects.toBeInstanceOf(ValidationError);
    });

    it('con dominios permitidos solo acepta esos correos', async () => {
      const { useCase, ctx } = buildUsers(['empresa.com']);
      await expect(useCase.create(ctx, { email: 'a@gmail.com', displayName: 'Ana' })).rejects.toBeInstanceOf(ValidationError);
      await expect(useCase.create(ctx, { email: 'a@empresa.com', displayName: 'Ana' })).resolves.toBeDefined();
    });

    it('cada usuario nuevo recibe una clave temporal distinta', async () => {
      const { useCase, ctx } = buildUsers();
      const a = await useCase.create(ctx, { email: 'a@empresa.com', displayName: 'Ana' });
      const b = await useCase.create(ctx, { email: 'b@empresa.com', displayName: 'Beto' });
      expect(a.temporaryPassword).not.toBe(b.temporaryPassword);
    });
  });

  describe('deshabilitar y habilitar', () => {
    it('deshabilitar cierra las sesiones del usuario y deja evento', async () => {
      const { useCase, ctx, repo, events } = buildUsers();
      const ana = repo.add({ email: 'ana@empresa.com', liveSessions: 2 });
      const r = await useCase.disable(ctx, ana.id);
      expect(r.status).toBe('DISABLED');
      expect(repo.revoked).toEqual([{ userId: ana.id, reason: 'USER_DISABLED' }]);
      expect(events.types()).toContain('USER_DISABLED');
    });

    it('no puedes deshabilitarte a ti mismo', async () => {
      const { useCase, ctx, admin } = buildUsers();
      await expect(useCase.disable(ctx, admin.id)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('con varios administradores uno puede deshabilitar a otro', async () => {
      const { useCase, repo, admin } = buildUsers();
      const otro = repo.add({ email: 'otro@empresa.com', roles: ['ADMIN'] });
      await expect(useCase.disable({ actorId: otro.id }, admin.id)).resolves.toMatchObject({ status: 'DISABLED' });
      expect(await repo.countActiveAdmins()).toBe(1);
    });

    it('habilitar reactiva la cuenta', async () => {
      const { useCase, ctx, repo, events } = buildUsers();
      const ana = repo.add({ email: 'ana@empresa.com', status: 'DISABLED' });
      expect((await useCase.enable(ctx, ana.id)).status).toBe('ACTIVE');
      expect(events.types()).toContain('USER_ENABLED');
    });

    it('un usuario inexistente da 404', async () => {
      const { useCase, ctx } = buildUsers();
      await expect(useCase.disable(ctx, 'fantasma')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('desbloquear', () => {
    it('quita el bloqueo y deja evento', async () => {
      const { useCase, ctx, repo, events } = buildUsers();
      const ana = repo.add({ email: 'ana@empresa.com', lockedUntil: new Date('2027-01-01') });
      expect((await useCase.unlock(ctx, ana.id)).lockedUntil).toBeNull();
      expect(events.types()).toContain('USER_UNLOCKED');
    });
  });

  describe('restablecer contraseña', () => {
    it('genera clave temporal, obliga a cambiarla, desbloquea y cierra sesiones', async () => {
      const { useCase, ctx, repo, events } = buildUsers();
      const ana = repo.add({ email: 'ana@empresa.com', lockedUntil: new Date('2027-01-01'), liveSessions: 1 });
      const r = await useCase.resetPassword(ctx, ana.id);
      expect(r.user.mustChangePassword).toBe(true);
      expect(r.user.lockedUntil).toBeNull();
      expect(r.temporaryPassword).toBeTruthy();
      expect(repo.revoked).toEqual([{ userId: ana.id, reason: 'ADMIN' }]);
      expect(repo.history.at(-1)).toEqual({ userId: ana.id, hash: `h:${r.temporaryPassword}` });
      expect(events.types()).toContain('USER_PASSWORD_RESET');
    });
  });

  describe('roles', () => {
    it('asigna roles válidos y registra el cambio', async () => {
      const { useCase, ctx, repo, events } = buildUsers();
      const ana = repo.add({ email: 'ana@empresa.com' });
      const r = await useCase.setRoles(ctx, ana.id, ['AUDITOR', 'MODERADOR', 'AUDITOR']);
      expect(r.roles).toEqual(['AUDITOR', 'MODERADOR']);
      expect(events.events.find((e) => e.type === 'USER_ROLES_CHANGED')?.metadata).toMatchObject({ from: ['USUARIO'], to: ['AUDITOR', 'MODERADOR'] });
    });

    it('rechaza roles inventados', async () => {
      const { useCase, ctx, repo } = buildUsers();
      const ana = repo.add({ email: 'ana@empresa.com' });
      await expect(useCase.setRoles(ctx, ana.id, ['DIOS'])).rejects.toBeInstanceOf(ValidationError);
    });

    it('un administrador no puede quitarse su propio rol', async () => {
      const { useCase, ctx, admin } = buildUsers();
      await expect(useCase.setRoles(ctx, admin.id, ['USUARIO'])).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('un administrador puede quitarle el rol a otro cuando hay más de uno', async () => {
      const { useCase, repo, admin } = buildUsers();
      const otro = repo.add({ email: 'otro@empresa.com', roles: ['ADMIN'] });
      await expect(useCase.setRoles({ actorId: otro.id }, admin.id, ['USUARIO'])).resolves.toMatchObject({ roles: ['USUARIO'] });
    });

    it('si el único admin activo es el objetivo, otro admin deshabilitado no puede quitárselo', async () => {
      const { useCase, repo, admin } = buildUsers();
      const inactivo = repo.add({ email: 'inactivo@empresa.com', roles: ['ADMIN'], status: 'DISABLED' });
      await expect(useCase.setRoles({ actorId: inactivo.id }, admin.id, ['USUARIO'])).rejects.toBeInstanceOf(ForbiddenError);
      expect(repo.accounts.get(admin.id)!.roles).toEqual(['ADMIN']);
    });
  });

  describe('listar', () => {
    it('filtra por texto y por estado', async () => {
      const { useCase, ctx, repo } = buildUsers();
      repo.add({ email: 'ana@empresa.com', displayName: 'Ana Quispe' });
      repo.add({ email: 'beto@empresa.com', status: 'DISABLED' });
      expect((await useCase.list(ctx.actorId, { q: 'quispe' })).map((a) => a.email)).toEqual(['ana@empresa.com']);
      expect((await useCase.list(ctx.actorId, { status: 'DISABLED' })).map((a) => a.email)).toEqual(['beto@empresa.com']);
      expect(await useCase.list(ctx.actorId)).toHaveLength(3);
    });
  });
});
