import { createHash } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

export const XRW = { 'X-Requested-With': 'XMLHttpRequest' };
export const PASSWORD = 'Clave-Segura-2026';
export const UA = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export const prisma = new PrismaClient();

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "users", "security_events", "documento_bitacora_accesos", "documentos" RESTART IDENTITY CASCADE',
  );
}

export async function createUser(email: string, over: Record<string, unknown> = {}, password = PASSWORD) {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 4096, timeCost: 2, parallelism: 1 });
  const user = await prisma.user.create({
    data: { email, displayName: email.split('@')[0], passwordHash, mustChangePassword: false, ...over },
  });
  await prisma.passwordHistory.create({ data: { userId: user.id, passwordHash } });
  return user;
}

/** Registra un dispositivo ya aprobado para el usuario y devuelve su clave (la que iría en la cookie). */
export async function trustDevice(userId: string, key = `dk-${Math.random().toString(36).slice(2)}`) {
  const device = await prisma.device.create({
    data: { userId, keyHash: sha(key), label: 'Chrome en Windows', status: 'TRUSTED' },
  });
  return { key, device };
}

export const cookiesOf = (res: request.Response): string[] =>
  ((res.headers['set-cookie'] as unknown as string[]) ?? []);
export const cookieNamed = (res: request.Response, name: string) =>
  cookiesOf(res).find((c) => c.startsWith(`${name}=`));
export const cookieValue = (res: request.Response, name: string) =>
  cookieNamed(res, name)?.split(';')[0].slice(name.length + 1);

export function login(app: INestApplication, email: string, password: string, deviceKey?: string, agent = request.agent(app.getHttpServer())) {
  let req = agent.post('/api/v1/auth/login').set(XRW).set('User-Agent', UA).send({ email, password });
  if (deviceKey) req = req.set('Cookie', `sisdoc_dk=${deviceKey}`);
  return req.then((res) => ({ res, agent }));
}

/** Crea usuario + dispositivo aprobado + sesión iniciada. Devuelve el "navegador" (agent) con sus cookies. */
export async function loggedInUser(app: INestApplication, email: string, over: Record<string, unknown> = {}) {
  const user = await createUser(email, over);
  const { key, device } = await trustDevice(user.id);
  const { res, agent } = await login(app, email, PASSWORD, key);
  if (res.status !== 200) throw new Error(`login falló: ${res.status} ${JSON.stringify(res.body)}`);
  return { user, device, deviceKey: key, agent, loginRes: res };
}

/** Un POST/PATCH con la cabecera anti-CSRF ya puesta. */
export const withXrw = (r: request.Test) => r.set(XRW);
