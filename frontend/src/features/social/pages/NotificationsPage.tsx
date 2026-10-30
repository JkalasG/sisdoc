import { AtSign, Bell, FileCheck2, Heart, Megaphone, MessageSquare, ShieldAlert, UserPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { timeAgo } from '@/shared/format';
import { Avatar, EmptyState, proto } from '@/shared/ui/primitives';
import type { Notice, NotificationKind } from '../data';
import { unreadNotices, useSocial } from '../store';

const ICON: Record<NotificationKind, { icon: ReactNode; bg: string }> = {
  reaction: { icon: <Heart className="h-3 w-3 fill-white" />, bg: 'bg-rose-500' },
  comment: { icon: <MessageSquare className="h-3 w-3 fill-white" />, bg: 'bg-ok-soft0' },
  mention: { icon: <AtSign className="h-3 w-3" />, bg: 'bg-brand' },
  group_request: { icon: <UserPlus className="h-3 w-3" />, bg: 'bg-violet-500' },
  announcement: { icon: <Megaphone className="h-3 w-3" />, bg: 'bg-amber' },
  security: { icon: <ShieldAlert className="h-3 w-3" />, bg: 'bg-danger' },
  review: { icon: <FileCheck2 className="h-3 w-3" />, bg: 'bg-sky-500' },
};

function Row({ n }: { n: Notice }) {
  const read = useSocial((s) => s.readNotice);
  const navigate = useNavigate();
  const open = () => { read(n.id); if (n.link) navigate(n.link); };
  const k = ICON[n.kind];
  return (
    <li>
      <div className={`flex w-full items-start gap-3 rounded-lg p-2.5 text-left hover:bg-paper ${n.read ? '' : 'bg-brand-light/50'}`}>
        <button onClick={open} className="flex min-w-0 flex-1 items-start gap-3 text-left" aria-label={`${n.actor} ${n.text}`}>
          <span className="relative shrink-0">
            <Avatar name={n.actor} size="lg" group={n.kind === 'security'} />
            <span className={`absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface text-white ${k.bg}`}>{k.icon}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] leading-snug"><strong>{n.actor}</strong> {n.text}</span>
            <span className={`text-xs font-semibold ${n.read ? 'text-ink-mute' : 'text-brand'}`}>{timeAgo(n.at)}</span>
          </span>
        </button>
        {n.kind === 'group_request' && !n.read && (
          <span className="flex shrink-0 gap-2 self-center">
            <button className="btn-primary !px-3 !py-1.5 text-sm" onClick={() => { read(n.id); proto('Aprobar solicitudes'); }}>Aceptar</button>
            <button className="btn-ghost !px-3 !py-1.5 text-sm" onClick={() => { read(n.id); proto('Rechazar solicitudes'); }}>Rechazar</button>
          </span>
        )}
        {n.kind === 'security' && (
          <button className="btn-ghost shrink-0 self-center !px-3 !py-1.5 text-sm" onClick={() => proto('Reportar «no fui yo»')}>No fui yo</button>
        )}
        {!n.read && <span className="mt-4 h-3 w-3 shrink-0 rounded-full bg-brand" aria-label="No leída" />}
      </div>
    </li>
  );
}

export function NotificationsPage() {
  const notices = useSocial((s) => s.notices);
  const readAll = useSocial((s) => s.readAllNotices);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const list = onlyUnread ? notices.filter((n) => !n.read) : notices;
  const fresh = list.filter((n) => !n.read);
  const old = list.filter((n) => n.read);

  return (
    <div className="mx-auto max-w-2xl px-3 py-5">
      <div className="card p-4">
        <header className="mb-3 flex items-center justify-between">
          <h1 className="text-2xl">Notificaciones</h1>
          <button className="text-sm font-semibold text-brand hover:underline disabled:text-ink-mute" disabled={unreadNotices(notices) === 0} onClick={readAll}>Marcar todas como leídas</button>
        </header>
        <div className="mb-3 flex gap-2" role="tablist">
          {[['Todas', false], ['No leídas', true]].map(([label, v]) => (
            <button key={String(label)} role="tab" aria-selected={onlyUnread === v} onClick={() => setOnlyUnread(v as boolean)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${onlyUnread === v ? 'bg-brand-light text-brand' : 'hover:bg-paper'}`}>{label as string}</button>
          ))}
        </div>
        {list.length === 0 && <EmptyState icon={<Bell className="h-6 w-6" />} title="Estás al día" hint="No tienes notificaciones sin leer." />}
        {fresh.length > 0 && <><h2 className="px-1 pb-1 text-base">Nuevas</h2><ul className="mb-3">{fresh.map((n) => <Row key={n.id} n={n} />)}</ul></>}
        {old.length > 0 && <><h2 className="px-1 pb-1 text-base">Anteriores</h2><ul>{old.map((n) => <Row key={n.id} n={n} />)}</ul></>}
      </div>
    </div>
  );
}
