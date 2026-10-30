import { Bookmark, CalendarDays, Clock, FileText, Gift, MessageCircle, Megaphone, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar, proto } from '@/shared/ui/primitives';
import { CONTACTS, ME } from '../data';
import { useSocial } from '../store';

export function LeftRail({ name = ME }: { name?: string }) {
  const groups = useSocial((s) => s.groups).filter((g) => g.joined);
  const item = 'flex items-center gap-3 rounded-lg px-2.5 py-2 text-[15px] font-semibold hover:bg-ink/5';
  return (
    <nav className="sticky top-[72px] space-y-0.5" aria-label="Accesos directos">
      <Link to="/perfil" className={item}><Avatar name={name} size="sm" />{name}</Link>
      <Link to="/grupos" className={item}><Users className="h-7 w-7 text-brand" />Grupos</Link>
      <Link to="/documentos" className={item}><FileText className="h-7 w-7 text-ok" />Documentos</Link>
      <Link to="/mensajes" className={item}><MessageCircle className="h-7 w-7 text-chat-accent" />Mensajes</Link>
      <button className={`${item} w-full`} onClick={() => proto('Guardados')}><Bookmark className="h-7 w-7 text-rose-500" />Guardados</button>
      <button className={`${item} w-full`} onClick={() => proto('Eventos')}><CalendarDays className="h-7 w-7 text-amber" />Eventos</button>
      <button className={`${item} w-full`} onClick={() => proto('Recuerdos')}><Clock className="h-7 w-7 text-sky-500" />Recuerdos</button>
      <hr className="my-3 border-line" />
      <p className="px-2.5 pb-1 text-[15px] font-semibold text-ink-soft">Tus grupos</p>
      {groups.map((g) => (
        <Link key={g.id} to={`/grupos/${g.id}`} className={item}><Avatar name={g.name} size="sm" group />{g.name}</Link>
      ))}
    </nav>
  );
}

export function RightRail() {
  const navigate = useNavigate();
  return (
    <aside className="sticky top-[72px] space-y-5" aria-label="Información adicional">
      <section>
        <h3 className="mb-2 px-1 text-[17px] font-semibold text-ink-soft">Anuncios</h3>
        <button onClick={() => proto('Los anuncios')} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-ink/5">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-light text-brand"><Megaphone className="h-6 w-6" /></span>
          <span><span className="block text-sm font-semibold">Mantenimiento del sistema</span><span className="text-xs text-ink-mute">Sábado 8, 22:00 – 23:30</span></span>
        </button>
      </section>
      <hr className="border-line" />
      <section>
        <h3 className="mb-2 px-1 text-[17px] font-semibold text-ink-soft">Cumpleaños</h3>
        <div className="flex items-center gap-3 rounded-lg p-2 text-sm">
          <Gift className="h-9 w-9 text-rose-500" />
          <p><strong>Elena Torres</strong> y <strong>Pablo Rivas</strong> cumplen años hoy.</p>
        </div>
      </section>
      <hr className="border-line" />
      <section>
        <h3 className="mb-2 px-1 text-[17px] font-semibold text-ink-soft">Contactos</h3>
        <ul>
          {CONTACTS.map((c) => (
            <li key={c.name}>
              <button onClick={() => (c.chat ? navigate(`/mensajes/${c.chat}`) : proto('Iniciar un chat nuevo'))}
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left text-[15px] font-semibold hover:bg-ink/5">
                <Avatar name={c.name} size="sm" online={c.online} />{c.name}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
