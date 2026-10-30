import { ChevronLeft, ChevronRight, Plus, Send, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { timeAgo } from '@/shared/format';
import { Art, Avatar, proto } from '@/shared/ui/primitives';
import { ME, Story } from '../data';
import { useSocial } from '../store';

export function StoriesBar() {
  const stories = useSocial((s) => s.stories);
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <div className="mb-4 flex gap-2.5 overflow-x-auto pb-1" aria-label="Historias">
        <button onClick={() => proto('Crear una historia')}
          className="group relative h-48 w-28 shrink-0 overflow-hidden rounded-xl bg-surface text-left shadow-card transition hover:shadow-pop sm:w-32">
          <div className="h-32"><Art seed={9} className="h-full" /></div>
          <span className="absolute left-1/2 top-[7.4rem] flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border-4 border-surface bg-brand text-white"><Plus className="h-5 w-5" /></span>
          <span className="absolute inset-x-0 bottom-3 text-center text-[13px] font-semibold">Crear historia</span>
        </button>
        {stories.map((s, i) => (
          <button key={s.id} onClick={() => setOpen(i)} aria-label={`Ver historia de ${s.author}`}
            className="relative h-48 w-28 shrink-0 overflow-hidden rounded-xl text-left shadow-card transition hover:shadow-pop sm:w-32">
            <Art seed={s.slides[0].art} className="h-full !w-full" />
            <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
            <span className="absolute left-2 top-2"><Avatar name={s.author} size="sm" ring seen={s.seen} /></span>
            <span className="absolute inset-x-2 bottom-2 text-[13px] font-semibold leading-tight text-white">{s.author}</span>
          </button>
        ))}
      </div>
      {open !== null && <StoryViewer start={open} onClose={() => setOpen(null)} />}
    </>
  );
}

const SLIDE_MS = 4000;

function StoryViewer({ start, onClose }: { start: number; onClose: () => void }) {
  const stories = useSocial((s) => s.stories);
  const mark = useSocial((s) => s.markStorySeen);
  const [si, setSi] = useState(start);   // historia
  const [pi, setPi] = useState(0);       // diapositiva
  const story: Story = stories[si];

  useEffect(() => { mark(story.id); }, [story.id, mark]);

  const next = () => {
    if (pi < story.slides.length - 1) setPi(pi + 1);
    else if (si < stories.length - 1) { setSi(si + 1); setPi(0); }
    else onClose();
  };
  const prev = () => {
    if (pi > 0) setPi(pi - 1);
    else if (si > 0) { setSi(si - 1); setPi(0); }
  };

  useEffect(() => {
    const t = setTimeout(next, SLIDE_MS);
    const key = (e: KeyboardEvent) => e.key === 'Escape' ? onClose() : e.key === 'ArrowRight' ? next() : e.key === 'ArrowLeft' ? prev() : undefined;
    window.addEventListener('keydown', key);
    return () => { clearTimeout(t); window.removeEventListener('keydown', key); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [si, pi]);

  const slide = story.slides[pi];
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90" role="dialog" aria-modal="true" aria-label={`Historia de ${story.author}`}>
      <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-2 text-white hover:bg-white/15" aria-label="Cerrar historia"><X className="h-7 w-7" /></button>
      <button onClick={prev} className="absolute left-4 hidden rounded-full bg-white/15 p-2 text-white hover:bg-white/25 sm:block" aria-label="Anterior"><ChevronLeft className="h-6 w-6" /></button>
      <button onClick={next} className="absolute right-4 hidden rounded-full bg-white/15 p-2 text-white hover:bg-white/25 sm:right-20 sm:block" aria-label="Siguiente"><ChevronRight className="h-6 w-6" /></button>

      <div className="relative h-full w-full max-w-md overflow-hidden bg-black sm:h-[92vh] sm:rounded-2xl">
        <Art seed={slide.art} className="h-full !w-full" />
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent p-3">
          <div className="mb-3 flex gap-1.5">
            {story.slides.map((_, i) => (
              <span key={`${si}-${i}`} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35">
                <span className={`block h-full bg-white ${i < pi ? 'w-full' : i === pi ? 'animate-progress' : 'w-0'}`} />
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2.5 text-white">
            <Avatar name={story.author} size="sm" />
            <p className="text-sm font-semibold">{story.author} <span className="font-normal text-white/70">· {timeAgo(story.at)}</span></p>
          </div>
        </div>
        <button className="absolute inset-y-24 left-0 w-1/3" onClick={prev} aria-label="Diapositiva anterior" />
        <button className="absolute inset-y-24 right-0 w-1/3" onClick={next} aria-label="Diapositiva siguiente" />
        <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-8 text-center text-3xl font-bold leading-tight text-white drop-shadow-lg">{slide.caption}</p>
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/60 to-transparent p-3">
          <input className="flex-1 rounded-full border border-white/50 bg-transparent px-4 py-2.5 text-sm text-white placeholder:text-white/70" placeholder={`Responder a ${story.author}…`}
            aria-label="Responder a la historia" onFocus={() => proto('Responder historias')} />
          <button className="rounded-full p-2 text-white hover:bg-white/15" aria-label="Enviar" onClick={() => proto('Responder historias')}><Send className="h-5 w-5" /></button>
        </div>
        <span className="sr-only">{ME}</span>
      </div>
    </div>
  );
}
