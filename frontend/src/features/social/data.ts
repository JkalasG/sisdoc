// PROTOTIPO: datos locales. Cuando se construya el módulo de publicaciones del backend,
// este archivo se reemplaza por llamadas a la API (el contrato se define entonces).

export type ReactionKey = 'like' | 'love' | 'joy' | 'wow' | 'sad';
export const REACTIONS: Array<{ key: ReactionKey; emoji: string; label: string; color: string }> = [
  { key: 'like', emoji: '👍', label: 'Me gusta', color: 'text-brand' },
  { key: 'love', emoji: '❤️', label: 'Me encanta', color: 'text-rose-500' },
  { key: 'joy', emoji: '😂', label: 'Me divierte', color: 'text-amber' },
  { key: 'wow', emoji: '😮', label: 'Me asombra', color: 'text-amber' },
  { key: 'sad', emoji: '😢', label: 'Me entristece', color: 'text-amber' },
];

export interface PostComment { id: string; author: string; text: string; at: string; likes: number }
export interface PostDoc { title: string; fileName: string; version: number; size: string; mime: string }
export interface Post {
  id: string;
  author: string;                     // 'Ana Quispe' = yo
  role?: string;
  groupId?: string;
  at: string;
  text: string;
  arts?: number[];                    // semillas de las «fotos»
  doc?: PostDoc;
  kind?: 'announcement';
  reactions: Record<ReactionKey, number>;
  mine: ReactionKey | null;           // mi reacción
  comments: PostComment[];
  shares: number;
  saved: boolean;
}

export interface StorySlide { art: number; caption: string }
export interface Story { id: string; author: string; slides: StorySlide[]; seen: boolean; at: string }

export interface Group {
  id: string; name: string; section: string; members: number; privacy: 'Privado' | 'Público';
  art: number; description: string; joined: boolean; online: number;
}

export type NotificationKind = 'reaction' | 'comment' | 'mention' | 'group_request' | 'announcement' | 'security' | 'review';
export interface Notice {
  id: string; kind: NotificationKind; actor: string; text: string; target?: string; at: string; read: boolean; link?: string;
}

export const ME = 'Ana Quispe';
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const r = (like = 0, love = 0, joy = 0, wow = 0, sad = 0): Post['reactions'] => ({ like, love, joy, wow, sad });

export const GROUPS: Group[] = [
  { id: 'g-conta', name: 'Contabilidad', section: 'Sección', members: 18, privacy: 'Privado', art: 0, description: 'Cierres, conciliaciones y comprobantes del área.', joined: true, online: 6 },
  { id: 'g-alfa', name: 'Proyecto Alfa', section: 'Proyecto', members: 9, privacy: 'Privado', art: 4, description: 'Seguimiento del lanzamiento del nuevo sistema.', joined: true, online: 3 },
  { id: 'g-norte', name: 'Sucursal Norte', section: 'Sucursal', members: 34, privacy: 'Público', art: 2, description: 'Novedades y coordinación de la sucursal.', joined: true, online: 11 },
  { id: 'g-log', name: 'Logística', section: 'Sección', members: 22, privacy: 'Privado', art: 3, description: 'Despachos, rutas y proveedores.', joined: false, online: 5 },
  { id: 'g-rrhh', name: 'Recursos Humanos', section: 'Sección', members: 7, privacy: 'Privado', art: 5, description: 'Comunicados, permisos y bienestar.', joined: false, online: 2 },
  { id: 'g-dep', name: 'Deporte y bienestar', section: 'Comunidad', members: 41, privacy: 'Público', art: 7, description: 'Campeonatos, caminatas y pausas activas.', joined: false, online: 8 },
];

export const STORIES: Story[] = [
  { id: 's1', author: 'Marta Rojas', seen: false, at: ago(40), slides: [{ art: 1, caption: 'Cierre del trimestre ✅' }, { art: 5, caption: 'Gracias equipo 🎉' }] },
  { id: 's2', author: 'Luis Mamani', seen: false, at: ago(95), slides: [{ art: 6, caption: 'Capacitación de seguridad' }, { art: 0, caption: 'Recuerden: nunca compartan su clave' }, { art: 2, caption: '¡Gracias por asistir!' }] },
  { id: 's3', author: 'Carla Soto', seen: false, at: ago(180), slides: [{ art: 3, caption: 'Sucursal Norte, buenos días ☀️' }] },
  { id: 's4', author: 'Jorge Vargas', seen: true, at: ago(300), slides: [{ art: 7, caption: 'Ruta de hoy' }, { art: 4, caption: 'Todo en orden' }] },
  { id: 's5', author: 'Diego Pérez', seen: true, at: ago(420), slides: [{ art: 2, caption: 'Pausa activa 💪' }] },
];

export const POSTS: Post[] = [
  {
    id: 'p1', author: 'Recursos Humanos', role: 'Comunicado oficial', kind: 'announcement', at: ago(25),
    text: '📢 Mantenimiento programado: el sábado 8 de noviembre, de 22:00 a 23:30, el sistema no estará disponible. Guarden sus trabajos con anticipación.',
    arts: [5], reactions: r(48, 5, 0, 12, 0), mine: null, shares: 9, saved: false,
    comments: [
      { id: 'c1', author: 'Diego Pérez', text: 'Gracias por avisar con tiempo 👍', at: ago(20), likes: 3 },
      { id: 'c2', author: 'Elena Torres', text: '¿Afecta también a la app del celular?', at: ago(14), likes: 1 },
    ],
  },
  {
    id: 'p2', author: 'Marta Rojas', role: 'Contador senior', groupId: 'g-conta', at: ago(85),
    text: 'Cerramos el trimestre sin observaciones 🎉 Gracias a todo el equipo por el esfuerzo de estas semanas. ¡A descansar el fin de semana!',
    arts: [1, 5], reactions: r(21, 14, 2, 0, 0), mine: 'love', shares: 2, saved: false,
    comments: [
      { id: 'c3', author: 'Jorge Vargas', text: '¡Excelente trabajo, equipo!', at: ago(70), likes: 5 },
      { id: 'c4', author: 'Ana Quispe', text: 'Gracias Marta, fue un gran cierre 🙌', at: ago(66), likes: 2 },
      { id: 'c5', author: 'Luis Mamani', text: 'Mérito de todos.', at: ago(50), likes: 0 },
    ],
  },
  {
    id: 'p3', author: 'Luis Mamani', role: 'Jefe de compras', groupId: 'g-alfa', at: ago(160),
    text: 'Les comparto el contrato de servicios para revisión. Cualquier observación la dejamos en comentarios antes del viernes.',
    doc: { title: 'Contrato de servicios 2026', fileName: 'contrato-servicios.docx', version: 3, size: '85 KB', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    reactions: r(7, 0, 0, 0, 0), mine: null, shares: 0, saved: true,
    comments: [{ id: 'c6', author: 'Marta Rojas', text: 'Lo reviso hoy en la tarde.', at: ago(120), likes: 1 }],
  },
  {
    id: 'p4', author: 'Carla Soto', role: 'Sucursal Norte', groupId: 'g-norte', at: ago(60 * 5),
    text: 'Así quedó la nueva sala de capacitación de la Sucursal Norte 💙 Ya pueden reservarla desde la agenda compartida.',
    arts: [3, 6, 2], reactions: r(34, 19, 1, 6, 0), mine: 'like', shares: 5, saved: false,
    comments: [
      { id: 'c7', author: 'Diego Pérez', text: 'Quedó hermosa 😍', at: ago(60 * 4), likes: 4 },
      { id: 'c8', author: 'Elena Torres', text: '¿Cuántas personas entran?', at: ago(60 * 4 - 10), likes: 0 },
    ],
  },
  {
    id: 'p5', author: 'Jorge Vargas', role: 'Logística', groupId: 'g-log', at: ago(60 * 9),
    text: 'Recordatorio para los choferes: antes de salir revisen el checklist de seguridad en la app. Una revisión de 2 minutos evita problemas de horas. 🚚',
    reactions: r(12, 0, 0, 0, 0), mine: null, shares: 1, saved: false, comments: [],
  },
  {
    id: 'p6', author: 'Ana Quispe', role: 'Analista contable', at: ago(60 * 26),
    text: '¿Alguien tiene la plantilla actualizada del reporte de gastos? La que tengo aún usa el formato anterior.',
    reactions: r(3, 0, 0, 0, 0), mine: null, shares: 0, saved: false,
    comments: [{ id: 'c9', author: 'Marta Rojas', text: 'Te la envío por mensaje ahora mismo.', at: ago(60 * 25), likes: 1 }],
  },
];

export const NOTICES: Notice[] = [
  { id: 'n1', kind: 'review', actor: 'Luis Mamani', text: 'te pidió revisar «Contrato de servicios 2026»', at: ago(18), read: false, link: '/documentos/d-contrato' },
  { id: 'n2', kind: 'reaction', actor: 'Marta Rojas', text: 'y 12 personas más reaccionaron a tu comentario', at: ago(45), read: false },
  { id: 'n3', kind: 'mention', actor: 'Diego Pérez', text: 'te mencionó en un comentario: «@Ana ¿puedes confirmar el monto?»', at: ago(90), read: false },
  { id: 'n4', kind: 'group_request', actor: 'Elena Torres', text: 'quiere unirse al grupo Contabilidad', at: ago(60 * 3), read: false },
  { id: 'n5', kind: 'announcement', actor: 'Recursos Humanos', text: 'publicó un comunicado: Mantenimiento programado', at: ago(60 * 5), read: true },
  { id: 'n6', kind: 'comment', actor: 'Jorge Vargas', text: 'comentó tu publicación: «Excelente, gracias».', at: ago(60 * 8), read: true },
  { id: 'n7', kind: 'security', actor: 'Seguridad', text: 'Nuevo inicio de sesión desde Chrome en Windows (IP 10.0.0.5)', at: ago(60 * 26), read: true },
  { id: 'n8', kind: 'reaction', actor: 'Carla Soto', text: 'reaccionó con ❤️ a tu publicación', at: ago(60 * 30), read: true },
];

export const CONTACTS = [
  { name: 'Luis Mamani', online: true, chat: 'c-luis' },
  { name: 'Marta Rojas', online: false, chat: 'c-marta' },
  { name: 'Jorge Vargas', online: false, chat: 'c-jorge' },
  { name: 'Carla Soto', online: true, chat: null },
  { name: 'Diego Pérez', online: true, chat: null },
  { name: 'Elena Torres', online: true, chat: null },
  { name: 'Pablo Rivas', online: false, chat: null },
];

export const totalReactions = (p: Post) => Object.values(p.reactions).reduce((a, b) => a + b, 0) + (p.mine ? 1 : 0);
