import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { useSession } from '@/features/auth/store/session';
import { mockControls } from '@/shared/api/mock/router';

const T = { timeout: 5000 };

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}><App /></MemoryRouter>
    </QueryClientProvider>,
  );
}

type User = ReturnType<typeof userEvent.setup>;
async function inLuis(opts: Parameters<typeof userEvent.setup>[0] = {}) {
  renderApp();
  const user = userEvent.setup(opts);
  await user.type(await screen.findByLabelText('Correo', undefined, T), 'ana@empresa.com');
  await user.type(screen.getByLabelText('Contraseña'), 'Clave-Segura-2026');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  await screen.findByRole('region', { name: 'Crear publicación' }, T);
  await user.click(screen.getAllByRole('link', { name: 'Mensajes' })[0]);
  await user.click(await screen.findByRole('button', { name: /Luis Mamani/ }, T));
  const lista = await screen.findByTestId('mensajes', undefined, T);
  await within(lista).findByText('Recibido, lo reviso esta tarde.', undefined, T);
  return { user, lista };
}
const thread = () => within(screen.getByTestId('mensajes'));
const bubbleOf = (text: string) => thread().getByText(text).closest('.group') as HTMLElement;
const typeAndSend = async (user: User, text: string) => {
  await user.type(screen.getByLabelText('Mensaje'), text);
  await user.click(screen.getByRole('button', { name: 'Enviar' }));
  await thread().findByText(text, undefined, T);
};

beforeEach(() => {
  localStorage.clear();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  mockControls.reset();
  useSession.setState({ status: 'loading', user: null, notice: null });
});

describe('Emojis', () => {
  it('el selector tiene categorías, busca en español y mete el emoji donde está el cursor', async () => {
    const { user } = await inLuis();
    const box = screen.getByLabelText('Mensaje') as HTMLTextAreaElement;
    await user.type(box, 'Hola  amigos');
    box.setSelectionRange(5, 5); // entre los dos espacios
    await user.click(screen.getByRole('button', { name: 'Emojis' }));
    const picker = within(screen.getByRole('group', { name: 'Emojis' }));
    expect(picker.getAllByRole('tab').length).toBeGreaterThanOrEqual(8);
    await user.type(picker.getByLabelText('Buscar emoji'), 'fuego');
    await user.click(picker.getByRole('button', { name: /fuego/ }));
    expect(box.value).toBe('Hola 🔥 amigos');
  });

  it('busca sin importar tildes ni mayúsculas, y avisa cuando nada coincide', async () => {
    const { user } = await inLuis();
    await user.click(screen.getByRole('button', { name: 'Emojis' }));
    const picker = within(screen.getByRole('group', { name: 'Emojis' }));
    await user.type(picker.getByLabelText('Buscar emoji'), 'CORAZÓN');
    expect(picker.getAllByRole('button', { name: /corazon/ }).length).toBeGreaterThan(5);
    await user.clear(picker.getByLabelText('Buscar emoji'));
    await user.type(picker.getByLabelText('Buscar emoji'), 'zzzzqq');
    expect(picker.getByText('Ningún emoji coincide.')).toBeInTheDocument();
  });

  it('recuerda los usados en «Recientes», cambia de categoría y se cierra con Esc', async () => {
    const { user } = await inLuis();
    await user.click(screen.getByRole('button', { name: 'Emojis' }));
    let picker = within(screen.getByRole('group', { name: 'Emojis' }));
    await user.click(picker.getByRole('tab', { name: 'Recientes' }));
    expect(picker.getByText('Aquí aparecerán los emojis que uses.')).toBeInTheDocument();
    await user.click(picker.getByRole('tab', { name: 'Corazones y símbolos' }));
    await user.click(picker.getByRole('button', { name: /^rayo/ }));
    expect((screen.getByLabelText('Mensaje') as HTMLTextAreaElement).value).toBe('⚡');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Emojis' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Emojis' }));
    picker = within(screen.getByRole('group', { name: 'Emojis' }));
    expect(picker.getByRole('tab', { name: 'Recientes' })).toHaveAttribute('aria-selected', 'true'); // abre en lo último usado
    expect(picker.getAllByRole('button').some((b) => b.textContent === '⚡')).toBe(true);
  });
});

describe('Responder a un mensaje', () => {
  it('Responder muestra a quién respondes; al enviar, el mensaje lleva la cita, y se puede cancelar', async () => {
    const { user } = await inLuis();
    await user.click(within(bubbleOf('Recibido, lo reviso esta tarde.')).getByRole('button', { name: 'Responder' }));
    const bar = screen.getByRole('status', { name: 'Respondiendo a un mensaje' });
    expect(bar).toHaveTextContent('Respondiendo a Luis Mamani');
    expect(bar).toHaveTextContent('Recibido, lo reviso esta tarde.');

    await user.click(within(bar).getByRole('button', { name: 'Cancelar respuesta' }));
    expect(screen.queryByRole('status', { name: 'Respondiendo a un mensaje' })).not.toBeInTheDocument();

    await user.click(within(bubbleOf('Recibido, lo reviso esta tarde.')).getByRole('button', { name: 'Responder' }));
    await typeAndSend(user, 'Gracias, avísame');
    const nuevo = bubbleOf('Gracias, avísame');
    expect(within(nuevo).getByRole('button', { name: 'Ir al mensaje original de Luis Mamani' })).toHaveTextContent('Recibido, lo reviso esta tarde.');
    expect(screen.queryByRole('status', { name: 'Respondiendo a un mensaje' })).not.toBeInTheDocument(); // la barra se limpia
  });

  it('tocar la cita lleva al mensaje original y lo resalta', async () => {
    const { user, lista } = await inLuis();
    await user.click(within(bubbleOf('Recibido, lo reviso esta tarde.')).getByRole('button', { name: 'Responder' }));
    await typeAndSend(user, 'Respuesta con cita');
    await user.click(within(bubbleOf('Respuesta con cita')).getByRole('button', { name: /Ir al mensaje original/ }));
    await waitFor(() => expect(lista.querySelector('[data-mid="m3"] .ring-2')).not.toBeNull(), T);
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }));
  });

  it('Esc en el cuadro de texto cancela la respuesta', async () => {
    const { user } = await inLuis();
    await user.click(within(bubbleOf('Recibido, lo reviso esta tarde.')).getByRole('button', { name: 'Responder' }));
    await user.type(screen.getByLabelText('Mensaje'), '{Escape}');
    expect(screen.queryByRole('status', { name: 'Respondiendo a un mensaje' })).not.toBeInTheDocument();
  });
});

describe('Editar: solo los últimos 3 mensajes propios', () => {
  it('al inicio solo se puede editar el propio con texto; lo de otros nunca', async () => {
    await inLuis();
    expect(within(bubbleOf('Luis, te envío el contrato para tu revisión. Quedó la cláusula 4 corregida.')).getByRole('button', { name: 'Editar mensaje' })).toBeInTheDocument();
    expect(within(bubbleOf('Recibido, lo reviso esta tarde.')).queryByRole('button', { name: 'Editar mensaje' })).not.toBeInTheDocument();
  });

  it('edita un mensaje: el texto cambia, aparece «editado» y se puede cancelar sin cambios', async () => {
    const { user } = await inLuis();
    await user.click(within(bubbleOf('Luis, te envío el contrato para tu revisión. Quedó la cláusula 4 corregida.')).getByRole('button', { name: 'Editar mensaje' }));
    expect(screen.getByRole('status')).toHaveTextContent('Editando mensaje');
    const box = screen.getByLabelText('Mensaje') as HTMLTextAreaElement;
    expect(box.value).toContain('cláusula 4 corregida');

    await user.click(screen.getByRole('button', { name: 'Cancelar edición' }));
    expect(screen.queryByText('Editando mensaje')).not.toBeInTheDocument();
    expect((screen.getByLabelText('Mensaje') as HTMLTextAreaElement).value).toBe('');

    await user.click(within(bubbleOf('Luis, te envío el contrato para tu revisión. Quedó la cláusula 4 corregida.')).getByRole('button', { name: 'Editar mensaje' }));
    await user.clear(screen.getByLabelText('Mensaje'));
    await user.type(screen.getByLabelText('Mensaje'), 'Luis, contrato revisado y corregido.');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const editado = await thread().findByText('Luis, contrato revisado y corregido.', undefined, T);
    expect(within(editado.closest('.group') as HTMLElement).getByText('editado')).toBeInTheDocument();
    expect(screen.queryByText('Editando mensaje')).not.toBeInTheDocument();
  });

  it('tras enviar 3 mensajes más, el primero ya no se puede editar (la ventana son los 3 últimos propios)', async () => {
    const { user } = await inLuis();
    const primero = 'Luis, te envío el contrato para tu revisión. Quedó la cláusula 4 corregida.';
    expect(within(bubbleOf(primero)).queryByRole('button', { name: 'Editar mensaje' })).toBeInTheDocument();
    for (const t of ['uno', 'dos', 'tres']) await typeAndSend(user, `msg ${t}`);
    await waitFor(() => expect(within(bubbleOf(primero)).queryByRole('button', { name: 'Editar mensaje' })).not.toBeInTheDocument(), T);
    for (const t of ['uno', 'dos', 'tres']) expect(within(bubbleOf(`msg ${t}`)).getByRole('button', { name: 'Editar mensaje' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Editar mensaje' })).toHaveLength(3);
  }, 30000);

  it('un texto sin cambios o vacío se rechaza con el motivo y deja el modo edición abierto', async () => {
    const { user } = await inLuis();
    await user.click(within(bubbleOf('Luis, te envío el contrato para tu revisión. Quedó la cláusula 4 corregida.')).getByRole('button', { name: 'Editar mensaje' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('alert', undefined, T)).toHaveTextContent('No hay cambios que guardar');
    expect(screen.getByRole('status')).toHaveTextContent('Editando mensaje');
  });
});

describe('Fotos', () => {
  const png = (name = 'foto.png', size = 100) => new File([new Uint8Array(size)], name, { type: 'image/png' });

  it('se eligen, suben, se envían y se ven en el mensaje; al tocarlas se abre el visor y Esc lo cierra', async () => {
    const { user } = await inLuis();
    await user.upload(screen.getByLabelText('Elegir fotos'), [png('sala.png'), png('grafico.png')]);
    const lista = screen.getByRole('list', { name: 'Fotos por enviar' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2);
    await waitFor(() => expect(screen.queryByRole('status', { name: /Subiendo/ })).not.toBeInTheDocument(), T);

    await user.type(screen.getByLabelText('Mensaje'), 'Mira estas fotos');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await thread().findByText('Mira estas fotos', undefined, T);
    const burbuja = bubbleOf('Mira estas fotos');
    expect(within(burbuja).getAllByRole('img')).toHaveLength(2);
    expect(screen.queryByRole('list', { name: 'Fotos por enviar' })).not.toBeInTheDocument(); // la bandeja se limpia

    await user.click(within(burbuja).getByRole('button', { name: /Ver foto 1 de 2: sala.png/ }));
    const visor = within(screen.getByRole('dialog', { name: 'Visor de fotos' }));
    expect(visor.getByText(/1 de 2/)).toBeInTheDocument();
    await user.click(visor.getByRole('button', { name: 'Foto siguiente' }));
    expect(visor.getByText(/2 de 2/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Visor de fotos' })).not.toBeInTheDocument();
  });

  it('una foto sola, sin texto, se puede enviar', async () => {
    const { user } = await inLuis();
    await user.upload(screen.getByLabelText('Elegir fotos'), png('sola.png'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled(), T);
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('button', { name: /Ver foto 1 de 1: sola.png/ }, T)).toBeInTheDocument();
  });

  it('rechaza lo que no es imagen y lo que pasa de 5 MB, con el motivo; se puede quitar', async () => {
    const { user } = await inLuis({ applyAccept: false });
    await user.upload(screen.getByLabelText('Elegir fotos'), new File(['hola'], 'nota.txt', { type: 'text/plain' }));
    expect(await screen.findByText(/nota\.txt: No es una imagen/)).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Elegir fotos'), png('enorme.png', 5 * 1024 * 1024 + 1));
    expect(await screen.findByText(/enorme\.png: Supera 5 MB/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Grabar nota de voz/ })).toBeInTheDocument(); // nada que enviar
    await user.click(screen.getByRole('button', { name: 'Quitar nota.txt' }));
    expect(screen.queryByText(/nota\.txt: No es una imagen/)).not.toBeInTheDocument();
  });

  it('no deja subir más de 10 fotos por mensaje', async () => {
    const { user } = await inLuis();
    await user.upload(screen.getByLabelText('Elegir fotos'), Array.from({ length: 12 }, (_, i) => png(`f${i}.png`)));
    expect(await screen.findAllByText(/Máximo 10 fotos por mensaje/)).toHaveLength(2);
  });
});

describe('Entregado y leído con fecha y hora', () => {
  const STAMP = /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/;

  it('los mensajes propios muestran su estado: leído por todos o solo entregado', async () => {
    await inLuis();
    const leido = bubbleOf('Luis, te envío el contrato para tu revisión. Quedó la cláusula 4 corregida.');
    expect(within(leido).getByLabelText('Leído')).toBeInTheDocument();
    // m2 es solo el documento (sin texto): el adjunto tiene estado «Entregado»
    const entregado = screen.getByLabelText('Descargar contrato-servicios.docx').closest('.group') as HTMLElement;
    expect(within(entregado).getByLabelText('Entregado')).toBeInTheDocument();
    // los mensajes de otros no llevan marcas
    expect(within(bubbleOf('Recibido, lo reviso esta tarde.')).queryByLabelText(/Leído|Entregado|Enviado/)).not.toBeInTheDocument();
  });

  it('«Información del mensaje» muestra enviado, y entrega y lectura de cada destinatario con segundos', async () => {
    const { user } = await inLuis();
    await user.click(within(bubbleOf('Luis, te envío el contrato para tu revisión. Quedó la cláusula 4 corregida.')).getByRole('button', { name: 'Información del mensaje' }));
    const modal = within(await screen.findByRole('dialog'));
    expect(await modal.findByText(/Enviado:/, undefined, T)).toBeInTheDocument();
    const fila = modal.getByRole('row', { name: /Luis Mamani/ });
    const celdas = within(fila).getAllByRole('cell');
    expect(celdas[0]).toHaveTextContent(STAMP); // entregado
    expect(celdas[1]).toHaveTextContent(STAMP); // leído
    expect(modal.getByText('Leído por todos')).toBeInTheDocument();
  });

  it('un mensaje que el destinatario aún no lee muestra «Pendiente» en lugar de una hora', async () => {
    const { user } = await inLuis();
    const doc = screen.getByLabelText('Descargar contrato-servicios.docx').closest('.group') as HTMLElement;
    await user.click(within(doc).getByRole('button', { name: 'Información del mensaje' }));
    const modal = within(await screen.findByRole('dialog'));
    const fila = await modal.findByRole('row', { name: /Luis Mamani/ }, T);
    const celdas = within(fila).getAllByRole('cell');
    expect(celdas[0]).toHaveTextContent(STAMP);
    expect(celdas[1]).toHaveTextContent('Pendiente');
    expect(modal.getByText('Entregado a todos')).toBeInTheDocument();
  });

  it('un mensaje nuevo pasa de Enviado a Entregado y a Leído en vivo, y el historial lo registra', async () => {
    const { user } = await inLuis();
    await typeAndSend(user, 'Prueba de estados');
    const b = bubbleOf('Prueba de estados');
    expect(within(b).getByLabelText('Enviado')).toBeInTheDocument();
    expect(await within(b).findByLabelText('Entregado', undefined, T)).toBeInTheDocument();
    expect(await within(b).findByLabelText('Leído', undefined, { timeout: 8000 })).toBeInTheDocument();

    await user.click(within(b).getByRole('button', { name: 'Información del mensaje' }));
    const fila = await within(await screen.findByRole('dialog')).findByRole('row', { name: /Luis Mamani/ }, T);
    const celdas = within(fila).getAllByRole('cell');
    expect(celdas[0]).toHaveTextContent(STAMP);
    expect(celdas[1]).toHaveTextContent(STAMP);
  }, 30000);

  it('en el historial del mensaje aparecen las ediciones con el texto anterior y la hora', async () => {
    const { user } = await inLuis();
    await user.click(within(bubbleOf('Luis, te envío el contrato para tu revisión. Quedó la cláusula 4 corregida.')).getByRole('button', { name: 'Editar mensaje' }));
    await user.clear(screen.getByLabelText('Mensaje'));
    await user.type(screen.getByLabelText('Mensaje'), 'Texto corregido');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const b = (await thread().findByText('Texto corregido', undefined, T)).closest('.group') as HTMLElement;
    await user.click(within(b).getByRole('button', { name: 'Información del mensaje' }));
    const modal = within(await screen.findByRole('dialog'));
    const ed = await modal.findByRole('region', { name: 'Historial de ediciones' }, T);
    expect(ed).toHaveTextContent('1.ª edición');
    expect(ed).toHaveTextContent(STAMP);
    expect(ed).toHaveTextContent('Antes: Luis, te envío el contrato para tu revisión.');
  });
});
