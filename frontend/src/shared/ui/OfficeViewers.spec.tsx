import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FilePreview } from './FilePreview';
import { esFormatoAntiguo, officeKind } from './OfficeViewers';

// Las librerías reales dibujan en un navegador; aquí se sustituyen para probar NUESTRA lógica (elección de visor, fallos, límites).
const renderAsync = vi.fn();
const preview = vi.fn();
const init = vi.fn(() => ({ preview }));
const leer = vi.fn();
vi.mock('docx-preview', () => ({ renderAsync: (...a: unknown[]) => renderAsync(...a) }));
vi.mock('pptx-preview', () => ({ init: (...a: unknown[]) => init(...a as []) }));
vi.mock('read-excel-file/browser', () => ({ default: (...a: unknown[]) => leer(...a) }));

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const mk = (name: string, type = '', size = 10) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

beforeEach(() => { vi.clearAllMocks(); });

describe('Qué visor corresponde a cada archivo', () => {
  it('detecta por extensión o por tipo MIME', () => {
    expect(officeKind(mk('a.docx'))).toBe('docx');
    expect(officeKind(mk('sin-extension', XLSX))).toBe('xlsx');
    expect(officeKind(mk('macros.xlsm'))).toBe('xlsx');
    expect(officeKind(mk('a.pptx', PPTX))).toBe('pptx');
    expect(officeKind(mk('a.pdf', 'application/pdf'))).toBeNull();
    expect(officeKind(mk('a.doc'))).toBeNull();
  });
  it('reconoce los formatos antiguos que no se pueden dibujar', () => {
    for (const n of ['a.doc', 'b.XLS', 'c.ppt']) expect(esFormatoAntiguo(n)).toBe(true);
    for (const n of ['a.docx', 'b.xlsx', 'c.pptx', 'd.pdf']) expect(esFormatoAntiguo(n)).toBe(false);
  });
});

describe('Vista previa de Word', () => {
  it('renderiza el .docx con docx-preview', async () => {
    renderAsync.mockImplementation(async (_f: File, body: HTMLElement) => { body.textContent = 'Contenido del acta'; });
    render(<FilePreview file={mk('acta.docx', DOCX)} />);
    expect(screen.getByRole('status')).toHaveTextContent('Preparando el documento');
    await waitFor(() => expect(renderAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Documento de Word')).toHaveTextContent('Contenido del acta');
  });

  it('si el archivo está dañado o protegido, muestra la ficha con el motivo (no se rompe)', async () => {
    renderAsync.mockRejectedValue(new Error('Can\'t find end of central directory'));
    render(<FilePreview file={mk('roto.docx', DOCX)} />);
    expect(await screen.findByText(/No se pudo generar la vista previa/)).toBeInTheDocument();
    expect(screen.getByText(/central directory/)).toBeInTheDocument();
    expect(screen.getByText(/Se cargará tal cual/)).toBeInTheDocument();
  });
});

describe('Vista previa de Excel', () => {
  const hojas = [
    { sheet: 'Ventas', data: [['Producto', 'Cantidad'], ['Tornillos', 120], ['Tuercas', new Date(2026, 0, 15)]] },
    { sheet: 'Resumen', data: [['Total'], [true]] },
  ];

  it('muestra la hoja como tabla con columnas A, B… y pestañas por hoja', async () => {
    const user = userEvent.setup();
    leer.mockResolvedValue(hojas);
    render(<FilePreview file={mk('ventas.xlsx', XLSX)} />);
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByRole('columnheader', { name: 'A' })).toBeInTheDocument();
    expect(within(tabla).getByRole('columnheader', { name: 'B' })).toBeInTheDocument();
    expect(within(tabla).getByText('Tornillos')).toBeInTheDocument();
    expect(within(tabla).getByText('120')).toHaveClass('text-right'); // números a la derecha
    expect(within(tabla).getByText('15/1/2026')).toBeInTheDocument();  // fechas legibles
    await user.click(screen.getByRole('tab', { name: 'Resumen' }));
    expect(within(screen.getByRole('table')).getByText('VERDADERO')).toBeInTheDocument();
  });

  it('limita a 300 filas y lo avisa', async () => {
    leer.mockResolvedValue([{ sheet: 'Grande', data: Array.from({ length: 500 }, (_, i) => [`fila ${i}`]) }]);
    render(<FilePreview file={mk('grande.xlsx', XLSX)} />);
    await screen.findByRole('table');
    expect(screen.getByText('Primeras 300 filas')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(301); // encabezado + 300
  });

  it('un Excel ilegible cae a la ficha', async () => {
    leer.mockRejectedValue(new Error('archivo protegido'));
    render(<FilePreview file={mk('x.xlsx', XLSX)} />);
    expect(await screen.findByText(/archivo protegido/)).toBeInTheDocument();
  });
});

describe('Vista previa de PowerPoint', () => {
  it('inicializa el visor con proporción 16:9 y le pasa el archivo', async () => {
    preview.mockResolvedValue(undefined);
    render(<FilePreview file={mk('plan.pptx', PPTX)} />);
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    const [, opciones] = init.mock.calls[0] as unknown as [HTMLElement, { width: number; height: number }];
    expect(opciones.height).toBe(Math.round((opciones.width * 9) / 16));
    expect(screen.getByLabelText('Presentación')).toBeInTheDocument();
  });
});

describe('Sin vista previa', () => {
  it('formatos antiguos explican qué hacer', () => {
    render(<FilePreview file={mk('viejo.doc', 'application/msword')} />);
    expect(screen.getByText(/formato antiguo de Office/)).toBeInTheDocument();
    expect(renderAsync).not.toHaveBeenCalled();
  });

  it('un archivo de Office muy grande no se carga en memoria para previsualizarlo', () => {
    render(<FilePreview file={mk('enorme.xlsx', XLSX, 40 * 1024 * 1024)} />);
    expect(screen.getByText(/muy grande para previsualizarlo/)).toBeInTheDocument();
    expect(leer).not.toHaveBeenCalled();
  });
});
