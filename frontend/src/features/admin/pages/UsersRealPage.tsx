import { Copy, KeyRound, Pencil, Plus, ShieldOff, Unlock, UserCheck } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ApiError, http, json } from '@/shared/api/http';
import { Avatar, ErrorNote, Modal, Spinner } from '@/shared/ui/primitives';
import { Btn, DataTable, PageHeader, Panel, Pill, SearchBox, Tabs, When, type Tone } from '../components/ui';

/** Usuario tal como lo entrega GET /admin/users. */
interface ApiUser {
  id: string; email: string; displayName: string; status: 'ACTIVE' | 'DISABLED' | 'PENDING'; roles: string[];
  mustChangePassword: boolean; locked: boolean; lockedUntil: string | null; lastLoginAt: string | null;
  createdAt: string; liveSessions: number;
}

const ROLES = ['ADMIN', 'MODERADOR', 'AUDITOR', 'USUARIO'] as const;
const ROLE_LABEL: Record<string, string> = { ADMIN: 'Administrador', MODERADOR: 'Moderador', AUDITOR: 'Auditor', USUARIO: 'Usuario' };
type Filter = 'all' | 'ACTIVE' | 'DISABLED' | 'LOCKED' | 'PENDING';

const stateOf = (u: ApiUser): { label: string; tone: Tone } =>
  u.status === 'PENDING' ? { label: 'Pendiente de activación', tone: 'warn' } :
  u.status === 'DISABLED' ? { label: 'Deshabilitado', tone: 'mute' } : u.locked ? { label: 'Bloqueado', tone: 'bad' } : { label: 'Activo', tone: 'ok' };
const rolesOf = (u: ApiUser) => (u.roles.length ? u.roles : ['USUARIO']).map((r) => ROLE_LABEL[r] ?? r).join(', ');
const messageOf = (e: unknown) => (e as ApiError)?.message ?? 'No se pudo completar la acción';

/** Administración real de usuarios contra /admin/users (solo rol ADMIN en el servidor). */
export function UsersRealPage() {
  const [users, setUsers] = useState<ApiUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ApiUser | null>(null);
  const [activating, setActivating] = useState<ApiUser | null>(null);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    http<ApiUser[]>('/admin/users').then((r) => { setUsers(r); setError(null); }).catch((e) => setError(messageOf(e)));
  }, []);
  useEffect(load, [load]);

  /** Ejecuta una acción sobre un usuario, refresca la lista y muestra el error si falla. */
  async function act<T>(id: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(id); setError(null);
    try { const r = await fn(); load(); return r; } catch (e) { setError(messageOf(e)); } finally { setBusy(null); }
  }
  const post = (u: ApiUser, action: string) => act(u.id, () => http(`/admin/users/${u.id}/${action}`, { method: 'POST' }));
  const reset = async (u: ApiUser) => {
    if (!window.confirm(`¿Restablecer la contraseña de ${u.displayName}? Se cerrarán todas sus sesiones.`)) return;
    const r = await act(u.id, () => http<{ temporaryPassword: string }>(`/admin/users/${u.id}/reset-password`, { method: 'POST' }));
    if (r) setSecret({ email: u.email, password: r.temporaryPassword });
  };
  const disable = (u: ApiUser) =>
    window.confirm(`¿Deshabilitar a ${u.displayName}? Se cerrarán sus sesiones y no podrá entrar.`) ? post(u, 'disable') : undefined;

  const all = users ?? [];
  const count = (f: Filter) => all.filter((u) => matches(u, f)).length;
  const rows = all.filter((u) => matches(u, filter) && `${u.displayName} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Usuarios" subtitle="Altas, bajas, roles y estado de acceso. Quien se registra con Google queda pendiente hasta que lo actives aquí."
        actions={<button className="btn-primary !py-2 text-sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nuevo usuario</button>} />
      {error && <div className="mb-3"><ErrorNote message={error} /></div>}
      <Panel flush>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-2">
          <Tabs value={filter} onChange={setFilter} items={[
            { id: 'all', label: 'Todos', count: all.length }, { id: 'ACTIVE', label: 'Activos', count: count('ACTIVE') },
            { id: 'PENDING', label: 'Pendientes', count: count('PENDING') }, { id: 'LOCKED', label: 'Bloqueados', count: count('LOCKED') }, { id: 'DISABLED', label: 'Deshabilitados', count: count('DISABLED') },
          ]} />
          <SearchBox value={q} onChange={setQ} placeholder="Buscar usuario o correo" />
        </div>
        {users === null && !error ? (
          <div className="flex justify-center p-10 text-brand"><Spinner className="h-6 w-6" /></div>
        ) : (
          <DataTable label="Usuarios" rows={rows} empty="Ningún usuario coincide con la búsqueda." columns={[
            { header: 'Usuario', cell: (u: ApiUser) => (
              <span className="flex items-center gap-3"><Avatar name={u.displayName} size="sm" /><span><span className="block font-semibold">{u.displayName}</span><span className="text-xs text-ink-soft">{u.email}</span></span></span>) },
            { header: 'Rol', cell: (u) => <span className="font-medium">{rolesOf(u)}</span> },
            { header: 'Estado', cell: (u) => (
              <span className="flex flex-wrap items-center gap-1.5"><Pill tone={stateOf(u).tone}>{stateOf(u).label}</Pill>{u.mustChangePassword && <Pill tone="warn">Debe cambiar clave</Pill>}</span>) },
            { header: 'Sesiones', cell: (u) => u.liveSessions },
            { header: 'Último acceso', cell: (u) => <When iso={u.lastLoginAt ?? undefined} /> },
            { header: 'Acciones', className: 'text-right', cell: (u) => (
              <span className={`flex justify-end gap-1.5 ${busy === u.id ? 'pointer-events-none opacity-50' : ''}`}>
                {u.locked && <Btn tone="success" onClick={() => post(u, 'unlock')} label={`Desbloquear a ${u.displayName}`}><Unlock className="h-3.5 w-3.5" /></Btn>}
                <Btn onClick={() => setEditing(u)} label={`Cambiar roles de ${u.displayName}`}><Pencil className="h-3.5 w-3.5" /></Btn>
                <Btn onClick={() => reset(u)} label={`Restablecer contraseña de ${u.displayName}`}><KeyRound className="h-3.5 w-3.5" /></Btn>
                {u.status === 'PENDING'
                  ? <Btn tone="success" onClick={() => setActivating(u)} label={`Activar a ${u.displayName}`}><UserCheck className="h-3.5 w-3.5" /></Btn>
                  : u.status === 'DISABLED'
                  ? <Btn tone="success" onClick={() => post(u, 'enable')} label={`Habilitar a ${u.displayName}`}><UserCheck className="h-3.5 w-3.5" /></Btn>
                  : <Btn tone="danger" onClick={() => disable(u)} label={`Deshabilitar a ${u.displayName}`}><ShieldOff className="h-3.5 w-3.5" /></Btn>}
              </span>) },
          ]} />
        )}
      </Panel>

      {creating && <NewUserModal onClose={() => setCreating(false)} onCreated={(email, password) => { setCreating(false); load(); setSecret({ email, password }); }} />}
      {activating && <ActivateModal user={activating} onChanged={load} onClose={() => setActivating(null)} onDone={() => { setActivating(null); load(); }} />}
      {editing && <RolesModal user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {secret && <SecretModal {...secret} onClose={() => setSecret(null)} />}
    </>
  );
}

function matches(u: ApiUser, f: Filter) {
  return f === 'all' || (f === 'LOCKED' ? u.status === 'ACTIVE' && u.locked : f === 'ACTIVE' ? u.status === 'ACTIVE' && !u.locked : u.status === f);
}

function RoleChecks({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="grid grid-cols-2 gap-2">
      <legend className="label">Roles</legend>
      {ROLES.map((r) => (
        <label key={r} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
          <input type="checkbox" checked={value.includes(r)} onChange={(e) => onChange(e.target.checked ? [...value, r] : value.filter((x) => x !== r))} />
          {ROLE_LABEL[r]}
        </label>
      ))}
    </fieldset>
  );
}

function NewUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (email: string, password: string) => void }) {
  const [displayName, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<string[]>(['USUARIO']);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const r = await http<{ user: ApiUser; temporaryPassword: string }>('/admin/users', { method: 'POST', ...json({ email, displayName, roles }) });
      onCreated(r.user.email, r.temporaryPassword);
    } catch (err) { setError(messageOf(err)); setSaving(false); }
  }

  return (
    <Modal title="Nuevo usuario" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div><label className="label" htmlFor="nu-name">Nombre completo</label><input id="nu-name" className="field" required minLength={2} value={displayName} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label" htmlFor="nu-mail">Correo institucional</label><input id="nu-mail" type="email" className="field" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <RoleChecks value={roles} onChange={setRoles} />
        <p className="rounded-lg bg-brand-light px-3 py-2 text-xs text-brand">Se generará una contraseña temporal que verás una sola vez. El usuario deberá cambiarla en su primer ingreso y su dispositivo deberá ser aprobado.</p>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={!displayName || !email || saving}>{saving ? <Spinner className="h-4 w-4" /> : 'Crear usuario'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Dispositivo tal como lo entrega GET /admin/devices (solo lo que este modal necesita). */
interface ApiDevice { id: string; userId?: string; label: string; ip: string; code?: string; status: string; firstSeen: string }

/**
 * Activar a quien se registró con Google: en el mismo paso se aprueban sus equipos pendientes, para no tener que ir
 * después a Dispositivos. Cualquier equipo que llegue más tarde seguirá el bloqueo de dispositivo normal.
 */
function ActivateModal({ user, onClose, onDone, onChanged }: { user: ApiUser; onClose: () => void; onDone: () => void; onChanged: () => void }) {
  const [devices, setDevices] = useState<ApiDevice[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    http<ApiDevice[]>('/admin/devices')
      .then((all) => {
        const mine = all.filter((d) => d.userId === user.id && d.status === 'PENDING');
        setDevices(mine); setChosen(mine.map((d) => d.id));
      })
      .catch((e) => { setError(messageOf(e)); setDevices([]); });
  }, [user.id]);

  async function confirm() {
    setSaving(true); setError(null);
    try {
      await http(`/admin/users/${user.id}/enable`, { method: 'POST' });
      for (const id of chosen) await http(`/admin/devices/${id}/approve`, { method: 'POST' });
      onDone();
    } catch (err) {
      setError(messageOf(err));
      setSaving(false);
      onChanged(); // si la cuenta ya quedó activa, la lista lo refleja aunque falle algún dispositivo
    }
  }
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <Modal title={`Activar a ${user.displayName}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-ink-soft">
          <strong>{user.email}</strong> se registró con Google y espera tu autorización. Al activarla podrá entrar con Google.
        </p>
        {devices === null ? (
          <div className="flex justify-center py-4 text-brand"><Spinner className="h-5 w-5" /></div>
        ) : devices.length ? (
          <fieldset className="space-y-2">
            <legend className="label">Dispositivos pendientes: aprobar también</legend>
            {devices.map((d) => (
              <label key={d.id} className="flex items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 text-sm">
                <input type="checkbox" className="mt-1" checked={chosen.includes(d.id)} onChange={() => toggle(d.id)} />
                <span>
                  <span className="block font-semibold">{d.label}</span>
                  <span className="text-xs text-ink-soft">IP <code>{d.ip}</code>{d.code && <> · ID <code>{d.code}</code></>} · <When iso={d.firstSeen} /></span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="rounded-lg bg-paper px-3 py-2.5 text-sm text-ink-soft">
            No tiene dispositivos pendientes. Cuando entre por primera vez, su equipo aparecerá en Dispositivos para aprobarlo.
          </p>
        )}
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={devices === null || saving} onClick={confirm}>
            {saving ? <Spinner className="h-4 w-4" /> : chosen.length ? 'Activar cuenta y aprobar' : 'Activar cuenta'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RolesModal({ user, onClose, onSaved }: { user: ApiUser; onClose: () => void; onSaved: () => void }) {
  const [roles, setRoles] = useState<string[]>(user.roles.length ? user.roles : ['USUARIO']);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setError(null);
    try { await http(`/admin/users/${user.id}/roles`, { method: 'PUT', ...json({ roles }) }); onSaved(); }
    catch (err) { setError(messageOf(err)); setSaving(false); }
  }

  return (
    <Modal title={`Roles de ${user.displayName}`} onClose={onClose}>
      <div className="space-y-3">
        <RoleChecks value={roles} onChange={setRoles} />
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={!roles.length || saving} onClick={save}>{saving ? <Spinner className="h-4 w-4" /> : 'Guardar roles'}</button>
        </div>
      </div>
    </Modal>
  );
}

/** La clave temporal solo existe aquí: el servidor guarda únicamente su hash. */
function SecretModal({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(password).then(() => setCopied(true)).catch(() => undefined);
  return (
    <Modal title="Contraseña temporal" onClose={onClose} dismissible={false}>
      <p className="text-sm text-ink-soft">Entrégala a <strong>{email}</strong> por un canal seguro. <strong>No se volverá a mostrar</strong>; deberá cambiarla al entrar.</p>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2.5">
        <code className="flex-1 select-all break-all text-base font-semibold" aria-label="Clave generada">{password}</code>
        <button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={copy}><Copy className="h-3.5 w-3.5" /> {copied ? 'Copiada' : 'Copiar'}</button>
      </div>
      <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={onClose}>Ya la copié</button></div>
    </Modal>
  );
}
