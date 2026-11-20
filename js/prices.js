// Price/FX adapters. Rules (D-10/D-11): only identified sources, keep source + original date,
// never invent a price. Adapters that cannot run leave existing prices untouched and log why.
import * as D from './dec.js';
import { kuwaitParts } from './calc.js';
import { mutate } from './store.js';

async function getJson(url, ms = 12000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
export const SOURCES = [
  { id: 'cbk-fx', name: 'Central Bank of Kuwait reference rates (via Frankfurter)', covers: 'FX (USD→KWD)', status: 'configured, untested in this build' },
  { id: 'coingecko', name: 'CoinGecko public API (keyless, rate-limited, attribution required)', covers: 'Crypto', status: 'configured, untested in this build' },
  { id: 'us-stocks', name: 'US stocks/ETFs', covers: 'US', status: 'no source approved yet (terms review pending)' },
  { id: 'kw-stocks', name: 'Kuwait stocks / BAITAKREIT', covers: 'KW', status: 'no permitted automated source found (D-10 fallback applies)' },
];

export async function refreshAll(state, now = new Date()) {
  const log = []; const today = kuwaitParts(now).date; const fetchedAt = now.toISOString();
  // FX: USD -> KWD
  try {
    const j = await getJson('https://api.frankfurter.dev/v2/rate/USD/KWD?providers=CBKKW');
    if (!(j && j.rate > 0 && j.date)) throw new Error('unexpected response');
    const rate = D.str(D.parse(j.rate));
    mutate(s => { s.fx.USD = { rate, date: j.date, source: 'Central Bank of Kuwait via Frankfurter', fetchedAt }; });
    log.push({ id: 'USD/KWD', ok: true, msg: `${rate} (${j.date})` });
  } catch (e) { log.push({ id: 'USD/KWD', ok: false, msg: String(e.message || e) }); }
  // Crypto
  const crypto = state.instruments.filter(i => i.type === 'crypto' && i.cgId);
  if (crypto.length) {
    try {
      const ids = [...new Set(crypto.map(i => i.cgId))].join(',');
      const j = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_last_updated_at=true`);
      for (const i of crypto) {
        const r = j[i.cgId]; if (!r || !(r.usd > 0)) { log.push({ id: i.symbol, ok: false, msg: 'no price in response' }); continue; }
        const pd = r.last_updated_at ? kuwaitParts(new Date(r.last_updated_at * 1000)).date : null;
        mutate(s => { s.prices[i.id] = { price: D.str(D.parse(r.usd)), ccy: 'USD', source: 'CoinGecko', priceDate: pd, priceTime: r.last_updated_at ? new Date(r.last_updated_at * 1000).toISOString() : null, fetchedAt, kind: 'unknown' }; });
        log.push({ id: i.symbol, ok: true, msg: `${r.usd} USD` });
      }
    } catch (e) { for (const i of crypto) log.push({ id: i.symbol, ok: false, msg: String(e.message || e) }); }
  }
  // Instruments with no adapter
  for (const i of state.instruments) {
    if (i.type !== 'crypto' && !state.prices[i.id]) log.push({ id: i.symbol, ok: false, msg: 'no automated source' });
    else if (i.type !== 'crypto') log.push({ id: i.symbol, ok: false, msg: 'no automated source (kept last price)' });
  }
  mutate(s => { s.settings.lastPriceRefresh = fetchedAt; s.priceLog = [{ at: fetchedAt, log }, ...s.priceLog].slice(0, 20); });
  return log;
}
