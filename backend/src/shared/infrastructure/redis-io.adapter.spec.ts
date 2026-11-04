import { INestApplication } from '@nestjs/common';
import { useRedisForSockets } from './redis-io.adapter';

const fakeApp = () => {
  const useWebSocketAdapter = jest.fn();
  return { app: { useWebSocketAdapter } as unknown as INestApplication, useWebSocketAdapter };
};

describe('Tiempo real distribuido por Redis (opcional)', () => {
  it('sin REDIS_URL no cambia nada: una sola instancia', async () => {
    const { app, useWebSocketAdapter } = fakeApp();
    expect(await useRedisForSockets(app, { REDIS_URL: '' } as NodeJS.ProcessEnv)).toBe(false);
    expect(useWebSocketAdapter).not.toHaveBeenCalled();
  });

  it('en desarrollo, si Redis no responde, sigue sin él (aviso, no caída)', async () => {
    const { app, useWebSocketAdapter } = fakeApp();
    const env = { REDIS_URL: 'redis://127.0.0.1:1', NODE_ENV: 'development' } as NodeJS.ProcessEnv;
    expect(await useRedisForSockets(app, env)).toBe(false);
    expect(useWebSocketAdapter).not.toHaveBeenCalled();
  }, 15000);

  it('en producción, si Redis no responde, el arranque FALLA (no se degrada en silencio con varias instancias)', async () => {
    const { app } = fakeApp();
    const env = { REDIS_URL: 'redis://127.0.0.1:1', NODE_ENV: 'production' } as NodeJS.ProcessEnv;
    await expect(useRedisForSockets(app, env)).rejects.toThrow();
  }, 15000);
});
