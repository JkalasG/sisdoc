// Aplica las migraciones a la base de pruebas (no destructivo). Las tablas se vacían entre pruebas.
const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  const url = process.env.TEST_DATABASE_URL
    || 'postgresql://sisdoc:sisdoc_dev@localhost:5434/sisdoc_test?schema=public';
  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
};
