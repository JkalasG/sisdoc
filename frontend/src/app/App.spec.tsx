import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSession } from '@/features/auth/store/session';
import { GROUPS, NOTICES, POSTS, STORIES } from '@/features/social/data';
import { useSocial } from '@/features/social/store';
import { mockControls } from '@/shared/api/mock/router';
import { App } from './App';

const T = { timeout: 4000 };

function renderApp(path = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
    </QueryClientProvider>,
  );
}

async function signIn(email = 'ana@empresa.com', password = 'Clave-Segura-2026') {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Correo', undefined, T), email);
  await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  return user;
}
const feed = () => screen.findByRole('region', { name: 'Crear publicación' }, T);

beforeEach(() => {
  mockControls.reset();
  useSession.setState({ status: 'loading', user: null, notice: null });
  useSocial.setState({ posts: POSTS, stories: STORIES, groups: GROUPS, notices: NOTICES });
});

describe('Acceso (sin servidor)', () => {
  it('sin sesión muestra el login y avisa que es modo demostración', async () => {
    renderApp('/documentos');
    expect(await screen.findByLabelText('Correo', undefined, T)).toBeInTheDocument();
    expect(screen.getByText(/Modo demostración/)).toBeInTheDocument();
  });

  it('credenciales incorrectas muestran un mensaje genérico', async () => {
    renderApp();
    await signIn('ana@empresa.com', 'incorrecta-123456');
    expect(await screen.findByRole('alert', undefined, T)).toHaveTextContent(/incorrectos, o la cuenta está bloqueada/);
  });

  it('login correcto lleva al inicio (red social)', async () => {
    renderApp();
    await signIn();
    expect(await feed()).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Publicaciones' })).toBeInTheDocument();
  });

  it('dispositivo nuevo: muestra "pendiente de autorización" y permite reintentar', async () => {
    mockControls.set({ deviceKnown: false });
    renderApp();
    const user = await signIn();
    expect(await screen.findByText('Dispositivo pendiente de autorización', undefined, T)).toBeInTheDocument();
    mockControls.approveDevices();
    await user.click(screen.getByRole('button', { name: 'Volver a intentar' }));
    expect(await screen.findByLabelText('Correo')).toHaveValue('ana@empresa.com'); // los campos conservan lo escrito
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await feed()).toBeInTheDocument();
  });

  it('contraseña temporal: obliga a cambiarla, valida en vivo y luego deja entrar', async () => {
    renderApp();
    const user = await signIn('nueva@empresa.com', 'Temporal-Clave-2026');
    expect(await screen.findByRole('heading', { name: 'Crea tu contraseña' }, T)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Contraseña actual'), 'Temporal-Clave-2026');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'corta');
    expect(screen.getByRole('button', { name: 'Guardar contraseña' })).toBeDisabled();
    expect(within(screen.getByLabelText('Requisitos')).getByText('Al menos 12 caracteres')).toHaveClass('text-ink-mute');
    await user.clear(screen.getByLabelText('Nueva contraseña'));
    await user.type(screen.getByLabelText('Nueva contraseña'), 'Contrasena-Segura-77');
    await user.type(screen.getByLabelText('Repite la nueva contraseña'), 'Contrasena-Segura-77');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await feed()).toBeInTheDocument();
  });

  it('cerrar sesión desde el menú de cuenta devuelve al login', async () => {
    renderApp();
    const user = await signIn();
    await feed();
    await user.click(screen.getByRole('button', { name: 'Menú de cuenta' }));
    await user.click(screen.getByRole('menuitem', { name: /Cerrar sesión/ }));
    await waitFor(() => expect(screen.getByLabelText('Correo')).toBeInTheDocument(), T);
  });
});

describe('Red social (prototipo)', () => {
  async function inFeed() {
    renderApp();
    const user = await signIn();
    await feed();
    return user;
  }

  it('muestra historias, composer, publicaciones y columnas laterales', async () => {
    await inFeed();
    expect(screen.getByLabelText('Historias')).toBeInTheDocument();
    expect(screen.getAllByRole('article').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText(/Anuncio fijado/)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Accesos directos' })).toBeInTheDocument();
    expect(screen.getByText('Contactos')).toBeInTheDocument();
  });

  it('reaccionar a una publicación cambia el botón y el contador', async () => {
    const user = await inFeed();
    const post = screen.getByRole('article', { name: 'Publicación de Luis Mamani' });
    await user.click(within(post).getAllByRole('button', { name: 'Me gusta' })[0]); // el primero es el del post (luego vienen los de comentarios)
    expect(within(post).getByRole('button', { pressed: true })).toBeInTheDocument();
  });

  it('comentar agrega el comentario a la publicación', async () => {
    const user = await inFeed();
    const post = screen.getByRole('article', { name: 'Publicación de Jorge Vargas' });
    await user.type(within(post).getByLabelText(/Comentar la publicación/), 'Gracias por el aviso{enter}');
    expect(await within(post).findByText('Gracias por el aviso')).toBeInTheDocument();
  });

  it('crear una publicación la coloca primera en el inicio', async () => {
    const user = await inFeed();
    await user.click(screen.getByRole('button', { name: /¿Qué quieres compartir, Ana\?/ }));
    await user.type(screen.getByLabelText('Contenido de la publicación'), 'Hola equipo, buenos días');
    await user.click(screen.getByRole('button', { name: 'Publicar' }));
    const first = screen.getAllByRole('article')[0];
    expect(within(first).getByText('Hola equipo, buenos días')).toBeInTheDocument();
  });

  it('abre una historia con barra de progreso y se puede cerrar', async () => {
    const user = await inFeed();
    await user.click(screen.getByRole('button', { name: 'Ver historia de Marta Rojas' }));
    expect(screen.getByRole('dialog', { name: 'Historia de Marta Rojas' })).toBeInTheDocument();
    expect(screen.getByText('Cierre del trimestre ✅')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar historia' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('una función aún sin conectar avisa que es prototipo, sin romperse', async () => {
    const user = await inFeed();
    await user.click(screen.getByRole('button', { name: 'Crear historia' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/prototipo/);
  });

  it('grupos: lista los míos y permite entrar a uno', async () => {
    const user = await inFeed();
    await user.click(screen.getAllByRole('link', { name: 'Grupos' })[0]);
    expect(await screen.findByRole('heading', { name: 'Tus grupos' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Abrir Contabilidad' }));
    expect(await screen.findByRole('heading', { name: 'Contabilidad' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Miembros' })).toBeInTheDocument();
  });

  it('notificaciones: muestra nuevas y anteriores, y marcar todas como leídas', async () => {
    const user = await inFeed();
    await user.click(screen.getAllByRole('link', { name: 'Notificaciones' })[0]);
    expect(await screen.findByRole('heading', { name: 'Nuevas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Anteriores' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Marcar todas como leídas' }));
    expect(screen.queryByRole('heading', { name: 'Nuevas' })).not.toBeInTheDocument();
  });

  it('perfil: muestra la portada, el nombre y mis publicaciones', async () => {
    const user = await inFeed();
    await user.click(screen.getAllByRole('link', { name: /Ana Quispe/ })[0]);
    expect(await screen.findByRole('heading', { name: 'Ana Quispe' })).toBeInTheDocument();
    expect(screen.getByText(/plantilla actualizada del reporte/)).toBeInTheDocument();
  });
});

describe('Documentos', () => {
  async function inDocs() {
    renderApp();
    const user = await signIn();
    await feed();
    await user.click(screen.getAllByRole('link', { name: 'Documentos' })[0]);
    await screen.findByRole('heading', { name: 'Documentos' }, T);
    return user;
  }

  it('lista los documentos como registro maestro, solo con las columnas esenciales', async () => {
    await inDocs();
    expect(await screen.findByText('Contrato de servicios 2026', undefined, T)).toBeInTheDocument();
    expect(screen.getByText('Presupuesto trimestral Q2')).toBeInTheDocument();
    const tabla = screen.getByRole('table', { name: 'Registro de documentos' });
    const columnas = ['Código', 'Nombre del documento', 'Estado', 'Fecha modificación', 'Versión'];
    expect(within(tabla).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(columnas);
    expect(within(tabla).getByText('PR-LOG-001')).toBeInTheDocument();
  });

  it('cargar un documento: el nombre se sugiere desde el archivo y se puede cambiar', async () => {
    const user = await inDocs();
    await user.click(screen.getByRole('button', { name: /Cargar documento/ }));
    const dialog = await screen.findByRole('dialog');
    const file = new File(['hola'], 'procedimiento_de_compras.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    await user.upload(within(dialog).getByLabelText('Archivo'), file);
    expect(within(dialog).getByLabelText('Nombre del documento')).toHaveValue('procedimiento de compras');

    await user.type(within(dialog).getByLabelText('Código'), 'pr-com-009');
    await user.clear(within(dialog).getByLabelText('Nombre del documento'));
    await user.type(within(dialog).getByLabelText('Nombre del documento'), 'Procedimiento de compras v2');
    expect(within(dialog).getByRole('switch', { name: 'Documento revisado' })).toHaveAttribute('aria-checked', 'false');
    expect(within(dialog).getByRole('figure', { name: 'Vista previa del archivo' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('switch', { name: 'Documento revisado' }));
    expect(within(dialog).getByRole('switch', { name: 'Documento revisado' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'Cargar' }));

    // abre el detalle con el registro completo, llenado por el sistema
    const ficha = await screen.findByRole('region', { name: 'Registro del documento' }, T);
    expect(within(ficha).getByText('PR-COM-009')).toBeInTheDocument();
    expect(within(ficha).getByText('Procedimiento de compras v2')).toBeInTheDocument();
    expect(within(ficha).getByText('Revisado')).toBeInTheDocument();
    expect(within(ficha).getByText('Descargar Word')).toBeInTheDocument();
  });

  it('un código repetido muestra el error del servidor y no cierra el formulario', async () => {
    const user = await inDocs();
    await user.click(screen.getByRole('button', { name: /Cargar documento/ }));
    const dialog = await screen.findByRole('dialog');
    await user.upload(within(dialog).getByLabelText('Archivo'), new File(['x'], 'otro.pdf', { type: 'application/pdf' }));
    await user.type(within(dialog).getByLabelText('Código'), 'PR-LOG-001');
    await user.click(within(dialog).getByRole('button', { name: 'Cargar' }));
    expect(await within(dialog).findByRole('alert', undefined, T)).toHaveTextContent(/Ya existe un documento con el código PR-LOG-001/);
  });

  it('abre un documento: versiones y trazabilidad para el dueño', async () => {
    const user = await inDocs();
    await user.click(await screen.findByText('Contrato de servicios 2026', undefined, T));
    expect(await screen.findByRole('heading', { name: 'Contrato de servicios 2026' }, T)).toBeInTheDocument();
    expect(await screen.findByText(/Se corrigió la cláusula 4/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Historial' }));
    expect((await screen.findAllByText(/descargó el documento/, undefined, T)).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/IP /).length).toBeGreaterThan(0);
  });

  it('en un documento ajeno el historial aparece restringido', async () => {
    const user = await inDocs();
    await user.click(await screen.findByText('Acta de reunión – Comité de compras', undefined, T));
    await user.click(await screen.findByRole('tab', { name: 'Historial' }, T));
    expect(await screen.findByText('Historial restringido', undefined, T)).toBeInTheDocument();
  });
});

describe('Mensajes (estilo WhatsApp)', () => {
  async function inChat() {
    renderApp();
    const user = await signIn();
    await feed();
    await user.click(screen.getAllByRole('link', { name: 'Mensajes' })[0]);
    await screen.findByLabelText('Buscar chats', undefined, T);
    return user;
  }

  it('lista chats con fijados, grupos y no leídos', async () => {
    await inChat();
    expect(await screen.findByText('Luis Mamani', undefined, T)).toBeInTheDocument();
    expect(screen.getByText('Contabilidad')).toBeInTheDocument();
    expect(screen.getByText('Proyecto Alfa')).toBeInTheDocument();
  });

  it('filtra por "No leídos" y "Grupos"', async () => {
    const user = await inChat();
    await screen.findByText('Luis Mamani', undefined, T);
    await user.click(screen.getByRole('tab', { name: 'Grupos' }));
    expect(screen.queryByText('Luis Mamani')).not.toBeInTheDocument();
    expect(screen.getByText('Contabilidad')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'No leídos' }));
    expect(screen.getByText('Contabilidad')).toBeInTheDocument();
    expect(screen.queryByText('Proyecto Alfa')).not.toBeInTheDocument();
  });

  it('abre una conversación: estado en línea, adjunto con versión y ticks', async () => {
    const user = await inChat();
    await user.click(await screen.findByText('Luis Mamani', undefined, T));
    expect(await screen.findByText('en línea', undefined, T)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Descargar contrato-servicios.docx/ }, T)).toBeInTheDocument();
    expect(screen.getAllByLabelText('Leído').length).toBeGreaterThan(0);
  });

  it('envía un mensaje y recibe "escribiendo…" y la respuesta en tiempo real', async () => {
    const user = await inChat();
    await user.click(await screen.findByText('Luis Mamani', undefined, T));
    await user.type(await screen.findByLabelText('Mensaje', undefined, T), 'Hola Luis');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Hola Luis', undefined, T)).toBeInTheDocument();
    expect(await screen.findByLabelText('Luis Mamani está escribiendo', undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(await screen.findByText('Entendido 👍', undefined, { timeout: 5000 })).toBeInTheDocument();
  });

  it('muestra nota de voz, imagen y mensaje citado en el grupo', async () => {
    const user = await inChat();
    await user.click(await screen.findByText('Contabilidad', undefined, T));
    expect((await screen.findAllByText('Así quedó la nueva sala de reuniones', undefined, T)).length).toBeGreaterThanOrEqual(2); // mensaje original + cita
    expect(screen.getAllByText('Jorge Vargas').length).toBeGreaterThan(0); // nombre del remitente en grupos
    await user.click(screen.getByRole('button', { name: 'Volver a chats' }));
    await user.click(await screen.findByText('Marta Rojas'));
    expect(await screen.findByRole('button', { name: 'Reproducir nota de voz' }, T)).toBeInTheDocument();
  });

  it('el panel de información lista los documentos compartidos', async () => {
    const user = await inChat();
    await user.click(await screen.findByText('Luis Mamani', undefined, T));
    await user.click(await screen.findByRole('button', { name: 'Información' }, T));
    const panel = await screen.findByRole('complementary', { name: 'Información del chat' });
    expect(within(panel).getByText('Documentos compartidos')).toBeInTheDocument();
    expect(await within(panel).findByText('contrato-servicios.docx', undefined, T)).toBeInTheDocument();
  });

  it('servidor caído: muestra un error amigable en lugar de romperse', async () => {
    const user = await inChat();
    await screen.findByText('Luis Mamani', undefined, T);
    mockControls.set({ serverDown: true });
    await user.click(await screen.findByText('Luis Mamani'));
    expect(await screen.findByText(/No se pudo conectar con el servidor/, undefined, T)).toBeInTheDocument();
  });
});
