// Dependency-free SVG charts (line, donut, bars) with touch/hover tooltips.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const PALETTE = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)'];

/** pts: [{l:'label', v:number, s:'formatted'}] */
export function line(pts, { w = 340, h = 150 } = {}) {
  if (pts.length < 2) return `<div class="empty small">—</div>`;
  const vs = pts.map(p => p.v), min = Math.min(...vs), max = Math.max(...vs), pad = (max - min || Math.abs(max) || 1) * 0.12;
  const lo = min - pad, hi = max + pad, X = i => (i / (pts.length - 1)) * w, Y = v => h - ((v - lo) / (hi - lo)) * h;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const up = pts.at(-1).v >= pts[0].v;
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  return `<div class="chart" data-pts="${esc(JSON.stringify(pts.map(p => [p.l, p.s])))}" data-w="${w}">
  <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="trend">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${up ? 'var(--pos)' : 'var(--neg)'}" stop-opacity=".35"/><stop offset="1" stop-color="${up ? 'var(--pos)' : 'var(--neg)'}" stop-opacity="0"/></linearGradient></defs>
    <path d="${d} L${w},${h} L0,${h} Z" fill="url(#${id})"/>
    <path d="${d}" fill="none" stroke="${up ? 'var(--pos)' : 'var(--neg)'}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    <line class="cursor" x1="0" x2="0" y1="0" y2="${h}" stroke="var(--muted)" stroke-width="1" vector-effect="non-scaling-stroke" opacity="0"/>
  </svg><div class="tip" hidden></div></div>`;
}
export function donut(slices, { size = 140, center = '' } = {}) {
  const total = slices.reduce((s, x) => s + x.v, 0); if (!(total > 0)) return '';
  let off = 25; const segs = slices.map((s, i) => {
    const frac = (s.v / total) * 100, el = `<circle r="15.9155" cx="21" cy="21" fill="none" stroke="${s.c || PALETTE[i % PALETTE.length]}" stroke-width="5.2" stroke-dasharray="${Math.max(frac - 0.6, 0.01).toFixed(2)} ${(100 - Math.max(frac - 0.6, 0.01)).toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/>`;
    off -= frac; return el;
  }).join('');
  return `<svg class="donut" width="${size}" height="${size}" viewBox="0 0 42 42" role="img"><circle r="15.9155" cx="21" cy="21" fill="none" stroke="var(--line)" stroke-width="5.2"/>${segs}<text x="21" y="22.4" text-anchor="middle" font-size="4.2" fill="var(--text)" font-weight="700">${esc(center)}</text></svg>`;
}
/** items: [{l:'Jan', v:number}] */
export function bars(items, { w = 340, h = 120 } = {}) {
  const max = Math.max(...items.map(i => i.v), 0); if (!(max > 0)) return `<div class="empty small">—</div>`;
  const bw = w / items.length;
  return `<svg viewBox="0 0 ${w} ${h + 18}" class="bars" role="img">${items.map((it, i) => {
    const bh = (it.v / max) * h;
    return `<rect x="${(i * bw + bw * 0.18).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${Math.max(bh, it.v > 0 ? 2 : 0).toFixed(1)}" rx="3" fill="var(--c1)" opacity="${it.v > 0 ? 1 : 0.25}"/><text x="${(i * bw + bw / 2).toFixed(1)}" y="${h + 13}" text-anchor="middle" font-size="9" fill="var(--muted)">${esc(it.l)}</text>`;
  }).join('')}</svg>`;
}
export function bindCharts(root) {
  root.querySelectorAll('.chart').forEach(el => {
    const pts = JSON.parse(el.dataset.pts), tip = el.querySelector('.tip'), cur = el.querySelector('.cursor'), w = +el.dataset.w;
    const move = e => {
      const r = el.getBoundingClientRect(), x = Math.min(Math.max((e.clientX ?? e.touches?.[0]?.clientX) - r.left, 0), r.width);
      const i = Math.round((x / r.width) * (pts.length - 1)), p = pts[i];
      tip.hidden = false; tip.innerHTML = `<b>${esc(p[1])}</b><span>${esc(p[0])}</span>`;
      tip.style.insetInlineStart = Math.min(Math.max(x - 60, 0), r.width - 120) + 'px';
      cur.setAttribute('x1', (i / (pts.length - 1)) * w); cur.setAttribute('x2', (i / (pts.length - 1)) * w); cur.setAttribute('opacity', 1);
    };
    const end = () => { tip.hidden = true; cur.setAttribute('opacity', 0); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerdown', move); el.addEventListener('pointerleave', end); el.addEventListener('pointerup', () => setTimeout(end, 1200));
  });
}
