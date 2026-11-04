import { createReadStream } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve, sep } from 'path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageStorage } from '../domain/ports';

/** Imágenes del chat en disco, aparte de los documentos (carpeta `chat-images/`). Claves = UUID del sistema. */
@Injectable()
export class LocalImageStorage implements ImageStorage {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('STORAGE_DIR', './storage'));
  }

  private pathOf(key: string): string {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error('Clave de almacenamiento inválida');
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body, { flag: 'wx' }); // nunca sobrescribe
  }

  async read(key: string) {
    return createReadStream(this.pathOf(key));
  }
}
