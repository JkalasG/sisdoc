import { beforeEach, describe, expect, it } from 'vitest';
import { initialState, loadState, persist } from './state';

beforeEach(() => localStorage.clear());

describe('Estado guardado del mock', () => {
  it('sin datos guardados arranca con los usuarios base, incluido el administrador', () => {
    expect(loadState().users.map((u) => u.email)).toContain('admin@empresa.com');
  });

  it('datos guardados por una versión anterior (sin admin) se completan y no bloquean el acceso', () => {
    const old = initialState();
    old.users = old.users.filter((u) => u.email !== 'admin@empresa.com'); // como el navegador de quien probó antes
    persist(old);
    const loaded = loadState();
    expect(loaded.users.some((u) => u.email === 'admin@empresa.com' && u.roles?.includes('ADMIN'))).toBe(true);
    expect(loaded.users.length).toBe(initialState().users.length);
  });

  it('conserva lo ya modificado (por ejemplo una contraseña cambiada)', () => {
    const s = initialState();
    s.users.find((u) => u.email === 'ana@empresa.com')!.password = 'Otra-Clave-Segura-9';
    persist(s);
    expect(loadState().users.find((u) => u.email === 'ana@empresa.com')!.password).toBe('Otra-Clave-Segura-9');
  });

  it('un valor corrupto en el almacenamiento no rompe la app', () => {
    localStorage.setItem('sisdoc-mock-db-v2', '{no es json');
    expect(loadState().users.length).toBeGreaterThan(0);
  });
});
