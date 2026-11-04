// WebSocket client: request/response RPC, server events, auto-reconnect and
// session resume.
const TOKEN_KEY = 'vantage.token';

function defaultUrl() {
  const env = import.meta.env?.VITE_SERVER_URL;
  if (env) return env;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

class Net {
  constructor() {
    this.ws = null;
    this.seq = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.status = 'offline'; // offline | connecting | online
    this.user = null;
    this.wantConnected = false;
  }

  on(ev, fn) { if (!this.handlers.has(ev)) this.handlers.set(ev, new Set()); this.handlers.get(ev).add(fn); return () => this.handlers.get(ev).delete(fn); }
  // one failing handler must not stop the others (or the socket) from working
  emit(ev, data) { for (const fn of this.handlers.get(ev) || []) { try { fn(data); } catch (e) { console.error(`Handler for "${ev}" failed:`, e); } } }
  setStatus(s) { this.status = s; this.emit('status', s); }

  connect(url = defaultUrl()) {
    if (this.ws && this.ws.readyState <= 1) return this.ready;
    this.wantConnected = true;
    this.setStatus('connecting');
    this.ready = new Promise((resolve, reject) => {
      let opened = false;
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => { opened = true; this.setStatus('online'); resolve(); };
      ws.onmessage = (e) => this.onMessage(e.data);
      ws.onclose = () => {
        const wasOpen = opened;
        this.setStatus('offline');
        for (const [, p] of this.pending) p.reject(new Error('Disconnected'));
        this.pending.clear();
        if (!wasOpen) reject(new Error('Server unreachable'));
        this.emit('disconnected');
        if (this.wantConnected && wasOpen) setTimeout(() => this.reconnect(), 2000);
      };
    });
    return this.ready;
  }

  async reconnect() {
    try { await this.connect(); if (this.token()) await this.resume(); } catch { setTimeout(() => this.reconnect(), 5000); }
  }

  onMessage(raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.re != null) {
      const p = this.pending.get(m.re);
      if (!p) return;
      this.pending.delete(m.re);
      if (m.error) p.resolve({ error: m.error, ...m.data }); else p.resolve(m.data || {});
    } else if (m.ev) this.emit(m.ev, m.data);
  }

  // Resolves with the response data, or { error } on a server-side failure.
  rpc(type, data = {}) {
    if (!this.ws || this.ws.readyState !== 1) return Promise.resolve({ error: 'Not connected to the server' });
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, type, data }));
    }).catch(e => ({ error: e.message }));
  }

  // Fire-and-forget (used for high-rate match traffic).
  send(type, data) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type, data })); }

  token() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
  setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } }

  async login(name, password, register = false) {
    await this.connect();
    const res = await this.rpc(register ? 'auth.register' : 'auth.login', { name, password });
    if (!res.error) { this.setToken(res.token); this.user = res.user; this.emit('auth', res); }
    return res;
  }
  async resume() {
    const t = this.token();
    if (!t) return { error: 'No session' };
    const res = await this.rpc('auth.resume', { token: t });
    if (res.error) this.setToken(null); else { this.user = res.user; this.emit('auth', res); }
    return res;
  }
  async logout() {
    await this.rpc('auth.logout', {});
    this.setToken(null); this.user = null; this.wantConnected = false;
    this.ws?.close();
    this.emit('auth', null);
  }
}

export const net = new Net();
