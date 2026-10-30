import { useEffect, useState } from 'react';

/** Preferencia del usuario: claro, oscuro o "automático" (sigue al sistema operativo). */
export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'sisdoc-theme';

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* almacenamiento bloqueado */ }
  return 'system';
}

export function applyTheme(pref: ThemePref = getThemePref()) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function setThemePref(pref: ThemePref) {
  try { localStorage.setItem(KEY, pref); } catch { /* sin persistencia */ }
  applyTheme(pref);
  window.dispatchEvent(new Event('sisdoc-theme'));
}

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  useEffect(() => {
    const sync = () => setPref(getThemePref());
    window.addEventListener('sisdoc-theme', sync);
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    const onSystem = () => applyTheme();
    mq?.addEventListener?.('change', onSystem);
    return () => { window.removeEventListener('sisdoc-theme', sync); mq?.removeEventListener?.('change', onSystem); };
  }, []);
  return [pref, setThemePref];
}
