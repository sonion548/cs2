// Copies a JSON database file (what the server writes when DATABASE_URL is
// not set) into the Postgres database named by DATABASE_URL.
//
//   npm run db:import                       uses data/db.json
//   npm run db:import -- path/to/db.json    another file
//   npm run db:import -- --force            replace accounts already in Postgres
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* no .env file */ }

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--')) || path.join(ROOT, 'data', 'db.json');
const force = args.includes('--force');

if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL first (in a .env file or the environment). See the README.');
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error(`No file at ${file}.`);
  process.exit(1);
}
const src = JSON.parse(fs.readFileSync(file, 'utf8'));
const db = await openDb({ url: process.env.DATABASE_URL });
const existing = Object.keys(db.data.users).length;
if (existing && !force) {
  console.error(`The database already has ${existing} account(s). Run again with --force to replace everything in it with ${file}.`);
  await db.close();
  process.exit(1);
}
Object.assign(db.data, { users: src.users || {}, listings: src.listings || [], sales: src.sales || [], trades: src.trades || [], nextId: src.nextId || 1 });
await db.flushNow();
console.log(`Imported ${Object.keys(db.data.users).length} account(s) from ${file} into ${db.where}.`);
await db.close();
