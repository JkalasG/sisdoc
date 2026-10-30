import { ArrowLeft, Globe, Lock } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '@/features/auth/store/session';
import { Art, Avatar, EmptyState, proto } from '@/shared/ui/primitives';
import { Composer } from '../components/Composer';
import { PostCard } from '../components/PostCard';
import { CONTACTS } from '../data';
import { useSocial } from '../store';

type Tab = 'posts' | 'members' | 'files';

export function GroupPage() {
  const { id = '' } = useParams();
  const name = useSession((s) => s.user?.displayName) ?? 'Ana Quispe';
  const group = useSocial((s) => s.groups.find((g) => g.id === id));
  const posts = useSocial((s) => s.posts).filter((p) => p.groupId === id);
  const [tab, setTab] = useState<Tab>('posts');

  if (!group) return <EmptyState icon={<Lock className="h-6 w-6" />} title="Grupo no encontrado" hint="No existe o no tienes acceso." action={<Link to="/grupos" className="btn-ghost">Volver a grupos</Link>} />;

  return (
    <div className="mx-auto max-w-4xl pb-6">
      <div className="card overflow-hidden rounded-t-none sm:rounded-t-xl">
        <Art seed={group.art} className="h-40 sm:h-56" />
        <div className="px-5 pt-4">
          <Link to="/grupos" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-soft hover:underline"><ArrowLeft className="h-4 w-4" /> Grupos</Link>
          <h1 className="text-3xl">{group.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
            {group.privacy === 'Privado' ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}{group.privacy} · {group.members} miembros · {group.online} en línea
          </p>
          <p className="mt-2 text-sm">{group.description}</p>
        </div>
        <div className="mt-3 flex gap-1 border-t border-line px-3" role="tablist">
          {([['posts', 'Publicaciones'], ['members', 'Miembros'], ['files', 'Archivos']] as Array<[Tab, string]>).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`-mb-px border-b-[3px] px-4 py-3 text-[15px] font-semibold ${tab === t ? 'border-brand text-brand' : 'border-transparent text-ink-soft hover:bg-paper'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-[680px] px-3">
        {tab === 'posts' && (
          <>
            <Composer name={name} groupId={group.id} />
            {posts.length === 0 && <div className="card"><EmptyState icon={<Globe className="h-6 w-6" />} title="Aún no hay publicaciones" hint="Sé el primero en escribir en este grupo." /></div>}
            {posts.map((p) => <PostCard key={p.id} post={p} />)}
          </>
        )}
        {tab === 'members' && (
          <ul className="card divide-y divide-line">
            {CONTACTS.map((c, i) => (
              <li key={c.name} className="flex items-center gap-3 p-3.5">
                <Avatar name={c.name} online={c.online} /><span className="flex-1 font-semibold">{c.name}</span>
                <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold text-ink-soft">{i === 0 ? 'Administrador' : 'Miembro'}</span>
                <button className="btn-ghost !py-1 text-sm" onClick={() => proto('Gestionar miembros')}>Gestionar</button>
              </li>
            ))}
          </ul>
        )}
        {tab === 'files' && (
          <div className="card">
            <EmptyState icon={<Globe className="h-6 w-6" />} title="Archivos del grupo"
              hint="Aquí aparecerán los documentos compartidos con este grupo, con sus versiones y su historial."
              action={<Link to="/documentos" className="btn-primary">Ir a Documentos</Link>} />
          </div>
        )}
      </div>
    </div>
  );
}
