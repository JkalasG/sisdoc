import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Eye, FileEdit, FilePlus2, Fingerprint, Send } from 'lucide-react';
import { FormEvent, ReactNode, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@/shared/api/http';
import { etiquetaDoc, etiquetaVersion } from '@/shared/api/types';
import type { DocumentDetail, ReviewDTO } from '@/shared/api/types';
import { formatBytes, fullDate, shortHash, timeAgo } from '@/shared/format';
import { useSession } from '@/features/auth/store/session';
import { Avatar, DocLoader, EmptyState, ErrorNote, FileTypeIcon, Modal, Spinner, StatusBadge } from '@/shared/ui/primitives';
import { filesApi, isEditableInOffice, isViewableInOffice } from '../api/files.api';
import { HistoryTimeline } from '../components/HistoryTimeline';
import { UploadModal } from '../components/UploadModal';

type Tab = 'versions' | 'reviews' | 'history';
const DECISION: Record<ReviewDTO['decision'], string> = {
  PENDIENTE: 'Pendiente', APROBADO: 'Aprobada', RECHAZADO: 'Rechazada', CAMBIOS_SOLICITADOS: 'Cambios solicitados',
};

export function DocumentDetailPage() {
  const { id = '' } = useParams();
  const me = useSession((s) => s.user);
  const qc = useQueryClient();
  const { data: doc, isLoading, error } = useQuery({ queryKey: ['document', id], queryFn: () => filesApi.get(id), retry: false });
  const [tab, setTab] = useState<Tab>('versions');
  const [newVersion, setNewVersion] = useState(false);
  const navigate = useNavigate();
  const { data: lista } = useQuery({ queryKey: ['documents'], queryFn: filesApi.list });
  const openEditor = (modo: 'edit' | 'view') => navigate(`/documentos/${id}/editor${modo === 'view' ? '?modo=view' : ''}`);
  const [asking, setAsking] = useState(false);
  const [deciding, setDeciding] = useState<ReviewDTO | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);

  const refresh = () => { qc.invalidateQueries({ queryKey: ['document', id] }); qc.invalidateQueries({ queryKey: ['history', id] }); qc.invalidateQueries({ queryKey: ['documents'] }); };

  async function download(versionId?: string, fileName?: string) {
    setDlError(null);
    try {
      await filesApi.download(id, fileName ?? doc!.versionVigente.fileName, versionId);
      qc.invalidateQueries({ queryKey: ['history', id] });
    } catch (e) { setDlError((e as ApiError).message); }
  }

  if (isLoading) return <div className="flex flex-col items-center gap-3 p-20 text-ink-soft"><DocLoader /><p className="text-sm">Cargando documento…</p></div>;
  if (error || !doc) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <EmptyState icon={<FilePlus2 className="h-6 w-6" />} title="Documento no encontrado"
          hint="No existe o no tienes acceso a él." action={<Link to="/documentos" className="btn-ghost">Volver a documentos</Link>} />
      </div>
    );
  }

  const canEdit = doc.miPermiso === 'PROPIETARIO' || doc.miPermiso === 'EDITAR';
  const canDownload = canEdit || doc.miPermiso === 'DESCARGAR';
  const canEditOnline = canEdit && isEditableInOffice(doc.versionVigente.mimeType);
  const canViewOnline = isViewableInOffice(doc.versionVigente.mimeType);
  const posicion = lista?.findIndex((d) => d.id === id) ?? -1;
  const anterior = posicion > 0 ? lista![posicion - 1] : undefined;
  const siguienteDoc = lista && posicion >= 0 ? lista[posicion + 1] : undefined;
  const myPending = doc.reviews.find((r) => r.reviewerId === me?.id && r.decision === 'PENDIENTE');

  return (
    <div className="mx-auto max-w-5xl p-5 sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex min-w-0 items-center gap-1.5 text-sm text-ink-soft" aria-label="Ruta">
          <Link to="/documentos" className="inline-flex items-center gap-1.5 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Documentos</Link>
          <span aria-hidden className="text-ink-mute">/</span>
          <span className="truncate font-semibold text-ink" title={doc.nombreDocumento}>{doc.nombreDocumento}</span>
        </nav>
        {posicion >= 0 && lista && lista.length > 1 && (
          <div className="inline-flex items-center gap-1 text-sm text-ink-soft" role="group" aria-label="Navegar entre documentos">
            <button className="icon-btn !h-8 !w-8" disabled={!anterior} aria-label="Documento anterior" title={anterior?.nombreDocumento}
              onClick={() => anterior && navigate(`/documentos/${anterior.id}`)}><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-[4.5rem] text-center tabular-nums">{posicion + 1} de {lista.length}</span>
            <button className="icon-btn !h-8 !w-8" disabled={!siguienteDoc} aria-label="Documento siguiente" title={siguienteDoc?.nombreDocumento}
              onClick={() => siguienteDoc && navigate(`/documentos/${siguienteDoc.id}`)}><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      <header className="card mb-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-light text-brand"><FileTypeIcon mime={doc.versionVigente.mimeType} className="h-7 w-7" /></span>
            <div className="min-w-0">
              <h1 className="break-words text-3xl leading-tight">{doc.nombreDocumento}</h1>
              <p className="mt-1 font-mono text-sm font-semibold text-ink-soft">{doc.codigo}</p>
              {doc.descripcion && <p className="mt-1 text-sm text-ink-soft">{doc.descripcion}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-soft">
                <StatusBadge status={doc.estado} />
                <span className="inline-flex items-center gap-2"><Avatar name={doc.usuarioCreador.nombre} size="sm" />{doc.miPermiso === 'PROPIETARIO' ? 'Tú' : doc.usuarioCreador.nombre}</span>
                <span>Versión {etiquetaDoc(doc)}</span>
                <span>{formatBytes(doc.versionVigente.sizeBytes)}</span>
                <span>Modificado {timeAgo(doc.fechaModificacion)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEditOnline && (
              <button className="btn-primary" onClick={() => openEditor('edit')}>
                <FileEdit className="h-4 w-4" /> Editar en línea
              </button>
            )}
            {!canEditOnline && canViewOnline && (
              <button className="btn-ghost" onClick={() => openEditor('view')}>
                <Eye className="h-4 w-4" /> Ver en línea
              </button>
            )}
            {canDownload && (
              <button className={canEditOnline ? 'btn-ghost' : 'btn-primary'} onClick={() => download()}>
                <Download className="h-4 w-4" /> Descargar
              </button>
            )}
            {canEdit && <button className="btn-ghost" onClick={() => setNewVersion(true)}><FilePlus2 className="h-4 w-4" /> Nueva versión</button>}
            {canEdit && <button className="btn-ghost" onClick={() => setAsking(true)}><Send className="h-4 w-4" /> Pedir revisión</button>}
          </div>
        </div>
        {dlError && <div className="mt-4"><ErrorNote message={dlError} /></div>}
      </header>

      <RegistroMaestro
        doc={doc}
        onDownload={canDownload ? (url) => download(filesApi.versionDeUrl(url)) : undefined}
        onEditOnline={canEditOnline ? () => openEditor('edit') : undefined}
      />

      {myPending && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber/40 bg-amber-soft p-4">
          <p className="text-sm text-amber-ink"><strong>{myPending.requestedByName}</strong> te pidió revisar la versión {myPending.versionNumber}.</p>
          <button className="btn bg-amber text-white hover:opacity-90" onClick={() => setDeciding(myPending)}>Revisar ahora</button>
        </div>
      )}

      <div className="mb-3 flex gap-1 border-b border-line" role="tablist">
        {([['versions', `Versiones (${doc.versions.length})`], ['reviews', `Revisiones (${doc.reviews.length})`], ['history', 'Historial']] as Array<[Tab, string]>).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === t ? 'border-brand text-brand' : 'border-transparent text-ink-mute hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      <section className="card overflow-hidden" role="tabpanel">
        {tab === 'versions' && (
          <ul className="divide-y divide-line">
            {doc.versions.map((v, i) => (
              <li key={v.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${i === 0 ? 'bg-brand text-white' : 'bg-paper text-ink-soft'}`}>v{etiquetaVersion(v)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{v.fileName} {i === 0 && <span className="ml-1 rounded-full bg-brand-light px-2 py-0.5 text-[11px] font-semibold text-brand">vigente</span>}</p>
                  {v.changeNote && <p className="text-sm text-ink-soft">“{v.changeNote}”</p>}
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-mute">
                    <span>{v.uploadedByName}</span><span>{fullDate(v.createdAt)}</span><span>{formatBytes(v.sizeBytes)}</span>
                    <span className="inline-flex items-center gap-1 font-mono" title={`SHA-256: ${v.checksumSha256}`}><Fingerprint className="h-3 w-3" />{shortHash(v.checksumSha256)}</span>
                  </p>
                </div>
                {canViewOnline && <button className="btn-ghost" onClick={() => navigate(`/documentos/${id}/editor?version=${v.id}`)} aria-label={`Ver versión ${etiquetaVersion(v)} en línea`} title="Ver en línea"><Eye className="h-4 w-4" /></button>}
                {canDownload && <button className="btn-ghost" onClick={() => download(v.id, v.fileName)} aria-label={`Descargar versión ${etiquetaVersion(v)}`}><Download className="h-4 w-4" /></button>}
              </li>
            ))}
          </ul>
        )}

        {tab === 'reviews' && (doc.reviews.length === 0
          ? <EmptyState icon={<Send className="h-6 w-6" />} title="Sin revisiones" hint="Pide una revisión para que alguien apruebe o comente esta versión." />
          : <ul className="divide-y divide-line">
              {doc.reviews.map((r) => (
                <li key={r.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm"><strong>{r.reviewerName}</strong> · versión {r.versionNumber}</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.decision === 'APROBADO' ? 'bg-brand-light text-brand' : r.decision === 'PENDIENTE' ? 'bg-amber-soft text-amber-ink' : 'bg-danger-soft text-danger'}`}>{DECISION[r.decision]}</span>
                  </div>
                  {r.comment && <p className="mt-1.5 text-sm text-ink-soft">“{r.comment}”</p>}
                  <p className="mt-1 text-xs text-ink-mute">Pedida por {r.requestedByName} · {fullDate(r.requestedAt)}{r.decidedAt ? ` · resuelta ${fullDate(r.decidedAt)}` : ''}</p>
                </li>
              ))}
            </ul>)}

        {tab === 'history' && <HistoryTimeline documentId={id} />}
      </section>

      {newVersion && <UploadModal documentId={id} onClose={() => setNewVersion(false)} onDone={refresh} />}
      {asking && <ReviewRequestModal documentId={id} onClose={() => setAsking(false)} onDone={refresh} />}
      {deciding && <DecideModal review={deciding} onClose={() => setDeciding(null)} onDone={refresh} />}
    </div>
  );
}

function ReviewRequestModal({ documentId, onClose, onDone }: { documentId: string; onClose: () => void; onDone: () => void }) {
  const { data: people } = useQuery({ queryKey: ['directory'], queryFn: filesApi.directory });
  const [reviewer, setReviewer] = useState('');
  const send = useMutation({ mutationFn: () => filesApi.requestReview(documentId, reviewer), onSuccess: () => { onDone(); onClose(); } });
  return (
    <Modal title="Pedir revisión" onClose={onClose}>
      <p className="mb-4 text-sm text-ink-soft">La persona elegida podrá ver y descargar la versión vigente, y quedará registrado.</p>
      <label className="label" htmlFor="reviewer">Revisor</label>
      <select id="reviewer" className="field" value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
        <option value="">Selecciona una persona…</option>
        {people?.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.email}</option>)}
      </select>
      <div className="mt-3"><ErrorNote message={send.error ? (send.error as ApiError).message : null} /></div>
      <div className="mt-5 flex justify-end gap-3">
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" disabled={!reviewer || send.isPending} onClick={() => send.mutate()}>{send.isPending ? <Spinner className="h-4 w-4" /> : 'Enviar solicitud'}</button>
      </div>
    </Modal>
  );
}

function DecideModal({ review, onClose, onDone }: { review: ReviewDTO; onClose: () => void; onDone: () => void }) {
  const [comment, setComment] = useState('');
  const decide = useMutation({
    mutationFn: (d: 'APROBADO' | 'RECHAZADO' | 'CAMBIOS_SOLICITADOS') => filesApi.decideReview(review.id, d, comment || undefined),
    onSuccess: () => { onDone(); onClose(); },
  });
  const submit = (e: FormEvent) => e.preventDefault();
  return (
    <Modal title={`Revisar versión ${review.versionNumber}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="comment">Comentario (opcional)</label>
          <textarea id="comment" rows={3} className="field resize-none" value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        <ErrorNote message={decide.error ? (decide.error as ApiError).message : null} />
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-danger" disabled={decide.isPending} onClick={() => decide.mutate('RECHAZADO')}>Rechazar</button>
          <button className="btn-ghost" disabled={decide.isPending} onClick={() => decide.mutate('CAMBIOS_SOLICITADOS')}>Pedir cambios</button>
          <button className="btn-primary" disabled={decide.isPending} onClick={() => decide.mutate('APROBADO')}>Aprobar</button>
        </div>
      </form>
    </Modal>
  );
}

/** Ficha con todos los campos del registro maestro (los de auditoría los llena el sistema). */
function RegistroMaestro({ doc, onDownload, onEditOnline }: { doc: DocumentDetail; onDownload?: (url: string) => void; onEditOnline?: () => void }) {
  const campos: Array<[string, ReactNode]> = [
    ['Código', <span className="font-mono">{doc.codigo}</span>],
    ['Nombre del documento', doc.nombreDocumento],
    ['Estado', <StatusBadge status={doc.estado} />],
    ['Gestión', doc.gestion],
    ['Versión', `v${etiquetaDoc(doc)}`],
    ['Cambios', doc.cambios === 'SI' ? 'Sí' : 'No'],
    ['Fecha de creación', fullDate(doc.fechaCreacion)],
    ['Usuario creador', doc.usuarioCreador.nombre],
    ['Fecha de modificación', fullDate(doc.fechaModificacion)],
    ['Usuario modificador', doc.usuarioModificador.nombre],
    ['Fecha de actualización', fullDate(doc.fechaActualizacion)],
    ['Usuario actualizador', doc.usuarioActualizador.nombre],
    ['Revisor', doc.revisor?.nombre ?? '—'],
    ['Archivo Word', doc.urlWord
      ? <span className="inline-flex flex-wrap items-center gap-3">
          {onDownload && <button className="font-semibold text-brand hover:underline" onClick={() => onDownload(doc.urlWord!)}>Descargar Word</button>}
          {onEditOnline && <button className="font-semibold text-brand hover:underline" onClick={onEditOnline}>Editar en línea</button>}
          {!onDownload && !onEditOnline && 'Disponible'}
        </span>
      : '—'],
    ['Archivo PDF', doc.urlPdf && onDownload
      ? <button className="font-semibold text-brand hover:underline" onClick={() => onDownload(doc.urlPdf!)}>Descargar PDF</button> : (doc.urlPdf ? 'Disponible' : '—')],
  ];
  return (
    <section className="card mb-5 p-5" aria-label="Registro del documento">
      <h2 className="mb-3 text-base font-semibold">Registro del documento</h2>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {campos.map(([k, v]) => (
          <div key={k}><dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{k}</dt><dd className="mt-0.5 text-sm">{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}
