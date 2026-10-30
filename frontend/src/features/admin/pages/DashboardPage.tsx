import { Activity, AlertTriangle, Download, MonitorSmartphone, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar } from '@/shared/ui/primitives';
import { EVENT_LABEL, LOGINS_7D } from '../data';
import { BarChart, Btn, DataTable, PageHeader, Panel, Pill, StatCard, When } from '../components/ui';
import { useAdmin } from '../store';

export function DashboardPage() {
  const { users, sessions, devices, events, downloads, setDevice } = useAdmin();
  const pending = devices.filter((d) => d.status === 'PENDING');
  const failed = events.filter((e) => e.type === 'LOGIN_FAIL' || e.type === 'ACCOUNT_LOCKED').length;

  return (
    <>
      <PageHeader title="Resumen" subtitle="Estado de la plataforma en las últimas 24 horas." />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <StatCard label="Usuarios activos" value={users.filter((u) => u.status === 'Activo').length} hint={`${users.length} registrados`} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Sesiones abiertas" value={sessions.length} hint="Máx. 3 por usuario" icon={<Activity className="h-5 w-5" />} tone="ok" />
        <StatCard label="Dispositivos pendientes" value={pending.length} hint={pending.length ? 'Esperan tu aprobación' : 'Todo al día'} icon={<MonitorSmartphone className="h-5 w-5" />} tone={pending.length ? 'warn' : 'ok'} />
        <StatCard label="Accesos fallidos" value={failed} hint="Intentos y bloqueos" icon={<AlertTriangle className="h-5 w-5" />} tone={failed > 3 ? 'bad' : 'warn'} />
        <StatCard label="Descargas registradas" value={downloads.length} hint="Con usuario, IP y versión" icon={<Download className="h-5 w-5" />} tone="info" />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Inicios de sesión · últimos 7 días"><BarChart data={LOGINS_7D} /></Panel>
        <Panel title="Dispositivos por aprobar" flush
          actions={<Link to="/admin/dispositivos" className="text-sm font-semibold text-brand hover:underline">Ver todos</Link>}>
          {pending.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-soft">No hay dispositivos pendientes.</p>}
          <ul className="divide-y divide-line">
            {pending.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={d.user} size="sm" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{d.user}</p><p className="truncate text-xs text-ink-soft">{d.label} · {d.ip}</p></div>
                <Btn tone="success" onClick={() => setDevice(d.id, 'TRUSTED')} label={`Aprobar dispositivo de ${d.user}`}>Aprobar</Btn>
                <Btn tone="danger" onClick={() => setDevice(d.id, 'BLOCKED')} label={`Bloquear dispositivo de ${d.user}`}>Bloquear</Btn>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Eventos de seguridad recientes" flush actions={<Link to="/admin/auditoria" className="text-sm font-semibold text-brand hover:underline">Ver auditoría</Link>}>
        <DataTable label="Eventos recientes" rows={events.slice(0, 6)} columns={[
          { header: 'Evento', cell: (e) => <Pill tone={EVENT_LABEL[e.type].tone}>{EVENT_LABEL[e.type].label}</Pill> },
          { header: 'Usuario', cell: (e) => <span className="font-medium">{e.user}</span> },
          { header: 'IP', cell: (e) => <code className="text-xs">{e.ip}</code> },
          { header: 'Detalle', cell: (e) => <span className="text-ink-soft">{e.detail ?? '—'}</span> },
          { header: 'Cuándo', cell: (e) => <When iso={e.at} /> },
        ]} />
      </Panel>
    </>
  );
}
