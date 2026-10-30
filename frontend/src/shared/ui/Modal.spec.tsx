import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal reutilizable', () => {
  it('se dibuja en el body con nombre accesible, descripción y pie fijo', () => {
    render(<Modal title="Cargar" description="Completa los datos" onClose={() => {}} footer={<button>Guardar</button>}><p>Contenido</p></Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Cargar' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Completa los datos');
    expect(dialog.parentElement?.parentElement).toBe(document.body); // portal
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });

  it('bloquea el scroll de la página mientras está abierto y lo libera al cerrar', () => {
    const { unmount } = render(<Modal title="A" onClose={() => {}}>x</Modal>);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('enfoca el primer campo y devuelve el foco al elemento que lo abrió', async () => {
    const user = userEvent.setup();
    function Demo() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Abrir</button>{open && <Modal title="M" onClose={() => setOpen(false)}><input aria-label="Código" /></Modal>}</>;
    }
    render(<Demo />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByLabelText('Código')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus();
  });

  it('atrapa el foco: Tab desde el último control vuelve al primero', async () => {
    const user = userEvent.setup();
    render(<Modal title="M" onClose={() => {}} footer={<button>Último</button>}><input aria-label="Primero" /></Modal>);
    await user.tab(); // Primero -> (X ya quedó antes) ...
    screen.getByRole('button', { name: 'Último' }).focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus(); // da la vuelta al principio del cuadro
  });

  it('cierra con la X, con Escape y con clic en el fondo; no con clic dentro', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal title="M" onClose={onClose}><p>dentro</p></Modal>);
    await user.click(screen.getByText('dentro'));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('un clic que empieza dentro y termina en el fondo (seleccionar texto) NO cierra', async () => {
    const onClose = vi.fn();
    render(<Modal title="M" onClose={onClose}><p>dentro</p></Modal>);
    const fondo = screen.getByRole('dialog').parentElement!;
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.mouseDown(screen.getByText('dentro'));
    fireEvent.mouseUp(fondo);
    fireEvent.click(fondo);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('con dismissible=false no hay X y Escape / fondo no cierran', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal title="¿Sigues ahí?" onClose={onClose} dismissible={false}>x</Modal>);
    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('con varios modales apilados, Escape cierra solo el de encima', async () => {
    const user = userEvent.setup();
    const a = vi.fn(), b = vi.fn();
    render(<><Modal title="Abajo" onClose={a}>x</Modal><Modal title="Arriba" onClose={b}>y</Modal></>);
    await user.keyboard('{Escape}');
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
  });
});
