import { useEffect, useState } from 'react';
import { formatBytes } from '@/shared/format';
import { DocxView, esFormatoAntiguo, MAX_OFFICE_BYTES, officeKind, PptxView, XlsxView } from './OfficeViewers';
import { FileTypeIcon } from './primitives';

const TEXTO = /^(text\/|application\/json)/;
const MAX_CHARS = 3000;

/** Lee solo el inicio del archivo como texto (sin cargar archivos enormes en memoria). */
const leerTexto = (blob: Blob) => new Promise<string>((ok, fail) => {
  const rd = new FileReader();
  rd.onload = () => ok(String(rd.result ?? ''));
  rd.onerror = () => fail(rd.error);
  rd.readAsText(blob);
});

const etiquetaTipo = (mime: string, name: string) =>
  (name.includes('.') ? name.split('.').pop()! : mime.split('/').pop() ?? '').toUpperCase();

/**
 * Visor local del archivo elegido (no se sube nada): barra con nombre y tamaño arriba,
 * contenido debajo. Imagen, PDF y texto se ven; Word/Excel/PowerPoint no se pueden dibujar
 * sin librerías pesadas, así que muestran su ficha. Ocupa el alto que le dé su contenedor.
 */
export function FilePreview({ file, className = 'h-64' }: { file: File; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [texto, setTexto] = useState<string | null>(null);
  const tipo = file.type || '';
  const esImagen = tipo.startsWith('image/');
  const esPdf = tipo === 'application/pdf';
  const esTexto = TEXTO.test(tipo);
  const office = officeKind(file);
  const grande = !!office && file.size > MAX_OFFICE_BYTES;
  const [fallo, setFallo] = useState<string | null>(null);
  useEffect(() => setFallo(null), [file]);

  useEffect(() => {
    setTexto(null);
    if (esImagen || esPdf) {
      let u: string | null = null;
      try { u = URL.createObjectURL(file); } catch { /* entorno sin blobs: se muestra la ficha */ }
      setUrl(u);
      return () => { if (u) URL.revokeObjectURL(u); }; // libera memoria al cambiar de archivo o cerrar
    }
    setUrl(null);
    if (esTexto) {
      let vivo = true;
      leerTexto(file.slice(0, MAX_CHARS * 4)).then((t) => { if (vivo) setTexto(t.slice(0, MAX_CHARS)); }).catch(() => {});
      return () => { vivo = false; };
    }
  }, [file, esImagen, esPdf, esTexto]);

  const verOffice = !!office && !grande && !fallo;
  const sinVista = !verOffice && (!(esImagen || esPdf || esTexto) || ((esImagen || esPdf) && !url));
  const motivo = fallo ? `No se pudo generar la vista previa (${fallo}).`
    : grande ? 'El archivo es muy grande para previsualizarlo aquí.'
    : esFormatoAntiguo(file.name) ? 'Es un formato antiguo de Office: guárdalo como .docx, .xlsx o .pptx para verlo aquí.'
    : 'Sin vista previa para este tipo de archivo';

  return (
    <figure className={`m-0 flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-paper ${className}`} aria-label="Vista previa del archivo">
      <figcaption className="flex shrink-0 items-center gap-2.5 border-b border-line bg-surface px-3 py-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand"><FileTypeIcon mime={tipo} className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{file.name}</span>
          <span className="block text-xs text-ink-soft">{etiquetaTipo(tipo, file.name)} · {formatBytes(file.size)}</span>
        </span>
      </figcaption>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        {esImagen && url && <img src={url} alt={`Vista previa de ${file.name}`} className="max-h-full max-w-full object-contain p-3" />}
        {esPdf && url && <iframe src={`${url}#toolbar=0&navpanes=0`} title={`Vista previa de ${file.name}`} className="h-full w-full border-0 bg-white" />}
        {esTexto && <pre className="h-full w-full overflow-auto whitespace-pre-wrap break-words p-4 text-left text-xs leading-relaxed text-ink-soft">{texto ?? 'Cargando…'}</pre>}
        {verOffice && office === 'docx' && <DocxView file={file} onFail={setFallo} />}
        {verOffice && office === 'xlsx' && <XlsxView file={file} onFail={setFallo} />}
        {verOffice && office === 'pptx' && <PptxView file={file} onFail={setFallo} />}
        {sinVista && (
          <div className="px-6 text-center">
            <FileTypeIcon mime={tipo} className="mx-auto h-10 w-10 text-brand" />
            <p className="mt-2 text-sm font-semibold">{motivo}</p>
            <p className="mt-0.5 text-xs text-ink-soft">Se cargará tal cual y podrás descargarlo desde el registro.</p>
          </div>
        )}
      </div>
    </figure>
  );
}

/** Marcador del panel mientras todavía no hay archivo: dice qué hacer, no solo que está vacío. */
export function PreviewVacia({ className = 'h-64' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line bg-paper px-8 text-center ${className}`}>
      <FileTypeIcon mime="" className="h-9 w-9 text-ink-mute" />
      <p className="text-sm font-semibold text-ink-soft">Aquí verás el documento</p>
      <p className="text-xs text-ink-mute">Elige un archivo a la izquierda y revísalo antes de cargarlo.</p>
    </div>
  );
}
