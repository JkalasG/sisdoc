import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CheckCircle2, ChevronRight, Eye, FileEdit, RefreshCw, Save, ServerCrash, ShieldCheck, Sparkles, Users,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/shared/api/http';
import { etiquetaDoc, etiquetaVersion } from '@/shared/api/types';
import type { DocumentDetail, EditorSessionResponse } from '@/shared/api/types';
import { USE_MOCKS } from '@/shared/config';
import { DocLoader, EmptyState, ErrorNote, Spinner } from '@/shared/ui/primitives';
import { filesApi } from '../api/files.api';

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (placeholderId: string, config: Record<string, unknown>) => {
        destroyEditor?: () => void;
      };
    };
  }
}

type EngineState = 'loading-script' | 'onlyoffice-ready' | 'local-fallback';

/** Carga el script `api.js` desde el contenedor OnlyOffice Document Server. */
function loadOnlyOfficeScript(src: string, timeoutMs = 4500): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.DocsAPI?.DocEditor) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[data-onlyoffice-src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('No se pudo conectar con OnlyOffice')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.onlyofficeSrc = src;
    const timer = window.setTimeout(() => {
      script.remove();
      reject(new Error('Tiempo de espera agotado al conectar con OnlyOffice'));
    }, timeoutMs);
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.DocsAPI?.DocEditor) resolve();
      else reject(new Error('DocsAPI no disponible'));
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      script.remove();
      reject(new Error('Contenedor OnlyOffice no disponible en ' + src));
    };
    document.head.appendChild(script);
  });
}

// Registro de diagnóstico: filtra la consola del navegador por "[IRIS-editor]".
const log = (msg: string, ...extra: unknown[]) => console.info('[IRIS-editor]', msg, ...extra);
const logError = (msg: string, ...extra: unknown[]) => console.error('[IRIS-editor]', msg, ...extra);

/** Editor en línea a pantalla completa: /documentos/:id/editor (?modo=view para solo lectura). */
export function DocumentEditorPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const versionId = params.get('version') ?? undefined; // una versión concreta siempre se abre en lectura
  const initialMode: 'edit' | 'view' = params.get('modo') === 'view' || versionId ? 'view' : 'edit';
  const { data: doc, isLoading, error } = useQuery({ queryKey: ['document', id], queryFn: () => filesApi.get(id), retry: false });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-4 p-20 text-ink-soft">
        <DocLoader />
        <p className="text-sm">Abriendo documento…</p>
      </div>
    );
  }
  if (error || !doc) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <EmptyState icon={<FileEdit className="h-6 w-6" />} title="Documento no encontrado"
          hint="No existe o no tienes acceso a él." action={<Link to="/documentos" className="btn-ghost">Volver a documentos</Link>} />
      </div>
    );
  }
  return <EditorWorkspace doc={doc} initialMode={initialMode} versionId={versionId} />;
}

function EditorWorkspace({ doc, initialMode, versionId }: { doc: DocumentDetail; initialMode: 'edit' | 'view'; versionId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const placeholderId = useId().replace(/:/g, '_');
  const editorRef = useRef<{ destroyEditor?: () => void } | null>(null);
  const [engine, setEngine] = useState<EngineState>(USE_MOCKS ? 'local-fallback' : 'loading-script');
  const [retryCount, setRetryCount] = useState(0);

  // Debe declararse ANTES de usarse en los useState de abajo (si no, ReferenceError y pantalla en blanco).
  const siguiente = `${doc.version}.${(doc.versionMenor ?? 0) + 1}`; // la edición en línea sube la versión menor

  const [draftContent, setDraftContent] = useState(() =>
    [
      `DOCUMENTO OFICIAL: ${doc.codigo} — ${doc.nombreDocumento}`,
      `Versión base: v${etiquetaDoc(doc)} (${doc.versionVigente.fileName})`,
      `Estado actual: ${doc.estado} | Gestión: ${doc.gestion}`,
      `────────────────────────────────────────────────────────────────────────`,
      ``,
      `1. OBJETIVO DEL DOCUMENTO`,
      `${doc.descripcion ?? 'Establecer los lineamientos y controles operativos vigentes para el área responsable.'}`,
      ``,
      `2. DESARROLLO Y CONTENIDO ACTUALIZADO`,
      `En fecha ${new Date().toLocaleDateString('es-BO')}, se realiza la edición en línea del documento "${doc.nombreDocumento}".`,
      `- Se verifican los requisitos de cumplimiento y trazabilidad SHA-256.`,
      `- Toda modificación guardada desde este editor genera automáticamente la versión v${siguiente} sin sobrescribir la versión v${etiquetaDoc(doc)}.`,
      ``,
      `3. HISTORIAL DE REVISIÓN`,
      `- Creado por: ${doc.usuarioCreador.nombre}`,
      `- Última modificación previa: ${doc.usuarioModificador.nombre}`,
    ].join('\n'),
  );
  const [changeNote, setChangeNote] = useState('Edición colaborativa en línea');
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const sessionQuery = useQuery<EditorSessionResponse, ApiError>({
    queryKey: ['editor-session', doc.id, initialMode, versionId, retryCount],
    queryFn: () => filesApi.openEditorSession(doc.id, initialMode, versionId),
    retry: false,
    refetchOnWindowFocus: false,
    gcTime: 0, // cada apertura pide una sesión (y token) nuevos
  });

  const session = sessionQuery.data;
  const isEditable = session ? session.modo === 'EDICION' : initialMode === 'edit';

  const versionMostrada = (versionId && doc.versions.find((v) => v.id === versionId) ? etiquetaVersion(doc.versions.find((v) => v.id === versionId)!) : etiquetaDoc(doc));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['document', doc.id] });
    qc.invalidateQueries({ queryKey: ['history', doc.id] });
    qc.invalidateQueries({ queryKey: ['documents'] });
  };
  const close = () => {
    refresh();
    navigate(`/documentos/${doc.id}`);
  };

  useEffect(() => {
    if (!session) return;
    if (USE_MOCKS) {
      setEngine('local-fallback');
      return;
    }
    let cancelled = false;
    setEngine('loading-script');
    log('sesión de editor recibida', { modo: session.modo, scriptUrl: session.scriptUrl, key: (session.config as { document?: { key?: string } }).document?.key });
    loadOnlyOfficeScript(session.scriptUrl)
      .then(() => {
        if (cancelled || !window.DocsAPI?.DocEditor) return;
        log('api.js cargado, creando editor');
        setEngine('onlyoffice-ready');
        setTimeout(() => {
          if (cancelled || !window.DocsAPI?.DocEditor) return;
          editorRef.current?.destroyEditor?.();
          const cfg = session.config as { events?: Record<string, unknown> };
          editorRef.current = new window.DocsAPI.DocEditor(placeholderId, {
            ...session.config,
            width: '100%',
            height: '100%',
            events: {
              ...(cfg.events ?? {}),
              onAppReady: () => log('editor listo'),
              onDocumentReady: () => log('documento cargado'),
              onDocumentStateChange: (e: { data?: boolean }) => log('documento modificado', e?.data),
              onInfo: (e: unknown) => log('info', e),
              onWarning: (e: unknown) => logError('aviso del editor', e),
              onError: (e: unknown) => logError('error del editor', e),
            },
          });
        }, 50);
      })
      .catch((err) => {
        logError('no se pudo cargar api.js; se usa el editor rápido', err);
        if (!cancelled) setEngine('local-fallback');
      });

    return () => {
      cancelled = true;
      editorRef.current?.destroyEditor?.();
      editorRef.current = null;
    };
  }, [session, placeholderId]);

  const saveVersionMutation = useMutation({
    mutationFn: async () => {
      const blob = new Blob([draftContent], { type: doc.versionVigente.mimeType || 'text/plain' });
      const file = new File([blob], doc.versionVigente.fileName, {
        type: doc.versionVigente.mimeType || 'text/plain',
      });
      return filesApi.newVersion(doc.id, file, changeNote.trim() || 'Edición en línea');
    },
    onSuccess: (res: any) => {
      setSavedBanner(res?.etiqueta ?? (res?.versionNumber ? `${res.versionNumber}.${res.versionMenor ?? 0}` : siguiente));
      refresh();
    },
  });

  const insertSnippet = (snippet: string) => {
    setDraftContent((prev) => `${prev}\n\n${snippet}`);
  };

  return (
    // Ocupa todo el alto bajo la barra superior (y sobre la barra inferior en móvil) para que las herramientas del editor se vean completas.
    <div className="flex h-[calc(100dvh-3.5rem-4rem)] flex-col gap-2 p-2 sm:p-3 md:h-[calc(100dvh-3.5rem)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex min-w-0 items-center gap-1.5 text-sm text-ink-soft" aria-label="Ruta">
          <Link to="/documentos" className="inline-flex items-center gap-1.5 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Documentos</Link>
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-mute" />
          <Link to={`/documentos/${doc.id}`} className="max-w-[14rem] truncate hover:text-ink" title={doc.nombreDocumento}>{doc.nombreDocumento}</Link>
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-mute" />
          <span className="font-semibold text-ink">{isEditable ? 'Editar en línea' : 'Vista en línea'}</span>
          <span className="ml-1 hidden rounded-full bg-paper px-2 py-0.5 text-xs font-semibold sm:inline">v{versionMostrada}</span>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-ink-soft md:inline-flex">
            <Users className="h-3.5 w-3.5" />
            {isEditable ? `Al guardar crea la v${siguiente}` : 'Solo lectura'}
          </span>
          {!USE_MOCKS && engine === 'local-fallback' && (
            <button type="button" className="btn-ghost" onClick={() => setRetryCount((c) => c + 1)}>
              <RefreshCw className="h-4 w-4" /> Reintentar OnlyOffice
            </button>
          )}
          {engine === 'onlyoffice-ready' && (
            <button type="button" className="btn-ghost" onClick={() => setEngine('local-fallback')}>
              <FileEdit className="h-4 w-4" /> Usar editor rápido local
            </button>
          )}
          {engine === 'local-fallback' && isEditable && (
            <button type="button" className="btn-primary" disabled={saveVersionMutation.isPending || !draftContent.trim()} onClick={() => saveVersionMutation.mutate()}>
              {saveVersionMutation.isPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              Guardar como v{siguiente}
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={close}>Cerrar editor</button>
        </div>
      </div>

      {sessionQuery.isLoading && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-ink-soft">
          <DocLoader />
          <p className="text-sm">Preparando sesión segura de edición…</p>
        </div>
      )}

      {sessionQuery.error && (
        <div className="py-6">
          <ErrorNote message={sessionQuery.error.message} />
        </div>
      )}

      {session && (
        <>
          {engine === 'local-fallback' && (
            <p className="inline-flex items-center gap-1.5 px-1 text-xs font-semibold text-amber-ink">
              <ServerCrash className="h-4 w-4" />
              {USE_MOCKS
                ? 'Modo demostración (VITE_USE_MOCKS=true) · Editor rápido integrado activo'
                : `OnlyOffice (${session.documentServerUrl}) no detectado · Editor rápido integrado activo`}
            </p>
          )}

          {savedBanner !== null && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand-light px-4 py-2.5 text-sm text-brand">
              <span className="inline-flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                ¡Versión v{savedBanner} creada y registrada con su huella SHA-256 en el historial!
              </span>
              <button type="button" className="text-xs font-semibold underline" onClick={close}>Ver en el registro</button>
            </div>
          )}

          {saveVersionMutation.error && <ErrorNote message={(saveVersionMutation.error as ApiError).message} />}

          {/* Lienzo de OnlyOffice: ocupa todo el espacio restante */}
          {engine !== 'local-fallback' && (
            <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-xl border border-line bg-surface">
              {engine === 'loading-script' && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface"><DocLoader /></div>
              )}
              <div id={placeholderId} className="h-full w-full" />
            </div>
          )}

          {/* Editor rápido integrado (VITE_USE_MOCKS=true o contenedor Docker 8082 apagado) */}
          {engine === 'local-fallback' && (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {isEditable && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-soft">
                      <Sparkles className="h-3.5 w-3.5 text-brand" /> Insertar bloque:
                    </span>
                    <button type="button" className="btn-ghost !px-2.5 !py-1 text-xs"
                      onClick={() => insertSnippet('4. CLÁUSULA DE CONFORMIDAD\nLas partes aprueban el contenido revisado en sesión colaborativa.')}>
                      + Cláusula
                    </button>
                    <button type="button" className="btn-ghost !px-2.5 !py-1 text-xs"
                      onClick={() => insertSnippet('OBSERVACIÓN DE REVISIÓN:\n- Punto verificado por ' + session.config.editorConfig.user.name + ' (' + new Date().toLocaleTimeString('es-BO') + ').')}>
                      + Observación
                    </button>
                    <button type="button" className="btn-ghost !px-2.5 !py-1 text-xs"
                      onClick={() => insertSnippet('FIRMA DIGITAL / CONSTANCIA:\nResponsable: ' + session.config.editorConfig.user.name + '\nFecha: ' + new Date().toISOString())}>
                      + Pie de firma
                    </button>
                  </div>
                  <span className="text-xs text-ink-mute">
                    Usuario activo: <strong className="text-ink">{session.config.editorConfig.user.name}</strong>
                  </span>
                </div>
              )}

              <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
                <div className="mb-2 flex items-center justify-between border-b border-line pb-2 text-xs text-ink-mute">
                  <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-ink-soft">
                    {isEditable ? <FileEdit className="h-3.5 w-3.5 text-brand" /> : <Eye className="h-3.5 w-3.5" />}
                    {session.config.document.title}
                  </span>
                  <span>Tipo: {session.config.document.fileType.toUpperCase()} · {session.modo}</span>
                </div>
                <textarea
                  aria-label="Contenido del documento en línea"
                  readOnly={!isEditable}
                  rows={18}
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  className="w-full resize-y border-0 bg-transparent font-mono text-sm leading-relaxed text-ink focus:outline-none"
                />
              </div>

              {isEditable && (
                <div>
                  <label className="label" htmlFor="editor-change-note">Nota de cambios para la nueva versión (v{siguiente})</label>
                  <input id="editor-change-note" type="text" className="field" value={changeNote}
                    onChange={(e) => setChangeNote(e.target.value)} placeholder="Ej.: Ajuste de indicadores y revisión de cláusulas en línea" />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
