import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2, Download, Eye, FileEdit, FilePlus2, FileUp, Lock, MessageSquare, Send, Share2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError } from '@/shared/api/http';
import type { DocAction } from '@/shared/api/types';
import { fullDate } from '@/shared/format';
import { EmptyState, Spinner } from '@/shared/ui/primitives';
import { filesApi } from '../api/files.api';

const META: Record<DocAction, { label: string; icon: ReactNode; tone: string }> = {
  SUBIR: { label: 'subió el documento', icon: <FileUp className="h-4 w-4" />, tone: 'bg-brand-light text-brand' },
  CREADO: { label: 'subió el documento', icon: <FileUp className="h-4 w-4" />, tone: 'bg-brand-light text-brand' },
  NUEVA_VERSION: { label: 'subió una nueva versión', icon: <FilePlus2 className="h-4 w-4" />, tone: 'bg-brand-light text-brand' },
  VERSION_CREADA: { label: 'subió una nueva versión', icon: <FilePlus2 className="h-4 w-4" />, tone: 'bg-brand-light text-brand' },
  VER: { label: 'visualizó el documento', icon: <Eye className="h-4 w-4" />, tone: 'bg-paper text-ink-soft' },
  VISTO: { label: 'visualizó el documento', icon: <Eye className="h-4 w-4" />, tone: 'bg-paper text-ink-soft' },
  DESCARGAR: { label: 'descargó el documento', icon: <Download className="h-4 w-4" />, tone: 'bg-amber-soft text-amber-ink' },
  DESCARGADO: { label: 'descargó el documento', icon: <Download className="h-4 w-4" />, tone: 'bg-amber-soft text-amber-ink' },
  EDITADO: { label: 'abrió el documento en el editor en línea', icon: <FileEdit className="h-4 w-4" />, tone: 'bg-brand-light text-brand' },
  COMPARTIR: { label: 'compartió el documento', icon: <Share2 className="h-4 w-4" />, tone: 'bg-paper text-ink-soft' },
  COMPARTIDO: { label: 'compartió el documento', icon: <Share2 className="h-4 w-4" />, tone: 'bg-paper text-ink-soft' },
  REVISION_SOLICITADA: { label: 'solicitó una revisión', icon: <Send className="h-4 w-4" />, tone: 'bg-paper text-ink-soft' },
  REVISION_DECIDIDA: { label: 'resolvió la revisión', icon: <CheckCircle2 className="h-4 w-4" />, tone: 'bg-brand-light text-brand' },
};

export function HistoryTimeline({ documentId }: { documentId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['history', documentId], queryFn: () => filesApi.history(documentId), retry: false,
  });

  if (isLoading) return <div className="flex justify-center p-10 text-brand"><Spinner /></div>;
  if ((error as ApiError | null)?.status === 403) {
    return <EmptyState icon={<Lock className="h-6 w-6" />} title="Historial restringido" hint="Solo el propietario del documento puede ver quién lo consultó y descargó." />;
  }
  if (error) return <p className="p-5 text-sm text-danger">{(error as Error).message}</p>;
  if (!data?.length) return <EmptyState icon={<MessageSquare className="h-6 w-6" />} title="Sin actividad todavía" />;

  return (
    <ol className="relative space-y-5 p-5 before:absolute before:bottom-6 before:left-[2.1rem] before:top-6 before:w-px before:bg-line">
      {data.map((e) => {
        const m = META[e.action];
        return (
          <li key={e.id} className="relative flex gap-4">
            <span className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-surface ${m.tone}`}>{m.icon}</span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm">
                <strong>{e.userName}</strong> {m.label}
                {e.versionNumber ? <span className="text-ink-soft"> · versión {e.versionNumber}</span> : null}
                {e.detail ? <span className="text-ink-soft"> · {e.detail}</span> : null}
              </p>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-mute">
                <time dateTime={e.createdAt}>{fullDate(e.createdAt)}</time>
                {e.ip && <span>IP {e.ip}</span>}
                {e.channel && <span>{e.channel.startsWith('chat:') ? 'desde el chat' : 'desde documentos'}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
