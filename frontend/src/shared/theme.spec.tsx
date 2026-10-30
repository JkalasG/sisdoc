import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, getThemePref } from './theme';
import { ThemeSwitch } from './ui/ThemeSwitch';

beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme; });

describe('Tema claro / oscuro', () => {
  it('por defecto sigue al sistema (en pruebas: claro)', () => {
    expect(getThemePref()).toBe('system');
    applyTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('el selector cambia el tema, lo recuerda y puede volver a claro', async () => {
    const user = userEvent.setup();
    render(<ThemeSwitch />);
    await user.click(screen.getByRole('radio', { name: 'Oscuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('sisdoc-theme')).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'Claro' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('una preferencia guardada inválida se ignora', () => {
    localStorage.setItem('sisdoc-theme', 'rosa');
    expect(getThemePref()).toBe('system');
  });
});
