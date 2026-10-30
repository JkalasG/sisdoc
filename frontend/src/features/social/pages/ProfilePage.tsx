import { Briefcase, Camera, Calendar, Mail, MapPin, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/features/auth/store/session';
import { Art, Avatar, proto } from '@/shared/ui/primitives';
import { Composer } from '../components/Composer';
import { PostCard } from '../components/PostCard';
import { ME } from '../data';
import { useSocial } from '../store';

type Tab = 'posts' | 'about' | 'files';

export function ProfilePage() {
  const user = useSession((s) => s.user);
  const name = user?.displayName ?? ME;
  const posts = useSocial((s) => s.posts).filter((p) => p.author === ME);
  const [tab, setTab] = useState<Tab>('posts');

  const About = () => (
    <section className="card space-y-3.5 p-4 text-[15px]" aria-label="Información">
      <h2 className="text-xl">Información</h2>
      <p className="flex items-center gap-3"><Briefcase className="h-5 w-5 text-ink-mute" /> Analista contable en <strong>Contabilidad</strong></p>
      <p className="flex items-center gap-3"><MapPin className="h-5 w-5 text-ink-mute" /> Sucursal Central</p>
      <p className="flex items-center gap-3"><Mail className="h-5 w-5 text-ink-mute" /> {user?.email ?? 'ana@empresa.com'}</p>
      <p className="flex items-center gap-3"><Calendar className="h-5 w-5 text-ink-mute" /> En la empresa desde marzo de 2022</p>
    </section>
  );

  return (
    <div className="mx-auto max-w-4xl pb-6">
      <div className="card overflow-hidden rounded-t-none sm:rounded-t-xl">
        <div className="relative">
          <Art seed={6} className="h-44 sm:h-64" />
          <button onClick={() => proto('Cambiar la portada')} className="absolute bottom-3 right-3 flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-sm font-semibold shadow"><Camera className="h-4 w-4" /> Editar portada</button>
        </div>
        <div className="flex flex-wrap items-end gap-4 px-5 pb-4">
          <div className="-mt-12 rounded-full border-4 border-surface sm:-mt-16"><Avatar name={name} size="xl" /></div>
          <div className="min-w-0 flex-1 pt-3">
            <h1 className="text-3xl">{name}</h1>
            <p className="text-sm text-ink-soft">Analista contable · Contabilidad · 214 conexiones</p>
          </div>
          <button className="btn-primary" onClick={() => proto('Editar el perfil')}><Pencil className="h-4 w-4" /> Editar perfil</button>
        </div>
        <div className="flex gap-1 border-t border-line px-3" role="tablist">
          {([['posts', 'Publicaciones'], ['about', 'Información'], ['files', 'Archivos']] as Array<[Tab, string]>).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`border-b-[3px] px-4 py-3 text-[15px] font-semibold ${tab === t ? 'border-brand text-brand' : 'border-transparent text-ink-soft hover:bg-paper'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 px-3 md:grid-cols-[320px_minmax(0,1fr)]">
        {tab === 'posts' && (
          <>
            <div className="hidden md:block"><About /></div>
            <div><Composer name={name} />{posts.map((p) => <PostCard key={p.id} post={p} />)}</div>
          </>
        )}
        {tab === 'about' && <div className="md:col-span-2 md:mx-auto md:w-full md:max-w-xl"><About /></div>}
        {tab === 'files' && (
          <div className="card p-6 text-center md:col-span-2">
            <p className="mb-3 text-ink-soft">Tus documentos viven en la sección Documentos.</p>
            <Link to="/documentos" className="btn-primary">Abrir Documentos</Link>
          </div>
        )}
      </div>
    </div>
  );
}
