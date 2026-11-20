// Exact decimal arithmetic on BigInt, fixed scale 1e10. No floating point in money maths.
export const SCALE_DIGITS = 10;
export const S = 10n ** 10n;
const AR = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','٫':'.','٬':'','،':'' };

export function parse(x) {
  if (typeof x === 'bigint') return x;
  if (x === null || x === undefined || x === '') return 0n;
  let s = typeof x === 'number' ? x.toFixed(SCALE_DIGITS) : String(x).trim();
  s = s.replace(/[٠-٩٫٬،]/g, c => AR[c]).replace(/,/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) throw new Error('Invalid number: ' + x);
  let neg = false;
  if (s[0] === '-' || s[0] === '+') { neg = s[0] === '-'; s = s.slice(1); }
  let [i, f = ''] = s.split('.');
  f = (f + '0'.repeat(SCALE_DIGITS)).slice(0, SCALE_DIGITS);
  const v = BigInt(i || '0') * S + BigInt(f);
  return neg ? -v : v;
}
export function isValid(x) { try { parse(x); return true; } catch { return false; } }
// round-half-away-from-zero integer division
function rdiv(n, d) {
  if (d === 0n) throw new Error('Division by zero');
  const neg = (n < 0n) !== (d < 0n);
  const an = n < 0n ? -n : n, ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (ad * 2n);
  return neg ? -q : q;
}
export const add = (a, b) => a + b;
export const sub = (a, b) => a - b;
export const mul = (a, b) => rdiv(a * b, S);
export const div = (a, b) => rdiv(a * S, b);
export const neg = a => -a;
export const abs = a => (a < 0n ? -a : a);
export const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const toNum = a => Number(a) / 1e10;
export const fromNum = n => parse(Number(n));
// round to dp decimals (half away from zero), returns scaled value
export function round(a, dp) {
  const f = 10n ** BigInt(SCALE_DIGITS - dp);
  return rdiv(a, f) * f;
}
// plain string with exactly dp decimals
export function fixed(a, dp = 3) {
  const r = round(a, dp);
  const neg = r < 0n;
  let s = (neg ? -r : r).toString().padStart(SCALE_DIGITS + 1, '0');
  const i = s.slice(0, s.length - SCALE_DIGITS);
  const f = s.slice(s.length - SCALE_DIGITS, s.length - SCALE_DIGITS + dp);
  return (neg && /[1-9]/.test(i + f) ? '-' : '') + i + (dp ? '.' + f : '');
}
// canonical storage string (trimmed zeros)
export function str(a) {
  let s = fixed(a, SCALE_DIGITS);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
export function group(intStr) { return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
export function format(a, dp = 3) {
  const s = fixed(a, dp);
  const neg = s[0] === '-';
  const [i, f] = (neg ? s.slice(1) : s).split('.');
  return (neg ? '-' : '') + group(i) + (f ? '.' + f : '');
}
export const ZERO = 0n, ONE = S;
