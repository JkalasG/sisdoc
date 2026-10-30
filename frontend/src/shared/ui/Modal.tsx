import { X } from 'lucide-react';
import { ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Modal reutilizable. Estructura fija: cabecera · cuerpo con scroll · pie opcional.
 * Así los botones de acción nunca se pierden en pantallas bajas y el contenido largo se desplaza solo.
 *
 * - En móvil se comporta como una hoja desde abajo; en escritorio, como un cuadro centrado.
 * - Se dibuja en `document.body` (portal): ningún contenedor lo recorta.
 * - Bloquea el scroll de la página, atrapa el foco, lo devuelve al cerrar y respeta `Escape`
 *   (solo cierra el modal que está encima).
 * - Un clic cuenta como «fuera» solo si empezó Y terminó en el fondo (soltar el mouse fuera tras seleccionar texto no cierra).
 */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';
const WIDTH: Record<ModalSize, string> = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-6xl' };

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Botones de acción: quedan fijos al pie, siempre visibles. */
  footer?: ReactNode;
  description?: string;
  size?: ModalSize;
  /** Compatibilidad: `wide` = `size="md"`. */
  wide?: boolean;
  /** false = no se cierra con Escape, clic fuera ni la X (p. ej. avisos que exigen decisión). */
  dismissible?: boolean;
}

const stack: symbol[] = [];       // modales abiertos; solo el último reacciona a Escape
let scrollLocks = 0;

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, footer, description, size, wide, dismissible = true }: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const downOnBackdrop = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const width = WIDTH[size ?? (wide ? 'md' : 'sm')];

  useEffect(() => {
    const me = Symbol('modal');
    stack.push(me);
    const previous = document.activeElement as HTMLElement | null;
    if (scrollLocks++ === 0) document.body.style.overflow = 'hidden';

    // foco inicial: el primer campo del cuerpo; si no hay, el propio cuadro
    const body = panel.current?.querySelector<HTMLElement>('[data-modal-body]');
    (body?.querySelector<HTMLElement>('input:not([type=file]):not([type=hidden]),textarea,select') ?? panel.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;
      if (e.key === 'Escape' && dismissible) { onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[hidden],[aria-hidden="true"]'));
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(me), 1);
      if (--scrollLocks === 0) document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [dismissible]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:p-6"
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (dismissible && downOnBackdrop.current && e.target === e.currentTarget) onClose(); downOnBackdrop.current = false; }}
    >
      <div
        ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined} tabIndex={-1}
        className={`animate-rise motion-reduce:animate-none flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-pop outline-none sm:max-h-[min(90dvh,880px)] sm:rounded-2xl ${width}`}
      >
        <header className="relative shrink-0 border-b border-line px-5 py-3.5 text-center">
          <h2 id={titleId} className="text-lg">{title}</h2>
          {description && <p id={descId} className="mt-0.5 text-sm text-ink-soft">{description}</p>}
          {dismissible && (
            <button type="button" className="icon-btn absolute right-3 top-1/2 !h-9 !w-9 -translate-y-1/2" onClick={onClose} aria-label="Cerrar">
              <X className="h-5 w-5" />
            </button>
          )}
        </header>
        <div data-modal-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-line bg-surface px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
