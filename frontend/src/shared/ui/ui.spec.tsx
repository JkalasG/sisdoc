import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DateTimeField, formatFechaHora } from './DateTimeField';
import { FilePreview } from './FilePreview';
import { Modal } from './primitives';
import { Switch } from './Switch';

function Campo({ inicial, max }: { inicial: string; max?: Date }) {
  const [v, setV] = useState(inicial);
  return <><DateTimeField id="f" value={v} onChange={setV} max={max} /><output aria-label="valor">{v}</output></>;
}

describe('DateTimeField (fecha y hora)', () => {
  const inicial = new Date(2026, 9, 30, 14, 5).toISOString(); // 30/10/2026 14:05 local

  it('muestra fecha y hora, abre el calendario y cambia el día conservando la hora', async () => {
    const user = userEvent.setup();
    render(<Campo inicial={inicial} />);
    expect(screen.getByRole('button', { name: /30\/10\/2026 14:05/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /30\/10\/2026/ }));
    const cal = screen.getByRole('dialog', { name: 'Calendario' });
    expect(within(cal).getByText('octubre 2026')).toBeInTheDocument();
    await user.click(within(cal).getByRole('button', { name: '15 de octubre de 2026' }));
    expect(screen.getByRole('button', { name: /15\/10\/2026 14:05/ })).toBeInTheDocument();
  });

  it('permite cambiar la hora y los minutos', async () => {
    const user = userEvent.setup();
    render(<Campo inicial={inicial} />);
    await user.click(screen.getByRole('button', { name: /30\/10\/2026/ }));
    const cal = screen.getByRole('dialog', { name: 'Calendario' });
    await user.clear(within(cal).getByLabelText('Hora'));
    await user.type(within(cal).getByLabelText('Hora'), '9');
    await user.clear(within(cal).getByLabelText('Minutos'));
    await user.type(within(cal).getByLabelText('Minutos'), '30');
    expect(formatFechaHora(new Date(screen.getByLabelText('valor').textContent!))).toBe('30/10/2026 09:30');
  });

  it('navega entre meses y bloquea fechas posteriores al máximo', async () => {
    const user = userEvent.setup();
    render(<Campo inicial={inicial} max={new Date(2026, 9, 31, 12, 0)} />);
    await user.click(screen.getByRole('button', { name: /30\/10\/2026/ }));
    const cal = screen.getByRole('dialog', { name: 'Calendario' });
    expect(within(cal).getByRole('button', { name: '31 de octubre de 2026' })).toBeEnabled();
    expect(within(cal).getByRole('button', { name: '1 de noviembre de 2026' })).toBeDisabled();
    expect(within(cal).getByRole('button', { name: 'Mes siguiente' })).toBeDisabled();
    await user.click(within(cal).getByRole('button', { name: 'Mes anterior' }));
    expect(within(cal).getByText('septiembre 2026')).toBeInTheDocument();
  });

  it('la hora se limita al máximo (no se puede elegir el futuro) y Escape cierra', async () => {
    const user = userEvent.setup();
    render(<Campo inicial={inicial} max={new Date(2026, 9, 30, 15, 0)} />);
    await user.click(screen.getByRole('button', { name: /30\/10\/2026/ }));
    const cal = screen.getByRole('dialog', { name: 'Calendario' });
    await user.clear(within(cal).getByLabelText('Hora'));
    await user.type(within(cal).getByLabelText('Hora'), '23');
    expect(formatFechaHora(new Date(screen.getByLabelText('valor').textContent!))).toBe('30/10/2026 15:00');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Calendario' })).not.toBeInTheDocument();
  });
});

describe('DateTimeField dentro de un modal', () => {
  it('Escape cierra primero el calendario y recién el siguiente Escape cierra el modal', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal title="Cargar" onClose={onClose}><Campo inicial={new Date(2026, 9, 30, 14, 5).toISOString()} /></Modal>);
    await user.click(screen.getByRole('button', { name: /30\/10\/2026/ }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Calendario' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Switch', () => {
  it('es un interruptor accesible que alterna entre dos estados con nombre', async () => {
    const user = userEvent.setup();
    function Demo() {
      const [v, setV] = useState(false);
      return <Switch checked={v} onChange={setV} label="Documento revisado" labelOff="Borrador" labelOn="Revisado" />;
    }
    render(<Demo />);
    const sw = screen.getByRole('switch', { name: 'Documento revisado' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await user.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByText('Documento revisado')); // también responde al clic en la etiqueta
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });
});

describe('FilePreview', () => {
  it('imagen y PDF usan una URL local que se libera al desmontar', () => {
    const create = vi.fn(() => 'blob:abc');
    const revoke = vi.fn();
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    const { unmount, rerender } = render(<FilePreview file={new File(['x'], 'foto.png', { type: 'image/png' })} />);
    expect(screen.getByRole('img', { name: /foto.png/ })).toHaveAttribute('src', 'blob:abc');
    rerender(<FilePreview file={new File(['x'], 'norma.pdf', { type: 'application/pdf' })} />);
    expect(screen.getByTitle(/norma.pdf/)).toBeInTheDocument();
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:abc');
  });

  it('texto muestra el contenido; un tipo desconocido muestra su ficha', async () => {
    const { rerender } = render(<FilePreview file={new File(['hola mundo'], 'nota.txt', { type: 'text/plain' })} />);
    await waitFor(() => expect(screen.getByText('hola mundo')).toBeInTheDocument());
    rerender(<FilePreview file={new File(['x'], 'a.zip', { type: 'application/zip' })} />);
    expect(screen.getByText('Sin vista previa para este tipo de archivo')).toBeInTheDocument();
  });
});
