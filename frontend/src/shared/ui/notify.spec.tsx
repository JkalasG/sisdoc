import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify, Notifications, useNotify } from './notify';

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); useNotify.getState().clear(); });
afterEach(() => { useNotify.getState().clear(); vi.useRealTimers(); });

describe('Notificaciones (esquina superior derecha)', () => {
  it('se muestran como alertas ancladas arriba a la derecha, con título según el tipo', () => {
    render(<Notifications />);
    act(() => { notify.error('Contraseña incorrecta'); });
    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('Error');
    expect(alerta).toHaveTextContent('Contraseña incorrecta');
    expect(alerta.parentElement).toHaveClass('fixed', 'right-4', 'top-4');
  });

  it('cada tipo tiene su título', () => {
    render(<Notifications />);
    act(() => { notify.warning('a'); notify.success('b'); notify.info('c'); });
    const titulos = screen.getAllByRole('alert').map((a) => a.querySelector('p')!.textContent);
    expect(titulos).toEqual(['Atención', 'Listo', 'Información']);
  });

  it('desaparecen solas a los 7 s', () => {
    render(<Notifications />);
    act(() => { notify.error('x'); });
    act(() => { vi.advanceTimersByTime(6900); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('se pueden cerrar con la X', async () => {
    render(<Notifications />);
    act(() => { notify.error('x'); });
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('el mismo aviso repetido no se apila: se renueva y su cuenta regresiva reinicia', () => {
    render(<Notifications />);
    act(() => { notify.error('Contraseña incorrecta'); });
    act(() => { vi.advanceTimersByTime(5000); });
    act(() => { notify.error('Contraseña incorrecta'); });
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(5000); }); // 10 s desde el primero, 5 desde el último
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('muestra como máximo 4 a la vez (se van los más viejos)', () => {
    render(<Notifications />);
    act(() => { for (let i = 1; i <= 6; i++) notify.info(`aviso ${i}`); });
    const textos = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(textos).toHaveLength(4);
    expect(textos.join(' ')).toContain('aviso 6');
    expect(textos.join(' ')).not.toContain('aviso 1');
  });
});
