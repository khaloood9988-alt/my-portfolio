// Synthetic sample data for demos. Every price/FX/value here is made up and labelled "sample".
import * as D from './dec.js';
import * as C from './calc.js';
import { emptyState } from './store.js';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const ago = (today, n) => C.addDays(today, -n);

export function buildSample(now = new Date()) {
  const today = C.kuwaitParts(now).date;
  const s = emptyState();
  s.settings.sampleMode = true; s.settings.trackingStart = ago(today, 90);
  s.portfolios = [{ id: 'p1', name: 'Main Portfolio' }, { id: 'p2', name: 'Crypto' }];
  s.fx.USD = { rate: '0.3090', date: ago(today, 1), source: 'Sample data', fetchedAt: now.toISOString() };
  const I = (id, symbol, name, type, market, ccy, portfolioId, extra = {}) => ({ id, symbol, name, type, market, ccy, portfolioId, ...extra });
  s.instruments = [
    I('nbk', 'NBK', 'National Bank of Kuwait', 'stock', 'KW', 'KWD', 'p1'),
    I('zain', 'ZAIN', 'Zain', 'stock', 'KW', 'KWD', 'p1'),
    I('bait', 'BAITAKREIT', 'KFH Capital REIT', 'reit', 'KW', 'KWD', 'p1', { dist: { annualRate: '0.05', nominal: '1.000', exDay: 21, payDay: 1 } }),
    I('aapl', 'AAPL', 'Apple Inc.', 'stock', 'US', 'USD', 'p1'),
    I('msft', 'MSFT', 'Microsoft', 'stock', 'US', 'USD', 'p1'),
    I('voo', 'VOO', 'Vanguard S&P 500 ETF', 'etf', 'US', 'USD', 'p1'),
    I('btc', 'BTC', 'Bitcoin', 'crypto', 'CRYPTO', 'USD', 'p2', { cgId: 'bitcoin' }),
    I('eth', 'ETH', 'Ethereum', 'crypto', 'CRYPTO', 'USD', 'p2', { cgId: 'ethereum' }),
  ];
  let n = 0;
  const tx = (type, instId, daysAgo, qty, price, fee = '0', extra = {}) => s.txs.push({ id: 't' + (++n), ts: n, type, instId, date: ago(today, daysAgo), qty, price, fee, ccy: s.instruments.find(i => i.id === instId)?.ccy, ...extra });
  tx('buy', 'nbk', 400, '2000', '0.850', '5.000'); tx('buy', 'nbk', 150, '1000', '0.930', '3.000'); tx('sell', 'nbk', 40, '500', '1.010', '2.500');
  tx('buy', 'zain', 300, '3000', '0.540', '4.000'); tx('bonus', 'zain', 120, '150');
  tx('buy', 'bait', 200, '5000', '1.000', '0');
  tx('buy', 'aapl', 330, '40', '170.00', '1.00'); tx('buy', 'aapl', 100, '20', '195.50', '1.00');
  tx('buy', 'msft', 260, '15', '330.00', '1.00'); tx('split', 'msft', 60, null, null, '0', { ratio: '2' });
  tx('buy', 'voo', 280, '12', '410.00', '0.50'); tx('buy', 'voo', 50, '8', '500.00', '0.50');
  tx('buy', 'btc', 250, '0.15', '42000', '10'); tx('buy', 'eth', 220, '2.5', '2300', '5'); tx('sell', 'eth', 30, '0.5', '3100', '3');
  for (const [d, a, m] of [[420, '2500', 'KW'], [300, '2500', 'KW'], [330, '2000', 'US'], [100, '1500', 'US'], [250, '700', 'CRYPTO'], [70, '300', 'CRYPTO']]) s.txs.push({ id: 't' + (++n), ts: n, type: 'deposit', date: ago(today, d), amount: a, ccy: 'KWD', market: m, note: 'Sample deposit' });
  s.txs.push({ id: 't' + (++n), ts: n, type: 'withdraw', date: ago(today, 25), amount: '400', ccy: 'KWD', market: 'KW', note: 'Sample withdrawal' });
  // sample prices (kind 'sample' = not a market quote); BAITAKREIT intentionally has none -> cost-based estimate demo
  const P = (id, price, ccy, back = 1) => { s.prices[id] = { price, ccy, source: 'Sample data', priceDate: ago(today, back), fetchedAt: now.toISOString(), kind: 'sample' }; };
  P('nbk', '0.985', 'KWD'); P('zain', '0.575', 'KWD'); P('aapl', '227.40', 'USD'); P('msft', '212.30', 'USD'); P('voo', '541.20', 'USD'); P('btc', '97250', 'USD'); P('eth', '3180', 'USD');
  // dividends: received / announced
  const dv = (instId, exAgo, payAgo, perUnit, status, qty) => { const ccy = s.instruments.find(i => i.id === instId).ccy; s.dividends.push({ id: 'd' + (++n), instId, exDate: ago(today, exAgo), payDate: ago(today, payAgo), perUnit, qty, amount: D.str(D.round(D.mul(D.parse(qty), D.parse(perUnit)), ccy === 'KWD' ? 3 : 2)), ccy, status, receivedDate: status === 'received' ? ago(today, payAgo) : null }); };
  for (const k of [3, 2, 1]) dv('bait', 30 * k + 8, 30 * k - 2, '0.0042', 'received', '5000');
  dv('nbk', 200, 180, '0.035', 'received', '3000'); dv('aapl', 80, 70, '0.25', 'received', '60'); dv('voo', 70, 60, '1.75', 'received', '20');
  dv('zain', -10, -20, '0.025', 'announced', '3150');
  s.cashAccounts = [{ id: 'c1', name: 'Main current account', bank: 'Sample Bank', ccy: 'KWD', balance: '6250.500', asOf: ago(today, 1) }, { id: 'c2', name: 'USD savings', bank: 'Sample Bank', ccy: 'USD', balance: '4800.00', asOf: ago(today, 2) }];
  s.properties = [{ id: 'r1', name: 'Salmiya apartment', address: 'Salmiya, Kuwait', ccy: 'KWD', value: '98000.000', valueAsOf: ago(today, 60), cost: '85000.000', tenant: 'Sample Tenant', rent: '450.000', leaseStart: ago(today, 200), leaseEnd: C.addDays(today, 165), note: 'Owner estimate' }];
  s.liabilities = [{ id: 'l1', name: 'Apartment mortgage', ccy: 'KWD', balance: '41500.000', rate: '4.5', payment: '320.000', propertyId: 'r1', asOf: ago(today, 5) }, { id: 'l2', name: 'Car loan', ccy: 'KWD', balance: '3200.000', rate: '3.0', payment: '150.000', propertyId: null, asOf: ago(today, 5) }];
  const cf = (daysAgo, type, category, amount, extra = {}) => s.cashflow.push({ id: 'f' + (++n), date: ago(today, daysAgo), type, category, amount, ccy: 'KWD', note: '', ...extra });
  for (const m of [0, 1, 2, 3]) {
    const b = m * 30; cf(b + 2, 'income', 'salary', '2100.000'); cf(b + 3, 'income', 'rent', '450.000', { propertyId: 'r1' });
    cf(b + 4, 'expense', 'rent', '320.000', { note: 'Mortgage payment', propertyId: 'r1' }); cf(b + 6, 'expense', 'groceries', '310.000'); cf(b + 9, 'expense', 'utilities', '55.000'); cf(b + 12, 'expense', 'transport', '90.000'); cf(b + 15, 'expense', 'other', '140.000');
  }
  cf(40, 'expense', 'maintenance', '120.000', { propertyId: 'r1', note: 'AC service' });
  s.recurring = [{ id: 'q1', name: 'Mortgage', amount: '320.000', ccy: 'KWD', type: 'expense', day: 4, active: true }, { id: 'q2', name: 'Internet', amount: '18.000', ccy: 'KWD', type: 'expense', day: 10, active: true }, { id: 'q3', name: 'Salary', amount: '2100.000', ccy: 'KWD', type: 'income', day: 2, active: true }];
  s.goals = [{ id: 'g1', name: 'Emergency fund', ccy: 'KWD', target: '10000.000', current: '6250.500', targetDate: C.addDays(today, 240) }, { id: 'g2', name: 'Family trip', ccy: 'KWD', target: '2500.000', current: '900.000', targetDate: C.addDays(today, 120) }];
  // synthetic history for charts: walk backwards from the current valuation (marked sample)
  const val = C.valuation(s, now), nw = C.netWorth(s, val), r = rng(7);
  let inv = nw.investments, cash = nw.cash; const re = nw.realEstate, liab = nw.liabilities;
  const snaps = [];
  for (let k = 1; k <= 90; k++) {
    const d = ago(today, k), dNext = ago(today, k - 1);
    const flowNext = C.cumulativeFlows(s, dNext) - C.cumulativeFlows(s, d);
    const ret = D.fromNum((r() - 0.47) * 0.018);
    inv = D.div(inv - flowNext, D.ONE + ret);
    cash += D.fromNum((r() - 0.5) * 30);
    const total = inv + cash + re - liab;
    snaps.push({ date: d, scheduledAt: d + 'T19:00:00+03:00', executedAt: d + 'T16:00:05Z', delayed: false, delayMin: 0, netWorth: D.str(total), investments: D.str(inv), cash: D.str(cash), realEstate: D.str(re), liabilities: D.str(liab), cost: D.str(val.allCost), cumFlow: D.str(C.cumulativeFlows(s, d)), priceCounts: {}, fxUsed: {}, sample: true, final: true });
  }
  s.snapshots = snaps.reverse();
  s.settings.lang = 'en';
  return s;
}
