// Views, forms and actions. All user text is escaped; money uses exact decimals.
import * as D from './dec.js';
import * as C from './calc.js';
import * as Ch from './charts.js';
import { t, lang, locale } from './i18n.js';
import { app, mutate, uid, hasPasscode, setPasscode, removePasscode, replaceState, wipeAll } from './store.js';
import { refreshAll, SOURCES } from './prices.js';
import { exportBackup, readBackup, restore } from './backup.js';
import { buildSample } from './sample.js';

export const ui = { route: 'home', pf: 'all', mk: 'all', txTab: 'tx', range: 90, wtab: 're', filter: 'all', month: null, busy: false, toast: '', passcodeOn: false };
const $ = (s, r = document) => r.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = () => app.state;
const today = () => C.kuwaitParts(new Date()).date;
const dpOf = ccy => (ccy === 'KWD' ? 3 : 2);
const num = (v, dp) => `<span class="num">${esc(D.format(v, dp))}</span>`;
const money = (v, ccy = 'KWD', dp = dpOf(ccy)) => `<span class="num">${esc(D.format(v, dp))}</span> <span class="ccy">${esc(ccy)}</span>`;
const sgn = v => (v > 0n ? 'pos' : v < 0n ? 'neg' : '');
const signed = (v, ccy = 'KWD') => `<span class="${sgn(v)}">${v > 0n ? '+' : ''}${money(v, ccy)}</span>`;
const pct = p => (p === null || p === undefined ? '—' : `<span class="num ${p > 0 ? 'pos' : p < 0 ? 'neg' : ''}">${p > 0 ? '+' : ''}${p.toFixed(2)}%</span>`);
const qtyFmt = v => { let s = D.format(v, 8); if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, ''); return s; };
const mlabel = ym => new Intl.DateTimeFormat(locale(), { month: 'short', timeZone: 'UTC' }).format(new Date(ym + '-01T00:00:00Z'));
const instOf = id => S().instruments.find(i => i.id === id);
const instName = id => { const i = instOf(id); return i ? i.symbol : '?'; };
const pfName = id => S().portfolios.find(p => p.id === id)?.name || '';

// ---------- small building blocks ----------
const badge = (kind, text) => `<span class="badge b-${kind}">${esc(text)}</span>`;
function statusBadge(r) {
  switch (r.status) {
    case 'cost': return badge('warn', t('st.cost'));
    case 'stale': return badge('warn', t('st.stale', { n: r.age }));
    case 'sample': return badge('info', t('st.sample'));
    case 'unknown': return badge('muted', t('st.unknown'));
    default: return badge('ok', t('st.ok', { d: r.priceRec?.priceDate || '' }));
  }
}
const empty = (msg, act) => `<div class="empty"><p>${esc(msg)}</p>${act || ''}</div>`;
const btn = (act, label, cls = '', data = '') => `<button class="btn ${cls}" data-act="${act}" ${data}>${esc(label)}</button>`;
const sec = (title, inner, right = '') => `<section class="card"><div class="between"><h3>${esc(title)}</h3>${right}</div>${inner}</section>`;

// ---------- Home ----------
const MINUS = '−';
const kw3 = v => D.format(v < 0n ? -v : v, 3);
const sAmt = v => (v < 0n ? MINUS : v > 0n ? '+' : '') + kw3(v);
const pill = (p, word = false) => {
  if (p === null || p === undefined) return `<span class="pill p-na">—</span>`;
  const cls = p > 0 ? 'p-pos' : p < 0 ? 'p-neg' : 'p-na';
  return `<span class="pill ${cls}"><span class="num">${p > 0 ? '+' : p < 0 ? MINUS : ''}${Math.abs(p).toFixed(2)}%</span>${word && p !== 0 ? ' ' + esc(t(p > 0 ? 'sum.gain' : 'sum.loss')) : ''}</span>`;
};
export function alertList(val, nw) {
  const a = []; const s = S();
  if (val.counts.cost) a.push(['warn', t('al.cost', { n: val.counts.cost })]);
  if (val.counts.stale) a.push(['warn', t('al.stale', { n: val.counts.stale })]);
  if (s.missingDays.length) a.push(['warn', t('al.missing', { n: s.missingDays.length })]);
  if (val.issues.length || nw.issues.length) a.push(['bad', t('al.issues')]);
  const lb = s.settings.lastBackup; const days = lb ? C.daysBetween(lb.slice(0, 10), today()) : null;
  if (!s.settings.sampleMode && (days === null || days > 7)) a.push(['warn', days === null ? t('al.nobackup') : t('al.backup', { n: days })]);
  if (!app.storageOk) a.push(['bad', t('al.nostorage')]);
  return a;
}
export function alertCount() { const val = C.valuation(S()); return alertList(val, C.netWorth(S(), val)).length; }
export function notifSheet() {
  const val = C.valuation(S()), a = alertList(val, C.netWorth(S(), val));
  openSheet(`<h2>${esc(t('notif.title'))}</h2>${a.length ? a.map(([k, m]) => `<div class="alert a-${k}">${esc(m)}</div>`).join('') : `<div class="empty">${esc(t('notif.none'))}</div>`}`);
}
const MK_ICON = {
  KW: '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  US: '<path d="M3 17l5-5 4 3 8-9M15 6h5v5"/>',
  CRYPTO: '<path d="M9 5v14M9 5h5a3 3 0 0 1 0 6H9m0 0h6a3 3 0 0 1 0 6H9M11 3v2m3-2v2m-3 14v2m3-2v2"/>',
  OTHER: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>',
};
const ico = d => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const fmtTime = iso => {
  const parts = new Intl.DateTimeFormat(locale(), { timeZone: 'Asia/Kuwait', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
  const d = C.kuwaitParts(new Date(iso)).date;
  return d === today() ? parts : `${d} ${parts}`;
};
const MK_COLOR = { KW: 'var(--mk-kw)', US: 'var(--mk-us)', CRYPTO: 'var(--mk-cr)', OTHER: 'var(--c6)' };
export const mkKeys = IS => ['KW', 'US', 'CRYPTO', ...(IS.markets.OTHER.count || IS.markets.OTHER.bought > 0n ? ['OTHER'] : [])];

function homeOnboarding() {
  return `<section class="sum onb"><div class="sum-lbl">${esc(t('onb.title'))}</div><p class="onb-p">${esc(t('onb.body'))}</p>
    <div class="actions">${btn('add-tx', t('onb.add'), 'primary')}${btn('sample-load', t('onb.sample'))}</div></section>`;
}
function summaryCard(IS, last) {
  const T = IS.total, plCls = T.pl > 0n ? 'pos' : T.pl < 0n ? 'neg' : '';
  return `<section class="sum" role="button" tabindex="0" data-act="details" aria-label="${esc(t('sum.title'))}">
    <div class="sum-top"><div class="sum-lbl">${esc(t('sum.title'))}</div>${ico('<path d="M4 7a2 2 0 0 1 2-2h11v3M4 7v10a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6a2 2 0 0 1-2-2zM16 13.5h.01"/>')}</div>
    <div class="sum-val"><span class="ccy">KWD</span> <span class="num">${esc(kw3(T.value))}</span></div>
    <div class="sum-line"></div>
    <div class="sum-cols">
      <div><div class="sum-l">${esc(t('col.deposits'))}</div><div class="sum-v"><span class="num">${esc(kw3(T.deposits))}</span></div></div>
      <div><div class="sum-l">${esc(t('col.pl'))}</div><div class="sum-v ${plCls}"><span class="num">${esc(sAmt(T.pl))}</span></div></div>
    </div>
    <div class="sum-foot">${pill(T.retPct, true)}<span class="upd">${esc(t('sum.upd'))}: ${last ? esc(fmtTime(last)) : esc(t('sum.noupd'))}</span></div>
  </section>${T.estimateCount ? `<div class="est">${esc(t('sum.estimate', { n: T.estimateCount }))}</div>` : ''}`;
}
function marketsBlock(IS) {
  const rows = mkKeys(IS).map(k => {
    const m = IS.markets[k], plCls = m.pl > 0n ? 'pos' : m.pl < 0n ? 'neg' : '';
    return `<button class="mrow" data-act="mkt" data-v="${k}" aria-label="${esc(t('mk.' + k))}">
      <div class="mrow-h"><span class="mname"><span class="mico" style="color:${MK_COLOR[k]}">${ico(MK_ICON[k])}</span>${esc(t('mk.' + k))}</span>${pill(m.retPct)}</div>
      <div class="mrow-c">
        <div><div class="sum-l">${esc(t('col.deposits'))}</div><div class="mv"><span class="num">${esc(kw3(m.deposits))}</span></div></div>
        <div><div class="sum-l">${esc(t('col.value'))}</div><div class="mv"><span class="num">${esc(kw3(m.value))}</span></div></div>
        <div><div class="sum-l">${esc(t('col.pl'))}</div><div class="mv ${plCls}"><span class="num">${esc(sAmt(m.pl))}</span></div></div>
      </div></button>`;
  }).join('');
  return `<h3 class="sech">${esc(t('mk.title'))}</h3><div class="mbox">${rows}</div>`;
}
const RANGES = [[30, '1M'], [90, '3M'], [365, '1Y'], [0, 'ALL']];
function chartBlock() {
  const s = S(), cut = ui.range ? C.addDays(today(), -ui.range) : '0000-00-00';
  const pts = s.snapshots.filter(x => x.date >= cut).map(x => ({ l: x.date, v: D.toNum(D.parse(x.investments)), s: D.format(D.parse(x.investments), 3) + ' KWD' }));
  const body = pts.length > 1 ? Ch.line(pts) : `<div class="empty-c">${ico('<path d="M3 17l5-5 4 3 8-9"/>')}<span>${esc(t('ch.empty'))}</span></div>`;
  return `<h3 class="sech">${esc(t('ch.title'))}</h3><section class="card tight">${body}
    <div class="seg mini">${RANGES.map(([v, l]) => `<button class="${ui.range === v ? 'on' : ''}" data-act="range" data-v="${v}">${l}</button>`).join('')}</div></section>`;
}
function allocBlock(IS) {
  const items = mkKeys(IS).map(k => ({ k, v: IS.markets[k].value })).filter(x => x.v > 0n);
  const tot = items.reduce((a, x) => a + D.toNum(x.v), 0);
  const body = items.length ? `<div class="alloc">${Ch.donut(items.map(x => ({ v: D.toNum(x.v), c: MK_COLOR[x.k] })), { center: '' })}
    <ul class="legend">${items.map(x => `<li><i style="background:${MK_COLOR[x.k]}"></i><span class="grow">${esc(t('mk.' + x.k))}<br><span class="muted small num">${esc(kw3(x.v))} KWD</span></span><b class="num">${((D.toNum(x.v) / tot) * 100).toFixed(1)}%</b></li>`).join('')}</ul></div>`
    : `<div class="empty-c"><span>${esc(t('al.empty'))}</span></div>`;
  return `<h3 class="sech">${esc(t('al.title'))}</h3><section class="card tight">${body}</section>`;
}
function incomeBlock() {
  const s = S(), td = today(), inc = C.incomeSummary(s, td);
  const up = [...s.dividends.filter(d => d.status === 'announced' && d.payDate >= td).map(d => ({ ...d })), ...C.forecastDividends(s, td, 11)].sort((a, b) => (a.payDate < b.payDate ? -1 : 1)).slice(0, 3);
  return `<h3 class="sech">${esc(t('inc.title'))}</h3><section class="card tight" data-act="goto-div" role="button" tabindex="0">
    <div class="grid2"><div><div class="muted small">${esc(t('inc.recv'))}</div><div class="v"><span class="num pos">${esc(kw3(inc.ytd))}</span> <span class="ccy">KWD</span></div><div>${badge('ok', t('div.received'))}</div></div>
    <div><div class="muted small">${esc(t('inc.forecast12'))}</div><div class="v"><span class="num">${esc(kw3(inc.forecast12m))}</span> <span class="ccy">KWD</span></div><div>${badge('muted', t('div.forecast'))}</div></div></div>
    ${inc.announced > 0n ? `<div class="small muted" style="margin-top:8px">${badge('info', t('div.announced'))} <span class="num">${esc(kw3(inc.announced))}</span> KWD</div>` : ''}
    ${up.length ? `<div class="ups">${up.map(d => `<div class="up"><span class="grow"><b>${esc(instName(d.instId))}</b> <span class="muted small">${esc(d.payDate)}</span></span>${badge(d.status === 'forecast' ? 'muted' : 'info', t('div.' + d.status))}<span class="num small">${esc(D.format(D.parse(d.amount), dpOf(d.ccy)))} ${esc(d.ccy)}</span></div>`).join('')}</div>` : ''}
  </section>`;
}
export function nwRows(nw) {
  const row = (k, v, neg) => `<div class="nwr"><span>${esc(t(k))}</span><b class="${neg ? 'neg' : ''}"><span class="num">${neg && v > 0n ? MINUS : ''}${esc(kw3(v))}</span></b></div>`;
  return row('nw.inv', nw.investments) + row('nw.cash', nw.cash) + row('nw.re', nw.realEstate) + row('nw.liab', nw.liabilities, true);
}
function netWorthBlock(nw) {
  return `<h3 class="sech">${esc(t('nw.title'))}</h3><section class="card tight" data-act="goto-assets" role="button" tabindex="0">${nwRows(nw)}
    <div class="nwr total"><span>${esc(t('nw.total'))}</span><b><span class="num">${nw.total < 0n ? MINUS : ''}${esc(kw3(nw.total))}</span> <span class="ccy">KWD</span></b></div>
    <div class="muted small">${esc(t('nw.formula'))}</div></section>`;
}
function viewHome() {
  const s = S(), val = C.valuation(s), nw = C.netWorth(s, val), IS = C.investmentSummary(s);
  const has = s.instruments.length && (IS.total.bought > 0n || IS.total.count);
  const sample = s.settings.sampleMode ? `<div class="alert a-info">${esc(t('app.sample'))}</div>` : '';
  if (!has) return homeOnboarding() + netWorthBlock(nw) + sample;
  return summaryCard(IS, C.lastPriceUpdate(s)) + marketsBlock(IS) + chartBlock() + allocBlock(IS) + incomeBlock() + netWorthBlock(nw) + `<div style="height:12px"></div>` + sample;
}
export function detailsSheet() {
  const IS = C.investmentSummary(S()), keys = ['total', ...mkKeys(IS)];
  const row = (k, v, signed) => `<div>${esc(t(k))}</div><b class="${signed && v !== 0n ? (v > 0n ? 'pos' : 'neg') : ''}"><span class="num">${esc(signed ? sAmt(v) : kw3(v))}</span></b>`;
  const block = k => { const m = k === 'total' ? IS.total : IS.markets[k];
    return `<h4>${esc(k === 'total' ? t('sum.title') : t('mk.' + k))}</h4><div class="kv">${row('col.deposits', m.deposits)}${row('d.withdrawals', m.withdrawals)}${row('d.cost', m.cost)}${row('col.value', m.value)}${row('d.realized', m.realized, true)}${row('d.unrealized', m.unrealized, true)}${row('d.dividends', m.dividends)}${row('d.fees', m.fees)}${row('col.pl', m.pl, true)}${row('d.base', m.base)}<div>${esc(t('d.ret'))}</div><b>${pill(m.retPct)}</b></div>`; };
  openSheet(`<h2>${esc(t('d.title'))}</h2><p class="note">${esc(t('d.method'))}</p>${IS.untaggedDeposits !== 0n || IS.untaggedWithdrawals !== 0n ? `<p class="note">${esc(t('d.untagged', { a: kw3(IS.untaggedDeposits), b: kw3(IS.untaggedWithdrawals) }))}</p>` : ''}${keys.map(block).join('')}<p class="small muted">${esc(t('d.fx'))}</p>`);
}

// ---------- Portfolio ----------
const GROUPS = [['kwstock', r => r.inst.market === 'KW' && r.inst.type === 'stock'], ['usstock', r => r.inst.market === 'US' && r.inst.type === 'stock'], ['etf', r => r.inst.type === 'etf'], ['reit', r => r.inst.type === 'reit'], ['crypto', r => r.inst.type === 'crypto']];
function viewPortfolio() {
  const s = S(), val = C.valuation(s);
  const rows = val.rows.filter(r => (ui.pf === 'all' || r.portfolioId === ui.pf) && (ui.mk === 'all' || (['KW', 'US', 'CRYPTO'].includes(r.inst.market) ? r.inst.market : 'OTHER') === ui.mk));
  const tot = rows.reduce((a, r) => a + r.valueKWD, 0n), mk = rows.filter(r => r.unrealizedKWD !== null);
  const un = mk.reduce((a, r) => a + r.unrealizedKWD, 0n), mc = mk.reduce((a, r) => a + r.costKWD, 0n);
  const rl = rows.reduce((a, r) => a + r.realizedKWD, 0n);
  const mchips = `<div class="chips">${['all', 'KW', 'US', 'CRYPTO'].map(k => `<button class="chip ${ui.mk === k ? 'on' : ''}" data-act="mk" data-v="${k}">${esc(k === 'all' ? t('pf.all') : t('mk.' + k))}</button>`).join('')}</div>`;
  const pchips = s.portfolios.length > 1 ? `<div class="chips"><button class="chip ${ui.pf === 'all' ? 'on' : ''}" data-act="pf" data-v="all">${esc(t('pf.all'))}</button>${s.portfolios.map(p => `<button class="chip ${ui.pf === p.id ? 'on' : ''}" data-act="pf" data-v="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>` : '';
  const head = `<section class="hero"><div class="muted">${esc(t('pf.value'))}</div><div class="big">${money(tot)}</div>
    <div class="grid2 small"><div>${esc(t('pf.unreal'))}: ${signed(un)} ${mc > 0n ? pct(D.toNum(D.div(un, mc)) * 100) : ''}</div><div>${esc(t('pf.real'))}: ${signed(rl)}</div></div></section>`;
  const item = r => `
    <button class="item" data-act="holding" data-id="${esc(r.inst.id)}"><div class="grow"><div class="t"><bdi>${esc(r.inst.symbol)}</bdi> <bdi class="muted small">${esc(r.inst.name)}</bdi></div>
      <div class="small muted"><span class="num">${esc(qtyFmt(r.qty))}</span> × ${esc(t('h.avg'))} <span class="num">${esc(D.format(r.avg, r.inst.ccy === 'KWD' ? 3 : 2))}</span> ${esc(r.inst.ccy)}</div>
      <div class="small muted">${esc(t('h.price'))} ${r.price !== null ? money(r.price, r.inst.ccy, r.inst.ccy === 'KWD' ? 3 : 2) : '—'}</div>${statusBadge(r)}</div>
      <div class="end"><div class="t">${money(r.valueKWD)}</div><div class="small">${r.unrealizedKWD !== null ? signed(r.unrealizedKWD) : ''}</div><div class="small">${r.unrealizedPct !== null ? pct(r.unrealizedPct) : ''}</div></div></button>`;
  const sorted = [...rows].sort((a, b) => (b.valueKWD > a.valueKWD ? 1 : -1)), used = new Set();
  let list = GROUPS.map(([g, f]) => { const rs = sorted.filter(r => !used.has(r) && f(r)); rs.forEach(r => used.add(r)); return rs.length ? `<h4>${esc(t('grp.' + g))}</h4><div class="list">${rs.map(item).join('')}</div>` : ''; }).join('');
  const rest = sorted.filter(r => !used.has(r)); if (rest.length) list += `<h4>${esc(t('mk.OTHER'))}</h4><div class="list">${rest.map(item).join('')}</div>`;
  if (!rows.length) list = `<div class="list">${empty(t('pf.empty'), btn('add-inst', t('pf.addinst'), 'primary'))}</div>`;
  return mchips + pchips + head + `<div class="actions">${btn('add-tx', t('tx.add'), 'primary')}${btn('add-inst', t('pf.addinst'))}${btn('add-pf', t('pf.add'))}${btn('refresh', ui.busy ? t('more.refreshing') : t('pf.refresh'))}</div>` + list +
    `<p class="muted small">${esc(t('pf.note'))}</p>`;
}
function holdingSheet(id) {
  const s = S(), val = C.valuation(s), r = val.rows.find(x => x.inst.id === id), inst = instOf(id);
  const pos = C.positions(s)[id];
  const pr = s.prices[id];
  const txs = s.txs.filter(x => x.instId === id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12);
  const body = `<h2><bdi>${esc(inst.symbol)}</bdi> <bdi class="muted small">${esc(inst.name)}</bdi></h2>
  ${r ? statusBadge(r) : ''}
  <div class="kv"><div>${esc(t('h.qty'))}</div><b class="num">${esc(qtyFmt(pos?.qty ?? 0n))}</b>
   <div>${esc(t('h.avg'))}</div><b>${money(pos?.avg ?? 0n, inst.ccy, 4)}</b>
   <div>${esc(t('h.cost'))}</div><b>${money(pos?.cost ?? 0n, inst.ccy)}</b>
   <div>${esc(t('h.price'))}</div><b>${pr ? money(D.parse(pr.price), inst.ccy, 4) : esc(t('h.noprice'))}</b>
   <div>${esc(t('h.source'))}</div><b>${esc(pr?.source || '—')}</b>
   <div>${esc(t('h.pdate'))}</div><b>${esc(pr?.priceDate || t('h.unknowndate'))}</b>
   <div>${esc(t('h.value'))}</div><b>${r ? money(r.valueLocal, inst.ccy) : '—'}</b>
   <div>${esc(t('h.unreal'))}</div><b>${r && r.unrealizedKWD !== null ? signed(r.unrealizedKWD) + ' ' + pct(r.unrealizedPct) : '—'}</b>
   <div>${esc(t('h.real'))}</div><b>${signed(D.mul(pos?.realized ?? 0n, C.fxRate(s, inst.ccy) ?? D.ONE))}</b>
   <div>${esc(t('h.fees'))}</div><b>${money(pos?.fees ?? 0n, inst.ccy)}</b></div>
  ${r && r.status === 'cost' ? `<p class="note">${esc(t('st.costnote'))}</p>` : ''}
  <div class="actions">${btn('add-tx', t('tx.buy'), 'primary', `data-inst="${esc(id)}" data-type="buy"`)}${btn('add-tx', t('tx.sell'), '', `data-inst="${esc(id)}" data-type="sell"`)}${btn('edit-inst', t('edit'), '', `data-id="${esc(id)}"`)}</div>
  <h4>${esc(t('h.recent'))}</h4><div class="list">${txs.map(x => txRow(x)).join('') || empty(t('empty.generic'))}</div>`;
  openSheet(body);
}

// ---------- Activity ----------
function txRow(x) {
  const inst = x.instId ? instOf(x.instId) : null, ccy = x.ccy || inst?.ccy || 'KWD';
  let amt = '';
  if (x.type === 'buy' || x.type === 'sell') amt = money(D.mul(D.parse(x.qty), D.parse(x.price)), ccy);
  else if (x.type === 'deposit' || x.type === 'withdraw') amt = money(D.parse(x.amount), ccy);
  const sub = x.type === 'buy' || x.type === 'sell' ? `${qtyFmt(D.parse(x.qty))} @ ${D.format(D.parse(x.price), ccy === 'KWD' ? 3 : 2)}${D.parse(x.fee) ? ' · ' + t('tx.fee') + ' ' + D.format(D.parse(x.fee), 3) : ''}`
    : x.type === 'split' ? `${t('tx.ratio')} ${x.ratio}:1` : x.type === 'bonus' ? `+${qtyFmt(D.parse(x.qty))}` : esc(x.note || '');
  return `<button class="item" data-act="edit-tx" data-id="${esc(x.id)}"><div class="grow"><div class="t">${esc(t('tx.' + x.type))} ${inst ? esc(inst.symbol) : ''}</div><div class="small muted">${esc(x.date)} · ${esc(sub)}</div></div><div class="end">${amt}</div></button>`;
}
function viewTxList() {
  const f = ui.filter, groups = { all: null, trades: ['buy', 'sell'], corp: ['split', 'bonus'], flows: ['deposit', 'withdraw'] };
  const rows = S().txs.filter(x => !groups[f] || groups[f].includes(x.type)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0)));
  return `<div class="chips">${Object.keys(groups).map(k => `<button class="chip ${f === k ? 'on' : ''}" data-act="filter" data-v="${k}">${esc(t('flt.' + k))}</button>`).join('')}</div>
  <div class="actions">${btn('add-tx', t('tx.add'), 'primary')}</div>
  <div class="list">${rows.length ? rows.map(txRow).join('') : empty(t('tx.empty'))}</div><p class="muted small">${esc(t('tx.flownote'))}</p>`;
}

// ---------- Income ----------
function viewDividends() {
  const s = S(), td = today(), inc = C.incomeSummary(s, td), fc = C.forecastDividends(s, td, 11);
  const [y, m] = td.split('-').map(Number), months = [];
  for (let k = 11; k >= 0; k--) { const mi = m - 1 - k, yy = y + Math.floor(mi / 12), mm = ((mi % 12) + 12) % 12 + 1; months.push(`${yy}-${String(mm).padStart(2, '0')}`); }
  const bars = Ch.bars(months.map(k => ({ l: mlabel(k), v: D.toNum(inc.byMonth[k] || 0n) })));
  const annKey = td.slice(0, 7), thisMonth = inc.byMonth[annKey] || 0n;
  const head = `<section class="hero"><div class="muted">${esc(t('inc.ytd'))}</div><div class="big">${money(inc.ytd)}</div>
    <div class="grid2 small"><div>${esc(t('inc.month'))}: ${money(thisMonth)}</div><div>${esc(t('inc.announced'))}: ${money(inc.announced)}</div></div>
    <div class="muted small">${esc(t('inc.forecast12'))}: ${money(inc.forecast12m)} — ${esc(t('inc.notreceived'))}</div></section>`;
  const upcoming = [...s.dividends.filter(d => d.status === 'announced').map(d => ({ ...d })), ...fc].sort((a, b) => (a.payDate < b.payDate ? -1 : 1));
  const upRows = upcoming.map((d, i) => `<button class="item" data-act="${d.status === 'forecast' ? 'announce' : 'edit-div'}" data-id="${esc(d.id || '')}" data-i="${d.status === 'forecast' ? fc.indexOf(fc.find(f => f.instId === d.instId && f.exDate === d.exDate)) : ''}">
    <div class="grow"><div class="t">${esc(instName(d.instId))} ${badge(d.status === 'forecast' ? 'muted' : 'info', t('div.' + d.status))}</div><div class="small muted">${esc(t('div.ex'))} ${esc(d.exDate)} · ${esc(t('div.pay'))} ${esc(d.payDate)}</div></div>
    <div class="end">${money(D.parse(d.amount), d.ccy)}</div></button>`).join('');
  const hist = s.dividends.filter(d => d.status === 'received').sort((a, b) => ((b.receivedDate || b.payDate) > (a.receivedDate || a.payDate) ? 1 : -1));
  const histRows = hist.map(d => `<button class="item" data-act="edit-div" data-id="${esc(d.id)}"><div class="grow"><div class="t">${esc(instName(d.instId))} ${badge('ok', t('div.received'))}</div><div class="small muted">${esc(d.receivedDate || d.payDate)}</div></div><div class="end">${money(D.parse(d.amount), d.ccy)}</div></button>`).join('');
  return head + sec(t('inc.monthly'), bars) + `<div class="actions">${btn('add-div', t('div.add'), 'primary')}</div>` +
    `<h4>${esc(t('inc.calendar'))}</h4><div class="list">${upRows || empty(t('empty.generic'))}</div><h4>${esc(t('inc.history'))}</h4><div class="list">${histRows || empty(t('empty.generic'))}</div>
    <p class="muted small">${esc(t('inc.rule'))}</p>`;
}

// ---------- Wealth ----------
function viewAssets() {
  const tabs = ['re', 'cash', 'cf', 'goals'];
  const bar = `<div class="seg">${tabs.map(k => `<button class="${ui.wtab === k ? 'on' : ''}" data-act="wtab" data-v="${k}">${esc(t('w.' + k))}</button>`).join('')}</div>`;
  const val = C.valuation(S()), nw = C.netWorth(S(), val);
  const top = `<section class="card tight">${nwRows(nw)}<div class="nwr total"><span>${esc(t('nw.total'))}</span><b><span class="num">${nw.total < 0n ? MINUS : ''}${esc(kw3(nw.total))}</span> <span class="ccy">KWD</span></b></div></section>`;
  return top + bar + ({ re: wRealEstate, cash: wCash, cf: wCashflow, goals: wGoals }[ui.wtab])();
}
function wRealEstate() {
  const s = S(), td = today();
  const cards = s.properties.map(p => { const st = C.propertyStats(s, p, td); return `<button class="card item col" data-act="edit-prop" data-id="${esc(p.id)}">
    <div class="between"><h3>${esc(p.name)}</h3>${p.leaseEnd ? badge(p.leaseEnd < td ? 'warn' : 'muted', t('re.lease') + ' ' + p.leaseEnd) : ''}</div>
    <div class="kv"><div>${esc(t('re.value'))}</div><b>${money(st.value)}</b><div>${esc(t('re.debt'))}</div><b>${money(st.debt)}</b><div>${esc(t('re.equity'))}</div><b>${money(st.equity)}</b>
    <div>${esc(t('re.net12'))}</div><b>${signed(st.net12)}</b><div>${esc(t('re.yield'))}</div><b>${pct(st.yieldPct)}</b><div>${esc(t('re.asof'))}</div><b>${esc(p.valueAsOf || '—')}</b></div>
    ${p.tenant ? `<div class="small muted">${esc(t('re.tenant'))}: ${esc(p.tenant)} · ${money(D.parse(p.rent || 0), p.ccy)}/${esc(t('re.mo'))}</div>` : ''}</button>`; }).join('');
  return `<div class="actions">${btn('add-prop', t('re.add'), 'primary')}</div>${cards || empty(t('empty.generic'))}<p class="muted small">${esc(t('re.note'))}</p>`;
}
function wCash() {
  const s = S();
  const cash = s.cashAccounts.map(a => `<button class="item" data-act="edit-cash" data-id="${esc(a.id)}"><div class="grow"><div class="t">${esc(a.name)}</div><div class="small muted">${esc(a.bank || '')} · ${esc(t('re.asof'))} ${esc(a.asOf || '—')}</div></div><div class="end">${money(D.parse(a.balance), a.ccy)}</div></button>`).join('');
  const liab = s.liabilities.map(l => `<button class="item" data-act="edit-liab" data-id="${esc(l.id)}"><div class="grow"><div class="t">${esc(l.name)}</div><div class="small muted">${l.rate ? esc(l.rate) + '% · ' : ''}${l.payment ? money(D.parse(l.payment), l.ccy) + '/' + esc(t('re.mo')) : ''}</div></div><div class="end neg">${money(D.parse(l.balance), l.ccy)}</div></button>`).join('');
  return `<div class="actions">${btn('add-cash', t('cash.add'), 'primary')}${btn('add-liab', t('liab.add'))}</div><h4>${esc(t('w.cash'))}</h4><div class="list">${cash || empty(t('empty.generic'))}</div><h4>${esc(t('liab.title'))}</h4><div class="list">${liab || empty(t('empty.generic'))}</div>`;
}
function wCashflow() {
  const s = S(); const month = ui.month ||= today().slice(0, 7);
  const sm = C.cashflowSummary(s, month);
  const rows = s.cashflow.filter(e => e.date.startsWith(month)).sort((a, b) => (a.date < b.date ? 1 : -1)).map(e => `<button class="item" data-act="edit-cf" data-id="${esc(e.id)}"><div class="grow"><div class="t">${esc(t('cat.' + e.category))}</div><div class="small muted">${esc(e.date)} ${esc(e.note || '')}</div></div><div class="end ${e.type === 'income' ? 'pos' : ''}">${e.type === 'income' ? '+' : '−'}${money(D.parse(e.amount), e.ccy)}</div></button>`).join('');
  const rec = s.recurring.map(r => `<button class="item" data-act="edit-rec" data-id="${esc(r.id)}"><div class="grow"><div class="t">${esc(r.name)}</div><div class="small muted">${esc(t('rec.day'))} ${r.day}</div></div><div class="end">${money(D.parse(r.amount), r.ccy)}</div></button>`).join('');
  return `<div class="between month"><button class="chip" data-act="month" data-v="-1">‹</button><b>${esc(month)}</b><button class="chip" data-act="month" data-v="1">›</button></div>
  <div class="grid3"><div class="tile"><div class="muted small">${esc(t('cf.income'))}</div><div class="v pos">${money(sm.income)}</div></div><div class="tile"><div class="muted small">${esc(t('cf.expense'))}</div><div class="v neg">${money(sm.expense)}</div></div><div class="tile"><div class="muted small">${esc(t('cf.net'))}</div><div class="v">${signed(sm.net)}</div></div></div>
  <div class="actions">${btn('add-cf', t('cf.add'), 'primary')}${btn('add-rec', t('rec.add'))}</div><div class="list">${rows || empty(t('empty.generic'))}</div><h4>${esc(t('rec.title'))}</h4><div class="list">${rec || empty(t('empty.generic'))}</div>`;
}
function wGoals() {
  const s = S();
  const g = s.goals.map(x => { const p = Math.min(100, D.parse(x.target) > 0n ? D.toNum(D.div(D.parse(x.current), D.parse(x.target))) * 100 : 0);
    return `<button class="card item col" data-act="edit-goal" data-id="${esc(x.id)}"><div class="between"><h3>${esc(x.name)}</h3><b class="num">${p.toFixed(0)}%</b></div><div class="bar"><i style="width:${p}%"></i></div><div class="small muted">${money(D.parse(x.current), x.ccy)} / ${money(D.parse(x.target), x.ccy)}${x.targetDate ? ' · ' + esc(x.targetDate) : ''}</div></button>`; }).join('');
  return `<div class="actions">${btn('add-goal', t('goal.add'), 'primary')}</div>${g || empty(t('empty.generic'))}`;
}

function viewTransactions() {
  const bar = `<div class="seg">${['tx', 'div'].map(k => `<button class="${ui.txTab === k ? 'on' : ''}" data-act="txtab" data-v="${k}">${esc(t('txtab.' + k))}</button>`).join('')}</div>`;
  return bar + (ui.txTab === 'div' ? viewDividends() : viewTxList());
}

// ---------- More ----------
function viewMore() {
  const s = S(), lb = s.settings.lastBackup;
  const last = s.priceLog[0];
  return `${s.settings.sampleMode ? `<div class="alert a-info">${esc(t('more.samplebanner'))}</div>` : ''}
  ${sec(t('more.general'), `<div class="seg"><button class="${s.settings.lang === 'en' ? 'on' : ''}" data-act="lang" data-v="en">English</button><button class="${s.settings.lang === 'ar' ? 'on' : ''}" data-act="lang" data-v="ar">العربية</button></div>
    <div class="seg"><button class="${s.settings.theme === 'auto' ? 'on' : ''}" data-act="theme" data-v="auto">${esc(t('th.auto'))}</button><button class="${s.settings.theme === 'light' ? 'on' : ''}" data-act="theme" data-v="light">${esc(t('th.light'))}</button><button class="${s.settings.theme === 'dark' ? 'on' : ''}" data-act="theme" data-v="dark">${esc(t('th.dark'))}</button></div><div class="between small"><span class="muted">${esc(t('more.ccy'))}</span><b>KWD · 3</b></div>`)}
  ${sec(t('more.reports'), `<p class="small muted">${esc(t('more.reportsnote'))}</p><div class="actions">${btn('details', t('more.perf'), 'primary')}</div>`)}
  ${sec(t('more.security'), `<p class="small muted">${esc(ui.passcodeOn ? t('sec.on') : t('sec.off'))}</p><div class="actions">${btn('passcode-set', ui.passcodeOn ? t('sec.change') : t('sec.set'))}${ui.passcodeOn ? btn('passcode-off', t('sec.remove')) : ''}</div><p class="small muted">${esc(t('sec.warn'))}</p>`)}
  ${sec(t('more.backup'), `<p class="small muted">${esc(t('bk.last'))}: ${esc(lb ? lb.slice(0, 16).replace('T', ' ') : t('bk.never'))}</p><div class="actions">${btn('export-enc', t('bk.enc'), 'primary')}${btn('export-plain', t('bk.plain'))}${btn('import', t('bk.import'))}</div><p class="small muted">${esc(t('bk.warn'))}</p><input type="file" id="importFile" accept=".json,application/json" hidden>`)}
  ${sec(t('more.prices'), `<div class="actions">${btn('refresh', ui.busy ? t('more.refreshing') : t('pf.refresh'), 'primary')}</div>
    <p class="small muted">${esc(t('more.lastrefresh'))}: ${esc(s.settings.lastPriceRefresh ? s.settings.lastPriceRefresh.slice(0, 16).replace('T', ' ') : '—')}</p>
    ${last ? `<ul class="log">${last.log.map(l => `<li class="${l.ok ? 'pos' : 'muted'}">${esc(l.id)}: ${esc(l.msg)}</li>`).join('')}</ul>` : ''}
    <ul class="src">${SOURCES.map(x => `<li><b>${esc(x.covers)}</b> — ${esc(x.name)}<br><span class="muted small">${esc(x.status)}</span></li>`).join('')}</ul>
    <p class="small muted">${esc(t('more.fxrate'))}: ${s.fx.USD ? esc(s.fx.USD.rate) + ' (' + esc(s.fx.USD.date) + ', ' + esc(s.fx.USD.source) + ')' : '—'}</p>`)}
  ${sec(t('more.data'), `<div class="actions">${btn('sample-load', t('data.sample'))}${s.settings.sampleMode ? btn('sample-clear', t('data.clear'), 'danger') : ''}${btn('wipe', t('data.wipe'), 'danger')}</div>`)}
  ${sec(t('more.about'), `<p class="small">${esc(t('about.1'))}</p><p class="small">${esc(t('about.2'))}</p><p class="small">${esc(t('about.3'))}</p><p class="small muted">${esc(t('about.4', { n: s.audit.length }))}</p>`)}`;
}

export const views = { home: viewHome, portfolio: viewPortfolio, transactions: viewTransactions, assets: viewAssets, more: viewMore };

// ---------- sheet + form engine ----------
export function toast(msg) { ui.toast = msg; const el = $('#toast'); if (el) { el.textContent = msg; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2600); } }
export function openSheet(html) { const el = $('#sheet'); el.innerHTML = `<div class="backdrop" data-act="close"></div><div class="panel" role="dialog"><div class="grab"></div><div class="pbody">${html}</div></div>`; el.classList.add('on'); }
export function closeSheet() { const el = $('#sheet'); el.classList.remove('on'); el.innerHTML = ''; }
const optsTag = (opts, v) => opts.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(v) ? 'selected' : ''}>${esc(o.l)}</option>`).join('');
let FORM = null;
export function openForm(spec) {
  FORM = spec; const vals = spec.values || {};
  const f = spec.fields.map(fd => {
    const v = vals[fd.k] ?? fd.def ?? '', id = 'f_' + fd.k; let input;
    if (fd.type === 'select') input = `<select id="${id}" name="${fd.k}">${optsTag(fd.opts, v)}</select>`;
    else if (fd.type === 'check') input = `<label class="chk"><input type="checkbox" id="${id}" name="${fd.k}" ${v ? 'checked' : ''}> <span>${esc(fd.label)}</span></label>`;
    else if (fd.type === 'area') input = `<textarea id="${id}" name="${fd.k}" rows="2">${esc(v)}</textarea>`;
    else input = `<input id="${id}" name="${fd.k}" type="${fd.type === 'date' ? 'date' : fd.type === 'password' ? 'password' : 'text'}" ${fd.type === 'num' ? 'inputmode="decimal" autocomplete="off"' : ''} value="${esc(v)}" ${fd.ph ? `placeholder="${esc(fd.ph)}"` : ''}>`;
    return `<div class="fld" data-k="${fd.k}">${fd.type === 'check' ? '' : `<label for="${id}">${esc(fd.label)}${fd.req ? ' *' : ''}</label>`}${input}${fd.hint ? `<div class="hint">${esc(fd.hint)}</div>` : ''}</div>`;
  }).join('');
  openSheet(`<h2>${esc(spec.title)}</h2>${spec.note ? `<p class="note">${esc(spec.note)}</p>` : ''}<form id="form" novalidate>${f}<div id="formerr" class="err" role="alert"></div>
    <div class="actions sticky"><button type="submit" class="btn primary">${esc(spec.saveLabel || t('save'))}</button><button type="button" class="btn" data-act="close">${esc(t('cancel'))}</button>${spec.onDelete ? `<button type="button" class="btn danger" data-act="form-delete">${esc(t('delete'))}</button>` : ''}</div></form>`);
  syncForm();
}
const readForm = () => { const out = {}; for (const fd of FORM.fields) { const el = $('#f_' + fd.k); if (!el) continue; out[fd.k] = fd.type === 'check' ? el.checked : el.value.trim(); } return out; };
export function syncForm() {
  if (!FORM) return; const v = readForm();
  for (const fd of FORM.fields) { if (!fd.when) continue; const w = $(`.fld[data-k="${fd.k}"]`); if (w) w.hidden = !fd.when(v); }
  FORM.onChange?.(v, k => $('#f_' + k));
}
export async function submitForm() {
  const v = readForm(), err = $('#formerr'); err.textContent = '';
  try {
    for (const fd of FORM.fields) {
      if (fd.when && !fd.when(v)) continue; const x = v[fd.k];
      if (fd.req && fd.type !== 'check' && !x) throw new Error(t('err.required', { f: fd.label }));
      if (fd.type === 'num' && x !== '' && !D.isValid(x)) throw new Error(t('err.number', { f: fd.label }));
      if (fd.type === 'num' && x !== '' && fd.pos && D.parse(x) <= 0n) throw new Error(t('err.positive', { f: fd.label }));
      if (fd.type === 'num' && x !== '' && fd.nonneg && D.parse(x) < 0n) throw new Error(t('err.positive', { f: fd.label }));
      if (fd.type === 'date' && x && !/^\d{4}-\d{2}-\d{2}$/.test(x)) throw new Error(t('err.date', { f: fd.label }));
    }
    const ok = await FORM.onSave(v); if (ok !== false) { closeSheet(); FORM = null; }
  } catch (e) { err.textContent = e.message || String(e); }
}
export function deleteFromForm() {
  const b = document.querySelector('[data-act="form-delete"]');
  if (!b.dataset.arm) { b.dataset.arm = 1; b.textContent = t('confirm.delete'); return; }
  FORM.onDelete(); closeSheet(); FORM = null;
}
const O = (arr, f) => arr.map(x => ({ v: x.v ?? x, l: f ? f(x) : x.l ?? x }));
const ccyOpts = [{ v: 'KWD', l: 'KWD' }, { v: 'USD', l: 'USD' }];
const instOpts = () => S().instruments.map(i => ({ v: i.id, l: `${i.symbol} — ${i.name}` }));

// ---------- forms ----------
function auditOf(action, entity, id) { return { action, entity, id }; }
export function txForm(id, preset = {}) {
  const s = S(), ex = id ? s.txs.find(x => x.id === id) : null;
  if (!ex && !s.instruments.length) { toast(t('tx.needinst')); return infoInst(); }
  const types = ['buy', 'sell', 'split', 'bonus', 'deposit', 'withdraw'];
  const withInst = v => ['buy', 'sell', 'split', 'bonus'].includes(v.type), trade = v => ['buy', 'sell'].includes(v.type), flow = v => ['deposit', 'withdraw'].includes(v.type);
  openForm({
    title: ex ? t('tx.edit') : t('tx.add'), values: ex || { type: preset.type || 'buy', instId: preset.inst || s.instruments[0]?.id, date: today(), fee: '0', ccy: 'KWD' },
    fields: [
      { k: 'type', label: t('tx.type'), type: 'select', opts: types.map(k => ({ v: k, l: t('tx.' + k) })) },
      { k: 'instId', label: t('tx.inst'), type: 'select', opts: instOpts(), when: withInst },
      { k: 'date', label: t('tx.date'), type: 'date', req: true },
      { k: 'qty', label: t('tx.qty'), type: 'num', pos: true, req: true, when: v => trade(v) || v.type === 'bonus' },
      { k: 'price', label: t('tx.price'), type: 'num', nonneg: true, req: true, when: trade, hint: t('tx.pricehint') },
      { k: 'fee', label: t('tx.fee'), type: 'num', nonneg: true, when: trade, hint: t('tx.feehint') },
      { k: 'ratio', label: t('tx.ratio'), type: 'num', pos: true, req: true, when: v => v.type === 'split', hint: t('tx.ratiohint') },
      { k: 'amount', label: t('tx.amount'), type: 'num', pos: true, req: true, when: flow },
      { k: 'ccy', label: t('ccy'), type: 'select', opts: ccyOpts, when: flow },
      { k: 'market', label: t('tx.market'), type: 'select', opts: [{ v: '', l: t('tx.nomarket') }, ...['KW', 'US', 'CRYPTO'].map(k => ({ v: k, l: t('mk.' + k) }))], when: flow, hint: t('tx.markethint') },
      { k: 'note', label: t('note'), type: 'area' }],
    onChange: (v, el) => { if (trade(v) && el('f_ccy')) { /* currency of instrument shown in hint only */ } },
    onSave: v => {
      const rec = { id: ex?.id || uid(), ts: ex?.ts || Date.now(), type: v.type, date: v.date, note: v.note };
      if (withInst(v)) { rec.instId = v.instId; rec.ccy = instOf(v.instId).ccy; }
      if (trade(v)) { rec.qty = D.str(D.parse(v.qty)); rec.price = D.str(D.parse(v.price)); rec.fee = D.str(D.parse(v.fee || 0)); }
      if (v.type === 'bonus') rec.qty = D.str(D.parse(v.qty));
      if (v.type === 'split') rec.ratio = D.str(D.parse(v.ratio));
      if (flow(v)) { rec.amount = D.str(D.parse(v.amount)); rec.ccy = v.ccy; if (v.market) rec.market = v.market; }
      const cand = { ...s, txs: [...s.txs.filter(x => x.id !== rec.id), rec] };
      const p = C.positions(cand)[rec.instId];
      if (rec.instId && p?.issues.length) throw new Error(t('err.oversell'));
      mutate(st => { st.txs = cand.txs; }, auditOf(ex ? 'edit' : 'add', 'tx', rec.id));
    },
    onDelete: ex ? () => mutate(st => { st.txs = st.txs.filter(x => x.id !== ex.id); }, auditOf('delete', 'tx', ex.id)) : null,
  });
}
function infoInst() { setTimeout(() => instForm(), 0); }
export function instForm(id) {
  const s = S(), ex = id ? instOf(id) : null;
  const vals = ex ? { ...ex, distOn: !!ex.dist, distRate: ex.dist ? D.str(D.mul(D.parse(ex.dist.annualRate), D.parse(100))) : '5', nominal: ex.dist?.nominal || '1.000', exDay: ex.dist?.exDay || 21, payDay: ex.dist?.payDay || 1 } : { type: 'stock', market: 'KW', ccy: 'KWD', portfolioId: s.portfolios[0].id, distRate: '5', nominal: '1.000', exDay: 21, payDay: 1 };
  openForm({
    title: ex ? t('inst.edit') : t('inst.add'), values: vals,
    fields: [
      { k: 'symbol', label: t('inst.symbol'), type: 'text', req: true }, { k: 'name', label: t('inst.name'), type: 'text', req: true },
      { k: 'type', label: t('inst.type'), type: 'select', opts: ['stock', 'etf', 'reit', 'crypto'].map(k => ({ v: k, l: t('type.' + k) })) },
      { k: 'market', label: t('inst.market'), type: 'select', opts: [{ v: 'KW', l: 'Kuwait' }, { v: 'US', l: 'US' }, { v: 'CRYPTO', l: 'Crypto' }, { v: 'OTHER', l: 'Other' }] },
      { k: 'ccy', label: t('ccy'), type: 'select', opts: ccyOpts, hint: t('inst.ccyhint') },
      { k: 'portfolioId', label: t('inst.portfolio'), type: 'select', opts: s.portfolios.map(p => ({ v: p.id, l: p.name })) },
      { k: 'cgId', label: t('inst.cgid'), type: 'text', when: v => v.type === 'crypto', hint: t('inst.cgidhint') },
      { k: 'distOn', label: t('inst.dist'), type: 'check' },
      { k: 'distRate', label: t('inst.distrate'), type: 'num', pos: true, when: v => v.distOn }, { k: 'nominal', label: t('inst.nominal'), type: 'num', pos: true, when: v => v.distOn },
      { k: 'exDay', label: t('inst.exday'), type: 'num', pos: true, when: v => v.distOn }, { k: 'payDay', label: t('inst.payday'), type: 'num', pos: true, when: v => v.distOn }],
    onSave: v => {
      const rec = { id: ex?.id || uid(), symbol: v.symbol.toUpperCase(), name: v.name, type: v.type, market: v.market, ccy: v.ccy, portfolioId: v.portfolioId };
      if (v.type === 'crypto' && v.cgId) rec.cgId = v.cgId.toLowerCase();
      if (v.distOn) rec.dist = { annualRate: D.str(D.div(D.parse(v.distRate), D.parse(100))), nominal: D.str(D.parse(v.nominal)), exDay: Math.min(28, +v.exDay || 21), payDay: Math.min(28, +v.payDay || 1) };
      mutate(st => { const i = st.instruments.findIndex(x => x.id === rec.id); if (i >= 0) st.instruments[i] = rec; else st.instruments.push(rec); }, auditOf(ex ? 'edit' : 'add', 'instrument', rec.id));
    },
    onDelete: ex && !s.txs.some(x => x.instId === ex.id) ? () => mutate(st => { st.instruments = st.instruments.filter(x => x.id !== ex.id); delete st.prices[ex.id]; }, auditOf('delete', 'instrument', ex.id)) : null,
  });
}
export function divForm(id, preset) {
  const s = S(), ex = id ? s.dividends.find(x => x.id === id) : null;
  if (!s.instruments.length) return instForm();
  const vals = ex || preset || { instId: s.instruments[0].id, exDate: today(), payDate: today(), status: 'announced' };
  openForm({
    title: ex ? t('div.edit') : t('div.add'), values: vals, note: t('div.note'),
    fields: [
      { k: 'instId', label: t('tx.inst'), type: 'select', opts: instOpts() },
      { k: 'exDate', label: t('div.ex'), type: 'date', req: true }, { k: 'payDate', label: t('div.pay'), type: 'date', req: true },
      { k: 'perUnit', label: t('div.perunit'), type: 'num', pos: true, req: true }, { k: 'qty', label: t('tx.qty'), type: 'num', pos: true, hint: t('div.qtyhint') },
      { k: 'amount', label: t('tx.amount'), type: 'num', nonneg: true, hint: t('div.amounthint') },
      { k: 'status', label: t('div.status'), type: 'select', opts: [{ v: 'announced', l: t('div.announced') }, { v: 'received', l: t('div.received') }] },
      { k: 'receivedDate', label: t('div.recdate'), type: 'date', when: v => v.status === 'received' }],
    onSave: v => {
      const inst = instOf(v.instId), q = v.qty ? D.parse(v.qty) : C.qtyAt(s, v.instId, v.exDate);
      const amount = v.amount ? D.parse(v.amount) : D.round(D.mul(q, D.parse(v.perUnit)), dpOf(inst.ccy));
      if (amount < 0n) throw new Error(t('err.positive', { f: t('tx.amount') }));
      const rec = { id: ex?.id || uid(), instId: v.instId, exDate: v.exDate, payDate: v.payDate, perUnit: D.str(D.parse(v.perUnit)), qty: D.str(q), amount: D.str(amount), ccy: inst.ccy, status: v.status, receivedDate: v.status === 'received' ? (v.receivedDate || v.payDate) : null };
      mutate(st => { const i = st.dividends.findIndex(x => x.id === rec.id); if (i >= 0) st.dividends[i] = rec; else st.dividends.push(rec); }, auditOf(ex ? 'edit' : 'add', 'dividend', rec.id));
    },
    onDelete: ex ? () => mutate(st => { st.dividends = st.dividends.filter(x => x.id !== ex.id); }, auditOf('delete', 'dividend', ex.id)) : null,
  });
}
function crud(key, entity, idPrefix) {
  return { save: (rec, ex) => mutate(st => { const i = st[key].findIndex(x => x.id === rec.id); if (i >= 0) st[key][i] = rec; else st[key].push(rec); }, auditOf(ex ? 'edit' : 'add', entity, rec.id)),
    del: ex => mutate(st => { st[key] = st[key].filter(x => x.id !== ex.id); }, auditOf('delete', entity, ex.id)) };
}
export function simpleForm({ key, entity, id, title, fields, defaults, build }) {
  const ex = id ? S()[key].find(x => x.id === id) : null, c = crud(key, entity);
  openForm({ title, fields, values: ex || defaults, onSave: v => c.save({ id: ex?.id || uid(), ...build(v) }, ex), onDelete: ex ? () => c.del(ex) : null });
}
const numStr = v => D.str(D.parse(v));
export const forms = {
  prop: id => simpleForm({ key: 'properties', entity: 'property', id, title: t(id ? 're.edit' : 're.add'), defaults: { ccy: 'KWD', valueAsOf: today() },
    fields: [{ k: 'name', label: t('inst.name'), type: 'text', req: true }, { k: 'address', label: t('re.address'), type: 'text' }, { k: 'ccy', label: t('ccy'), type: 'select', opts: ccyOpts },
      { k: 'value', label: t('re.value'), type: 'num', nonneg: true, req: true }, { k: 'valueAsOf', label: t('re.asof'), type: 'date', req: true }, { k: 'cost', label: t('re.cost'), type: 'num', nonneg: true },
      { k: 'tenant', label: t('re.tenant'), type: 'text' }, { k: 'rent', label: t('re.rent'), type: 'num', nonneg: true }, { k: 'leaseStart', label: t('re.leasestart'), type: 'date' }, { k: 'leaseEnd', label: t('re.leaseend'), type: 'date' }, { k: 'note', label: t('note'), type: 'area' }],
    build: v => ({ name: v.name, address: v.address, ccy: v.ccy, value: numStr(v.value), valueAsOf: v.valueAsOf, cost: v.cost ? numStr(v.cost) : '', tenant: v.tenant, rent: v.rent ? numStr(v.rent) : '', leaseStart: v.leaseStart, leaseEnd: v.leaseEnd, note: v.note }) }),
  cash: id => simpleForm({ key: 'cashAccounts', entity: 'cash', id, title: t(id ? 'cash.edit' : 'cash.add'), defaults: { ccy: 'KWD', asOf: today() },
    fields: [{ k: 'name', label: t('inst.name'), type: 'text', req: true }, { k: 'bank', label: t('cash.bank'), type: 'text' }, { k: 'ccy', label: t('ccy'), type: 'select', opts: ccyOpts }, { k: 'balance', label: t('cash.balance'), type: 'num', req: true }, { k: 'asOf', label: t('re.asof'), type: 'date', req: true }],
    build: v => ({ name: v.name, bank: v.bank, ccy: v.ccy, balance: numStr(v.balance), asOf: v.asOf }) }),
  liab: id => simpleForm({ key: 'liabilities', entity: 'liability', id, title: t(id ? 'liab.edit' : 'liab.add'), defaults: { ccy: 'KWD', asOf: today(), propertyId: '' },
    fields: [{ k: 'name', label: t('inst.name'), type: 'text', req: true }, { k: 'ccy', label: t('ccy'), type: 'select', opts: ccyOpts }, { k: 'balance', label: t('cash.balance'), type: 'num', nonneg: true, req: true }, { k: 'rate', label: t('liab.rate'), type: 'num', nonneg: true }, { k: 'payment', label: t('liab.payment'), type: 'num', nonneg: true },
      { k: 'propertyId', label: t('liab.property'), type: 'select', opts: [{ v: '', l: '—' }, ...S().properties.map(p => ({ v: p.id, l: p.name }))] }, { k: 'asOf', label: t('re.asof'), type: 'date', req: true }],
    build: v => ({ name: v.name, ccy: v.ccy, balance: numStr(v.balance), rate: v.rate, payment: v.payment ? numStr(v.payment) : '', propertyId: v.propertyId || null, asOf: v.asOf }) }),
  cf: id => simpleForm({ key: 'cashflow', entity: 'cashflow', id, title: t(id ? 'cf.edit' : 'cf.add'), defaults: { type: 'expense', category: 'other', ccy: 'KWD', date: today(), propertyId: '' },
    fields: [{ k: 'type', label: t('tx.type'), type: 'select', opts: [{ v: 'income', l: t('cf.income') }, { v: 'expense', l: t('cf.expense') }] }, { k: 'category', label: t('cf.cat'), type: 'select', opts: ['salary', 'rent', 'groceries', 'utilities', 'transport', 'maintenance', 'other'].map(k => ({ v: k, l: t('cat.' + k) })) },
      { k: 'amount', label: t('tx.amount'), type: 'num', pos: true, req: true }, { k: 'ccy', label: t('ccy'), type: 'select', opts: ccyOpts }, { k: 'date', label: t('tx.date'), type: 'date', req: true },
      { k: 'propertyId', label: t('re.add').replace(/.*/, t('liab.property')), type: 'select', opts: [{ v: '', l: '—' }, ...S().properties.map(p => ({ v: p.id, l: p.name }))] }, { k: 'note', label: t('note'), type: 'text' }],
    build: v => ({ type: v.type, category: v.category, amount: numStr(v.amount), ccy: v.ccy, date: v.date, propertyId: v.propertyId || null, note: v.note }) }),
  rec: id => simpleForm({ key: 'recurring', entity: 'recurring', id, title: t(id ? 'rec.edit' : 'rec.add'), defaults: { type: 'expense', ccy: 'KWD', day: 1, active: true },
    fields: [{ k: 'name', label: t('inst.name'), type: 'text', req: true }, { k: 'type', label: t('tx.type'), type: 'select', opts: [{ v: 'income', l: t('cf.income') }, { v: 'expense', l: t('cf.expense') }] }, { k: 'amount', label: t('tx.amount'), type: 'num', pos: true, req: true }, { k: 'ccy', label: t('ccy'), type: 'select', opts: ccyOpts }, { k: 'day', label: t('rec.day'), type: 'num', pos: true, req: true }],
    build: v => ({ name: v.name, type: v.type, amount: numStr(v.amount), ccy: v.ccy, day: Math.min(28, +v.day || 1), active: true }) }),
  goal: id => simpleForm({ key: 'goals', entity: 'goal', id, title: t(id ? 'goal.edit' : 'goal.add'), defaults: { ccy: 'KWD', current: '0' },
    fields: [{ k: 'name', label: t('inst.name'), type: 'text', req: true }, { k: 'ccy', label: t('ccy'), type: 'select', opts: ccyOpts }, { k: 'target', label: t('goal.target'), type: 'num', pos: true, req: true }, { k: 'current', label: t('goal.current'), type: 'num', nonneg: true, req: true }, { k: 'targetDate', label: t('goal.date'), type: 'date' }],
    build: v => ({ name: v.name, ccy: v.ccy, target: numStr(v.target), current: numStr(v.current), targetDate: v.targetDate }) }),
};
export function pfForm() {
  openForm({ title: t('pf.add'), fields: [{ k: 'name', label: t('inst.name'), type: 'text', req: true }], onSave: v => mutate(st => { st.portfolios.push({ id: uid(), name: v.name }); }, auditOf('add', 'portfolio')) });
}
export function passForm(kind) {
  const set = kind === 'set';
  openForm({ title: set ? t('sec.set') : t('bk.enc'), note: set ? t('sec.note') : t('bk.encnote'), saveLabel: set ? t('save') : t('bk.export'),
    fields: [{ k: 'p1', label: t('pass.new'), type: 'password', req: true }, { k: 'p2', label: t('pass.confirm'), type: 'password', req: true }],
    onSave: async v => {
      if (v.p1.length < 6) throw new Error(t('err.passlen')); if (v.p1 !== v.p2) throw new Error(t('err.passmatch'));
      if (set) { await setPasscode(v.p1); ui.passcodeOn = true; toast(t('sec.done')); } else { await exportBackup(v.p1); toast(t('bk.done')); }
    } });
}
export async function importFlow(file) {
  const text = await file.text(); let pass = null;
  const go = async () => {
    try { const r = await readBackup(text, pass);
      openForm({ title: t('bk.restore'), note: t('bk.restorenote', { n: r.summary.txs, i: r.summary.instruments, s: r.summary.snapshots, c: (r.summary.createdAt || '').slice(0, 16) }), saveLabel: t('bk.restorebtn'), fields: [],
        onSave: async () => { await restore(r.state); ui.passcodeOn = ui.passcodeOn; toast(t('bk.restored')); } });
    } catch (e) {
      if (e.message === 'needpass' || e.message === 'badpass') {
        openForm({ title: t('bk.import'), note: e.message === 'badpass' ? t('err.badpass') : t('bk.needpass'), fields: [{ k: 'p', label: t('pass.pass'), type: 'password', req: true }], onSave: v => { pass = v.p; setTimeout(go, 0); } });
      } else toast(t('err.backup.' + e.message) || t('err.backup.format'));
    }
  }; await go();
}
export async function loadSample() { await replaceState(buildSample(), true); toast(t('data.sampleok')); }
export async function clearSample() { await wipeAll(); toast(t('data.cleared')); }
export function wipeForm() { openForm({ title: t('data.wipe'), note: t('data.wipenote'), saveLabel: t('data.wipe'), fields: [], onSave: async () => { await wipeAll(); ui.passcodeOn = false; } }); }
export async function doRefresh() {
  if (ui.busy) return; ui.busy = true; app.listeners.forEach(f => f());
  try { const log = await refreshAll(S()); const ok = log.filter(l => l.ok).length; toast(t('refresh.done', { ok, bad: log.length - ok })); } finally { ui.busy = false; app.listeners.forEach(f => f()); }
}
export { holdingSheet };
