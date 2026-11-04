import { INestApplication, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ServerOptions } from 'socket.io';

/**
 * Socket.IO sobre Redis (pub/sub): con varias instancias del backend, un mensaje enviado en una llega
 * a quienes están conectados a las demás. Con una sola instancia no hace falta y se omite (sin REDIS_URL).
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly log = new Logger('RedisIoAdapter');
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  async connect(url: string, timeoutMs = 4000): Promise<void> {
    const pub = new Redis(url, { connectTimeout: timeoutMs, maxRetriesPerRequest: null, enableOfflineQueue: true });
    const sub = pub.duplicate();
    for (const c of [pub, sub]) c.on('error', (e) => this.log.warn(`Redis: ${e.message}`));
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.all([pub.ping(), sub.ping()]),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`sin respuesta de Redis en ${timeoutMs} ms`)), timeoutMs); }),
      ]);
    } catch (e) {
      pub.disconnect(); sub.disconnect();
      throw e;
    } finally {
      clearTimeout(timer);
    }
    this.adapterConstructor = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}

/** Activa el adaptador si hay REDIS_URL. En producción, si Redis no responde, el arranque falla (no se degrada en silencio). */
export async function useRedisForSockets(app: INestApplication, env = process.env): Promise<boolean> {
  const url = env.REDIS_URL?.trim();
  const log = new Logger('Sockets');
  if (!url) { log.warn('REDIS_URL vacío: tiempo real en una sola instancia.'); return false; }
  const adapter = new RedisIoAdapter(app);
  try {
    await adapter.connect(url);
  } catch (e) {
    if (env.NODE_ENV === 'production') throw e;
    log.warn(`Redis no disponible (${(e as Error).message}): tiempo real en una sola instancia.`);
    return false;
  }
  app.useWebSocketAdapter(adapter);
  log.log('Tiempo real distribuido por Redis.');
  return true;
}
