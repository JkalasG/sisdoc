import { Check, Ban, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/shared/ui/primitives';
import type { AdminDevice, DeviceStatus } from '../data';
import { Btn, DataTable, PageHeader, Panel, Pill, Tabs, When, type Tone } from '../components/ui';
import { useAdmin } from '../store';

const TONE: Record<DeviceStatus, Tone> = { PENDING: 'warn', TRUSTED: 'ok', BLOCKED: 'bad' };
const LABEL: Record<DeviceStatus, string> = { PENDING: 'Pendiente', TRUSTED: 'Aprobado', BLOCKED: 'Bloqueado' };

export function DevicesPage() {
  const { devices, setDevice } = useAdmin();
  const [tab, setTab] = useState<DeviceStatus>('PENDING');
  const n = (s: DeviceStatus) => devices.filter((d) => d.status === s).length;

  return (
    <>
      <PageHeader title="Dispositivos" subtitle="Un equipo nuevo no obtiene sesión hasta que lo apruebes. Bloquear un equipo cierra sus sesiones al instante." />
      <Panel flush>
        <div className="px-4 pt-2">
          <Tabs value={tab} onChange={setTab} items={[
            { id: 'PENDING', label: 'Pendientes', count: n('PENDING') }, { id: 'TRUSTED', label: 'Aprobados', count: n('TRUSTED') }, { id: 'BLOCKED', label: 'Bloqueados', count: n('BLOCKED') },
          ]} />
        </div>
        <DataTable label="Dispositivos" rows={devices.filter((d) => d.status === tab)} empty={tab === 'PENDING' ? 'No hay dispositivos esperando aprobación.' : 'Sin registros.'} columns={[
          { header: 'Usuario', cell: (d: AdminDevice) => <span className="flex items-center gap-3"><Avatar name={d.user} size="sm" /><span><span className="block font-semibold">{d.user}</span><span className="text-xs text-ink-soft">{d.email}</span></span></span> },
          { header: 'Dispositivo', cell: (d) => d.label },
          { header: 'IP', cell: (d) => <code className="text-xs">{d.ip}</code> },
          { header: 'Estado', cell: (d) => <Pill tone={TONE[d.status]}>{LABEL[d.status]}</Pill> },
          { header: 'Primera vez', cell: (d) => <When iso={d.firstSeen} /> },
          { header: 'Última vez', cell: (d) => <When iso={d.lastSeen} /> },
          { header: 'Acciones', className: 'text-right', cell: (d) => (
            <span className="flex justify-end gap-1.5">
              {d.status !== 'TRUSTED' && <Btn tone="success" onClick={() => setDevice(d.id, 'TRUSTED')} label={`Aprobar dispositivo de ${d.user}`}>{d.status === 'BLOCKED' ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}{d.status === 'BLOCKED' ? 'Reactivar' : 'Aprobar'}</Btn>}
              {d.status !== 'BLOCKED' && <Btn tone="danger" onClick={() => setDevice(d.id, 'BLOCKED')} label={`Bloquear dispositivo de ${d.user}`}><Ban className="h-3.5 w-3.5" />Bloquear</Btn>}
            </span>) },
        ]} />
      </Panel>
    </>
  );
}
