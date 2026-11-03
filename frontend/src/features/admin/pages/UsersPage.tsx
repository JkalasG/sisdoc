import { KeyRound, Plus, ShieldOff, Unlock, UserCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { config } from '@/shared/config';
import { Avatar, Modal, proto } from '@/shared/ui/primitives';
import { UsersRealPage } from './UsersRealPage';
import type { AdminUser, Role, UserStatus } from '../data';
import { Btn, DataTable, PageHeader, Panel, Pill, SearchBox, Tabs, When, type Tone } from '../components/ui';
import { useAdmin } from '../store';

const STATUS_TONE: Record<UserStatus, Tone> = { Activo: 'ok', Deshabilitado: 'mute', Bloqueado: 'bad' };
const ROLES: Role[] = ['Usuario', 'Moderador', 'Auditor', 'Administrador'];
type Filter = 'all' | UserStatus;

/** Con backend real administra usuarios de verdad; en modo demo (sin servidor) usa la maqueta en memoria. */
export function UsersPage() {
  return config.useMocks ? <DemoUsersPage /> : <UsersRealPage />;
}

function DemoUsersPage() {
  const { users, toggleUser, unlockUser, resetPassword, sections } = useAdmin();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);

  const count = (s: UserStatus) => users.filter((u) => u.status === s).length;
  const rows = users.filter((u) => (filter === 'all' || u.status === filter) && `${u.name} ${u.email} ${u.section}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Usuarios" subtitle="Altas, bajas, roles y estado de acceso. Solo tú puedes crear cuentas: no hay auto-registro."
        actions={<button className="btn-primary !py-2 text-sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nuevo usuario</button>} />
      <Panel flush>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-2">
          <Tabs value={filter} onChange={setFilter} items={[
            { id: 'all', label: 'Todos', count: users.length }, { id: 'Activo', label: 'Activos', count: count('Activo') },
            { id: 'Bloqueado', label: 'Bloqueados', count: count('Bloqueado') }, { id: 'Deshabilitado', label: 'Deshabilitados', count: count('Deshabilitado') },
          ]} />
          <SearchBox value={q} onChange={setQ} placeholder="Buscar usuario, correo o sección" />
        </div>
        <DataTable label="Usuarios" rows={rows} empty="Ningún usuario coincide con la búsqueda." columns={[
          { header: 'Usuario', cell: (u: AdminUser) => (
            <span className="flex items-center gap-3"><Avatar name={u.name} size="sm" /><span><span className="block font-semibold">{u.name}</span><span className="text-xs text-ink-soft">{u.email}</span></span></span>) },
          { header: 'Rol', cell: (u) => <span className="font-medium">{u.role}</span> },
          { header: 'Sección', cell: (u) => u.section },
          { header: 'Estado', cell: (u) => (
            <span className="flex flex-wrap items-center gap-1.5"><Pill tone={STATUS_TONE[u.status]}>{u.status}</Pill>{u.mustChange && <Pill tone="warn">Debe cambiar clave</Pill>}</span>) },
          { header: 'Google', cell: (u) => (u.google ? <Pill tone="info">Habilitado</Pill> : <span className="text-ink-mute">No</span>) },
          { header: 'Último acceso', cell: (u) => <When iso={u.lastLogin} /> },
          { header: 'Acciones', className: 'text-right', cell: (u) => (
            <span className="flex justify-end gap-1.5">
              {u.status === 'Bloqueado' && <Btn tone="success" onClick={() => unlockUser(u.id)} label={`Desbloquear a ${u.name}`}><Unlock className="h-3.5 w-3.5" /></Btn>}
              <Btn onClick={() => { resetPassword(u.id); proto('El envío de la contraseña temporal'); }} label={`Restablecer contraseña de ${u.name}`}><KeyRound className="h-3.5 w-3.5" /></Btn>
              {u.status === 'Deshabilitado'
                ? <Btn tone="success" onClick={() => toggleUser(u.id)} label={`Habilitar a ${u.name}`}><UserCheck className="h-3.5 w-3.5" /></Btn>
                : <Btn tone="danger" onClick={() => toggleUser(u.id)} label={`Deshabilitar a ${u.name}`}><ShieldOff className="h-3.5 w-3.5" /></Btn>}
            </span>) },
        ]} />
      </Panel>
      {creating && <NewUserModal sections={sections.map((s) => s.name)} onClose={() => setCreating(false)} />}
    </>
  );
}

function NewUserModal({ sections, onClose }: { sections: string[]; onClose: () => void }) {
  const create = useAdmin((s) => s.createUser);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('Usuario');
  const [section, setSection] = useState(sections[0]);
  const submit = (e: FormEvent) => { e.preventDefault(); create({ name, email, role, section }); onClose(); };

  return (
    <Modal title="Nuevo usuario" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div><label className="label" htmlFor="nu-name">Nombre completo</label><input id="nu-name" className="field" required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label" htmlFor="nu-mail">Correo institucional</label><input id="nu-mail" type="email" className="field" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="nu-role">Rol</label><select id="nu-role" className="field" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
          <div><label className="label" htmlFor="nu-sec">Sección</label><select id="nu-sec" className="field" value={section} onChange={(e) => setSection(e.target.value)}>{sections.map((s) => <option key={s}>{s}</option>)}</select></div>
        </div>
        <p className="rounded-lg bg-brand-light px-3 py-2 text-xs text-brand">Se generará una contraseña temporal. El usuario deberá cambiarla en su primer ingreso y su dispositivo deberá ser aprobado.</p>
        <div className="flex justify-end gap-2 pt-1"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={!name || !email}>Crear usuario</button></div>
      </form>
    </Modal>
  );
}
