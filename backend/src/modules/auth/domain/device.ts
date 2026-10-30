export type DeviceStatus = 'PENDING' | 'TRUSTED' | 'BLOCKED';

export interface Device {
  id: string;
  userId: string;
  keyHash: string;
  label: string | null;
  status: DeviceStatus;
  lastIp: string | null;
}

/** Etiqueta legible a partir del user-agent ("Chrome en Windows"). Solo informativa. */
export function describeUserAgent(ua?: string): string {
  if (!ua) return 'Dispositivo desconocido';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'SO desconocido';
  return `${browser} en ${os}`;
}
