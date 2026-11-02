// Checks that DATABASE_URL works: connects (TLS verified), creates the tables
// if needed and prints what is stored. Nothing is changed.
//
//   npm run db:check          (reads DATABASE_URL from the environment or .env)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* no .env file */ }

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Put your Neon connection string in a .env file (see .env.example) or the environment.');
  process.exit(1);
}
try {
  const t0 = Date.now();
  const db = await openDb({ url: process.env.DATABASE_URL });
  const c = await db.counts();
  console.log(`Connected to ${db.where} in ${Date.now() - t0} ms.`);
  console.log(`Accounts: ${c.users} · market sales: ${c.sales} · active listings: ${c.listings} · trades: ${c.trades}`);
  await db.close();
  console.log('The database is ready for the game server.');
} catch (e) {
  console.error('Could not use the database:', e.message);
  console.error('Check the connection string (copy it again from Neon → Connect) and that it starts with postgresql://');
  process.exit(1);
}
