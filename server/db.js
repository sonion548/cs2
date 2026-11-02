// Account / inventory storage. Everything lives in memory (D in index.js) and
// is saved shortly after each change, to one of two places:
//
//  - DATABASE_URL set (a Neon or any other Postgres database):
//      vantage_kv     one row per account, plus rows for market listings,
//                     trades and the id counter. Each save writes only the
//                     rows whose JSON changed, inside one transaction.
//      vantage_sales  market sales, append-only (price history), so a sale
//                     inserts one row instead of rewriting the whole history.
//  - otherwise: a JSON file (DB_FILE), written atomically.
import fs from 'node:fs';
import path from 'node:path';

const EMPTY = () => ({ users: {}, listings: [], sales: [], trades: [], nextId: 1 });
const SALES_IN_MEMORY = 50000;   // must match the cap in index.js

// opts: { file, url, Pool }  (Pool lets tests pass a stand-in for pg's Pool)
export async function openDb({ file, url, Pool } = {}) {
  return url ? openPostgres(url, Pool) : openFile(file);
}

function openFile(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let data = EMPTY();
  if (fs.existsSync(file)) {
    try { data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (e) { console.error('DB load failed, starting fresh:', e.message); }
  }
  let timer = null;
  const flush = () => {
    timer = null;
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  };
  return {
    data, kind: 'file', where: file,
    dirty() { if (!timer) timer = setTimeout(flush, 500); },
    async flushNow() { if (timer) { clearTimeout(timer); flush(); } },
    id(prefix) { return prefix + (data.nextId++).toString(36); },
    async clearSales() { data.sales.length = 0; },
    async close() {},
  };
}

// Turns a connection string as Neon shows it into a pg Pool config.
// Neon's strings end in "?sslmode=require&channel_binding=require". pg treats
// sslmode=require as full certificate checking but prints a long deprecation
// warning about it, so we take those options out of the URL and set the same
// behaviour explicitly: verified TLS, and SCRAM channel binding when asked for.
export function pgConfig(url) {
  const u = new URL(url);
  const sslmode = u.searchParams.get('sslmode');
  const binding = u.searchParams.get('channel_binding');
  u.searchParams.delete('sslmode');
  u.searchParams.delete('channel_binding');
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname);
  const ssl = sslmode === 'disable' || (local && !sslmode) ? false
    : sslmode === 'no-verify' ? { rejectUnauthorized: false }
    : { rejectUnauthorized: true };
  return {
    connectionString: u.toString(), ssl,
    enableChannelBinding: !!ssl && (binding === 'require' || binding === 'prefer'),
    max: 4, idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000,
  };
}

// The vantage_kv rows that make up `data`, by row key (sales live in their own table).
function rowsOf(data) {
  const out = new Map([['meta', { nextId: data.nextId }], ['listings', data.listings], ['trades', data.trades]]);
  for (const [id, u] of Object.entries(data.users)) out.set('user:' + id, u);
  return out;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function openPostgres(url, PoolClass) {
  if (!PoolClass) PoolClass = (await import('pg')).default.Pool;
  const pool = new PoolClass(pgConfig(url));
  // Neon closes idle connections and suspends the database when nobody is
  // playing; the pool reconnects on the next query, so a dropped idle
  // connection must not crash the server.
  pool.on?.('error', (e) => console.warn('Database connection dropped (reconnects on next save):', e.message));

  // A suspended Neon database takes a moment to wake up, and a fresh deploy can
  // start before the network is ready: keep trying for about a minute.
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (e) {
      if (attempt >= 8) throw new Error(`Could not connect to the database at ${hostOf(url)}: ${e.message}`);
      const wait = Math.min(15000, 1000 * 2 ** (attempt - 1));
      console.warn(`Database not reachable yet (${e.message}); retrying in ${wait / 1000}s…`);
      await sleep(wait);
    }
  }

  await pool.query('CREATE TABLE IF NOT EXISTS vantage_kv (k text PRIMARY KEY, v jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
  await pool.query(`CREATE TABLE IF NOT EXISTS vantage_sales (
    id bigserial PRIMARY KEY, def_id text NOT NULL, price integer NOT NULL, float double precision, t bigint NOT NULL)`);
  await pool.query('CREATE INDEX IF NOT EXISTS vantage_sales_def ON vantage_sales (def_id, t)');

  const data = EMPTY();
  const saved = new Map();      // kv row key -> JSON last written
  const savedSales = new WeakSet();
  const res = await pool.query('SELECT k, v FROM vantage_kv');
  let legacySales = null;
  for (const { k, v } of res.rows) {
    const val = typeof v === 'string' ? JSON.parse(v) : v;
    if (k === 'meta') data.nextId = val.nextId || 1;
    else if (k === 'listings' || k === 'trades') data[k] = val;
    else if (k === 'sales') { legacySales = val; continue; }   // older layout: migrated below
    else if (k.startsWith('user:')) data.users[k.slice(5)] = val;
    else continue;
    saved.set(k, JSON.stringify(val));
  }
  if (legacySales?.length) {
    await insertSales(pool, legacySales);
    console.log(`Moved ${legacySales.length} market sales into vantage_sales.`);
  }
  if (legacySales) await pool.query("DELETE FROM vantage_kv WHERE k = 'sales'");
  const sres = await pool.query('SELECT def_id, price, float, t FROM (SELECT * FROM vantage_sales ORDER BY id DESC LIMIT $1) s ORDER BY id', [SALES_IN_MEMORY]);
  for (const r of sres.rows) {
    const s = { defId: r.def_id, price: r.price, float: r.float, t: Number(r.t) };
    data.sales.push(s); savedSales.add(s);
  }

  async function save() {
    const current = rowsOf(data);
    const changed = [];
    for (const [k, v] of current) { const s = JSON.stringify(v); if (saved.get(k) !== s) changed.push([k, s]); }
    const removed = [...saved.keys()].filter(k => !current.has(k));
    const newSales = data.sales.filter(s => !savedSales.has(s));
    if (!changed.length && !removed.length && !newSales.length) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [k, s] of changed) {
        await client.query('INSERT INTO vantage_kv (k, v, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()', [k, s]);
      }
      for (const k of removed) await client.query('DELETE FROM vantage_kv WHERE k = $1', [k]);
      await insertSales(client, newSales);
      await client.query('COMMIT');
      for (const [k, s] of changed) saved.set(k, s);
      for (const k of removed) saved.delete(k);
      for (const s of newSales) savedSales.add(s);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Saving to the database failed, retrying in 5 s:', e.message);
      setTimeout(() => api.dirty(), 5000);
    } finally {
      client.release();
    }
  }

  // saves run one after another; each one writes whatever changed by then
  let timer = null, chain = Promise.resolve();
  const flush = () => { timer = null; chain = chain.then(save, save); return chain; };
  const api = {
    data, kind: 'postgres', where: hostOf(url),
    dirty() { if (!timer) timer = setTimeout(flush, 800); },
    async flushNow() { if (timer) clearTimeout(timer); await flush(); },
    id(prefix) { return prefix + (data.nextId++).toString(36); },
    async clearSales() { await pool.query('TRUNCATE vantage_sales'); data.sales.length = 0; },
    async counts() {
      const r = await pool.query("SELECT (SELECT count(*) FROM vantage_kv WHERE k LIKE 'user:%') AS users, (SELECT count(*) FROM vantage_sales) AS sales");
      return { users: Number(r.rows[0].users), sales: Number(r.rows[0].sales), listings: data.listings.length, trades: data.trades.length };
    },
    async close() { await chain; await pool.end(); },
  };
  return api;
}

// Multi-row insert in chunks (a sale is ~4 values; 500 rows per statement).
async function insertSales(q, sales) {
  for (let i = 0; i < sales.length; i += 500) {
    const chunk = sales.slice(i, i + 500);
    const vals = [], params = [];
    chunk.forEach((s, j) => {
      vals.push(`($${j * 4 + 1}, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4})`);
      params.push(String(s.defId), Math.round(s.price) | 0, s.float ?? null, Math.round(s.t) || Date.now());
    });
    await q.query(`INSERT INTO vantage_sales (def_id, price, float, t) VALUES ${vals.join(',')}`, params);
  }
}

function hostOf(url) { try { return new URL(url).host; } catch { return 'database'; } }
