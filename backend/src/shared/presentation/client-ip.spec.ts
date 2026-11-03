import { clientIp, normalizeIp } from './client-ip';

describe('IP del cliente', () => {
  it('quita el prefijo de IPv4 mapeada y convierte el loopback IPv6', () => {
    expect(normalizeIp('::ffff:200.87.14.55')).toBe('200.87.14.55');
    expect(normalizeIp('::1')).toBe('127.0.0.1');
    expect(normalizeIp('127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeIp(' 192.168.1.20 ')).toBe('192.168.1.20');
  });
  it('deja intactas las IPv6 reales y tolera valores vacíos', () => {
    expect(normalizeIp('2800:cd0:1::5')).toBe('2800:cd0:1::5');
    expect(normalizeIp(undefined)).toBeUndefined();
    expect(normalizeIp('')).toBeUndefined();
  });
  it('lee req.ip ya normalizada', () => {
    expect(clientIp({ ip: '::ffff:10.0.0.9' } as never)).toBe('10.0.0.9');
  });
});
