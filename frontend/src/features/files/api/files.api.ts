import { http, httpBlob, json } from '@/shared/api/http';
import type {
  AccessLogDTO, DocumentDetail, DocumentSummary, EditorSessionResponse, EstadoInicial, ReviewDecision, UserLite,
} from '@/shared/api/types';

const EDITABLE_OFFICE_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

export function isEditableInOffice(mimeType?: string): boolean {
  return Boolean(mimeType && EDITABLE_OFFICE_MIMES.has(mimeType));
}

export function isViewableInOffice(mimeType?: string): boolean {
  return Boolean(mimeType && (EDITABLE_OFFICE_MIMES.has(mimeType) || mimeType === 'application/pdf'));
}

// Contrato con el backend (ver docs/DOCUMENTOS.md):
//   existen:        GET /documents · GET /documents/:id · POST /documents · POST /documents/:id/versions
//                   GET /documents/:id/download · GET /documents/:id/history · POST /documents/:id/reviews · PATCH /reviews/:id
//                   POST /documents/:id/editor-session · GET /directory/users
export const filesApi = {
  list: () => http<DocumentSummary[]>('/documents'),
  get: (id: string) => http<DocumentDetail>(`/documents/${id}`),
  history: (id: string) => http<AccessLogDTO[]>(`/documents/${id}/history`),
  directory: () => http<UserLite[]>('/directory/users'),
  openEditorSession: (id: string, mode: 'edit' | 'view' = 'edit') =>
    http<EditorSessionResponse>(`/documents/${id}/editor-session`, { method: 'POST', ...json({ mode }) }),

  /** Alta de documento: solo lo que llena la persona; el resto del registro lo completa el sistema. */
  create: (file: File, f: { codigo: string; nombreDocumento: string; fechaCreacion: string; estado: EstadoInicial }) => {
    const form = new FormData();
    form.append('file', file);
    form.append('codigo', f.codigo);
    form.append('nombreDocumento', f.nombreDocumento);
    form.append('fechaCreacion', f.fechaCreacion);
    form.append('estado', f.estado);
    return http<{ document: DocumentSummary }>('/documents', { method: 'POST', body: form });
  },
  newVersion: (id: string, file: File, changeNote?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (changeNote) form.append('changeNote', changeNote);
    return http(`/documents/${id}/versions`, { method: 'POST', body: form });
  },
  requestReview: (id: string, reviewerId: string) =>
    http(`/documents/${id}/reviews`, { method: 'POST', ...json({ reviewerId }) }),
  decideReview: (reviewId: string, decision: Exclude<ReviewDecision, 'PENDIENTE'>, comment?: string) =>
    http(`/reviews/${reviewId}`, { method: 'PATCH', ...json({ decision, comment }) }),

  /** El backend devuelve las URL como `/documents/:id/download?versionId=…`: de ahí sale la versión. */
  versionDeUrl: (url?: string) => (url ? new URL(url, 'http://x').searchParams.get('versionId') ?? undefined : undefined),

  /** Descarga el archivo: el servidor registra la descarga (quién, versión, IP). */
  async download(id: string, fileName: string, versionId?: string, channel?: string) {
    const q = new URLSearchParams();
    if (versionId) q.set('versionId', versionId);
    if (channel) q.set('channel', channel);
    const blob = await httpBlob(`/documents/${id}/download${q.size ? `?${q}` : ''}`);
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
