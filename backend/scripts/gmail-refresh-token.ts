/**
 * Obtiene el REFRESH TOKEN de Gmail (una sola vez) para poder enviar correos desde la cuenta que elijas.
 *
 * Antes, en https://console.cloud.google.com/:
 *   1. APIs y servicios → Biblioteca → habilita "Gmail API".
 *   2. Credenciales → tu ID de cliente OAuth (tipo "Aplicación web") → en "URI de redireccionamiento autorizados"
 *      agrega exactamente:  http://localhost:53682/callback
 *   3. Pantalla de consentimiento: si está en modo "Prueba", agrega la cuenta que enviará correos como usuario de prueba.
 *
 * Uso:  npm run gmail:token
 * Luego inicia sesión con la cuenta REMITENTE y copia el token que se imprime a GMAIL_REFRESH_TOKEN en .env
 * (y pon esa misma dirección en MAIL_FROM). El permiso que se pide es solo "enviar correos" (gmail.send).
 */
import 'dotenv/config';
import { createServer } from 'http';
import { OAuth2Client } from 'google-auth-library';

const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}/callback`;

async function main() {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('Completa GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET en backend/.env y vuelve a ejecutar.');

  const client = new OAuth2Client(clientId, clientSecret, REDIRECT);
  const state = Math.random().toString(36).slice(2);
  const url = client.generateAuthUrl({
    access_type: 'offline', // necesario para recibir refresh token
    prompt: 'consent', // fuerza a Google a entregarlo aunque ya hayas autorizado antes
    scope: ['https://www.googleapis.com/auth/gmail.send'],
    state,
  });

  console.log('\nAbre este enlace en el navegador, inicia sesión con la cuenta que ENVIARÁ los correos y acepta:\n');
  console.log(url, '\n');

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url ?? '/', REDIRECT);
      if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
      const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(ok ? '<h2>Listo. Ya puedes cerrar esta pestaña y volver a la terminal.</h2>' : '<h2>Autorización inválida.</h2>');
      server.close();
      ok ? resolve(String(u.searchParams.get('code'))) : reject(new Error(u.searchParams.get('error') ?? 'Autorización inválida'));
    });
    server.listen(PORT, '127.0.0.1');
    setTimeout(() => { server.close(); reject(new Error('Tiempo agotado (5 min)')); }, 5 * 60_000);
  });

  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error('Google no entregó refresh token. Revoca el acceso previo en myaccount.google.com/permissions y repite.');
  console.log('\nCopia esta línea a backend/.env (no la compartas ni la subas a git):\n');
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  console.log('Y recuerda: MAIL_DRIVER=gmail  y  MAIL_FROM=<la cuenta con la que iniciaste sesión>\n');
}

main().catch((e) => { console.error('\nError:', e.message); process.exit(1); });
