import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { useSession } from '@/features/auth/store/session';
import { mockControls } from '@/shared/api/mock/router';

const T = { timeout: 4000 };

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}><App /></MemoryRouter>
    </QueryClientProvider>,
  );
}

async function inChat() {
  renderApp();
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Correo', undefined, T), 'ana@empresa.com');
  await user.type(screen.getByLabelText('Contraseña'), 'Clave-Segura-2026');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  await screen.findByRole('region', { name: 'Crear publicación' }, T);
  await user.click(screen.getAllByRole('link', { name: 'Mensajes' })[0]);
  await screen.findByLabelText('Buscar chats', undefined, T);
  await screen.findByText('Luis Mamani', undefined, T);
  return user;
}
const openModal = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Chat nuevo' }));
  return within(await screen.findByRole('dialog'));
};

beforeEach(() => {
  mockControls.reset();
  useSession.setState({ status: 'loading', user: null, notice: null });
});

describe('Chat nuevo', () => {
  it('el botón abre un cuadro real (ya no es un aviso de prototipo)', async () => {
    const user = await inChat();
    const modal = await openModal(user);
    expect(modal.getByRole('tab', { name: 'Persona' })).toHaveAttribute('aria-selected', 'true');
    expect(modal.getByLabelText('Buscar persona')).toBeInTheDocument();
    expect(screen.queryByText(/prototipo/)).not.toBeInTheDocument();
  });

  it('lista a las demás personas, ordenadas, y NO te incluye a ti', async () => {
    const user = await inChat();
    const modal = await openModal(user);
    const lista = await modal.findByRole('list', { name: 'Personas' });
    const nombres = within(lista).getAllByRole('button').map((b) => b.querySelector('.font-semibold')!.textContent);
    expect(nombres).not.toContain('Ana Quispe');
    expect(nombres).toContain('Marta Rojas');
    expect(nombres).toEqual([...nombres].sort((a, b) => a!.localeCompare(b!)));
  });

  it('busca por nombre o correo y avisa cuando nadie coincide', async () => {
    const user = await inChat();
    const modal = await openModal(user);
    await user.type(modal.getByLabelText('Buscar persona'), 'jorge@');
    await waitFor(() => expect(modal.queryByText('Marta Rojas')).not.toBeInTheDocument(), T);
    expect(modal.getByText('Jorge Vargas')).toBeInTheDocument();
    await user.clear(modal.getByLabelText('Buscar persona'));
    await user.type(modal.getByLabelText('Buscar persona'), 'zzzz');
    expect(await modal.findByText('Nadie coincide con la búsqueda.', undefined, T)).toBeInTheDocument();
  });

  it('elegir a alguien SIN chat previo lo crea y abre la conversación vacía', async () => {
    const user = await inChat();
    const modal = await openModal(user);
    const total = screen.getAllByRole('listitem').length;
    await user.click(await modal.findByRole('button', { name: /Administrador/ }, T));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), T);
    expect(await screen.findByRole('button', { name: 'Ver información del chat' }, T)).toHaveTextContent('Administrador');
    expect(await screen.findByRole('button', { name: /Administrador/ }, T)).toHaveAttribute('aria-current', 'true'); // aparece en la lista y activo
    expect(screen.getAllByRole('listitem').length).toBe(total + 1);
  });

  it('elegir a alguien CON quien ya hay chat abre ese mismo (no crea otro)', async () => {
    const user = await inChat();
    const antes = screen.getAllByRole('listitem').length;
    const modal = await openModal(user);
    await user.click(await modal.findByRole('button', { name: /Marta Rojas/ }, T));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), T);
    expect(await screen.findByRole('button', { name: 'Ver información del chat' }, T)).toHaveTextContent('Marta Rojas');
    expect(screen.getAllByRole('listitem')).toHaveLength(antes); // la lista no creció: se abrió el chat existente
    expect(screen.getByRole('button', { name: /Marta Rojas/ })).toHaveAttribute('aria-current', 'true');
  });

  it('GRUPO: pide nombre y al menos 2 personas; con eso lo crea y lo abre', async () => {
    const user = await inChat();
    const modal = await openModal(user);
    await user.click(modal.getByRole('tab', { name: 'Grupo nuevo' }));
    const crear = modal.getByRole('button', { name: 'Crear grupo' });
    expect(crear).toBeDisabled();
    expect(modal.getByText('Elige al menos 2 personas.')).toBeInTheDocument();

    await user.click(await modal.findByRole('checkbox', { name: 'Marta Rojas' }, T));
    expect(modal.getByText(/1 persona elegida \(faltan 1\)/)).toBeInTheDocument();
    await user.type(modal.getByLabelText('Nombre del grupo'), 'Proyecto Piloto');
    expect(crear).toBeDisabled(); // aún falta una persona
    await user.click(modal.getByRole('checkbox', { name: 'Jorge Vargas' }));
    expect(crear).toBeEnabled();

    await user.click(crear);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), T);
    expect(await screen.findByRole('button', { name: 'Ver información del chat' }, T)).toHaveTextContent('Proyecto Piloto');
    await user.click(screen.getByRole('tab', { name: 'Grupos' }));
    expect(screen.getByRole('button', { name: /Proyecto Piloto/ })).toHaveAttribute('aria-current', 'true'); // en la lista y activo
  });

  it('GRUPO: un nombre en blanco mantiene el botón bloqueado y se puede deseleccionar a alguien', async () => {
    const user = await inChat();
    const modal = await openModal(user);
    await user.click(modal.getByRole('tab', { name: 'Grupo nuevo' }));
    await user.click(await modal.findByRole('checkbox', { name: 'Marta Rojas' }, T));
    await user.click(modal.getByRole('checkbox', { name: 'Jorge Vargas' }));
    await user.type(modal.getByLabelText('Nombre del grupo'), '   ');
    expect(modal.getByRole('button', { name: 'Crear grupo' })).toBeDisabled();
    await user.type(modal.getByLabelText('Nombre del grupo'), 'Equipo');
    expect(modal.getByRole('button', { name: 'Crear grupo' })).toBeEnabled();
    await user.click(modal.getByRole('checkbox', { name: 'Jorge Vargas' }));
    expect(modal.getByRole('button', { name: 'Crear grupo' })).toBeDisabled();
  });

  it('cancelar cierra el cuadro sin crear nada', async () => {
    const user = await inChat();
    const modal = await openModal(user);
    await user.click(modal.getByRole('tab', { name: 'Grupo nuevo' }));
    await user.click(modal.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Equipo')).not.toBeInTheDocument();
  });

  it('si el servidor rechaza la creación, muestra el motivo y deja el cuadro abierto', async () => {
    const user = await inChat();
    const modal = await openModal(user);
    const marta = await modal.findByRole('button', { name: /Marta Rojas/ }, T); // la lista ya cargó
    mockControls.set({ serverDown: true });
    await user.click(marta);
    expect(await screen.findByRole('alert', undefined, T)).toHaveTextContent(/No se pudo conectar/);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('la lista vacía invita a empezar un chat', async () => {
    renderApp();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Correo', undefined, T), 'ana@empresa.com');
    await user.type(screen.getByLabelText('Contraseña'), 'Clave-Segura-2026');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    await screen.findByRole('region', { name: 'Crear publicación' }, T);
    await user.click(screen.getAllByRole('link', { name: 'Mensajes' })[0]);
    await screen.findByText('Luis Mamani', undefined, T);
    await user.type(screen.getByLabelText('Buscar chats'), 'nada-coincide');
    await user.click(await screen.findByRole('button', { name: 'Empieza uno nuevo' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
