// Tiny JSON-file database. Everything lives in memory and is flushed to disk
// shortly after each change (atomic rename), which is plenty for a hobby
// server. Swap for SQLite/Postgres if the player count grows.
import fs from 'node:fs';
import path from 'node:path';

export function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let data = { users: {}, listings: [], sales: [], trades: [], nextId: 1 };
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
    data,
    dirty() { if (!timer) timer = setTimeout(flush, 500); },
    flushNow() { if (timer) { clearTimeout(timer); flush(); } },
    id(prefix) { return prefix + (data.nextId++).toString(36); },
  };
}
