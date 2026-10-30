// Variables de entorno de las pruebas e2e (base de datos APARTE de la de desarrollo).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://sisdoc:sisdoc_dev@localhost:5434/sisdoc_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'secreto-solo-para-pruebas-e2e-de-al-menos-32-caracteres';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.DISABLE_THROTTLE = 'true';
process.env.STORAGE_DIR = require('path').join(require('os').tmpdir(), 'sisdoc-e2e-storage');
