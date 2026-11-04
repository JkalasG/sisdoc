import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { useSession } from '@/features/auth/store/session';
import { mockControls } from '@/shared/api/mock/router';
import { appendMessage, flatten, MessagesData } from '../lib/message-history';
import type { MessageDTO } from '@/shared/api/types';

const T = { timeout: 4000 };

/** IntersectionObserver de mentira: nos deja «hacer visible» el centinela como lo haría el desplazamiento real. */
class FakeIO {
  static all: FakeIO[] = [];
  el: Element | null = null; gone = false;
  constructor(private cb: (e: Array<{ isIntersecting: boolean; target: Element }>) => void) { FakeIO.all.push(this); }
  observe(el: Element) { this.el = el; }
  unobserve() { /* sin uso */ }
  disconnect() { this.gone = true; }
  fire() { act(() => this.cb([{ isIntersecting: true, target: this.el! }])); }
  static live() { return FakeIO.all.filter((o) => !o.gone && o.el?.isConnected); }
}

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}><App /></MemoryRouter>
    </QueryClientProvider>,
  );
}

async function abrirAlfa() {
  renderApp();
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Correo', undefined, T), 'ana@empresa.com');
  await user.type(screen.getByLabelText('Contraseña'), 'Clave-Segura-2026');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  await screen.findByRole('region', { name: 'Crear publicación' }, T);
  await user.click(screen.getAllByRole('link', { name: 'Mensajes' })[0]);
  await user.click(await screen.findByRole('button', { name: /Proyecto Alfa/ }, T));
  const lista = await screen.findByTestId('mensajes', undefined, T);
  await within(lista).findByText('Reunión de arranque mañana 9:00', undefined, T);
  return lista;
}
const antiguos = (c: HTMLElement) => within(c).queryAllByText(/Mensaje antiguo n\.º/).length;

beforeEach(() => {
  FakeIO.all = [];
  vi.stubGlobal('IntersectionObserver', FakeIO);
  mockControls.reset();
  useSession.setState({ status: 'loading', user: null, notice: null });
});
afterEach(() => vi.unstubAllGlobals());

describe('Historial paginado del chat (carga por páginas con precarga)', () => {
  it('al abrir carga SOLO la página más reciente (20), no los 121 mensajes', async () => {
    const lista = await abrirAlfa();
    expect(antiguos(lista)).toBe(19); // 19 antiguos + el último («Reunión de arranque»)
    expect(within(lista).queryByText(/n\.º 1 del proyecto/)).not.toBeInTheDocument();
    expect(within(lista).getByText(/n\.º 120 del proyecto/)).toBeInTheDocument();
  });

  it('el centinela es el 10.º mensaje desde arriba: al llegar a él se precarga la página anterior', async () => {
    const lista = await abrirAlfa();
    const sentinel = FakeIO.live().at(-1)!;
    expect(sentinel.el!.textContent).toContain('n.º 112'); // índice 10 de la primera página
    sentinel.fire();
    await waitFor(() => expect(antiguos(lista)).toBe(39), T); // +20
    expect(within(lista).getByText(/n\.º 82 del proyecto/)).toBeInTheDocument();
  });

  it('encadena: tras cargar, el centinela se mueve al 10.º de arriba de lo cargado, y así hasta el inicio', async () => {
    const lista = await abrirAlfa();
    for (const esperado of [39, 59]) {
      FakeIO.live().at(-1)!.fire();
      await waitFor(() => expect(antiguos(lista)).toBe(esperado), T);
    }
    // El centinela ya no está en la primera página: está 10 mensajes por debajo del borde de lo cargado.
    expect(FakeIO.live().at(-1)!.el!.textContent).toContain('n.º 72');
  });

  it('en el último tramo desaparece el centinela y aparece el aviso de inicio de conversación', async () => {
    const lista = await abrirAlfa();
    expect(within(lista).queryByText(/quedan registrados/)).not.toBeInTheDocument();
    for (let i = 0; i < 6; i++) {
      const live = FakeIO.live();
      if (!live.length) break;
      const antes = antiguos(lista);
      live.at(-1)!.fire();
      await waitFor(() => expect(antiguos(lista)).toBeGreaterThan(antes), T);
    }
    expect(antiguos(lista)).toBe(120);
    expect(await within(lista).findByText(/quedan registrados/, undefined, T)).toBeInTheDocument();
    expect(FakeIO.live()).toHaveLength(0); // ya no hay nada más que pedir
  });

  it('un mensaje enviado se agrega al final sin repetir ni recargar el historial', async () => {
    const lista = await abrirAlfa();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mensaje'), 'Hola equipo');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await within(lista).findByText('Hola equipo', undefined, T)).toBeInTheDocument();
    expect(within(lista).getAllByText('Hola equipo')).toHaveLength(1);
    expect(antiguos(lista)).toBe(19);
  });
});

describe('Caché del historial', () => {
  const m = (id: string): MessageDTO => ({ id, conversationId: 'c', authorId: 'a', authorName: 'A', content: id, attachments: [], createdAt: '2026-01-01T00:00:00.000Z' });
  const data = (): MessagesData => ({ pages: [{ items: [m('4'), m('5')], nextCursor: 'x' }, { items: [m('2'), m('3')], nextCursor: null }], pageParams: [undefined, 'x'] });

  it('flatten ordena cronológicamente: la página más antigua primero', () => {
    expect(flatten(data()).map((x) => x.id)).toEqual(['2', '3', '4', '5']);
    expect(flatten(undefined)).toEqual([]);
  });

  it('appendMessage agrega a la página reciente, ignora duplicados y no crea caché de la nada', () => {
    const out = appendMessage(data(), m('6'))!;
    expect(flatten(out).map((x) => x.id)).toEqual(['2', '3', '4', '5', '6']);
    expect(out.pages[1].items.map((x) => x.id)).toEqual(['2', '3']); // la página antigua no se toca
    expect(flatten(appendMessage(out, m('6'))).map((x) => x.id)).toEqual(['2', '3', '4', '5', '6']);
    expect(flatten(appendMessage(out, m('3'))).length).toBe(5);
    expect(appendMessage(undefined, m('9'))).toBeUndefined();
  });
});
