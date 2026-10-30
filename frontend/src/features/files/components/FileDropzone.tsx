import { UploadCloud } from 'lucide-react';
import { DragEvent, useRef, useState } from 'react';
import { formatBytes } from '@/shared/format';
import { FileTypeIcon } from '@/shared/ui/primitives';

const MAX_MB = 50;

/** Zona para elegir un archivo. Vacía: invita a arrastrar. Con archivo: se reduce a una fila para dejar sitio al formulario. */
export function FileDropzone({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(f?: File) {
    if (!f) return;
    if (f.size === 0) return setError('El archivo está vacío');
    if (f.size > MAX_MB * 1024 * 1024) return setError(`El archivo supera ${MAX_MB} MB`);
    setError(null);
    onFile(f);
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); accept(e.dataTransfer.files[0]); };
  const open = () => input.current?.click();

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
        onClick={open} role="button" tabIndex={0} aria-label={file ? `Archivo elegido: ${file.name}. Cambiar archivo` : 'Elegir archivo'}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
        className={`cursor-pointer rounded-xl border-2 border-dashed transition ${over ? 'border-brand bg-brand-light' : 'border-line hover:border-brand-ring hover:bg-paper'}`}
      >
        {file ? (
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand"><FileTypeIcon mime={file.type} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{file.name}</span>
              <span className="block text-xs text-ink-soft">{formatBytes(file.size)}</span>
            </span>
            <span className="shrink-0 rounded-lg px-2.5 py-1 text-sm font-semibold text-brand">Cambiar</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 px-4 py-7 text-center">
            <UploadCloud className="h-7 w-7 text-brand" />
            <p className="font-semibold">Arrastra un archivo o haz clic</p>
            <p className="text-xs text-ink-mute">PDF, Word, Excel, imágenes o texto · máx. {MAX_MB} MB</p>
          </div>
        )}
        <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-label="Archivo" onChange={(e) => accept(e.target.files?.[0])} />
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
