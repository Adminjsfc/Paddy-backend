import { createApp } from "./app.js";
import { pool } from "./config/database.js";
import { closeCoreDMPool } from "./config/core-database.js";
// for(const name of ['DB_PASSWORD','EUPARJAN_API_KEY','GPS_API_KEY']) {
//   const value=process.env[name]||'';
//   if(!value||value.startsWith('replace_')||(name.endsWith('_API_KEY')&&value.length<32))throw new Error(`Configure ${name} in .env`);
// }

for (const name of ['EUPARJAN_API_KEY', 'GPS_API_KEY']) {
  const value = process.env[name] || '';
  if (!value || value.startsWith('replace_') || name.endsWith('_API_KEY') && value.length < 32) throw new Error(`Configure ${name} in .env`);
}
if (process.env.EUPARJAN_API_KEY === process.env.GPS_API_KEY) throw new Error('Use different integration and GPS API keys');
const port = Number(process.env.PORT || 3015),
  host = process.env.HOST || '127.0.0.1';
await pool.query('SELECT 1');
const server = createApp().listen(port, host, () => console.log(JSON.stringify({
  event: 'SERVER_STARTED',
  host,
  port
})));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  server.close(async () => {
    await closeCoreDMPool();
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
});
