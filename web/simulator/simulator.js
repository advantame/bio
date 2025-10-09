import { initWasm, runSimulationPhysical } from "../core.js";
import { buildSimulationVariants } from "../modifications.js";

const cvTS = document.getElementById('cv_ts');
const cvPH = document.getElementById('cv_phase');
const ctxTS = cvTS.getContext('2d', { alpha: false });
const ctxPH = cvPH.getContext('2d', { alpha: false });
const status = byId('status');
const busy = byId('busy');
const resetBtn = byId('resetBtn');
const legendEl = byId('legend');
const modSummaryEl = byId('modSummary');

const s = bindSliders([
  'pol','rec','G','r_assoc','r_nick','r_poly','k2','kN','kP','KmP','N0','P0','t_end','dt'
]);

const DEFAULTS = {
  // SI S5: PP1 optimized / standard-like conditions
  pol: 3.7,
  rec: 32.5,
  G: 150,
  r_assoc: 1.0,
  r_nick: 1.0,
  r_poly: 1.0,
  k2: 0.0031,
  kN: 0.0210,
  kP: 0.0047,
  KmP: 34,
  N0: 10,
  P0: 10,
  t_end: 2000,
  dt: 0.5,
};

// Baseline values for k1 and b (used when all ratios = 1)
const K1_BASE = 0.0020;
const B_BASE = 0.000048;

const BASELINE_COLORS = { prey: '#f97316', pred: '#2c7a7b', lineDash: [] };
const ACTIVE_COLORS = { prey: '#2563eb', pred: '#0ea5e9', lineDash: [] };
const OVERLAY_PALETTE = [
  { prey: '#9333ea', pred: '#c084fc', lineDash: [6, 4] },
  { prey: '#22c55e', pred: '#0f766e', lineDash: [6, 4] },
  { prey: '#f43f5e', pred: '#fb7185', lineDash: [4, 4] },
  { prey: '#14b8a6', pred: '#0ea5e9', lineDash: [4, 4] },
];


resetBtn.addEventListener('click', () => {
  for (const k of Object.keys(DEFAULTS)) setVal(k, DEFAULTS[k]);
  requestUpdate();
});

// ---------- Axis helpers ----------
function niceNum(range, round){
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction;
  if (round) {
    if (fraction < 1.5)      niceFraction = 1;
    else if (fraction < 3.0) niceFraction = 2;
    else if (fraction < 7.0) niceFraction = 5;
    else                     niceFraction = 10;
  } else {
    if (fraction <= 1.0)     niceFraction = 1;
    else if (fraction <= 2.0)niceFraction = 2;
    else if (fraction <= 5.0)niceFraction = 5;
    else                     niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exponent);
}
function niceAxis(min, max, maxTicks=6){
  const range = niceNum(max - min || 1, false);
  const step  = niceNum(range / (maxTicks - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil (max / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + 0.5*step; v += step) ticks.push(v);
  return {min:niceMin, max:niceMax, step, ticks};
}

// ---------- Drawing ----------
function drawTimeSeries(seriesList, dt){
  const W = cvTS.width, H = cvTS.height;
  const L = 70, R = 30, T = 50, B = 60;

  ctxTS.save();
  ctxTS.fillStyle = '#fff';
  ctxTS.fillRect(0,0,W,H);
  ctxTS.restore();

  if (!seriesList.length) return;

  let dataYmin = Infinity;
  let dataYmax = -Infinity;
  let nMax = 0;
  for (const series of seriesList){
    nMax = Math.max(nMax, series.prey.length);
    for (const v of series.prey){ if (v < dataYmin) dataYmin = v; if (v > dataYmax) dataYmax = v; }
    for (const v of series.P){ if (v < dataYmin) dataYmin = v; if (v > dataYmax) dataYmax = v; }
  }
  const yPad = 0.05 * (dataYmax - dataYmin || 1);
  const yTicks  = niceAxis(dataYmin - yPad, dataYmax + yPad, 6);
  const tMax = (nMax - 1) * dt;
  const xTicks  = niceAxis(0, Math.max(0, tMax), 7);

  const axisWidth = Math.max(1, xTicks.max - xTicks.min);
  const axisHeight = Math.max(1, yTicks.max - yTicks.min);
  const xOf = (timeMin) => L + ((timeMin - xTicks.min)/axisWidth) * (W - L - R);
  const yOf = (v) => H - B - ((v - yTicks.min)/axisHeight) * (H - T - B);

  ctxTS.strokeStyle = '#eef2f7';
  ctxTS.lineWidth = 1;
  ctxTS.beginPath();
  for (const xv of xTicks.ticks){ const x = xOf(xv); ctxTS.moveTo(x,T); ctxTS.lineTo(x,H-B);} 
  for (const yv of yTicks.ticks){ const y = yOf(yv); ctxTS.moveTo(L,y); ctxTS.lineTo(W-R,y);} 
  ctxTS.stroke();

  ctxTS.strokeStyle = '#e5e7eb';
  ctxTS.strokeRect(L, T, W - L - R, H - T - B);

  for (const series of seriesList){
    ctxTS.lineWidth = series.type === 'baseline' ? 2.4 : 1.9;
    ctxTS.setLineDash(series.lineDash || []);
    ctxTS.beginPath();
    const prey = series.prey;
    for (let i=0;i<prey.length;i++){
      const t = i * dt;
      const x = xOf(t);
      const y = yOf(prey[i]);
      if (i === 0) ctxTS.moveTo(x,y); else ctxTS.lineTo(x,y);
    }
    ctxTS.strokeStyle = series.colors.prey;
    ctxTS.stroke();

    ctxTS.beginPath();
    const P = series.P;
    for (let i=0;i<P.length;i++){
      const t = i * dt;
      const x = xOf(t);
      const y = yOf(P[i]);
      if (i === 0) ctxTS.moveTo(x,y); else ctxTS.lineTo(x,y);
    }
    ctxTS.strokeStyle = series.colors.pred;
    ctxTS.stroke();
  }

  ctxTS.setLineDash([]);
  ctxTS.fillStyle = '#0f172a';
  ctxTS.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxTS.textAlign = 'center'; ctxTS.textBaseline = 'top';
  const xRange = Math.abs(xTicks.max - xTicks.min);
  const xDigits = xRange >= 100 ? 0 : (xRange >= 10 ? 1 : 2);
  for (const xv of xTicks.ticks){ const x = xOf(xv); ctxTS.fillText(xv.toFixed(xDigits), x, H - B + 6); }
  ctxTS.textAlign = 'right'; ctxTS.textBaseline = 'middle';
  const absRange = Math.abs(yTicks.max - yTicks.min);
  const digits = absRange >= 100 ? 0 : (absRange >= 10 ? 1 : 2);
  for (const yv of yTicks.ticks){ ctxTS.fillText(yv.toFixed(digits), L - 8, yOf(yv)); }
  ctxTS.fillStyle = '#111827';
  ctxTS.textAlign = 'center'; ctxTS.textBaseline = 'bottom';
  ctxTS.font = '13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxTS.fillText('time [min]', L + (W - L - R)/2, H - 8);
  ctxTS.save();
  ctxTS.translate(16, T + (H - T - B)/2); ctxTS.rotate(-Math.PI/2);
  ctxTS.textAlign = 'center'; ctxTS.textBaseline = 'top';
  ctxTS.fillText('Concentration [nM]', 0, 0);
  ctxTS.restore();
  ctxTS.textAlign = 'center'; ctxTS.textBaseline = 'top';
  ctxTS.font = '16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxTS.fillText('Time Series (Prey vs Predator)', L + (W - L - R)/2, 12);
}

function drawPhase(seriesList){
  const W = cvPH.width, H = cvPH.height;
  const L = 70, R = 30, T = 50, B = 60;

  ctxPH.save(); ctxPH.fillStyle = '#fff'; ctxPH.fillRect(0,0,W,H); ctxPH.restore();
  if (!seriesList.length) return;

  let xMin = Infinity, xMax = -Infinity;
  let yMin = Infinity, yMax = -Infinity;
  for (const series of seriesList){
    for (const v of series.prey){ if (v < xMin) xMin = v; if (v > xMax) xMax = v; }
    for (const v of series.P){ if (v < yMin) yMin = v; if (v > yMax) yMax = v; }
  }
  const xPad = 0.05 * (xMax - xMin || 1);
  const yPad = 0.05 * (yMax - yMin || 1);
  const xTicks = niceAxis(xMin - xPad, xMax + xPad, 6);
  const yTicks = niceAxis(yMin - yPad, yMax + yPad, 6);

  const xOf = (v) => L + ((v - xTicks.min)/(xTicks.max - xTicks.min || 1)) * (W - L - R);
  const yOf = (v) => H - B - ((v - yTicks.min)/(yTicks.max - yTicks.min || 1)) * (H - T - B);

  ctxPH.strokeStyle = '#eef2f7'; ctxPH.lineWidth = 1; ctxPH.beginPath();
  for (const xv of xTicks.ticks){ const x = xOf(xv); ctxPH.moveTo(x,T); ctxPH.lineTo(x,H-B);} 
  for (const yv of yTicks.ticks){ const y = yOf(yv); ctxPH.moveTo(L,y); ctxPH.lineTo(W-R,y);} 
  ctxPH.stroke();

  ctxPH.strokeStyle = '#e5e7eb';
  ctxPH.strokeRect(L, T, W - L - R, H - T - B);

  for (const series of seriesList){
    ctxPH.lineWidth = series.type === 'baseline' ? 2.0 : 1.7;
    ctxPH.setLineDash(series.lineDash || []);
    ctxPH.beginPath();
    const prey = series.prey;
    const P = series.P;
    for (let i=0;i<prey.length;i++){
      const x = xOf(prey[i]);
      const y = yOf(P[i]);
      if (i === 0) ctxPH.moveTo(x,y); else ctxPH.lineTo(x,y);
    }
    ctxPH.strokeStyle = series.colors.pred;
    ctxPH.stroke();
  }

  ctxPH.setLineDash([]);

  ctxPH.fillStyle = '#0f172a';
  ctxPH.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxPH.textAlign = 'center'; ctxPH.textBaseline = 'top';
  for (const xv of xTicks.ticks){ const x = xOf(xv); ctxPH.fillText(String(roundSmart(xv)), x, H - B + 6); }
  ctxPH.textAlign = 'right'; ctxPH.textBaseline = 'middle';
  for (const yv of yTicks.ticks){ ctxPH.fillText(String(roundSmart(yv)), L - 8, yOf(yv)); }

  ctxPH.fillStyle = '#111827';
  ctxPH.textAlign = 'center'; ctxPH.textBaseline = 'bottom';
  ctxPH.font = '13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxPH.fillText('Prey [nM]', L + (W - L - R)/2, H - 8);
  ctxPH.save();
  ctxPH.translate(16, T + (H - T - B)/2); ctxPH.rotate(-Math.PI/2);
  ctxPH.textAlign = 'center'; ctxPH.textBaseline = 'top';
  ctxPH.fillText('P [nM]', 0, 0);
  ctxPH.restore();
  ctxPH.textAlign = 'center'; ctxPH.textBaseline = 'top';
  ctxPH.font = '16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxPH.fillText('Phase Portrait (Prey vs P)', L + (W - L - R)/2, 12);
}

function roundSmart(v){
  const a = Math.abs(v);
  if (a >= 100) return Math.round(v);
  if (a >= 10)  return Math.round(v*10)/10;
  return Math.round(v*100)/100;
}

function styleForVariant(variant, overlayIndex){
  if (variant.type === 'baseline') {
    return { colors: { prey: BASELINE_COLORS.prey, pred: BASELINE_COLORS.pred }, lineDash: BASELINE_COLORS.lineDash || [] };
  }
  if (variant.type === 'active') {
    return { colors: { prey: ACTIVE_COLORS.prey, pred: ACTIVE_COLORS.pred }, lineDash: ACTIVE_COLORS.lineDash || [] };
  }
  const palette = OVERLAY_PALETTE[overlayIndex % OVERLAY_PALETTE.length];
  return {
    colors: { prey: palette.prey, pred: palette.pred },
    lineDash: palette.lineDash ? [...palette.lineDash] : [],
  };
}

function renderLegend(seriesList){
  if (!legendEl) return;
  legendEl.innerHTML = '';
  if (!seriesList.length) return;
  for (const series of seriesList){
    const row = document.createElement('div');
    row.className = 'legend-row';
    const swatches = document.createElement('div');
    swatches.className = 'legend-swatches';
    const preySw = document.createElement('span');
    preySw.className = 'swatch';
    preySw.style.background = series.colors.prey;
    const predSw = document.createElement('span');
    predSw.className = 'swatch';
    predSw.style.background = series.colors.pred;
    swatches.appendChild(preySw);
    swatches.appendChild(predSw);
    const label = document.createElement('span');
    const typeLabel = series.type === 'baseline' ? 'Baseline' : (series.type === 'active' ? 'Active' : 'Overlay');
    label.innerHTML = `<strong>${series.label}</strong> · ${typeLabel}`;
    row.appendChild(swatches);
    row.appendChild(label);
    legendEl.appendChild(row);
  }
}

function updateModSummary(seriesList){
  if (!modSummaryEl) return;
  const baseline = seriesList.find((s) => s.type === 'baseline');
  const active = seriesList.find((s) => s.type === 'active');

  // Display current k1 and b values computed from ratios
  const r_assoc = gNum('r_assoc');
  const r_nick = gNum('r_nick');
  const r_poly = gNum('r_poly');
  const k1 = K1_BASE * (r_assoc * r_poly / r_nick);
  const b = B_BASE * (r_assoc / r_nick);

  let summary = `Current: k1=${k1.toExponential(3)}, b=${b.toExponential(3)} (r_assoc=${r_assoc.toFixed(2)}, r_nick=${r_nick.toFixed(2)}, r_poly=${r_poly.toFixed(2)})`;

  if (active) {
    const ratioK1 = baseline ? active.derived.k1Eff / baseline.derived.k1Eff : 1;
    const ratioB = baseline ? active.derived.bEff / baseline.derived.bEff : 1;
    summary += ` | ${active.label}: k1'=${active.derived.k1Eff.toExponential(3)} (${ratioK1.toFixed(2)}×), b'=${active.derived.bEff.toExponential(3)} (${ratioB.toFixed(2)}×)`;
  }

  modSummaryEl.textContent = summary;
}

// ---------- Engine ----------
let needUpdate = true;
function requestUpdate(){ needUpdate = true; }

window.addEventListener('storage', () => requestUpdate());
window.addEventListener('focus', () => requestUpdate());

function getVals(){
  const r_assoc = gNum('r_assoc');
  const r_nick = gNum('r_nick');
  const r_poly = gNum('r_poly');

  // Compute k1 and b from ratios
  const k1 = K1_BASE * (r_assoc * r_poly / r_nick);
  const b = B_BASE * (r_assoc / r_nick);

  return {
    pol: gNum('pol'), rec: gNum('rec'), G: gNum('G'),
    k1, k2: gNum('k2'), kN: gNum('kN'), kP: gNum('kP'), b, KmP: gNum('KmP'),
    N0: gNum('N0'), P0: gNum('P0'),
    t_end_min: gNum('t_end'), dt_min: gNum('dt')
  };
}

function setBusy(vis){ busy.style.display = vis ? 'inline-flex' : 'none'; }

async function animate(){
  if (needUpdate) {
    needUpdate = false; setBusy(true);
    const t0 = performance.now();
    const baseParams = getVals();
    const variants = buildSimulationVariants(baseParams);

    const seriesList = [];
    let overlayIndex = 0;
    for (const variant of variants){
      const style = styleForVariant(variant, overlayIndex);
      if (variant.type === 'overlay') overlayIndex++;
      const { N: nSeries, P: pSeries } = runSimulationPhysical(variant.params);
      const rawN = Array.from(nSeries);
      const rawP = Array.from(pSeries);
      const prey = rawN.map((v) => 400 - v);
      seriesList.push({
        id: variant.id,
        label: variant.label,
        type: variant.type,
        colors: style.colors,
        lineDash: style.lineDash,
        N: rawN,
        P: rawP,
        prey,
        derived: variant.derived,
      });
    }

    drawTimeSeries(seriesList, baseParams.dt_min);
    drawPhase(seriesList);
    renderLegend(seriesList);
    updateModSummary(seriesList);

    const t1 = performance.now();
    const points = seriesList[0]?.N.length ?? 0;
    status.textContent = `calc+draw: ${(t1 - t0).toFixed(1)} ms | series: ${seriesList.length} | points: ${points}`;
    setBusy(false);
  }
  requestAnimationFrame(animate);
}

// ---------- Startup ----------
await initWasm();
for (const k of Object.keys(DEFAULTS)) setVal(k, DEFAULTS[k]);
requestUpdate();
animate();

// ---------- UI helpers ----------
function bindSliders(keys){
  const out = {};
  for (const key of keys){
    out[key] = byId(key);
    out[key+"_n"] = byId(key+"_n");
    const r = out[key], n = out[key+"_n"]; if (!r || !n) continue;
    r.addEventListener('input', () => { n.value = r.value; requestUpdate(); });
    n.addEventListener('input', () => { r.value = n.value; requestUpdate(); });
  }
  return out;
}
function setVal(key, val){ const r = byId(key), n = byId(key+"_n"); if(r){ r.value = val; } if(n){ n.value = val; } }
function gNum(key){ return parseFloat(byId(key).value); }
function byId(id){ return document.getElementById(id); }
