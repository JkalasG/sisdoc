import { LogOut } from 'lucide-react';
import { Avatar } from '@/shared/ui/primitives';
import type { AdminSession } from '../data';
import { Btn, DataTable, PageHeader, Panel, When } from '../components/ui';
import { useAdmin } from '../store';

export function SessionsPage() {
  const { sessions, closeSession } = useAdmin();
  return (
    <>
      <PageHeader title="Sesiones activas" subtitle="Cada usuario puede tener hasta 3 sesiones. Se cierran a los 30 min sin actividad o a las 12 h." />
      <Panel flush>
        <DataTable label="Sesiones activas" rows={sessions} empty="No hay sesiones abiertas." columns={[
          { header: 'Usuario', cell: (s: AdminSession) => <span className="flex items-center gap-3"><Avatar name={s.user} size="sm" /><span className="font-semibold">{s.user}</span></span> },
          { header: 'Dispositivo', cell: (s) => s.device },
          { header: 'IP', cell: (s) => <code className="text-xs">{s.ip}</code> },
          { header: 'Inicio', cell: (s) => <When iso={s.startedAt} /> },
          { header: 'Última actividad', cell: (s) => <When iso={s.lastActivity} /> },
          { header: 'Vence', cell: (s) => <span className="whitespace-nowrap text-ink-soft">{new Date(s.expiresAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span> },
          { header: 'Acciones', className: 'text-right', cell: (s) => (
            <span className="flex justify-end"><Btn tone="danger" onClick={() => closeSession(s.id)} label={`Cerrar sesión de ${s.user}`}><LogOut className="h-3.5 w-3.5" />Cerrar sesión</Btn></span>) },
        ]} />
      </Panel>
    </>
  );
}
