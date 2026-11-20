// WebCrypto helpers: PBKDF2-SHA256 -> AES-256-GCM. Used for the app passcode and encrypted backups.
const te = new TextEncoder(), td = new TextDecoder();
export const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
export const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
export async function deriveKey(pass, salt, iters) {
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iters, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptWithKey(key, text) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(text));
  return { iv: b64(iv), data: b64(ct) };
}
export async function decryptWithKey(key, { iv, data }) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(data));
  return td.decode(pt);
}
export async function encryptPass(text, pass, iters = 600000) {
  const salt = randomBytes(16), key = await deriveKey(pass, salt, iters);
  return { kdf: 'PBKDF2-SHA256', iters, salt: b64(salt), ...(await encryptWithKey(key, text)) };
}
export async function decryptPass(obj, pass) {
  const key = await deriveKey(pass, unb64(obj.salt), obj.iters);
  return decryptWithKey(key, obj);
}
export async function sha256Hex(text) {
  const h = await crypto.subtle.digest('SHA-256', te.encode(text));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
