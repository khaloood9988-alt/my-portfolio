// Backup & restore: plain JSON or passphrase-encrypted (AES-256-GCM). Files are checked before restore.
import { app, mutate, replaceState, SCHEMA } from './store.js';
import { encryptPass, decryptPass, sha256Hex } from './crypto.js';

export async function makeBackup(passphrase) {
  const payload = JSON.stringify(app.state);
  const meta = { format: 'mizan-backup', version: 1, schema: SCHEMA, createdAt: new Date().toISOString(), sha256: await sha256Hex(payload) };
  if (passphrase) return JSON.stringify({ ...meta, enc: true, ...(await encryptPass(payload, passphrase)) });
  return JSON.stringify({ ...meta, enc: false, payload });
}
export function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export async function exportBackup(passphrase) {
  const text = await makeBackup(passphrase);
  const name = `mizan-backup-${new Date().toISOString().slice(0, 10)}${passphrase ? '-encrypted' : ''}.json`;
  download(name, text);
  mutate(s => { s.settings.lastBackup = new Date().toISOString(); }, { action: 'backup', entity: 'backup' });
  return name;
}
/** Parse + verify a backup file. Returns {state, summary} or throws. Does not change anything. */
export async function readBackup(text, passphrase) {
  let o; try { o = JSON.parse(text); } catch { throw new Error('notjson'); }
  if (o.format !== 'mizan-backup') throw new Error('format');
  let payload;
  if (o.enc) { if (!passphrase) throw new Error('needpass'); try { payload = await decryptPass(o, passphrase); } catch { throw new Error('badpass'); } }
  else payload = o.payload;
  if (o.sha256 && (await sha256Hex(payload)) !== o.sha256) throw new Error('checksum');
  const state = JSON.parse(payload);
  if (!state || !Array.isArray(state.txs) || !state.settings) throw new Error('shape');
  return { state, summary: { txs: state.txs.length, instruments: state.instruments.length, snapshots: state.snapshots.length, createdAt: o.createdAt, enc: !!o.enc } };
}
export async function restore(state) { await replaceState(state, true); }
