import { Download } from 'lucide-react';
import { useState } from 'react';
import { proto } from '@/shared/ui/primitives';
import { EVENT_LABEL, EventType } from '../data';
import { Btn, DataTable, PageHeader, Panel, Pill, SearchBox, When } from '../components/ui';
import { useAdmin } from '../store';

export function AuditPage() {
  const events = useAdmin((s) => s.events);
  const [q, setQ] = useState('');
  const [type, setType] = useState<'' | EventType>('');
  const rows = events.filter((e) => (!type || e.type === type) && `${e.user} ${e.ip} ${e.device} ${e.detail ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Auditoría" subtitle="Registro de solo inserción: no se puede editar ni borrar. Cada fila guarda fecha, usuario, IP y dispositivo."
        actions={<Btn tone="primary" onClick={() => proto('Exportar la auditoría')}><Download className="h-3.5 w-3.5" />Exportar</Btn>} />
      <Panel flush>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar usuario, IP o detalle" />
          <select aria-label="Filtrar por tipo de evento" className="field !w-56 !py-2 text-sm" value={type} onChange={(e) => setType(e.target.value as '' | EventType)}>
            <option value="">Todos los eventos</option>
            {(Object.keys(EVENT_LABEL) as EventType[]).map((t) => <option key={t} value={t}>{EVENT_LABEL[t].label}</option>)}
          </select>
        </div>
        <DataTable label="Eventos de seguridad" rows={rows} empty="No hay eventos con esos filtros." columns={[
          { header: 'Fecha y hora', cell: (e) => <span className="whitespace-nowrap text-ink-soft">{new Date(e.at).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> },
          { header: 'Evento', cell: (e) => <Pill tone={EVENT_LABEL[e.type].tone}>{EVENT_LABEL[e.type].label}</Pill> },
          { header: 'Usuario', cell: (e) => <span className="font-medium">{e.user}</span> },
          { header: 'IP', cell: (e) => <code className="text-xs">{e.ip}</code> },
          { header: 'Dispositivo', cell: (e) => e.device },
          { header: 'Detalle', cell: (e) => <span className="text-ink-soft">{e.detail ?? '—'}</span> },
          { header: 'Hace', cell: (e) => <When iso={e.at} /> },
        ]} />
      </Panel>
    </>
  );
}
