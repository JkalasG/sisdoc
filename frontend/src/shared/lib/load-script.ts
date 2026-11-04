const loading = new Map<string, Promise<void>>();

/** Carga un script externo una sola vez (si falla, el siguiente intento vuelve a probar). */
export function loadScript(src: string): Promise<void> {
  const cached = loading.get(src);
  if (cached) return cached;
  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => { el.remove(); loading.delete(src); reject(new Error(`No se pudo cargar ${src}`)); };
    document.head.appendChild(el);
  });
  loading.set(src, p);
  return p;
}
