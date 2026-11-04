import { ConfigService } from '@nestjs/config';
import { HmacOtpService } from './hmac-otp.service';

const make = (secret = 'secreto-de-prueba-de-al-menos-32-caracteres-aa') => new HmacOtpService(new ConfigService({ JWT_ACCESS_SECRET: secret }));

describe('HmacOtpService (el generador de códigos real)', () => {
  it('genera 6 dígitos, con ceros a la izquierda, y no repite siempre el mismo', () => {
    const otp = make();
    const codes = Array.from({ length: 300 }, () => otp.generate());
    expect(codes.every((c) => /^\d{6}$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(250);
  });

  it('el hash no contiene el código, es estable y distinto por usuario', () => {
    const otp = make();
    const h = otp.hash('u1', '123456');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('123456');
    expect(otp.hash('u1', '123456')).toBe(h);
    expect(otp.hash('u2', '123456')).not.toBe(h); // el mismo código en otra cuenta da otro hash
  });

  it('matches acepta el código correcto y rechaza cualquier otro, otro usuario o un hash corrupto', () => {
    const otp = make();
    const h = otp.hash('u1', '123456');
    expect(otp.matches(h, 'u1', '123456')).toBe(true);
    expect(otp.matches(h, 'u1', '123457')).toBe(false);
    expect(otp.matches(h, 'u2', '123456')).toBe(false);
    expect(otp.matches('no-es-hex', 'u1', '123456')).toBe(false);
    expect(otp.matches('', 'u1', '123456')).toBe(false);
  });

  it('la clave del servidor importa: con otro secreto los hashes no coinciden (una BD robada no basta)', () => {
    expect(make('otro-secreto-distinto-de-al-menos-32-caracteres-bb').hash('u1', '123456')).not.toBe(make().hash('u1', '123456'));
  });
});
