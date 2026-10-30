import { useQuery } from '@tanstack/react-query';
import { FileText, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { DocumentSummary } from '@/shared/api/types';
import { shortDate } from '@/shared/format';
import { EmptyState, ErrorNote, Spinner, StatusBadge } from '@/shared/ui/primitives';
import { filesApi } from '../api/files.api';
import { UploadModal } from '../components/UploadModal';

type Filter = 'all' | 'mine' | 'shared' | 'review';
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Todos' }, { id: 'mine', label: 'Míos' },
  { id: 'shared', label: 'Compartidos conmigo' }, { id: 'review', label: 'En revisión' },
];

/** Enlace Word / PDF: descarga por el backend (queda registrada), nunca un enlace directo al archivo. */
function FileLink({ doc, kind }: { doc: DocumentSummary; kind: 'word' | 'pdf' }) {
  const url = kind === 'word' ? doc.urlWord : doc.urlPdf;
  if (!url) return <span className="text-ink-mute">—</span>;
  const label = kind === 'word' ? 'Word' : 'PDF';
  return (
    <button type="button" className="rounded-md bg-brand-light px-2 py-0.5 text-xs font-semibold text-brand hover:underline"
      aria-label={`Descargar ${label} de ${doc.codigo}`} title={`Descargar ${label}`}
      onClick={(e) => { e.stopPropagation(); void filesApi.download(doc.id, doc.versionVigente.fileName, filesApi.versionDeUrl(url)); }}>
      {label}
    </button>
  );
}

const COLUMNS = [
  'Código', 'Nombre del documento', 'Estado', 'Fecha creación', 'Fecha modificación', 'Usuario creador',
  'Usuario modificador', 'Versión', 'Fecha actualización', 'Usuario actualizador', 'Revisor', 'Word', 'PDF', 'Gestión', 'Cambios',
];

export function DocumentsPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({ queryKey: ['documents'], queryFn: filesApi.list });
  const [filter, setFilter] = useState<Filter>('all');
  const [gestion, setGestion] = useState('');
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState(false);

  const gestiones = useMemo(() => [...new Set((data ?? []).map((d) => d.gestion))].sort((a, b) => b - a), [data]);
  const rows = useMemo(() => (data ?? []).filter((d: DocumentSummary) =>
    (filter === 'all' || (filter === 'mine' && d.miPermiso === 'PROPIETARIO') ||
      (filter === 'shared' && d.miPermiso !== 'PROPIETARIO') || (filter === 'review' && d.estado === 'EN_REVISION')) &&
    (!gestion || String(d.gestion) === gestion) &&
    `${d.codigo} ${d.nombreDocumento} ${d.usuarioCreador.nombre} ${d.versionVigente.fileName}`.toLowerCase().includes(q.toLowerCase())),
  [data, filter, gestion, q]);

  return (
    <div className="mx-auto max-w-[1400px] p-5 sm:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Documentos</h1>
          <p className="text-sm text-ink-soft">Registro maestro: cada versión y cada descarga quedan registradas.</p>
        </div>
        <button className="btn-primary" onClick={() => setUploading(true)}><Plus className="h-4 w-4" /> Cargar documento</button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <input className="field pl-10" placeholder="Buscar por código, nombre, archivo o creador" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        </div>
        <select className="field !w-auto" aria-label="Gestión" value={gestion} onChange={(e) => setGestion(e.target.value)}>
          <option value="">Todas las gestiones</option>
          {gestiones.map((g) => <option key={g} value={g}>Gestión {g}</option>)}
        </select>
        <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filtros">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                filter === f.id ? 'bg-brand text-white' : 'bg-surface text-ink-soft ring-1 ring-line hover:bg-paper'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading && <div className="flex justify-center p-14 text-brand"><Spinner className="h-6 w-6" /></div>}
        {error && <div className="p-5"><ErrorNote message={(error as Error).message} /></div>}
        {!isLoading && !error && rows.length === 0 && (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="No hay documentos aquí"
            hint={q ? 'Prueba con otra búsqueda.' : 'Carga el primero o espera a que te compartan uno.'} />
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] text-left text-sm" aria-label="Registro de documentos">
              <thead>
                <tr className="border-b border-line bg-paper text-xs uppercase tracking-wide text-ink-soft">
                  {COLUMNS.map((c) => <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold">{c}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((d) => (
                  <tr key={d.id} className="cursor-pointer transition hover:bg-paper/70" onClick={() => navigate(`/documentos/${d.id}`)}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">{d.codigo}</td>
                    <td className="max-w-[320px] px-4 py-3">
                      <Link to={`/documentos/${d.id}`} className="block truncate font-semibold hover:text-brand" onClick={(e) => e.stopPropagation()}>{d.nombreDocumento}</Link>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={d.estado} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{shortDate(d.fechaCreacion)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{shortDate(d.fechaModificacion)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{d.usuarioCreador.nombre}</td>
                    <td className="whitespace-nowrap px-4 py-3">{d.usuarioModificador.nombre}</td>
                    <td className="px-4 py-3 font-semibold">v{d.version}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{shortDate(d.fechaActualizacion)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{d.usuarioActualizador.nombre}</td>
                    <td className="whitespace-nowrap px-4 py-3">{d.revisor?.nombre ?? <span className="text-ink-mute">—</span>}</td>
                    <td className="px-4 py-3"><FileLink doc={d} kind="word" /></td>
                    <td className="px-4 py-3"><FileLink doc={d} kind="pdf" /></td>
                    <td className="px-4 py-3">{d.gestion}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${d.cambios === 'SI' ? 'bg-amber-soft text-amber-ink' : 'bg-paper text-ink-soft'}`}>{d.cambios === 'SI' ? 'Sí' : 'No'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-line px-4 py-2 text-xs text-ink-soft">{rows.length} documento{rows.length === 1 ? '' : 's'}</p>
          </div>
        )}
      </div>

      {uploading && <UploadModal onClose={() => setUploading(false)} onDone={(id) => id && navigate(`/documentos/${id}`)} />}
    </div>
  );
}
