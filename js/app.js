// App shell: boot, routing, rendering, event delegation, lock screen, daily catch-up.
import * as C from './calc.js';
import * as Ch from './charts.js';
import { setLang, t } from './i18n.js';
import { app, init, unlock, lockNow, mutate, onChange, hasPasscode, removePasscode, wipeAll } from './store.js';
import { exportBackup } from './backup.js';
import * as U from './ui.js';
const { ui, views, esc } = U;
const $ = (s, r = document) => r.querySelector(s);
const ROUTES = ['home', 'portfolio', 'transactions', 'assets', 'more'];
const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  portfolio: '<path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/>',
  transactions: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  assets: '<path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
};
export const LOGO = '<svg class="logo" viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a4fb8"/><stop offset="1" stop-color="#0e1b4a"/></linearGradient></defs><rect width="40" height="40" rx="11" fill="url(#lg)"/><rect x="10" y="22" width="4.5" height="9" rx="1.4" fill="#fff" opacity=".55"/><rect x="17.75" y="17" width="4.5" height="14" rx="1.4" fill="#fff" opacity=".78"/><rect x="25.5" y="12" width="4.5" height="19" rx="1.4" fill="#fff"/><path d="M9 17.5l7-5.5 5 3.5 9-8" fill="none" stroke="#34d399" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M25.5 7.5H30V12" fill="none" stroke="#34d399" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let lastAway = 0;

function applyPrefs() {
  const s = app.state.settings; setLang(s.lang);
  document.documentElement.dataset.theme = s.theme;
  const dark = s.theme === 'dark' || (s.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name="theme-color"]').setAttribute('content', dark ? '#0b1220' : '#f4f6fb');
}
function renderNav() {
  $('#nav').innerHTML = ROUTES.map(r => `<a href="#${r}" class="${ui.route === r ? 'on' : ''}" aria-label="${esc(t('nav.' + r))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[r]}</svg><span>${esc(t('nav.' + r))}</span></a>`).join('');
  const n = U.alertCount();
  $('#title').innerHTML = `<a class="brand" href="#home">${LOGO}<span class="bt"><b>محفظتي</b><small>MY PORTFOLIO</small></span></a>
    <div class="hbtns"><button class="hb" data-act="notif" aria-label="${esc(t('notif.title'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0"/></svg>${n ? `<i class="dot">${n}</i>` : ''}</button>
    <a class="hb" href="#more" aria-label="${esc(t('nav.more'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></a></div>`;
}
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
function render() {
  if (!app.state) return;
  const y = window.scrollY, v = $('#view');
  let html = views[ui.route]();
  if (ui.route === 'home' && !standalone() && !ui.hideInstall) html += `<div class="alert a-info">${esc(t('install.title'))}: ${esc(t('install.body'))} <button class="chip" data-act="hide-install">✕</button></div>`;
  v.innerHTML = html; Ch.bindCharts(v); renderNav(); window.scrollTo(0, y);
}
function route() { const r = location.hash.slice(1); ui.route = ROUTES.includes(r) ? r : 'home'; render(); window.scrollTo(0, 0); }

function catchUp() {
  if (!app.state) return;
  const before = app.state.settings.trackingStart;
  const res = C.runDailyCatchUp(app.state, new Date());
  if (res.created || res.missing.length || before !== app.state.settings.trackingStart)
    mutate(s => { if (res.created) s.audit.push({ ts: Date.now(), action: 'snapshot', entity: 'snapshot', id: res.created.date }); });
}
async function start() {
  ui.passcodeOn = await hasPasscode(); applyPrefs(); catchUp(); $('#lock').hidden = true; $('#app').hidden = false; route();
}
function showLock() {
  $('#app').hidden = true; const el = $('#lock'); el.hidden = false; setLang('en');
  el.innerHTML = `<div class="lockbox"><h1>محفظتي</h1><p class="muted" style="margin-top:-6px;letter-spacing:2px;font-size:12px">MY PORTFOLIO</p><p class="muted">Enter your passphrase · أدخل عبارة المرور</p>
    <form id="lockform"><input id="lockpass" type="password" autocomplete="current-password" autofocus><div id="lockerr" class="err"></div><button class="btn primary" type="submit">Unlock · فتح</button></form>
    <button class="chip" id="forgot" type="button">${esc(t('lock.forgot'))}</button></div>`;
  $('#lockform').addEventListener('submit', async e => {
    e.preventDefault(); const b = $('#lockform button'); b.disabled = true;
    try { await unlock($('#lockpass').value); await start(); }
    catch { $('#lockerr').textContent = t('lock.wrong'); b.disabled = false; }
  });
  $('#forgot').addEventListener('click', async e => {
    if (!e.target.dataset.arm) { e.target.dataset.arm = 1; e.target.textContent = t('confirm.delete'); return; }
    await wipeAll(); await start();
  });
}

const H = {
  'range': el => { ui.range = +el.dataset.v; render(); }, 'details': () => U.detailsSheet(), 'notif': () => U.notifSheet(), 'txtab': el => { ui.txTab = el.dataset.v; render(); }, 'mk': el => { ui.mk = el.dataset.v; render(); },
  'mkt': el => { ui.mk = el.dataset.v; location.hash = '#portfolio'; }, 'goto-div': () => { ui.txTab = 'div'; location.hash = '#transactions'; }, 'goto-assets': () => { location.hash = '#assets'; }, 'pf': el => { ui.pf = el.dataset.v; render(); }, 'filter': el => { ui.filter = el.dataset.v; render(); }, 'wtab': el => { ui.wtab = el.dataset.v; render(); },
  'month': el => { const [y, m] = (ui.month || C.kuwaitParts(new Date()).date.slice(0, 7)).split('-').map(Number), d = new Date(Date.UTC(y, m - 1 + +el.dataset.v, 1)); ui.month = d.toISOString().slice(0, 7); render(); },
  'close': () => U.closeSheet(), 'form-delete': () => U.deleteFromForm(), 'hide-install': () => { ui.hideInstall = true; render(); },
  'holding': el => U.holdingSheet(el.dataset.id),
  'add-tx': el => U.txForm(null, { inst: el.dataset.inst, type: el.dataset.type }), 'edit-tx': el => U.txForm(el.dataset.id),
  'add-inst': () => U.instForm(), 'edit-inst': el => U.instForm(el.dataset.id), 'add-pf': () => U.pfForm(), 'refresh': () => U.doRefresh(),
  'announce': el => { const f = C.forecastDividends(app.state, C.kuwaitParts(new Date()).date, 11)[+el.dataset.i]; if (f) U.divForm(null, { ...f, status: 'announced' }); },
  'add-div': () => U.divForm(), 'edit-div': el => U.divForm(el.dataset.id),
  'add-prop': () => U.forms.prop(), 'edit-prop': el => U.forms.prop(el.dataset.id), 'add-cash': () => U.forms.cash(), 'edit-cash': el => U.forms.cash(el.dataset.id),
  'add-liab': () => U.forms.liab(), 'edit-liab': el => U.forms.liab(el.dataset.id), 'add-cf': () => U.forms.cf(), 'edit-cf': el => U.forms.cf(el.dataset.id),
  'add-rec': () => U.forms.rec(), 'edit-rec': el => U.forms.rec(el.dataset.id), 'add-goal': () => U.forms.goal(), 'edit-goal': el => U.forms.goal(el.dataset.id),
  'lang': el => { mutate(s => { s.settings.lang = el.dataset.v; }); applyPrefs(); render(); },
  'theme': el => { mutate(s => { s.settings.theme = el.dataset.v; }); applyPrefs(); render(); },
  'passcode-set': () => U.passForm('set'),
  'passcode-off': () => U.openForm({ title: t('sec.remove'), note: t('sec.warn'), saveLabel: t('sec.remove'), fields: [], onSave: async () => { await removePasscode(); ui.passcodeOn = false; render(); } }),
  'export-enc': () => U.passForm('backup'), 'export-plain': async () => { await exportBackup(null); U.toast(t('bk.done')); },
  'import': () => $('#importFile').click(),
  'sample-load': () => U.loadSample(), 'sample-clear': () => U.clearSample(), 'wipe': () => U.wipeForm(),
};
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && H[el.dataset.act]) { e.preventDefault(); H[el.dataset.act](el); } });
document.addEventListener('submit', e => { if (e.target.id === 'form') { e.preventDefault(); U.submitForm(); } });
document.addEventListener('input', e => { if (e.target.closest('#form')) U.syncForm(); });
document.addEventListener('change', e => {
  if (e.target.closest('#form')) U.syncForm();
  if (e.target.id === 'importFile' && e.target.files[0]) { U.importFlow(e.target.files[0]); e.target.value = ''; }
});
window.addEventListener('hashchange', route);
onChange(() => { render(); if (app.state && $('#sheet').classList.contains('on') === false) { /* nothing */ } });
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) { lastAway = Date.now(); return; }
  if (ui.passcodeOn && app.key && lastAway && Date.now() - lastAway > 60000) { U.closeSheet(); if (await lockNow()) { showLock(); return; } }
  catchUp();
});
setInterval(() => { if (app.state && !document.hidden) catchUp(); }, 60000);
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => app.state && applyPrefs());

(async function boot() {
  const r = await init();
  if (r.locked) showLock(); else await start();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
