import { Bookmark, Download, Globe, MessageCircle, MoreHorizontal, Pin, Share2, ThumbsUp, Users } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { timeAgo } from '@/shared/format';
import { Art, Avatar, FileTypeIcon, proto } from '@/shared/ui/primitives';
import { ME, Post, REACTIONS, totalReactions } from '../data';
import { useSocial } from '../store';
import { groupName } from './Composer';

export function PostCard({ post }: { post: Post }) {
  const { react, comment, toggleSave } = useSocial();
  const [showComments, setShowComments] = useState(post.comments.length > 0 && post.comments.length <= 2);
  const [picker, setPicker] = useState(false);
  const [draft, setDraft] = useState('');

  const mine = REACTIONS.find((r) => r.key === post.mine);
  const total = totalReactions(post);
  const top = REACTIONS.filter((r) => post.reactions[r.key] > 0 || post.mine === r.key)
    .sort((a, b) => post.reactions[b.key] - post.reactions[a.key]).slice(0, 3);
  const group = groupName(post.groupId);
  const isAnnouncement = post.kind === 'announcement';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    comment(post.id, draft.trim());
    setDraft(''); setShowComments(true);
  };

  return (
    <article className="card mb-4 animate-rise" aria-label={`Publicación de ${post.author}`}>
      {isAnnouncement && (
        <p className="flex items-center gap-2 rounded-t-xl bg-brand-light px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-brand"><Pin className="h-3.5 w-3.5" /> Anuncio fijado</p>
      )}
      <header className="flex items-start gap-3 px-4 pt-3.5">
        <Avatar name={post.author} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight">
            {post.author}
            {group && <span className="font-normal text-ink-soft"> ▸ <Link to="/grupos" className="font-semibold text-ink hover:underline">{group}</Link></span>}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-ink-mute">
            {post.role && <>{post.role} · </>}{timeAgo(post.at)} · {post.groupId ? <Users className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
          </p>
        </div>
        <button className="icon-btn !h-9 !w-9 bg-transparent" aria-label="Más opciones" onClick={() => proto('El menú de la publicación')}><MoreHorizontal className="h-5 w-5" /></button>
      </header>

      {post.text && <p className="whitespace-pre-wrap px-4 pb-3 pt-2.5 text-[15px] leading-relaxed">{post.text}</p>}

      {post.arts && (
        <div className={`grid gap-0.5 ${post.arts.length === 1 ? '' : post.arts.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
          {post.arts.map((a, i) => (
            <div key={a + '-' + i} className={post.arts!.length === 3 && i === 0 ? 'col-span-2' : ''}>
              <Art seed={a} className={`${post.arts!.length === 1 ? 'max-h-[28rem]' : 'h-56'} !w-full`} />
            </div>
          ))}
        </div>
      )}

      {post.doc && (
        <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl border border-line bg-paper/60 p-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-light text-brand"><FileTypeIcon mime={post.doc.mime} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{post.doc.title}</p>
            <p className="text-xs text-ink-mute">{post.doc.fileName} · v{post.doc.version} · {post.doc.size}</p>
          </div>
          <Link to="/documentos" className="btn-ghost !px-3 !py-1.5 text-sm"><Download className="h-4 w-4" /> Abrir</Link>
        </div>
      )}

      {(total > 0 || post.comments.length > 0 || post.shares > 0) && (
        <div className="flex items-center justify-between px-4 pb-2.5 text-sm text-ink-soft">
          <span className="flex items-center gap-1.5">
            {total > 0 && (
              <>
                <span className="flex -space-x-1" aria-hidden>{top.map((r) => <span key={r.key} className="flex h-5 w-5 items-center justify-center rounded-full border border-surface bg-paper text-[11px]">{r.emoji}</span>)}</span>
                <span>{total}</span>
              </>
            )}
          </span>
          <span className="flex gap-3">
            {post.comments.length > 0 && <button className="hover:underline" onClick={() => setShowComments((v) => !v)}>{post.comments.length} comentario{post.comments.length === 1 ? '' : 's'}</button>}
            {post.shares > 0 && <span>{post.shares} compartido{post.shares === 1 ? '' : 's'}</span>}
          </span>
        </div>
      )}

      <div className="mx-4 grid grid-cols-3 gap-1 border-y border-line py-1 text-[15px] font-semibold text-ink-soft">
        <div className="relative" onMouseEnter={() => setPicker(true)} onMouseLeave={() => setPicker(false)}>
          {picker && (
            <div className="absolute -top-12 left-0 z-10 flex gap-1 rounded-full bg-surface px-2 py-1.5 shadow-pop" role="group" aria-label="Reacciones">
              {REACTIONS.map((r) => (
                <button key={r.key} title={r.label} aria-label={r.label} onClick={() => { react(post.id, r.key); setPicker(false); }}
                  className="origin-bottom text-2xl transition hover:-translate-y-1 hover:scale-125">{r.emoji}</button>
              ))}
            </div>
          )}
          <button onClick={() => react(post.id, post.mine ? null : 'like')} aria-pressed={!!post.mine}
            className={`flex w-full items-center justify-center gap-2 rounded-lg py-2 hover:bg-paper ${mine ? mine.color : ''}`}>
            {mine ? <span className="text-lg leading-none">{mine.emoji}</span> : <ThumbsUp className="h-5 w-5" />} {mine ? mine.label : 'Me gusta'}
          </button>
        </div>
        <button onClick={() => setShowComments(true)} className="flex items-center justify-center gap-2 rounded-lg py-2 hover:bg-paper"><MessageCircle className="h-5 w-5" /> Comentar</button>
        <button onClick={() => proto('Compartir publicaciones')} className="flex items-center justify-center gap-2 rounded-lg py-2 hover:bg-paper"><Share2 className="h-5 w-5" /> Compartir</button>
      </div>

      {showComments && post.comments.length > 0 && (
        <ul className="space-y-2.5 px-4 pt-3">
          {post.comments.map((c) => (
            <li key={c.id} className="flex gap-2">
              <Avatar name={c.author} size="sm" />
              <div>
                <p className="rounded-2xl bg-paper px-3 py-2 text-sm"><span className="font-semibold">{c.author}</span><br />{c.text}</p>
                <p className="ml-3 mt-0.5 flex gap-3 text-xs font-semibold text-ink-mute">
                  <button className="hover:underline" onClick={() => proto('Reaccionar a comentarios')}>Me gusta</button>
                  <button className="hover:underline" onClick={() => proto('Responder comentarios')}>Responder</button>
                  <span className="font-normal">{timeAgo(c.at)}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="flex items-center gap-2 px-4 py-3">
        <Avatar name={ME} size="sm" />
        <input className="flex-1 rounded-full bg-paper px-4 py-2 text-sm placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-brand/30"
          placeholder="Escribe un comentario…" aria-label={`Comentar la publicación de ${post.author}`} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="button" className="rounded-full p-2 text-ink-mute hover:bg-paper" aria-label={post.saved ? 'Quitar de guardados' : 'Guardar'} onClick={() => toggleSave(post.id)}>
          <Bookmark className={`h-5 w-5 ${post.saved ? 'fill-brand text-brand' : ''}`} />
        </button>
      </form>
    </article>
  );
}
