import { createReadStream } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve, sep } from 'path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileStorage } from '../domain/ports';

/** Adaptador de disco local. Las claves son UUID generados por el sistema, nunca nombres del usuario. */
@Injectable()
export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('STORAGE_DIR', './storage'));
  }

  /** Impide salir de la carpeta raíz aunque la clave llegue manipulada. */
  private pathOf(key: string): string {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error('Clave de almacenamiento inválida');
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body, { flag: 'wx' }); // 'wx': jamás sobrescribe una versión existente
  }

  async read(key: string) {
    return createReadStream(this.pathOf(key));
  }
}
