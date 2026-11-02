// Account / inventory storage. Everything lives in memory (D in index.js) and
// is saved shortly after each change, to one of two places:
//
//  - DATABASE_URL set (a Neon or any other Postgres database): table
//    vantage_kv holds one row per account plus rows for the market listings,
//    sales, trades and the id counter. Each save writes only the rows whose
//    JSON changed, inside one transaction.
//  - otherwise: a JSON file (DB_FILE), written atomically.
import fs from 'node:fs';
import path from 'node:path';

const EMPTY = () => ({ users: {}, listings: [], sales: [], trades: [], nextId: 1 });

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
    async close() {},
  };
}

// The rows that make up `data`, by row key.
function rowsOf(data) {
  const out = new Map([['meta', { nextId: data.nextId }], ['listings', data.listings], ['sales', data.sales], ['trades', data.trades]]);
  for (const [id, u] of Object.entries(data.users)) out.set('user:' + id, u);
  return out;
}

async function openPostgres(url, PoolClass) {
  if (!PoolClass) PoolClass = (await import('pg')).default.Pool;
  const local = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
  const pool = new PoolClass({ connectionString: url, ssl: local ? false : { rejectUnauthorized: true }, max: 4, idleTimeoutMillis: 30000 });
  // Neon closes idle connections and suspends the database when nobody is
  // playing; the pool reconnects on the next query, so a dropped idle
  // connection must not crash the server.
  pool.on?.('error', (e) => console.warn('Database connection dropped (reconnects on next save):', e.message));

  await pool.query('CREATE TABLE IF NOT EXISTS vantage_kv (k text PRIMARY KEY, v jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
  const data = EMPTY();
  const saved = new Map();   // row key -> JSON last written
  const res = await pool.query('SELECT k, v FROM vantage_kv');
  for (const { k, v } of res.rows) {
    const val = typeof v === 'string' ? JSON.parse(v) : v;
    if (k === 'meta') data.nextId = val.nextId || 1;
    else if (k === 'listings' || k === 'sales' || k === 'trades') data[k] = val;
    else if (k.startsWith('user:')) data.users[k.slice(5)] = val;
    else continue;
    saved.set(k, JSON.stringify(val));
  }

  async function save() {
    const current = rowsOf(data);
    const changed = [];
    for (const [k, v] of current) { const s = JSON.stringify(v); if (saved.get(k) !== s) changed.push([k, s]); }
    const removed = [...saved.keys()].filter(k => !current.has(k));
    if (!changed.length && !removed.length) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [k, s] of changed) {
        await client.query('INSERT INTO vantage_kv (k, v, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()', [k, s]);
      }
      for (const k of removed) await client.query('DELETE FROM vantage_kv WHERE k = $1', [k]);
      await client.query('COMMIT');
      for (const [k, s] of changed) saved.set(k, s);
      for (const k of removed) saved.delete(k);
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
    async close() { await chain; await pool.end(); },
  };
  return api;
}

function hostOf(url) { try { return new URL(url).host; } catch { return 'database'; } }
