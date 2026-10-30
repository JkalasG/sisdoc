import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { FormEvent, useId, useState } from 'react';
import { ApiError } from '@/shared/api/http';
import { nombreDesdeArchivo } from '@/shared/format';
import { DateTimeField } from '@/shared/ui/DateTimeField';
import { FilePreview, PreviewVacia } from '@/shared/ui/FilePreview';
import { Modal } from '@/shared/ui/Modal';
import { ErrorNote, Spinner } from '@/shared/ui/primitives';
import { Switch } from '@/shared/ui/Switch';
import { filesApi } from '../api/files.api';
import { FileDropzone } from './FileDropzone';

/**
 * Documento nuevo (versión 1) o nueva versión de uno existente (si se pasa `documentId`).
 *
 * Al cargar un documento nuevo la persona solo llena: código, nombre (sugerido desde el archivo),
 * fecha y hora de creación y si es borrador o revisado. El resto del registro lo completa el sistema.
 */
export function UploadModal({ onClose, onDone, documentId }: { onClose: () => void; onDone?: (id?: string) => void; documentId?: string }) {
  const qc = useQueryClient();
  const formId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [nombreEditado, setNombreEditado] = useState(false);
  const [fecha, setFecha] = useState(() => new Date().toISOString()); // fecha Y hora
  const [revisado, setRevisado] = useState(false);
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: () => documentId
      ? filesApi.newVersion(documentId, file!, note || undefined).then(() => documentId)
      : filesApi.create(file!, {
          codigo: codigo.trim(), nombreDocumento: nombre.trim() || nombreDesdeArchivo(file!.name),
          fechaCreacion: new Date(fecha).toISOString(), estado: revisado ? 'REVISADO' : 'BORRADOR',
        }).then((r) => r.document.id),
    onSuccess: (id) => { qc.invalidateQueries({ queryKey: ['documents'] }); onDone?.(id); onClose(); },
  });

  const onFile = (f: File | null) => {
    setFile(f);
    if (f && !documentId && !nombreEditado) setNombre(nombreDesdeArchivo(f.name)); // sugerido, editable
  };
  const listo = !!file && (!!documentId || codigo.trim().length >= 2);
  const submit = (e: FormEvent) => { e.preventDefault(); if (listo && !save.isPending) save.mutate(); };

  return (
    <Modal
      size="xl" title={documentId ? 'Subir nueva versión' : 'Cargar documento'} onClose={onClose}
      footer={<>
        <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button type="submit" form={formId} className="btn-primary min-w-24" disabled={!listo || save.isPending}>
          {save.isPending ? <Spinner className="h-4 w-4" /> : documentId ? 'Subir' : 'Cargar'}
        </button>
      </>}
    >
      <form id={formId} onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* datos */}
        <div className="min-w-0 space-y-4">
          <FileDropzone file={file} onFile={onFile} />

          {documentId ? (
            <div>
              <label className="label" htmlFor="note">¿Qué cambió en esta versión?</label>
              <textarea id="note" rows={3} className="field resize-none" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
                placeholder="Ej.: se corrigió la cláusula 4" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:grid-cols-1 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
                <div>
                  <label className="label" htmlFor="codigo">Código</label>
                  <input id="codigo" className="field uppercase" value={codigo} onChange={(e) => setCodigo(e.target.value)}
                    maxLength={40} placeholder="PR-COM-001" autoComplete="off" required />
                </div>
                <div>
                  <label className="label" htmlFor="nombre">Nombre del documento</label>
                  <input id="nombre" className="field" value={nombre} maxLength={200} placeholder="Se completa con el nombre del archivo"
                    onChange={(e) => { setNombre(e.target.value); setNombreEditado(true); }} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="fecha">Fecha y hora de creación</label>
                <DateTimeField id="fecha" value={fecha} onChange={setFecha} max={new Date()} required />
              </div>
              <Switch checked={revisado} onChange={setRevisado} label="Documento revisado" labelOff="Borrador" labelOn="Revisado" />
              <p className="flex gap-2 text-xs leading-relaxed text-ink-soft">
                <Info className="mt-px h-3.5 w-3.5 shrink-0 text-ink-mute" aria-hidden />
                El sistema completa solo el creador, las fechas y usuarios de modificación y actualización, la versión, la gestión,
                los cambios, el revisor y los enlaces Word y PDF.
              </p>
            </>
          )}

          <ErrorNote message={save.error ? (save.error as ApiError).message : null} />
        </div>

        {/* vista previa: ocupa todo el alto del formulario; en móvil queda debajo */}
        <div className="flex min-h-72 min-w-0 flex-col lg:min-h-[28rem]">
          {file ? <FilePreview file={file} className="flex-1" /> : <PreviewVacia className="flex-1" />}
        </div>
      </form>
    </Modal>
  );
}
