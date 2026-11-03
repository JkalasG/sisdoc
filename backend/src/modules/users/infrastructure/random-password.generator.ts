import { randomInt } from 'crypto';
import { Injectable } from '@nestjs/common';
import { TempPasswordGenerator } from '../application/ports';

// Sin caracteres ambiguos (0/O, 1/l/I) para que se pueda dictar o copiar sin errores.
const SETS = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '#$%&*+-=?@'];
const LENGTH = 16;

@Injectable()
export class RandomPasswordGenerator implements TempPasswordGenerator {
  generate(): string {
    const all = SETS.join('');
    const chars = SETS.map((s) => s[randomInt(s.length)]); // al menos uno de cada tipo
    while (chars.length < LENGTH) chars.push(all[randomInt(all.length)]);
    for (let i = chars.length - 1; i > 0; i--) { // Fisher–Yates con aleatoriedad criptográfica
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }
}
