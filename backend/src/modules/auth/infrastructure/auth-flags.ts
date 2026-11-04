import { ConfigService } from '@nestjs/config';

/** "true" / "1" / "yes" / "on" (sin importar mayúsculas) activan la opción; cualquier otra cosa la apaga. */
export const flag = (config: ConfigService, name: string): boolean =>
  ['true', '1', 'yes', 'on'].includes(String(config.get(name, '')).trim().toLowerCase());
