import { useEffect, useRef, useState } from 'react';
import { Spinner } from './primitives';

/**
 * Visores de Word, Excel y PowerPoint que se ejecutan EN EL NAVEGADOR sobre el archivo elegido (no se sube nada).
 * Este módulo se carga bajo demanda (React.lazy desde FilePreview): quien solo sube PDF o imágenes no descarga nada de esto.
 *
 *   .docx → docx-preview      .xlsx → read-excel-file      .pptx → pptx-preview
 *
 * Los formatos antiguos (.doc, .xls, .ppt) son binarios propietarios: no se pueden dibujar en el navegador.
 */
export type OfficeKind = 'docx' | 'xlsx' | 'pptx';

const MIME: Record<OfficeKind, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** Qué visor corresponde al archivo (por extensión o tipo MIME), o null si no se puede previsualizar. */
export function officeKind(file: { name: string; type: string }): OfficeKind | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  for (const k of ['docx', 'xlsx', 'pptx'] as const) if (ext === k || file.type === MIME[k]) return k;
  if (ext === 'xlsm') return 'xlsx';
  return null;
}
/** Formatos antiguos de Office (para explicar por qué no hay vista previa). */
export const esFormatoAntiguo = (name: string) => /\.(doc|xls|ppt)$/i.test(name);

export const MAX_OFFICE_BYTES = 25 * 1024 * 1024; // un archivo mayor no se carga en memoria solo para previsualizarlo

/** Lee el archivo completo (FileReader funciona en todos los navegadores y en el entorno de pruebas). */
const leerBuffer = (blob: Blob) => new Promise<ArrayBuffer>((ok, fail) => {
  const rd = new FileReader();
  rd.onload = () => ok(rd.result as ArrayBuffer);
  rd.onerror = () => fail(rd.error);
  rd.readAsArrayBuffer(blob);
});

const Cargando = ({ texto }: { texto: string }) => (
  <div className="flex flex-col items-center gap-2 text-ink-soft" role="status"><Spinner className="h-5 w-5 text-brand" /><span className="text-xs">{texto}</span></div>
);

/** Ejecuta `render` sobre el archivo; si falla (archivo protegido o dañado) avisa para mostrar la ficha. */
function useRender(file: File, render: (host: HTMLDivElement, width: number) => Promise<void>, onFail: (msg: string) => void) {
  const host = useRef<HTMLDivElement>(null);
  const [listo, setListo] = useState(false);
  useEffect(() => {
    let vivo = true;
    setListo(false);
    const el = host.current;
    if (!el) return;
    const caja = document.createElement('div');
    el.append(caja);
    render(caja, Math.max(280, el.clientWidth))
      .then(() => { if (vivo) setListo(true); })
      .catch((e) => { if (vivo) onFail(e instanceof Error ? e.message : 'No se pudo leer el archivo'); });
    return () => { vivo = false; caja.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);
  return { host, listo };
}

// ---------------------------------------------------------------- Word
export function DocxView({ file, onFail }: { file: File; onFail: (m: string) => void }) {
  const { host, listo } = useRender(file, async (el, ancho) => {
    const { renderAsync } = await import('docx-preview');
    const estilos = document.createElement('div');
    const cuerpo = document.createElement('div');
    el.append(estilos, cuerpo);
    await renderAsync(file, cuerpo, estilos, { className: 'docx', inWrapper: true, ignoreLastRenderedPageBreak: true, useBase64URL: true });
    // las páginas miden lo que mide una hoja real: se reducen para caber en el panel
    const pagina = cuerpo.querySelector<HTMLElement>('section.docx');
    if (pagina && pagina.offsetWidth > 0) cuerpo.style.setProperty('zoom', String(Math.min(1, (ancho - 8) / pagina.offsetWidth)));
  }, onFail);
  return (
    <div className="relative h-full w-full overflow-auto" aria-label="Documento de Word">
      {!listo && <div className="absolute inset-0 flex items-center justify-center"><Cargando texto="Preparando el documento…" /></div>}
      <div ref={host} className="docx-host" />
    </div>
  );
}

// ---------------------------------------------------------------- Excel
const MAX_FILAS = 300, MAX_COLS = 40;
type Hoja = { sheet: string; data: unknown[][] };
const letra = (i: number): string => (i >= 26 ? letra(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));
const celda = (v: unknown) => (v instanceof Date ? v.toLocaleDateString('es') : typeof v === 'boolean' ? (v ? 'VERDADERO' : 'FALSO') : v == null ? '' : String(v));

export function XlsxView({ file, onFail }: { file: File; onFail: (m: string) => void }) {
  const [hojas, setHojas] = useState<Hoja[] | null>(null);
  const [activa, setActiva] = useState(0);
  useEffect(() => {
    let vivo = true;
    setHojas(null); setActiva(0);
    import('read-excel-file/browser')
      .then(({ default: leer }) => leer(file))
      .then((h) => { if (vivo) setHojas(h as Hoja[]); })
      .catch((e) => { if (vivo) onFail(e instanceof Error ? e.message : 'No se pudo leer el archivo'); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  if (!hojas) return <Cargando texto="Leyendo la hoja de cálculo…" />;
  const hoja = hojas[activa] ?? hojas[0];
  const filas = (hoja?.data ?? []).slice(0, MAX_FILAS);
  const cols = Math.min(MAX_COLS, Math.max(1, ...filas.map((f) => f.length)));
  const recortado = (hoja?.data.length ?? 0) > MAX_FILAS;

  return (
    <div className="flex h-full w-full flex-col bg-surface" aria-label="Hoja de cálculo">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="border-separate border-spacing-0 text-xs tabular-nums">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 border-b border-r border-line bg-paper px-2 py-1" />
              {Array.from({ length: cols }, (_, c) => <th key={c} scope="col" className="min-w-20 border-b border-r border-line bg-paper px-2 py-1 font-semibold text-ink-soft">{letra(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, r) => (
              <tr key={r}>
                <th scope="row" className="sticky left-0 border-b border-r border-line bg-paper px-2 py-1 text-right font-medium text-ink-mute">{r + 1}</th>
                {Array.from({ length: cols }, (_, c) => {
                  const v = f[c];
                  return <td key={c} className={`max-w-64 truncate whitespace-nowrap border-b border-r border-line px-2 py-1 ${typeof v === 'number' ? 'text-right' : ''}`} title={celda(v)}>{celda(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-line bg-paper px-2 py-1.5" role="tablist" aria-label="Hojas">
        {hojas.map((h, i) => (
          <button key={h.sheet + i} role="tab" aria-selected={i === activa} onClick={() => setActiva(i)}
            className={`whitespace-nowrap rounded-md px-3 py-1 text-xs font-semibold transition ${i === activa ? 'bg-surface text-brand shadow-card' : 'text-ink-soft hover:text-ink'}`}>{h.sheet}</button>
        ))}
        {recortado && <span className="ml-auto whitespace-nowrap pl-3 text-xs text-ink-mute">Primeras {MAX_FILAS} filas</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- PowerPoint
/** Lee el tamaño de diapositiva del .pptx (ppt/presentation.xml → p:sldSz) para respetar su proporción. */
async function proporcionDiapositiva(buf: ArrayBuffer): Promise<number> {
  try {
    const { default: JSZip } = await import('jszip');
    const xml = await (await JSZip.loadAsync(buf)).file('ppt/presentation.xml')?.async('string');
    const m = xml?.match(/<p:sldSz[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
    if (m && Number(m[1]) > 0) return Number(m[2]) / Number(m[1]);
  } catch { /* si no se puede leer, se asume panorámica */ }
  return 9 / 16;
}

export function PptxView({ file, onFail }: { file: File; onFail: (m: string) => void }) {
  const { host, listo } = useRender(file, async (el, ancho) => {
    const { init } = await import('pptx-preview');
    const buf = await leerBuffer(file);
    const w = Math.min(960, ancho - 24);
    const visor = init(el, { width: w, height: Math.round(w * (await proporcionDiapositiva(buf.slice(0)))) });
    await visor.preview(buf);
  }, onFail);
  return (
    <div className="relative h-full w-full overflow-auto" aria-label="Presentación">
      {!listo && <div className="absolute inset-0 flex items-center justify-center"><Cargando texto="Preparando las diapositivas…" /></div>}
      <div ref={host} className="pptx-host p-3" />
    </div>
  );
}
