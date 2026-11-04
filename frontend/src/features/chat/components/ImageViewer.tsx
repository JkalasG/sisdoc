import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ImageDTO } from '@/shared/api/types';
import { formatBytes } from '@/shared/format';
import { imageUrl } from '../api/chat.api';

/** Visor de fotos a pantalla completa: flechas o teclado para pasar, Esc para cerrar. */
export function ImageViewer({ conversationId, images, start, onClose }: { conversationId: string; images: ImageDTO[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const many = images.length > 1;
  const go = (d: number) => setI((cur) => (cur + d + images.length) % images.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (many && e.key === 'ArrowLeft') go(-1);
      if (many && e.key === 'ArrowRight') go(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const im = images[i];
  const src = imageUrl(conversationId, im);
  const btn = 'rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white';
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label="Visor de fotos" onClick={onClose}>
      <header className="flex items-center gap-3 p-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="min-w-0 flex-1 truncate text-sm"><span className="font-semibold">{im.fileName}</span> <span className="text-white/60">· {formatBytes(im.sizeBytes)}{many ? ` · ${i + 1} de ${images.length}` : ''}</span></p>
        <a href={src} download={im.fileName} className={btn} aria-label="Descargar foto"><Download className="h-5 w-5" /></a>
        <button type="button" className={btn} aria-label="Cerrar visor" onClick={onClose} autoFocus><X className="h-5 w-5" /></button>
      </header>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 pb-6">
        {many && <button type="button" className={`${btn} absolute left-3`} aria-label="Foto anterior" onClick={(e) => { e.stopPropagation(); go(-1); }}><ChevronLeft className="h-6 w-6" /></button>}
        <img src={src} alt={im.fileName} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        {many && <button type="button" className={`${btn} absolute right-3`} aria-label="Foto siguiente" onClick={(e) => { e.stopPropagation(); go(1); }}><ChevronRight className="h-6 w-6" /></button>}
      </div>
    </div>
  );
}
