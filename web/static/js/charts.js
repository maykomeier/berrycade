/* Lightweight SVG charts: semicircular gauges and grouped bar charts. */
"use strict";
SW.chart = {};

/* Gauge: value 0..max, colored by thresholds [warn, bad] (in value units). */
SW.chart.gauge = ({ value, max = 100, label, text, sub = "", warn = 70, bad = 90 }) => {
  const v = value == null || isNaN(value) ? null : Math.max(0, Math.min(max, value));
  const frac = v == null ? 0 : v / max;
  const R = 70, cx = 90, cy = 88, sw = 16;
  const pt = (f) => { const a = Math.PI * (1 - f); return [cx + R * Math.cos(a), cy - R * Math.sin(a)]; };
  const arc = (f0, f1) => { const [x0, y0] = pt(f0), [x1, y1] = pt(f1); return `M${x0.toFixed(1)},${y0.toFixed(1)} A${R},${R} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}`; }; // semicircle: never a "large arc"
  const color = v == null ? "var(--border-strong)" : v >= bad ? "var(--bad)" : v >= warn ? "var(--warn)" : "var(--accent)";
  const ticks = [warn / max, bad / max].map((f) => { const [x0, y0] = pt(f); const a = Math.PI * (1 - f); const x1 = cx + (R + 11) * Math.cos(a), y1 = cy - (R + 11) * Math.sin(a); return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="var(--muted)" stroke-width="1.5"/>`; }).join("");
  return `<div class="gauge"><svg viewBox="0 0 180 104" role="img" aria-label="${SW.esc(label)} ${SW.esc(text)}">
    <path d="${arc(0, 1)}" stroke="var(--border)" stroke-width="${sw}" fill="none" stroke-linecap="round"/>
    ${frac > 0.002 ? `<path d="${arc(0, Math.min(frac, 0.999))}" stroke="${color}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>` : ""}
    ${ticks}
    <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="24" font-weight="600" fill="var(--text)">${SW.esc(text ?? "—")}</text>
    <text x="${cx - R}" y="${cy + 14}" text-anchor="middle" font-size="10" fill="var(--muted)">0</text>
    <text x="${cx + R}" y="${cy + 14}" text-anchor="middle" font-size="10" fill="var(--muted)">${max}</text>
  </svg><div class="lbl">${SW.esc(label)}</div><div class="sub">${sub}</div></div>`;
};

/* Grouped bars (download/upload) over time. series: [{t, rx, tx}] in bits/s. */
SW.chart.bars = (el, series, { maxBars = 60, colors = ["var(--accent)", "var(--chart-2)"], labels = ["Download", "Upload"] } = {}) => {
  const W = Math.max(300, el.clientWidth || 600), H = 190, padL = 62, padB = 22, padT = 10, padR = 8;
  const data = series.slice(-maxBars);
  const max = Math.max(1000, ...data.map((d) => Math.max(d.rx, d.tx)));
  // nice scale
  const mag = Math.pow(10, Math.floor(Math.log10(max)));
  const top = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= max) || max;
  const iw = W - padL - padR, ih = H - padT - padB;
  const slot = iw / maxBars, bw = Math.max(1, slot / 2 - 1);
  let g = "";
  for (let i = 0; i <= 4; i++) {
    const y = padT + ih - (ih * i) / 4;
    g += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="var(--border)" stroke-width="1"/>`;
    g += `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)">${SW.fmtBits((top * i) / 4)}</text>`;
  }
  const off = maxBars - data.length;
  data.forEach((d, i) => {
    const x = padL + (off + i) * slot;
    const hr = (d.rx / top) * ih, ht = (d.tx / top) * ih;
    const tip = `${new Date(d.t * 1000).toLocaleTimeString("pt-BR")} — ↓ ${SW.fmtBits(d.rx)} / ↑ ${SW.fmtBits(d.tx)}`;
    g += `<g><title>${tip}</title><rect x="${x.toFixed(1)}" y="${(padT + ih - hr).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, hr).toFixed(1)}" fill="${colors[0]}" rx="1"/>
          <rect x="${(x + bw + 1).toFixed(1)}" y="${(padT + ih - ht).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, ht).toFixed(1)}" fill="${colors[1]}" rx="1"/></g>`;
  });
  if (data.length) {
    const t0 = new Date(data[0].t * 1000).toLocaleTimeString("pt-BR"), t1 = new Date(data[data.length - 1].t * 1000).toLocaleTimeString("pt-BR");
    g += `<text x="${padL + off * slot}" y="${H - 5}" font-size="10.5" fill="var(--muted)">${t0}</text>`;
    g += `<text x="${W - padR}" y="${H - 5}" font-size="10.5" text-anchor="end" fill="var(--muted)">${t1}</text>`;
  } else {
    g += `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="var(--muted)">coletando amostras…</text>`;
  }
  const last = data[data.length - 1] || { rx: 0, tx: 0 };
  el.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}</svg>
    <div class="chart-legend"><span><i style="background:${colors[0]}"></i>${labels[0]}: <b>${SW.fmtBits(last.rx)}</b></span>
    <span><i style="background:${colors[1]}"></i>${labels[1]}: <b>${SW.fmtBits(last.tx)}</b></span>
    <span>pico ↓ ${SW.fmtBits(Math.max(0, ...data.map((d) => d.rx)))} · ↑ ${SW.fmtBits(Math.max(0, ...data.map((d) => d.tx)))}</span></div>`;
};

/* Tiny sparkline (CPU history). */
SW.chart.spark = (vals, { w = 220, h = 36, max = 100 } = {}) => {
  if (!vals.length) return "";
  const step = w / Math.max(1, vals.length - 1);
  const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.5"/></svg>`;
};
