import { FileText, Image, Smile } from 'lucide-react';
import { useState } from 'react';
import { Art, Avatar, Modal, proto } from '@/shared/ui/primitives';
import { GROUPS, ME } from '../data';
import { useSocial } from '../store';

export function Composer({ name = ME, groupId }: { name?: string; groupId?: string }) {
  const [open, setOpen] = useState(false);
  const first = name.split(' ')[0];
  return (
    <>
      <section className="card mb-4 p-4" aria-label="Crear publicación">
        <div className="flex items-center gap-3">
          <Avatar name={name} />
          <button onClick={() => setOpen(true)} className="flex-1 rounded-full bg-paper px-4 py-2.5 text-left text-[15px] text-ink-soft transition hover:bg-line">
            ¿Qué quieres compartir, {first}?
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 border-t border-line pt-2.5 text-sm font-semibold text-ink-soft">
          <button className="flex items-center justify-center gap-2 rounded-lg py-2 hover:bg-paper" onClick={() => setOpen(true)}><Image className="h-5 w-5 text-ok" /> Foto</button>
          <button className="flex items-center justify-center gap-2 rounded-lg py-2 hover:bg-paper" onClick={() => proto('Adjuntar un documento a una publicación')}><FileText className="h-5 w-5 text-brand" /> Documento</button>
          <button className="flex items-center justify-center gap-2 rounded-lg py-2 hover:bg-paper" onClick={() => proto('Los estados de ánimo')}><Smile className="h-5 w-5 text-amber" /> Ánimo</button>
        </div>
      </section>
      {open && <CreatePost name={name} groupId={groupId} onClose={() => setOpen(false)} />}
    </>
  );
}

function CreatePost({ name, groupId, onClose }: { name: string; groupId?: string; onClose: () => void }) {
  const publish = useSocial((s) => s.publish);
  const [text, setText] = useState('');
  const [art, setArt] = useState<number | undefined>();
  const [target, setTarget] = useState(groupId ?? '');
  const joined = useSocial((s) => s.groups).filter((g) => g.joined);

  return (
    <Modal title="Crear publicación" onClose={onClose}>
      <div className="mb-3 flex items-center gap-3">
        <Avatar name={name} />
        <div>
          <p className="font-semibold leading-tight">{name}</p>
          <select aria-label="Audiencia" className="mt-0.5 rounded-md bg-paper px-2 py-0.5 text-xs font-semibold" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">🌐 Toda la organización</option>
            {joined.map((g) => <option key={g.id} value={g.id}>👥 {g.name}</option>)}
          </select>
        </div>
      </div>
      <textarea autoFocus rows={4} placeholder={`¿Qué quieres compartir, ${name.split(' ')[0]}?`} aria-label="Contenido de la publicación"
        className="w-full resize-none border-0 p-1 text-lg placeholder:text-ink-mute focus:outline-none focus:ring-0" value={text} onChange={(e) => setText(e.target.value)} />
      {art !== undefined && (
        <div className="relative mb-3 overflow-hidden rounded-xl">
          <Art seed={art} className="max-h-56" />
          <button onClick={() => setArt(undefined)} className="absolute right-2 top-2 rounded-full bg-surface px-2.5 py-1 text-xs font-bold shadow">Quitar</button>
        </div>
      )}
      <div className="mb-4 rounded-xl border border-line p-3">
        <p className="mb-2 text-sm font-semibold">Añadir a tu publicación</p>
        <div className="flex flex-wrap items-center gap-2">
          {[0, 1, 2, 3, 4, 5].map((s) => (
            <button key={s} aria-label={`Foto de ejemplo ${s + 1}`} onClick={() => setArt(s)} className={`h-10 w-10 overflow-hidden rounded-lg ring-offset-2 ${art === s ? 'ring-2 ring-brand' : ''}`}><Art seed={s} className="h-full" /></button>
          ))}
          <span className="text-xs text-ink-mute">(imágenes de ejemplo)</span>
        </div>
      </div>
      <button className="btn-primary w-full" disabled={!text.trim() && art === undefined}
        onClick={() => { publish({ text: text.trim(), art, groupId: target || undefined }); onClose(); }}>
        Publicar
      </button>
      <p className="mt-2 text-center text-xs text-ink-mute">Prototipo: la publicación vive solo en tu navegador.</p>
    </Modal>
  );
}

export const groupName = (id?: string) => GROUPS.find((g) => g.id === id)?.name;
