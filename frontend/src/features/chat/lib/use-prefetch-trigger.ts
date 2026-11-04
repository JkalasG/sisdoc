import { RefObject, useEffect, useRef, useState } from 'react';

/**
 * Devuelve una `ref` para el elemento «centinela» (p. ej. el 10.º mensaje desde arriba). Cuando ese elemento entra
 * en el área visible del contenedor, llama a `onNear`: es la señal de pedir la página anterior ANTES de que
 * quien lee llegue al borde, de modo que el desplazamiento siga fluido.
 */
export function usePrefetchTrigger(opts: { enabled: boolean; root: RefObject<HTMLElement | null>; onNear: () => void }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const onNear = useRef(opts.onNear);
  onNear.current = opts.onNear;

  useEffect(() => {
    if (!opts.enabled || !target || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onNear.current();
    }, { root: opts.root.current, rootMargin: '0px' });
    io.observe(target);
    return () => io.disconnect();
  }, [opts.enabled, opts.root, target]);

  return setTarget;
}
