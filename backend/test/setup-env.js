// Variables de entorno de las pruebas e2e (base de datos APARTE de la de desarrollo).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://sisdoc:sisdoc_dev@localhost:5434/sisdoc_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'secreto-solo-para-pruebas-e2e-de-al-menos-32-caracteres';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.DISABLE_THROTTLE = 'true';
process.env.STORAGE_DIR = require('path').join(require('os').tmpdir(), 'sisdoc-e2e-storage');
process.env.TRUST_PROXY = ''; // los e2e no dependen del .env de desarrollo; cada prueba de IP lo fija a su gusto
// Las pruebas no dependen del .env de desarrollo: captcha y Google apagados salvo que la prueba los encienda.
process.env.CAPTCHA_ENABLED = 'false';
process.env.GOOGLE_LOGIN_ENABLED = 'false';
process.env.TURNSTILE_SITE_KEY = '';
process.env.TURNSTILE_SECRET_KEY = '';
process.env.GOOGLE_CLIENT_ID = '';
process.env.GOOGLE_ALLOWED_DOMAIN = '';
process.env.GOOGLE_AUTO_REGISTER = 'false';
process.env.MAIL_DRIVER = 'off'; // los e2e inyectan su propio correo de pruebas
