// Financial engine: positions (weighted-average cost incl. fees), valuation, net worth,
// daily Snapshot + missed-day rule (D-11), dividend forecast (D-10 A5). Pure functions, no DOM.
import * as D from './dec.js';

export const SNAPSHOT_HOUR = 19;           // 19:00 Asia/Kuwait
export const DELAY_TOLERANCE_MIN = 15;
export const STALE_DAYS = { KW: 7, US: 4, CRYPTO: 1, OTHER: 4 };

export function kuwaitParts(now) {
  const t = new Date(now.getTime() + 3 * 3600e3);        // Kuwait is UTC+3, no DST
  return { date: t.toISOString().slice(0, 10), hour: t.getUTCHours(), minute: t.getUTCMinutes() };
}
export function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }
export function addDays(date, n) { return new Date(Date.parse(date + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }

export function fxRate(state, ccy) {
  if (ccy === state.settings.baseCcy) return D.ONE;
  const r = state.fx[ccy];
  return r ? D.parse(r.rate) : null;
}
const sortTx = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.ts || 0) - (b.ts || 0));

// ---- positions ------------------------------------------------------------
export function positions(state, asOf = '9999-12-31') {
  const pos = {};
  const txs = state.txs.filter(t => t.instId && t.date <= asOf).sort(sortTx);
  for (const t of txs) {
    const p = (pos[t.instId] ??= { qty: 0n, cost: 0n, realized: 0n, fees: 0n, bought: 0n, issues: [] });
    const q = D.parse(t.qty), pr = D.parse(t.price), fee = D.parse(t.fee);
    if (t.type === 'buy') {
      p.qty += q; p.cost += D.mul(q, pr) + fee; p.fees += fee; p.bought += D.mul(q, pr) + fee;
    } else if (t.type === 'sell') {
      let sq = q;
      if (sq > p.qty) { p.issues.push('oversell:' + t.id); sq = p.qty; }
      const costOut = sq === p.qty ? p.cost : (p.qty === 0n ? 0n : D.div(D.mul(p.cost, sq), p.qty));
      p.realized += D.mul(sq, pr) - fee - costOut;
      p.cost -= costOut; p.qty -= sq; p.fees += fee;
    } else if (t.type === 'split') {            // ratio = new shares per old share; total cost unchanged
      p.qty = D.mul(p.qty, D.parse(t.ratio));
    } else if (t.type === 'bonus') {
      p.qty += q;                                 // bonus shares: cost unchanged, average falls
    }
  }
  for (const p of Object.values(pos)) p.avg = p.qty > 0n ? D.div(p.cost, p.qty) : 0n;
  return pos;
}
export function qtyAt(state, instId, date) { return (positions(state, date)[instId]?.qty) ?? 0n; }

// ---- price status ---------------------------------------------------------
export function priceStatus(state, inst, now) {
  const pr = state.prices[inst.id];
  if (!pr) return { status: 'cost' };
  const today = kuwaitParts(now).date;
  const age = pr.priceDate ? daysBetween(pr.priceDate, today) : null;
  const limit = STALE_DAYS[inst.market] ?? STALE_DAYS.OTHER;
  const status = pr.kind === 'sample' ? 'sample' : (age === null ? 'unknown' : age > limit ? 'stale' : 'ok');
  return { status, age, pr };
}

// ---- valuation ------------------------------------------------------------
export function valuation(state, now = new Date()) {
  const pos = positions(state);
  const rows = []; const issues = [];
  let investments = 0n, marketValue = 0n, marketCost = 0n, allCost = 0n, realized = 0n;
  const counts = { ok: 0, stale: 0, cost: 0, sample: 0, unknown: 0 };
  for (const inst of state.instruments) {
    const p = pos[inst.id]; if (!p) continue;
    const fx = fxRate(state, inst.ccy);
    if (fx === null) { if (p.qty > 0n) issues.push('nofx:' + inst.ccy); continue; }
    realized += D.mul(p.realized, fx);
    if (p.issues.length) issues.push(...p.issues);
    if (p.qty <= 0n) continue;
    const ps = priceStatus(state, inst, now);
    const isMarket = ps.status !== 'cost';
    const price = isMarket ? D.parse(ps.pr.price) : null;
    const valueLocal = isMarket ? D.mul(p.qty, price) : p.cost;
    const valueKWD = D.mul(valueLocal, fx), costKWD = D.mul(p.cost, fx);
    investments += valueKWD; allCost += costKWD;
    if (isMarket) { marketValue += valueKWD; marketCost += costKWD; }
    counts[ps.status] = (counts[ps.status] || 0) + 1;
    rows.push({ inst, qty: p.qty, avg: p.avg, costLocal: p.cost, valueLocal, valueKWD, costKWD,
      price, status: ps.status, age: ps.age, priceRec: ps.pr || null,
      unrealizedKWD: isMarket ? valueKWD - costKWD : null,
      unrealizedPct: isMarket && costKWD > 0n ? D.toNum(D.div(valueKWD - costKWD, costKWD)) * 100 : null,
      realizedKWD: D.mul(p.realized, fx), portfolioId: inst.portfolioId });
  }
  const unrealized = marketValue - marketCost;
  return { rows, investments, marketValue, marketCost, allCost, unrealized, realized, counts, issues };
}

export function netWorth(state, val) {
  let cash = 0n, realEstate = 0n, liabilities = 0n; const issues = [];
  for (const a of state.cashAccounts) { const fx = fxRate(state, a.ccy); if (fx === null) { issues.push('nofx:' + a.ccy); continue; } cash += D.mul(D.parse(a.balance), fx); }
  for (const p of state.properties) { const fx = fxRate(state, p.ccy); if (fx === null) { issues.push('nofx:' + p.ccy); continue; } realEstate += D.mul(D.parse(p.value), fx); }
  for (const l of state.liabilities) { const fx = fxRate(state, l.ccy); if (fx === null) { issues.push('nofx:' + l.ccy); continue; } liabilities += D.mul(D.parse(l.balance), fx); }
  const total = val.investments + cash + realEstate - liabilities;
  return { investments: val.investments, cash, realEstate, liabilities, total, issues };
}

export function allocation(state, val, nw) {
  const m = {};
  for (const r of val.rows) m[r.inst.type] = (m[r.inst.type] || 0n) + r.valueKWD;
  if (nw.cash > 0n) m.cash = nw.cash;
  if (nw.realEstate > 0n) m.realestate = nw.realEstate;
  return Object.entries(m).map(([k, v]) => ({ key: k, value: v })).sort((a, b) => (b.value > a.value ? 1 : -1));
}

// ---- external flows (deposits/withdrawals) --------------------------------
export function cumulativeFlows(state, upToDate = '9999-12-31') {
  let s = 0n;
  for (const t of state.txs) {
    if ((t.type !== 'deposit' && t.type !== 'withdraw') || t.date > upToDate) continue;
    const fx = t.fx ? D.parse(t.fx) : fxRate(state, t.ccy || state.settings.baseCcy);
    if (fx === null) continue;
    const v = D.mul(D.parse(t.amount), fx);
    s += t.type === 'deposit' ? v : -v;
  }
  return s;
}

// ---- Snapshot + missed-day rule (D-11) -----------------------------------
export function buildSnapshot(state, now, date) {
  const val = valuation(state, now), nw = netWorth(state, val);
  const sched = date + 'T19:00:00+03:00';
  const delayMin = Math.round((now.getTime() - Date.parse(sched)) / 60000);
  const fxUsed = {}; for (const [c, r] of Object.entries(state.fx)) fxUsed[c] = { rate: r.rate, date: r.date, source: r.source };
  return {
    date, scheduledAt: sched, executedAt: now.toISOString(), delayed: delayMin > DELAY_TOLERANCE_MIN, delayMin,
    netWorth: D.str(nw.total), investments: D.str(nw.investments), cash: D.str(nw.cash),
    realEstate: D.str(nw.realEstate), liabilities: D.str(nw.liabilities), cost: D.str(val.allCost),
    cumFlow: D.str(cumulativeFlows(state, date)), priceCounts: val.counts, fxUsed,
    sample: !!state.settings.sampleMode, final: true,
  };
}
/** Run on app open. Creates at most one Snapshot for today's Kuwait date (after 19:00).
 *  Earlier dates without a Snapshot are marked missing — never back-filled with later prices. */
export function runDailyCatchUp(state, now = new Date()) {
  const kw = kuwaitParts(now), today = kw.date, out = { created: null, missing: [] };
  const start = state.settings.trackingStart ||= today;
  const have = new Set(state.snapshots.map(s => s.date));
  const gone = new Set(state.missingDays);
  for (let d = start; d < today; d = addDays(d, 1)) {
    if (!have.has(d) && !gone.has(d)) { state.missingDays.push(d); out.missing.push(d); }
  }
  if (kw.hour >= SNAPSHOT_HOUR && !have.has(today)) {
    const s = buildSnapshot(state, now, today);
    state.snapshots.push(s); state.snapshots.sort((a, b) => (a.date < b.date ? -1 : 1));
    out.created = s;
  }
  return out;
}
/** Daily change excluding external deposits/withdrawals. */
export function changeBetween(a, b) {
  if (!a || !b) return null;
  const flow = D.parse(b.cumFlow) - D.parse(a.cumFlow);
  const mk = key => {
    const d = D.parse(b[key]) - D.parse(a[key]) - (key === 'cash' || key === 'realEstate' || key === 'liabilities' ? 0n : flow);
    const base = D.parse(a[key]);
    return { amount: d, pct: base > 0n ? D.toNum(D.div(d, base)) * 100 : null };
  };
  return { netWorth: mk('netWorth'), investments: mk('investments'), flow, from: a.date, to: b.date, gap: daysBetween(a.date, b.date) > 1 };
}

// ---- income / dividends ---------------------------------------------------
/** Forecast distributions (computed, never stored, never counted as received). */
export function forecastDividends(state, today, months = 6) {
  const out = [];
  for (const inst of state.instruments) {
    if (!inst.dist) continue;
    const rate = D.parse(inst.dist.annualRate), nominal = D.parse(inst.dist.nominal);
    const perUnit = D.div(D.mul(nominal, rate), D.parse(12));
    const [y0, m0] = today.split('-').map(Number);
    for (let k = 0; k <= months; k++) {
      const mi = m0 - 1 + k, y = y0 + Math.floor(mi / 12), m = (mi % 12) + 1;
      const ex = `${y}-${String(m).padStart(2, '0')}-${String(inst.dist.exDay).padStart(2, '0')}`;
      if (ex < today) continue;
      const pm = m === 12 ? 1 : m + 1, py = m === 12 ? y + 1 : y;
      const pay = `${py}-${String(pm).padStart(2, '0')}-${String(inst.dist.payDay).padStart(2, '0')}`;
      if (state.dividends.some(d => d.instId === inst.id && d.exDate.slice(0, 7) === ex.slice(0, 7))) continue;
      const qty = qtyAt(state, inst.id, ex); if (qty <= 0n) continue;
      out.push({ instId: inst.id, exDate: ex, payDate: pay, perUnit: D.str(perUnit), qty: D.str(qty),
        amount: D.str(D.round(D.mul(qty, perUnit), 3)), ccy: inst.ccy, status: 'forecast' });
    }
  }
  return out.sort((a, b) => (a.payDate < b.payDate ? -1 : 1));
}
export function incomeSummary(state, today) {
  const byMonth = {}; let ytd = 0n, total = 0n, announced = 0n;
  const y = today.slice(0, 4);
  for (const d of state.dividends) {
    const fx = fxRate(state, d.ccy); if (fx === null) continue;
    const v = D.mul(D.parse(d.amount), fx);
    if (d.status === 'received') {
      const m = (d.receivedDate || d.payDate).slice(0, 7);
      byMonth[m] = (byMonth[m] || 0n) + v; total += v;
      if (m.startsWith(y)) ytd += v;
    } else if (d.status === 'announced') announced += v;
  }
  let forecast = 0n;
  for (const f of forecastDividends(state, today, 11)) { const fx = fxRate(state, f.ccy); if (fx !== null) forecast += D.mul(D.parse(f.amount), fx); }
  return { byMonth, ytd, total, announced, forecast12m: forecast };
}

// ---- cash flow ------------------------------------------------------------
export function cashflowSummary(state, month) {
  let inc = 0n, exp = 0n;
  for (const e of state.cashflow) {
    if (!e.date.startsWith(month)) continue;
    const fx = fxRate(state, e.ccy); if (fx === null) continue;
    const v = D.mul(D.parse(e.amount), fx);
    if (e.type === 'income') inc += v; else exp += v;
  }
  return { income: inc, expense: exp, net: inc - exp };
}
export function propertyStats(state, prop, today) {
  const fx = fxRate(state, prop.ccy) ?? D.ONE;
  const value = D.mul(D.parse(prop.value), fx);
  const debt = state.liabilities.filter(l => l.propertyId === prop.id).reduce((s, l) => s + D.mul(D.parse(l.balance), fxRate(state, l.ccy) ?? D.ONE), 0n);
  const since = addDays(today, -365);
  let inc = 0n, exp = 0n;
  for (const e of state.cashflow) {
    if (e.propertyId !== prop.id || e.date < since) continue;
    const v = D.mul(D.parse(e.amount), fxRate(state, e.ccy) ?? D.ONE);
    if (e.type === 'income') inc += v; else exp += v;
  }
  const net = inc - exp;
  const cost = D.mul(D.parse(prop.cost || 0), fx);
  return { value, debt, equity: value - debt, income12: inc, expense12: exp, net12: net,
    yieldPct: value > 0n ? D.toNum(D.div(net, value)) * 100 : null,
    gainPct: cost > 0n ? D.toNum(D.div(value - cost, cost)) * 100 : null };
}

// ---- investment summary per market (Home dashboard) ------------------------
export const MARKETS = ['KW', 'US', 'CRYPTO'];
const flowKWD = (state, t) => { const fx = t.fx ? D.parse(t.fx) : fxRate(state, t.ccy || state.settings.baseCcy); return fx === null ? null : D.mul(D.parse(t.amount), fx); };
/** Methodology (labelled in the UI):
 *  P/L = realized (net of fees) + unrealized (priced holdings only) + dividends received.
 *  Return % = P/L / purchases (qty*price+fee of every buy) of the same measurable holdings.
 *  Holdings with no market price are valued at cost (estimate): they add no P/L and are left out of the return base.
 *  Deposits/withdrawals are informational (optionally tagged to a market) and never used as the P/L base. */
export function investmentSummary(state, now = new Date()) {
  const pos = positions(state);
  const mk = () => ({ deposits: 0n, withdrawals: 0n, value: 0n, cost: 0n, realized: 0n, unrealized: 0n, dividends: 0n, fees: 0n, bought: 0n, base: 0n, estimateCount: 0, count: 0, issues: [] });
  const out = { total: mk(), markets: { KW: mk(), US: mk(), CRYPTO: mk(), OTHER: mk() }, untaggedDeposits: 0n, untaggedWithdrawals: 0n };
  const keyOf = inst => (out.markets[inst.market] ? inst.market : 'OTHER');
  const measurable = {};
  for (const inst of state.instruments) {
    const p = pos[inst.id]; if (!p) continue;
    const fx = fxRate(state, inst.ccy); const m = out.markets[keyOf(inst)];
    if (fx === null) { if (p.qty > 0n || p.bought > 0n) m.issues.push('nofx:' + inst.ccy); continue; }
    const ps = p.qty > 0n ? priceStatus(state, inst, now) : { status: 'closed' };
    const priced = ps.status !== 'cost' && ps.status !== 'closed';
    measurable[inst.id] = p.qty === 0n || priced;
    m.fees += D.mul(p.fees, fx);
    m.realized += D.mul(p.realized, fx);
    if (p.qty > 0n) {
      m.count++; m.cost += D.mul(p.cost, fx);
      if (priced) { const v = D.mul(D.mul(p.qty, D.parse(ps.pr.price)), fx); m.value += v; m.unrealized += v - D.mul(p.cost, fx); }
      else { m.value += D.mul(p.cost, fx); m.estimateCount++; }
    }
    if (measurable[inst.id]) m.base += D.mul(p.bought, fx);
    m.bought += D.mul(p.bought, fx);
  }
  for (const d of state.dividends) {
    if (d.status !== 'received') continue;
    const inst = state.instruments.find(i => i.id === d.instId); if (!inst || !measurable[inst.id]) continue;
    const fx = fxRate(state, d.ccy); if (fx === null) continue;
    out.markets[keyOf(inst)].dividends += D.mul(D.parse(d.amount), fx);
  }
  for (const t of state.txs) {
    if (t.type !== 'deposit' && t.type !== 'withdraw') continue;
    const v = flowKWD(state, t); if (v === null) continue;
    const target = t.market && out.markets[t.market] ? out.markets[t.market] : null;
    if (t.type === 'deposit') { out.total.deposits += v; if (target) target.deposits += v; else out.untaggedDeposits += v; }
    else { out.total.withdrawals += v; if (target) target.withdrawals += v; else out.untaggedWithdrawals += v; }
  }
  for (const m of Object.values(out.markets)) {
    m.pl = m.realized + m.unrealized + m.dividends;
    m.retPct = m.base > 0n ? D.toNum(D.div(m.pl, m.base)) * 100 : null;
    for (const k of ['value', 'cost', 'realized', 'unrealized', 'dividends', 'fees', 'bought', 'base', 'estimateCount', 'count']) out.total[k] += m[k];
    out.total.issues.push(...m.issues);
  }
  const T = out.total; T.pl = T.realized + T.unrealized + T.dividends; T.retPct = T.base > 0n ? D.toNum(D.div(T.pl, T.base)) * 100 : null;
  return out;
}
/** Latest successful automatic price/FX update (never counts sample data or failed refreshes). */
export function lastPriceUpdate(state) {
  let best = null;
  for (const p of Object.values(state.prices)) if (p.kind !== 'sample' && p.fetchedAt && (!best || p.fetchedAt > best)) best = p.fetchedAt;
  for (const f of Object.values(state.fx)) if (f.source && !/sample/i.test(f.source) && f.fetchedAt && (!best || f.fetchedAt > best)) best = f.fetchedAt;
  return best;
}
