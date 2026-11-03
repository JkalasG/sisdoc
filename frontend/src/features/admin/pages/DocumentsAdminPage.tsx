import { Download } from 'lucide-react';
import { useState } from 'react';
import { proto } from '@/shared/ui/primitives';
import type { AdminDoc, AdminDownload } from '../data';
import { Btn, DataTable, PageHeader, Panel, Pill, SearchBox, Tabs, When, type Tone } from '../components/ui';
import { useAdmin } from '../store';

const TONE: Record<string, Tone> = { Aprobado: 'ok', 'En revisión': 'warn', Borrador: 'mute', Rechazado: 'bad' };
type Tab = 'docs' | 'downloads';

export function DocumentsAdminPage() {
  const { docs, downloads } = useAdmin();
  const [tab, setTab] = useState<Tab>('docs');
  const [q, setQ] = useState('');
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase());

  return (
    <>
      <PageHeader title="Documentos" subtitle="Registro de todos los documentos y de cada descarga: quién, qué versión, desde qué IP y por qué canal."
        actions={<Btn tone="primary" onClick={() => proto('Exportar a Excel')}><Download className="h-3.5 w-3.5" />Exportar</Btn>} />
      <Panel flush>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-2">
          <Tabs value={tab} onChange={setTab} items={[{ id: 'docs', label: 'Documentos', count: docs.length }, { id: 'downloads', label: 'Historial de descargas', count: downloads.length }]} />
          <SearchBox value={q} onChange={setQ} placeholder={tab === 'docs' ? 'Buscar documento o propietario' : 'Buscar documento o usuario'} />
        </div>
        {tab === 'docs' ? (
          <DataTable label="Documentos" rows={docs.filter((d) => match(`${d.title} ${d.owner}`))} columns={[
            { header: 'Título', cell: (d: AdminDoc) => <span className="font-semibold">{d.title}</span> },
            { header: 'Propietario', cell: (d) => d.owner },
            { header: 'Estado', cell: (d) => <Pill tone={TONE[d.status] ?? 'mute'}>{d.status}</Pill> },
            { header: 'Versiones', cell: (d) => d.versions },
            { header: 'Descargas', cell: (d) => d.downloads },
            { header: 'Tamaño', cell: (d) => d.size },
            { header: 'Último acceso', cell: (d) => <When iso={d.lastAccess} /> },
          ]} />
        ) : (
          <DataTable label="Historial de descargas" rows={downloads.filter((d) => match(`${d.doc} ${d.user}`))} columns={[
            { header: 'Documento', cell: (d: AdminDownload) => <span className="font-semibold">{d.doc}</span> },
            { header: 'Versión', cell: (d) => `v${d.version}.0` },
            { header: 'Usuario', cell: (d) => d.user },
            { header: 'IP', cell: (d) => <code className="text-xs">{d.ip}</code> },
            { header: 'Canal', cell: (d) => <Pill tone={d.channel === 'chat' ? 'info' : 'mute'}>{d.channel === 'chat' ? 'Chat' : 'Documentos'}</Pill> },
            { header: 'Cuándo', cell: (d) => <When iso={d.at} /> },
          ]} />
        )}
      </Panel>
    </>
  );
}
