import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * Pruebas de arquitectura: hacen cumplir la regla de dependencias hexagonal y las fronteras entre módulos.
 * Si alguien rompe la arquitectura, el build falla.
 */
const SRC = __dirname;
const MODULES = join(SRC, 'modules');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}
const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

const files = walk(MODULES).filter((f) => !f.endsWith('.spec.ts') && !f.includes(`${sep}testing${sep}`));
const layerOf = (f: string) => relative(MODULES, f).split(sep)[1]; // modules/<mod>/<capa>/...
const moduleOf = (f: string) => relative(MODULES, f).split(sep)[0];

const INFRA_LIBS = ['@prisma/client', 'argon2', '@nestjs/jwt', 'express', 'socket.io', 'bullmq', 'ioredis', 'fs', 'fs/promises'];

describe('Arquitectura hexagonal', () => {
  it('hay módulos que verificar', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('el DOMINIO no depende de Nest, de librerías de infraestructura ni de capas externas', () => {
    const offenders = files.filter((f) => layerOf(f) === 'domain').flatMap((f) =>
      importsOf(f)
        .filter((i) => i.startsWith('@nestjs') || INFRA_LIBS.includes(i) || /\/(application|infrastructure|presentation)\//.test(i))
        .map((i) => `${relative(SRC, f)} → ${i}`));
    expect(offenders).toEqual([]);
  });

  it('la APLICACIÓN no depende de infraestructura ni de presentación ni de librerías técnicas', () => {
    const offenders = files.filter((f) => layerOf(f) === 'application').flatMap((f) =>
      importsOf(f)
        .filter((i) => INFRA_LIBS.includes(i) || /\/(infrastructure|presentation)\//.test(i))
        .map((i) => `${relative(SRC, f)} → ${i}`));
    expect(offenders).toEqual([]);
  });

  it('Prisma solo se usa en infraestructura', () => {
    const offenders = files
      .filter((f) => layerOf(f) !== 'infrastructure')
      .filter((f) => importsOf(f).some((i) => i === '@prisma/client' || i.includes('prisma.service')))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('un módulo solo accede a otro a través de su *.public-api.ts', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const imp of importsOf(f).filter((i) => i.startsWith('.'))) {
        const target = relative(MODULES, join(f, '..', imp)).split(sep);
        if (target[0] === '..' || target[0] === moduleOf(f)) continue; // fuera de modules/ o mismo módulo
        const isPublicApi = target[1]?.endsWith('.public-api');
        if (!isPublicApi) offenders.push(`${relative(SRC, f)} → ${imp}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('ningún módulo importa de shared/infrastructure salvo en su capa de infraestructura', () => {
    const offenders = files
      .filter((f) => layerOf(f) !== 'infrastructure')
      .filter((f) => importsOf(f).some((i) => i.includes('shared/infrastructure')))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
