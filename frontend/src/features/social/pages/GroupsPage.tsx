import { Lock, Globe, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Art, proto } from '@/shared/ui/primitives';
import type { Group } from '../data';
import { useSocial } from '../store';

function GroupCard({ g }: { g: Group }) {
  const toggle = useSocial((s) => s.toggleJoin);
  return (
    <article className="card overflow-hidden">
      <Link to={`/grupos/${g.id}`} aria-label={`Abrir ${g.name}`}><Art seed={g.art} className="h-28" /></Link>
      <div className="p-4">
        <Link to={`/grupos/${g.id}`} className="text-lg font-bold hover:underline">{g.name}</Link>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-mute">
          {g.privacy === 'Privado' ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}{g.privacy} · {g.section} · {g.members} miembros
        </p>
        <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{g.description}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ok"><span className="h-2 w-2 rounded-full bg-ok-soft0" />{g.online} en línea</span>
          {g.joined
            ? <Link to={`/grupos/${g.id}`} className="btn-ghost !py-1.5 text-sm">Ver grupo</Link>
            : <button className="btn-primary !py-1.5 text-sm" onClick={() => { toggle(g.id); proto(g.privacy === 'Privado' ? 'La aprobación de solicitudes' : 'Unirse a grupos'); }}>{g.privacy === 'Privado' ? 'Solicitar unirme' : 'Unirme'}</button>}
        </div>
      </div>
    </article>
  );
}

export function GroupsPage() {
  const groups = useSocial((s) => s.groups);
  const [q, setQ] = useState('');
  const match = (g: Group) => g.name.toLowerCase().includes(q.toLowerCase());
  const mine = groups.filter((g) => g.joined && match(g));
  const others = groups.filter((g) => !g.joined && match(g));

  return (
    <div className="mx-auto max-w-5xl px-3 py-5">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Grupos</h1>
          <p className="text-sm text-ink-soft">Espacios de trabajo por sección, proyecto o interés.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
            <input className="field !rounded-full !bg-surface pl-9" placeholder="Buscar grupos" aria-label="Buscar grupos" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={() => proto('Crear grupos')}><Users className="h-4 w-4" /> Crear grupo</button>
        </div>
      </header>
      <h2 className="mb-3 text-lg">Tus grupos</h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{mine.map((g) => <GroupCard key={g.id} g={g} />)}</div>
      {others.length > 0 && (
        <>
          <h2 className="mb-3 text-lg">Descubrir</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{others.map((g) => <GroupCard key={g.id} g={g} />)}</div>
        </>
      )}
    </div>
  );
}
