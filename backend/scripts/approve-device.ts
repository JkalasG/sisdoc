/**
 * Acceso de emergencia / arranque: aprueba por consola los dispositivos PENDING de un usuario.
 * Uso: npm run device:approve -- correo@dominio.com
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error('Indica el correo: npm run device:approve -- correo@dominio.com');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No existe el usuario ${email}`);

  const pending = await prisma.device.findMany({ where: { userId: user.id, status: 'PENDING' } });
  if (pending.length === 0) return console.log('No hay dispositivos pendientes.');

  for (const d of pending) {
    await prisma.device.update({
      where: { id: d.id },
      data: { status: 'TRUSTED', decidedAt: new Date(), decidedById: 'CLI', reason: 'Aprobado por consola' },
    });
    await prisma.securityEvent.create({
      data: { type: 'DEVICE_APPROVED', userId: user.id, deviceId: d.id, metadata: { by: 'CLI', label: d.label } },
    });
    console.log(`Aprobado: ${d.label ?? d.id} (IP ${d.firstIp ?? '?'})`);
  }
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
