import { Plus, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Modal, proto } from '@/shared/ui/primitives';
import type { IpRule, RateProfile } from '../data';
import { Btn, DataTable, PageHeader, Panel, Pill, Tabs, When } from '../components/ui';
import { useAdmin } from '../store';

type Tab = 'ip' | 'profiles' | 'geo';

export function NetworkPage() {
  const { ipRules, removeIpRule, profiles, countries, toggleCountry } = useAdmin();
  const [tab, setTab] = useState<Tab>('ip');
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader title="Red y límites" subtitle="Lista blanca y negra de IP, límites de peticiones por minuto y países permitidos."
        actions={tab === 'ip' && <button className="btn-primary !py-2 text-sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Nueva regla</button>} />
      <Panel flush>
        <div className="px-4 pt-2">
          <Tabs value={tab} onChange={setTab} items={[
            { id: 'ip', label: 'Reglas de IP', count: ipRules.length }, { id: 'profiles', label: 'Perfiles de límite', count: profiles.length }, { id: 'geo', label: 'Países permitidos' },
          ]} />
        </div>

        {tab === 'ip' && (
          <DataTable label="Reglas de IP" rows={ipRules} columns={[
            { header: 'Tipo', cell: (r: IpRule) => <Pill tone={r.type === 'ALLOW' ? 'ok' : 'bad'}>{r.type === 'ALLOW' ? 'Lista blanca' : 'Lista negra'}</Pill> },
            { header: 'IP / Rango', cell: (r) => <code className="text-xs font-semibold">{r.cidr}</code> },
            { header: 'Descripción', cell: (r) => r.label },
            { header: 'Perfil de límite', cell: (r) => r.profile ?? <span className="text-ink-mute">—</span> },
            { header: 'Origen', cell: (r) => <Pill tone={r.source === 'AUTO' ? 'warn' : 'mute'}>{r.source === 'AUTO' ? 'Automática' : 'Manual'}</Pill> },
            { header: 'Vence', cell: (r) => (r.expires ? <When iso={r.expires} /> : <span className="text-ink-soft">Nunca</span>) },
            { header: 'Acciones', className: 'text-right', cell: (r) => <span className="flex justify-end"><Btn tone="danger" onClick={() => removeIpRule(r.id)} label={`Eliminar regla ${r.cidr}`}><Trash2 className="h-3.5 w-3.5" />Eliminar</Btn></span> },
          ]} />
        )}

        {tab === 'profiles' && (
          <>
            <p className="px-4 pt-3 text-sm text-ink-soft">Peticiones por minuto. Se asignan a un usuario, a un rol o a una IP de la lista blanca; gana el más específico (usuario → IP → rol → estándar).</p>
            <DataTable label="Perfiles de límite" rows={profiles} columns={[
              { header: 'Perfil', cell: (p: RateProfile) => <span className="font-semibold">{p.name}</span> },
              { header: 'General', cell: (p) => p.general }, { header: 'Escritura', cell: (p) => p.write }, { header: 'Subidas', cell: (p) => p.upload },
              { header: 'Descargas', cell: (p) => p.download }, { header: 'Login (por IP)', cell: (p) => p.auth }, { header: 'Mensajes/seg', cell: (p) => p.ws },
              { header: 'Usuarios', cell: (p) => p.users },
              { header: 'Acciones', className: 'text-right', cell: () => <span className="flex justify-end"><Btn onClick={() => proto('Editar perfiles de límite')}>Editar</Btn></span> },
            ]} />
          </>
        )}

        {tab === 'geo' && (
          <div className="p-4">
            <p className="mb-4 text-sm text-ink-soft">Solo se permite el acceso desde los países marcados. Un usuario que viaje puede tener una excepción individual.</p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {countries.map((c) => (
                <li key={c.code}>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${c.allowed ? 'border-brand bg-brand-light' : 'border-line hover:bg-paper'}`}>
                    <input type="checkbox" className="h-4 w-4 accent-brand" checked={c.allowed} onChange={() => toggleCountry(c.code)} aria-label={`Permitir ${c.name}`} />
                    <span className="font-medium">{c.name}</span><span className="ml-auto text-xs text-ink-soft">{c.code}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
      {adding && <RuleModal onClose={() => setAdding(false)} />}
    </>
  );
}

function RuleModal({ onClose }: { onClose: () => void }) {
  const { addIpRule, profiles } = useAdmin();
  const [type, setType] = useState<'ALLOW' | 'DENY'>('ALLOW');
  const [cidr, setCidr] = useState('');
  const [label, setLabel] = useState('');
  const [profile, setProfile] = useState(profiles[1]?.name ?? '');
  const valid = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(cidr.trim());
  const submit = (e: FormEvent) => { e.preventDefault(); addIpRule({ type, cidr: cidr.trim(), label, profile: type === 'ALLOW' ? profile : undefined }); onClose(); };

  return (
    <Modal title="Nueva regla de IP" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div><label className="label" htmlFor="r-type">Tipo</label>
          <select id="r-type" className="field" value={type} onChange={(e) => setType(e.target.value as 'ALLOW' | 'DENY')}><option value="ALLOW">Lista blanca (sucursal de confianza)</option><option value="DENY">Lista negra (bloquear)</option></select></div>
        <div><label className="label" htmlFor="r-cidr">IP o rango (CIDR)</label><input id="r-cidr" className="field" placeholder="200.10.5.0/24" value={cidr} onChange={(e) => setCidr(e.target.value)} />
          {cidr && !valid && <p className="mt-1 text-xs text-danger">Formato no válido. Ejemplo: 200.10.5.20 o 200.10.5.0/24</p>}</div>
        <div><label className="label" htmlFor="r-label">Descripción</label><input id="r-label" className="field" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
        {type === 'ALLOW' && <div><label className="label" htmlFor="r-prof">Perfil de límites</label><select id="r-prof" className="field" value={profile} onChange={(e) => setProfile(e.target.value)}>{profiles.map((p) => <option key={p.id}>{p.name}</option>)}</select></div>}
        <div className="flex justify-end gap-2 pt-1"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={!valid || !label}>Guardar regla</button></div>
      </form>
    </Modal>
  );
}
