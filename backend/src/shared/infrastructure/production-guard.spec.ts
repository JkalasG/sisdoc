import { assertProductionConfig, productionProblems } from './production-guard';

const GOOD = {
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'q8W3mZk1pXr7tVb2NcY9uHj4LsD6fGa0QeR5wTzUiOoPxCvBnMlKjHgFdSaZxCvBnMq1',
  ONLYOFFICE_JWT_SECRET: 'f7Gh2Jk9Lm4Np6Qr8St1Vw3Xy5Za7Bc0De2Fg4Hj6Kl8',
  DATABASE_URL: 'postgresql://sisdoc:Zx9!kQ2mRt7vLp4w@db.interno:5432/sisdoc',
  CORS_ORIGIN: 'https://iris.empresa.com',
  TRUST_PROXY: '1',
};

describe('Guardia de configuración de producción', () => {
  it('no hace nada fuera de producción (desarrollo y pruebas usan valores de ejemplo)', () => {
    expect(productionProblems({ NODE_ENV: 'development', JWT_ACCESS_SECRET: 'cambia-esto' })).toEqual([]);
    expect(() => assertProductionConfig({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('una configuración correcta arranca', () => {
    expect(productionProblems(GOOD)).toEqual([]);
    expect(() => assertProductionConfig(GOOD)).not.toThrow();
  });

  it('rechaza el secreto JWT de ejemplo del .env.example aunque tenga 32+ caracteres', () => {
    const p = productionProblems({ ...GOOD, JWT_ACCESS_SECRET: 'cambia-esto-por-un-secreto-largo-de-al-menos-32-caracteres-1' });
    expect(p.join()).toMatch(/JWT_ACCESS_SECRET/);
  });

  it('rechaza secretos cortos, el secreto de OnlyOffice publicado y la contraseña de BD de desarrollo', () => {
    const p = productionProblems({
      ...GOOD, JWT_ACCESS_SECRET: 'corto', ONLYOFFICE_JWT_SECRET: 'sisdoc_onlyoffice_jwt_secret_2026_seguro',
      DATABASE_URL: 'postgresql://sisdoc:sisdoc_dev@localhost:5434/sisdoc',
    });
    expect(p).toHaveLength(3);
  });

  it('exige CORS con https, TRUST_PROXY y sin DISABLE_THROTTLE', () => {
    expect(productionProblems({ ...GOOD, CORS_ORIGIN: '' }).join()).toMatch(/CORS_ORIGIN está vacío/);
    expect(productionProblems({ ...GOOD, CORS_ORIGIN: 'http://iris.empresa.com' }).join()).toMatch(/https/);
    expect(productionProblems({ ...GOOD, TRUST_PROXY: '' }).join()).toMatch(/TRUST_PROXY/);
    expect(productionProblems({ ...GOOD, DISABLE_THROTTLE: 'true' }).join()).toMatch(/DISABLE_THROTTLE/);
  });

  it('assertProductionConfig lista TODOS los problemas en el mensaje del error', () => {
    expect(() => assertProductionConfig({ NODE_ENV: 'production' })).toThrow(/JWT_ACCESS_SECRET[\s\S]*CORS_ORIGIN/);
  });
});
