import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardián del sistema de diseño (reglas en docs/DISENO.md).
 * Falla si alguien vuelve a pintar con colores "sueltos" en vez de los tokens globales,
 * que es lo que rompe el modo oscuro y la consistencia entre pantallas.
 */
const SRC = join(__dirname, '..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(f) && !/\.spec\./.test(f) ? [p] : [];
  });

const RULES: Array<{ name: string; re: RegExp; allow?: RegExp; allowFiles?: RegExp }> = [
  { name: 'paleta de grises de Tailwind (usa ink / paper / line)', re: /\b(?:bg|text|border|ring|divide|fill|stroke)-(?:slate|gray|zinc|neutral|stone)-\d/ },
  { name: 'verdes/rojos de Tailwind (usa ok / danger)', re: /\b(?:bg|text|border|ring|divide)-(?:green|emerald|red)-\d/, allow: /dark:text-emerald/ },
  { name: 'bg-white (usa bg-surface)', re: /(?<![\w-])!?bg-white(?![\w/-])/, allow: /animate-progress/, allowFiles: /(Switch|FilePreview)\.tsx$/ }, // pulgar del interruptor y lienzo del PDF: siempre blancos
  { name: 'color hexadecimal en className', re: /className=[^\n]*#[0-9a-fA-F]{6}/ },
  { name: 'shadow-sm/md/lg (usa shadow-card o shadow-pop)', re: /(?<![\w-])shadow-(?:sm|md|lg|xl)\b/ },
];

describe('Sistema de diseño: solo tokens globales', () => {
  for (const rule of RULES) {
    it(`sin ${rule.name}`, () => {
      const offenders = files(SRC).flatMap((file) =>
        readFileSync(file, 'utf8').split('\n').flatMap((line, i) =>
          rule.re.test(line) && !(rule.allow && rule.allow.test(line)) && !(rule.allowFiles && rule.allowFiles.test(file)) ? [`${file.replace(SRC, 'src')}:${i + 1}`] : []));
      expect(offenders).toEqual([]);
    });
  }
});
