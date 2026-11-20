// Persistence: IndexedDB (whole state doc) with optional passcode encryption at rest.
import { deriveKey, encryptWithKey, decryptWithKey, randomBytes, b64, unb64 } from './crypto.js';
export const SCHEMA = 1;
const DB = 'mizan', ST = 'kv', ITERS = 310000;
const mem = new Map();           // fallback when IndexedDB is unavailable
export const app = { state: null, key: null, storageOk: true, persisted: false, raw: null, listeners: new Set() };

let dbp;
function open() {
  return dbp ??= new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function get(k) {
  try { const db = await open(); return await new Promise((res, rej) => { const q = db.transaction(ST).objectStore(ST).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
  catch { app.storageOk = false; return mem.get(k); }
}
async function put(k, v) {
  try { const db = await open(); await new Promise((res, rej) => { const tx = db.transaction(ST, 'readwrite'); tx.objectStore(ST).put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
  catch { app.storageOk = false; mem.set(k, v); }
}
async function del(k) { try { const db = await open(); await new Promise(r => { const tx = db.transaction(ST, 'readwrite'); tx.objectStore(ST).delete(k); tx.oncomplete = r; }); } catch { mem.delete(k); } }

export function emptyState() {
  return {
    schema: SCHEMA, createdAt: new Date().toISOString(),
    settings: { lang: 'en', theme: 'auto', baseCcy: 'KWD', sampleMode: false, trackingStart: null, lastBackup: null, lastPriceRefresh: null },
    portfolios: [{ id: 'p1', name: 'Main' }], instruments: [], txs: [], prices: {}, fx: {}, dividends: [],
    cashAccounts: [], properties: [], liabilities: [], cashflow: [], recurring: [], goals: [],
    snapshots: [], missingDays: [], audit: [], priceLog: [],
  };
}
export function migrate(s) {
  const e = emptyState();
  const out = { ...e, ...s, settings: { ...e.settings, ...(s.settings || {}) } };
  for (const k of Object.keys(e)) if (out[k] === undefined) out[k] = e[k];
  out.schema = SCHEMA; return out;
}
export const uid = () => (crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));

export async function init() {
  try { app.persisted = !!(navigator.storage && navigator.storage.persist && await navigator.storage.persist()); } catch { /* ignore */ }
  const raw = await get('state');
  if (raw && raw.enc) { app.raw = raw; return { locked: true }; }
  app.state = migrate(raw || emptyState());
  return { locked: false };
}
export async function hasPasscode() { return !!(await get('keymeta')); }
export async function unlock(pass) {
  const meta = await get('keymeta'); if (!meta) throw new Error('no key');
  const key = await deriveKey(pass, unb64(meta.salt), meta.iters);
  const text = await decryptWithKey(key, app.raw);            // throws on wrong passcode
  app.key = key; app.state = migrate(JSON.parse(text)); app.raw = null;
}
export async function lockNow() { if (!app.key) return false; await saveNow(); app.raw = await get('state'); app.key = null; app.state = null; return true; }
export async function setPasscode(pass) {
  const salt = randomBytes(16);
  await put('keymeta', { salt: b64(salt), iters: ITERS });
  app.key = await deriveKey(pass, salt, ITERS); await saveNow();
}
export async function removePasscode() { app.key = null; await del('keymeta'); await saveNow(); }

let timer = null;
export function save() { clearTimeout(timer); timer = setTimeout(saveNow, 200); }
export async function saveNow() {
  clearTimeout(timer); if (!app.state) return;
  const text = JSON.stringify(app.state);
  if (app.key) await put('state', { enc: true, ...(await encryptWithKey(app.key, text)) });
  else await put('state', JSON.parse(text));
}
export function onChange(fn) { app.listeners.add(fn); }
/** Mutate state, add an audit entry, persist, notify views. */
export function mutate(fn, audit) {
  fn(app.state);
  if (audit) { app.state.audit.push({ ts: Date.now(), ...audit }); if (app.state.audit.length > 2000) app.state.audit.splice(0, 500); }
  save(); app.listeners.forEach(f => f());
}
export async function replaceState(next, keepPrev = true) {
  if (keepPrev && app.state) await put('state_prev', JSON.parse(JSON.stringify(app.state)));
  app.state = migrate(next); await saveNow(); app.listeners.forEach(f => f());
}
export async function wipeAll() { await del('state'); await del('keymeta'); app.key = null; app.state = migrate(emptyState()); await saveNow(); app.listeners.forEach(f => f()); }
