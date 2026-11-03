import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

async function ensureUser(input: { email: string; displayName: string; password: string; mustChangePassword: boolean; roles?: string[] }) {
  const email = input.email.toLowerCase();
  const passwordHash = await argon2.hash(input.password, ARGON_OPTS);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      status: 'ACTIVE',
      failedAttempts: 0,
      lockoutLevel: 0,
      lockedUntil: null,
      ...(input.roles ? { roles: input.roles } : {}),
    },
    create: {
      email,
      displayName: input.displayName,
      passwordHash,
      mustChangePassword: input.mustChangePassword,
      roles: input.roles ?? [],
    },
  });

  const hasHistory = await prisma.passwordHistory.count({ where: { userId: user.id } });
  if (!hasHistory) {
    await prisma.passwordHistory.create({ data: { userId: user.id, passwordHash } });
  }
  return user;
}

/** Crea el administrador inicial y los usuarios de trabajo para pruebas con el backend real. */
async function main() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@sisdoc.local').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Cambiame-Ahora-2026!';

  await ensureUser({
    email: adminEmail,
    displayName: 'Administrador',
    password: adminPassword,
    mustChangePassword: true,
    roles: ['ADMIN'],
  });

  await ensureUser({
    email: 'ana@empresa.com',
    displayName: 'Ana Quispe',
    password: 'Segura#2026A',
    mustChangePassword: false,
  });

  await ensureUser({
    email: 'luis@empresa.com',
    displayName: 'Luis Rojas',
    password: 'Segura#2026L',
    mustChangePassword: false,
  });

  await ensureUser({
    email: 'admin@empresa.com',
    displayName: 'Carlos Mendoza (Admin)',
    password: 'Admin#2026S',
    mustChangePassword: false,
    roles: ['ADMIN'],
  });

  console.log('Usuarios listos en PostgreSQL:');
  console.log(`  1) ${adminEmail} / ${adminPassword} (pide cambio de contraseña al primer ingreso)`);
  console.log('  2) ana@empresa.com / Segura#2026A (lista para usar)');
  console.log('  3) luis@empresa.com / Segura#2026L (listo para usar)');
  console.log('  4) admin@empresa.com / Admin#2026S (listo para usar)');
  console.log('Recuerda aprobar el dispositivo tras el primer intento con: npm run device:approve -- <correo>');
}

main().finally(() => prisma.$disconnect());
