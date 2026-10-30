import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CheckCircle2, Cloud, Eye, FileEdit, RefreshCw, Save, ServerCrash, ShieldCheck, Sparkles, Users,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { ApiError } from '@/shared/api/http';
import type { DocumentDetail, EditorSessionResponse } from '@/shared/api/types';
import { USE_MOCKS } from '@/shared/config';
import { ErrorNote, Modal, Spinner } from '@/shared/ui/primitives';
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

interface OfficeEditorModalProps {
  doc: DocumentDetail;
  initialMode?: 'edit' | 'view';
  onClose: () => void;
  onSaved: () => void;
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

export function OfficeEditorModal({ doc, initialMode = 'edit', onClose, onSaved }: OfficeEditorModalProps) {
  const placeholderId = useId().replace(/:/g, '_');
  const editorRef = useRef<{ destroyEditor?: () => void } | null>(null);
  const [engine, setEngine] = useState<EngineState>(USE_MOCKS ? 'local-fallback' : 'loading-script');
  const [retryCount, setRetryCount] = useState(0);

  const [draftContent, setDraftContent] = useState(() =>
    [
      `DOCUMENTO OFICIAL: ${doc.codigo} — ${doc.nombreDocumento}`,
      `Versión base: v${doc.version} (${doc.versionVigente.fileName})`,
      `Estado actual: ${doc.estado} | Gestión: ${doc.gestion}`,
      `────────────────────────────────────────────────────────────────────────`,
      ``,
      `1. OBJETIVO DEL DOCUMENTO`,
      `${doc.descripcion ?? 'Establecer los lineamientos y controles operativos vigentes para el área responsable.'}`,
      ``,
      `2. DESARROLLO Y CONTENIDO ACTUALIZADO`,
      `En fecha ${new Date().toLocaleDateString('es-BO')}, se realiza la edición en línea del documento "${doc.nombreDocumento}".`,
      `- Se verifican los requisitos de cumplimiento y trazabilidad SHA-256.`,
      `- Toda modificación guardada desde este editor genera automáticamente la versión v${doc.version + 1} sin sobrescribir la versión v${doc.version}.`,
      ``,
      `3. HISTORIAL DE REVISIÓN`,
      `- Creado por: ${doc.usuarioCreador.nombre}`,
      `- Última modificación previa: ${doc.usuarioModificador.nombre}`,
    ].join('\n'),
  );
  const [changeNote, setChangeNote] = useState('Edición colaborativa en línea');
  const [savedBanner, setSavedBanner] = useState<number | null>(null);

  const sessionQuery = useQuery<EditorSessionResponse, ApiError>({
    queryKey: ['editor-session', doc.id, initialMode, retryCount],
    queryFn: () => filesApi.openEditorSession(doc.id, initialMode),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const session = sessionQuery.data;
  const isEditable = session ? session.modo === 'EDICION' : initialMode === 'edit';

  useEffect(() => {
    if (!session) return;
    if (USE_MOCKS) {
      setEngine('local-fallback');
      return;
    }
    let cancelled = false;
    setEngine('loading-script');
    loadOnlyOfficeScript(session.scriptUrl)
      .then(() => {
        if (cancelled || !window.DocsAPI?.DocEditor) return;
        setEngine('onlyoffice-ready');
        setTimeout(() => {
          if (cancelled || !window.DocsAPI?.DocEditor) return;
          editorRef.current?.destroyEditor?.();
          editorRef.current = new window.DocsAPI.DocEditor(placeholderId, {
            ...session.config,
            width: '100%',
            height: '100%',
          });
        }, 50);
      })
      .catch(() => {
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
      const nextVer = res?.versionNumber ?? doc.version + 1;
      setSavedBanner(nextVer);
      onSaved();
    },
  });

  const insertSnippet = (snippet: string) => {
    setDraftContent((prev) => `${prev}\n\n${snippet}`);
  };

  return (
    <Modal
      size="xl"
      title={isEditable ? `Editar en línea · ${doc.nombreDocumento}` : `Vista en línea · ${doc.nombreDocumento}`}
      description={`${doc.codigo} · Base v${doc.version} (${doc.versionVigente.fileName})`}
      onClose={() => {
        onSaved();
        onClose();
      }}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-light px-2.5 py-1 font-semibold text-brand">
              <ShieldCheck className="h-3.5 w-3.5" />
              Token JWT firmado · Clave {session?.config.document.key.slice(0, 14) ?? '…'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 font-medium text-ink-soft">
              <Users className="h-3.5 w-3.5" />
              {isEditable ? 'Co-edición activa (crea versión v' + (doc.version + 1) + ' al guardar)' : 'Modo solo lectura'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {engine === 'local-fallback' && isEditable && (
              <button
                type="button"
                className="btn-primary"
                disabled={saveVersionMutation.isPending || !draftContent.trim()}
                onClick={() => saveVersionMutation.mutate()}
              >
                {saveVersionMutation.isPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                Guardar como v{doc.version + 1}
              </button>
            )}
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                onSaved();
                onClose();
              }}
            >
              Cerrar editor
            </button>
          </div>
        </div>
      }
    >
      {sessionQuery.isLoading && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-brand">
          <Spinner className="h-8 w-8" />
          <p className="text-sm text-ink-soft">Preparando sesión segura de edición y firmando credenciales JWT…</p>
        </div>
      )}

      {sessionQuery.error && (
        <div className="py-6">
          <ErrorNote message={sessionQuery.error.message} />
        </div>
      )}

      {session && (
        <div className="space-y-4">
          {/* Barra de estado del motor de edición */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-paper px-3.5 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {engine === 'onlyoffice-ready' ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-brand">
                  <Cloud className="h-4 w-4" />
                  Conectado a OnlyOffice Document Server ({session.documentServerUrl})
                </span>
              ) : engine === 'loading-script' ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-ink-soft">
                  <Spinner className="h-3.5 w-3.5" />
                  Conectando con OnlyOffice en {session.documentServerUrl}…
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-semibold text-amber-ink">
                  <ServerCrash className="h-4 w-4" />
                  {USE_MOCKS
                    ? 'Modo demostración (VITE_USE_MOCKS=true) · Editor rápido integrado activo'
                    : `OnlyOffice (${session.documentServerUrl}) no detectado · Editor rápido integrado activo`}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!USE_MOCKS && engine === 'local-fallback' && (
                <button
                  type="button"
                  className="btn-ghost !px-2.5 !py-1 text-xs"
                  onClick={() => setRetryCount((c) => c + 1)}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Reintentar OnlyOffice
                </button>
              )}
              {engine === 'onlyoffice-ready' && (
                <button
                  type="button"
                  className="btn-ghost !px-2.5 !py-1 text-xs"
                  onClick={() => setEngine('local-fallback')}
                >
                  <FileEdit className="h-3.5 w-3.5" /> Usar editor rápido local
                </button>
              )}
            </div>
          </div>

          {savedBanner !== null && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand-light px-4 py-3 text-sm text-brand">
              <span className="inline-flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                ¡Versión v{savedBanner} creada y registrada con su huella SHA-256 en el historial!
              </span>
              <button type="button" className="text-xs font-semibold underline" onClick={onClose}>
                Ver en el registro
              </button>
            </div>
          )}

          {saveVersionMutation.error && (
            <ErrorNote message={(saveVersionMutation.error as ApiError).message} />
          )}

          {/* Lienzo de OnlyOffice Document Server cuando el contenedor está activo */}
          {engine !== 'local-fallback' && (
            <div className="h-[68dvh] min-h-[460px] w-full overflow-hidden rounded-xl border border-line bg-surface">
              <div id={placeholderId} className="h-full w-full" />
            </div>
          )}

          {/* Editor rápido integrado (cuando VITE_USE_MOCKS=true o el contenedor Docker 8082 está apagado) */}
          {engine === 'local-fallback' && (
            <div className="space-y-3">
              {isEditable && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-soft">
                      <Sparkles className="h-3.5 w-3.5 text-brand" /> Insertar bloque:
                    </span>
                    <button
                      type="button"
                      className="btn-ghost !px-2.5 !py-1 text-xs"
                      onClick={() => insertSnippet('4. CLÁUSULA DE CONFORMIDAD\nLas partes aprueban el contenido revisado en sesión colaborativa.')}
                    >
                      + Cláusula
                    </button>
                    <button
                      type="button"
                      className="btn-ghost !px-2.5 !py-1 text-xs"
                      onClick={() => insertSnippet('OBSERVACIÓN DE REVISIÓN:\n- Punto verificado por ' + session.config.editorConfig.user.name + ' (' + new Date().toLocaleTimeString('es-BO') + ').')}
                    >
                      + Observación
                    </button>
                    <button
                      type="button"
                      className="btn-ghost !px-2.5 !py-1 text-xs"
                      onClick={() => insertSnippet('FIRMA DIGITAL / CONSTANCIA:\nResponsable: ' + session.config.editorConfig.user.name + '\nFecha: ' + new Date().toISOString())}
                    >
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
                  rows={14}
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  className="w-full resize-y border-0 bg-transparent font-mono text-sm leading-relaxed text-ink focus:outline-none"
                />
              </div>

              {isEditable && (
                <div>
                  <label className="label" htmlFor="editor-change-note">
                    Nota de cambios para la nueva versión (v{doc.version + 1})
                  </label>
                  <input
                    id="editor-change-note"
                    type="text"
                    className="field"
                    value={changeNote}
                    onChange={(e) => setChangeNote(e.target.value)}
                    placeholder="Ej.: Ajuste de indicadores y revisión de cláusulas en línea"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

