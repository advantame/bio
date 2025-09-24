import { initWasm, runSimulationPhysical } from "../core.js";
import {
  initModificationStore,
  subscribe as subscribeModificationStore,
  getActiveModification,
  listModifications,
  getAnalysisPrefs,
} from "../modifications/store.js";
import {
  DEFAULT_EFFECT,
  computeEffectFromModification,
  applyEffectToParams,
} from "../modifications/apply.js";

const cvTS = document.getElementById('cv_ts');
const cvPH = document.getElementById('cv_phase');
const ctxTS = cvTS.getContext('2d', { alpha: false });
const ctxPH = cvPH.getContext('2d', { alpha: false });
const status = byId('status');
const busy = byId('busy');
const resetBtn = byId('resetBtn');
const legendEl = document.getElementById('legend');

const BASELINE_ID = 'mod-default';
const ACTIVE_STYLE = Object.freeze({ preyColor: '#f28c28', predColor: '#2c7a7b', width: 2.2 });
const BASELINE_STYLE = Object.freeze({ preyColor: '#fcd34d', predColor: '#60a5fa', width: 1.8, dash: [6, 4] });
const OVERLAY_STYLES = Object.freeze([
  { preyColor: '#6366f1', predColor: '#4338ca', dash: [4, 3], width: 1.6 },
  { preyColor: '#f472b6', predColor: '#be185d', dash: [3, 3], width: 1.6 },
  { preyColor: '#22c55e', predColor: '#15803d', dash: [5, 4], width: 1.6 },
  { preyColor: '#f97316', predColor: '#c2410c', dash: [2, 3], width: 1.6 },
  { preyColor: '#14b8a6', predColor: '#0f766e', dash: [6, 3], width: 1.6 },
]);

const s = bindSliders([
  'pol','rec','G','k1','k2','kN','kP','b','KmP','N0','P0','t_end','dt'
]);

const DEFAULTS = {
  // SI S5: PP1 optimized / standard-like conditions
  pol: 3.7,
  rec: 32.5,
  G: 150,
  k1: 0.0020,
  k2: 0.0031,
  kN: 0.0210,
  kP: 0.0047,
  b:  0.000048,
  KmP: 34,
  N0: 10,
  P0: 10,
  t_end: 2000,
  dt: 0.5,
};

let modificationEffect = { ...DEFAULT_EFFECT };
let analysisPrefs = { showBaseline: true, showDelta: true, overlays: [] };
let modificationsById = new Map();

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
function drawTimeSeries(seriesList) {
  const W = cvTS.width, H = cvTS.height;
  const L = 70, R = 30, T = 50, B = 60;

  ctxTS.save();
  ctxTS.fillStyle = '#fff';
  ctxTS.fillRect(0, 0, W, H);
  ctxTS.restore();

  if (!seriesList.length) {
    return;
  }

  let dataMin = Infinity;
  let dataMax = -Infinity;
  let maxLength = 0;
  for (const series of seriesList) {
    const { Prey, P } = series;
    maxLength = Math.max(maxLength, Prey.length);
    for (const value of Prey) {
      if (value < dataMin) dataMin = value;
      if (value > dataMax) dataMax = value;
    }
    for (const value of P) {
      if (value < dataMin) dataMin = value;
      if (value > dataMax) dataMax = value;
    }
  }
  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
    dataMin = 0;
    dataMax = 1;
  }

  const yPad = 0.05 * (dataMax - dataMin || 1);
  const yTicks = niceAxis(dataMin - yPad, dataMax + yPad, 6);
  const xDomainMax = Math.max(0, maxLength - 1);
  const xTicks = niceAxis(0, xDomainMax, 7);

  const xRange = xTicks.max - xTicks.min || 1;
  const yRange = yTicks.max - yTicks.min || 1;
  const xOf = (i) => L + ((i - xTicks.min) / xRange) * (W - L - R);
  const yOf = (v) => H - B - ((v - yTicks.min) / yRange) * (H - T - B);

  ctxTS.setLineDash([]);
  ctxTS.strokeStyle = '#eef2f7';
  ctxTS.lineWidth = 1;
  ctxTS.beginPath();
  for (const xv of xTicks.ticks) {
    const x = xOf(xv);
    ctxTS.moveTo(x, T);
    ctxTS.lineTo(x, H - B);
  }
  for (const yv of yTicks.ticks) {
    const y = yOf(yv);
    ctxTS.moveTo(L, y);
    ctxTS.lineTo(W - R, y);
  }
  ctxTS.stroke();

  ctxTS.strokeStyle = '#e5e7eb';
  ctxTS.strokeRect(L, T, W - L - R, H - T - B);

  for (const series of seriesList) {
    const { Prey, P, style } = series;
    const dash = style.dash || [];
    const width = style.width || 2;

    ctxTS.lineWidth = width;
    ctxTS.setLineDash(dash);
    ctxTS.beginPath();
    for (let i = 0; i < Prey.length; i++) {
      const x = xOf(i);
      const y = yOf(Prey[i]);
      if (i === 0) ctxTS.moveTo(x, y);
      else ctxTS.lineTo(x, y);
    }
    ctxTS.strokeStyle = style.preyColor;
    ctxTS.stroke();

    ctxTS.beginPath();
    for (let i = 0; i < P.length; i++) {
      const x = xOf(i);
      const y = yOf(P[i]);
      if (i === 0) ctxTS.moveTo(x, y);
      else ctxTS.lineTo(x, y);
    }
    ctxTS.strokeStyle = style.predColor;
    ctxTS.stroke();
    ctxTS.setLineDash([]);
  }

  ctxTS.fillStyle = '#0f172a';
  ctxTS.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxTS.textAlign = 'center';
  ctxTS.textBaseline = 'top';
  for (const xv of xTicks.ticks) {
    const x = xOf(xv);
    ctxTS.fillText(String(Math.round(xv)), x, H - B + 6);
  }
  ctxTS.textAlign = 'right';
  ctxTS.textBaseline = 'middle';
  for (const yv of yTicks.ticks) {
    const absRange = Math.abs(yTicks.max - yTicks.min);
    const digits = absRange >= 100 ? 0 : absRange >= 10 ? 1 : 2;
    ctxTS.fillText(yv.toFixed(digits), L - 8, yOf(yv));
  }

  ctxTS.fillStyle = '#111827';
  ctxTS.textAlign = 'center';
  ctxTS.textBaseline = 'bottom';
  ctxTS.font = '13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxTS.fillText('time [min]', L + (W - L - R) / 2, H - 8);
  ctxTS.save();
  ctxTS.translate(16, T + (H - T - B) / 2);
  ctxTS.rotate(-Math.PI / 2);
  ctxTS.textAlign = 'center';
  ctxTS.textBaseline = 'top';
  ctxTS.fillText('Concentration [nM]', 0, 0);
  ctxTS.restore();
  ctxTS.textAlign = 'center';
  ctxTS.textBaseline = 'top';
  ctxTS.font = '16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxTS.fillText('Time Series (N, P)', L + (W - L - R) / 2, 12);
}

function drawPhase(seriesList) {
  const W = cvPH.width, H = cvPH.height;
  const L = 70, R = 30, T = 50, B = 60;

  ctxPH.save();
  ctxPH.fillStyle = '#fff';
  ctxPH.fillRect(0, 0, W, H);
  ctxPH.restore();

  if (!seriesList.length) {
    return;
  }

  let xMin = Infinity, xMax = -Infinity;
  let yMin = Infinity, yMax = -Infinity;
  for (const series of seriesList) {
    const { N, P } = series;
    for (const value of N) {
      if (value < xMin) xMin = value;
      if (value > xMax) xMax = value;
    }
    for (const value of P) {
      if (value < yMin) yMin = value;
      if (value > yMax) yMax = value;
    }
  }
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    xMin = 0; xMax = 1;
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0; yMax = 1;
  }

  const xPad = 0.05 * (xMax - xMin || 1);
  const yPad = 0.05 * (yMax - yMin || 1);
  const xTicks = niceAxis(xMin - xPad, xMax + xPad, 6);
  const yTicks = niceAxis(yMin - yPad, yMax + yPad, 6);

  const xRange = xTicks.max - xTicks.min || 1;
  const yRange = yTicks.max - yTicks.min || 1;
  const xOf = (v) => L + ((v - xTicks.min) / xRange) * (W - L - R);
  const yOf = (v) => H - B - ((v - yTicks.min) / yRange) * (H - T - B);

  ctxPH.setLineDash([]);
  ctxPH.strokeStyle = '#eef2f7';
  ctxPH.lineWidth = 1;
  ctxPH.beginPath();
  for (const xv of xTicks.ticks) {
    const x = xOf(xv);
    ctxPH.moveTo(x, T);
    ctxPH.lineTo(x, H - B);
  }
  for (const yv of yTicks.ticks) {
    const y = yOf(yv);
    ctxPH.moveTo(L, y);
    ctxPH.lineTo(W - R, y);
  }
  ctxPH.stroke();

  ctxPH.strokeStyle = '#e5e7eb';
  ctxPH.strokeRect(L, T, W - L - R, H - T - B);

  for (const series of seriesList) {
    const { N, P, style } = series;
    const dash = style.dash || [];
    const width = style.width || 2;
    ctxPH.lineWidth = width;
    ctxPH.setLineDash(dash);
    ctxPH.beginPath();
    for (let i = 0; i < N.length; i++) {
      const x = xOf(N[i]);
      const y = yOf(P[i]);
      if (i === 0) ctxPH.moveTo(x, y);
      else ctxPH.lineTo(x, y);
    }
    ctxPH.strokeStyle = style.predColor;
    ctxPH.stroke();
    ctxPH.setLineDash([]);
  }

  ctxPH.fillStyle = '#0f172a';
  ctxPH.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxPH.textAlign = 'center';
  ctxPH.textBaseline = 'top';
  for (const xv of xTicks.ticks) {
    const x = xOf(xv);
    ctxPH.fillText(String(roundSmart(xv)), x, H - B + 6);
  }
  ctxPH.textAlign = 'right';
  ctxPH.textBaseline = 'middle';
  for (const yv of yTicks.ticks) {
    ctxPH.fillText(String(roundSmart(yv)), L - 8, yOf(yv));
  }

  ctxPH.fillStyle = '#111827';
  ctxPH.textAlign = 'center';
  ctxPH.textBaseline = 'bottom';
  ctxPH.font = '13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxPH.fillText('N [nM]', L + (W - L - R) / 2, H - 8);
  ctxPH.save();
  ctxPH.translate(16, T + (H - T - B) / 2);
  ctxPH.rotate(-Math.PI / 2);
  ctxPH.textAlign = 'center';
  ctxPH.textBaseline = 'top';
  ctxPH.fillText('P [nM]', 0, 0);
  ctxPH.restore();
  ctxPH.textAlign = 'center';
  ctxPH.textBaseline = 'top';
  ctxPH.font = '16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxPH.fillText('Phase Portrait (N vs P)', L + (W - L - R) / 2, 12);
}

function roundSmart(v){
  const a = Math.abs(v);
  if (a >= 100) return Math.round(v);
  if (a >= 10)  return Math.round(v*10)/10;
  return Math.round(v*100)/100;
}

// ---------- Engine ----------
let needUpdate = true;
function requestUpdate(){ needUpdate = true; }

function getVals(){
  return {
    pol: gNum('pol'), rec: gNum('rec'), G: gNum('G'),
    k1: gNum('k1'), k2: gNum('k2'), kN: gNum('kN'), kP: gNum('kP'), b: gNum('b'), KmP: gNum('KmP'),
    N0: gNum('N0'), P0: gNum('P0'),
    t_end_min: gNum('t_end'), dt_min: gNum('dt')
  };
}

function summarizeEffect(effect){
  if (!effect || effect.id === null) {
    return ` | mod: ${DEFAULT_EFFECT.label}`;
  }
  const segments = [
    `k1${formatScale(effect.scaleK1)}`,
    `b${formatScale(effect.scaleB)}`,
  ];
  if (Math.abs(effect.hairpin - 1) > 1e-3) {
    segments.push(`G${formatScale(effect.hairpin)}`);
  }
  return ` | mod: ${effect.label || 'Modification'} (${segments.join(', ')})`;
}

function formatScale(value){
  if (!Number.isFinite(value)) return '×–';
  return `×${value.toFixed(3)}`;
}

function buildSeriesDescriptors() {
  const descriptors = [];
  const activeLabel = modificationEffect.id
    ? (modificationEffect.label || 'Active modification')
    : 'Baseline';
  descriptors.push({
    id: modificationEffect.id ?? 'active',
    label: activeLabel,
    effect: modificationEffect,
    style: ACTIVE_STYLE,
    role: 'active',
  });

  if (analysisPrefs.showBaseline && modificationEffect.id !== null) {
    descriptors.push({
      id: BASELINE_ID,
      label: 'Baseline',
      effect: DEFAULT_EFFECT,
      style: BASELINE_STYLE,
      role: 'baseline',
    });
  }

  const overlayIds = analysisPrefs.overlays || [];
  overlayIds.forEach((id, idx) => {
    if (!id || id === modificationEffect.id) return;
    const mod = modificationsById.get(id);
    if (!mod) return;
    const effect = computeEffectFromModification(mod);
    descriptors.push({
      id,
      label: mod.label || id,
      effect,
      style: getOverlayStyle(idx),
      role: 'overlay',
    });
  });

  return descriptors;
}

function getOverlayStyle(index) {
  const base = OVERLAY_STYLES[index % OVERLAY_STYLES.length];
  return {
    preyColor: base.preyColor,
    predColor: base.predColor,
    dash: base.dash || [],
    width: base.width || 1.6,
  };
}

function updateLegend(seriesList) {
  if (!legendEl) return;
  if (!seriesList.length) {
    legendEl.textContent = '';
    return;
  }
  const html = seriesList.map((series) => {
    const label = escapeHtml(series.label || 'Series');
    return `
      <span class="legend-item">
        <strong>${label}</strong>
        <span class="legend-mode"><span class="swatch" style="background:${series.style.preyColor}"></span>Prey</span>
        <span class="legend-mode"><span class="swatch" style="background:${series.style.predColor}"></span>P</span>
      </span>
    `;
  }).join('');
  legendEl.innerHTML = html;
}

function updateStatus(seriesList, baseParams, elapsedMs) {
  const parts = [`calc+draw: ${elapsedMs.toFixed(1)} ms`, `series: ${seriesList.length}`];
  const activeSeries = seriesList.find((s) => s.role === 'active');
  if (activeSeries) {
    parts.push(`points: ${activeSeries.N.length}`);
  }
  const effectSummary = summarizeEffect(modificationEffect).replace(/^ \|\s*/, '');
  if (effectSummary) parts.push(effectSummary);

  const baselineSeries = seriesList.find((s) => s.role === 'baseline');
  if (analysisPrefs.showDelta && baselineSeries && activeSeries) {
    const dt = Number(baseParams.dt_min) || 1;
    const activeMetrics = analyzeSeries(activeSeries.P, dt);
    const baselineMetrics = analyzeSeries(baselineSeries.P, dt);
    const deltaAmp = Number.isFinite(activeMetrics.amplitude) && Number.isFinite(baselineMetrics.amplitude)
      ? activeMetrics.amplitude - baselineMetrics.amplitude
      : NaN;
    const deltaPeriod = Number.isFinite(activeMetrics.period) && Number.isFinite(baselineMetrics.period)
      ? activeMetrics.period - baselineMetrics.period
      : NaN;
    const deltaParts = [];
    if (Number.isFinite(deltaAmp)) deltaParts.push(`Δamp(P)=${formatSigned(deltaAmp, 2)} nM`);
    if (Number.isFinite(deltaPeriod)) deltaParts.push(`Δperiod=${formatSigned(deltaPeriod, 2)} min`);
    if (deltaParts.length) parts.push(deltaParts.join(', '));
  }

  const overlayLabels = seriesList
    .filter((s) => s.role === 'overlay' && s.label)
    .map((s) => s.label);
  if (overlayLabels.length) {
    parts.push(`overlays: ${overlayLabels.join(', ')}`);
  }

  status.textContent = parts.join(' | ');
}

function analyzeSeries(series, dt) {
  if (!Array.isArray(series) && !(series instanceof Float32Array)) {
    return { amplitude: NaN, period: NaN };
  }
  const tailStart = Math.max(0, Math.floor(series.length * 0.6));
  const amplitude = computeAmplitude(series, tailStart);
  const period = estimatePeriod(series, tailStart, dt);
  return { amplitude, period };
}

function computeAmplitude(series, startIndex) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = startIndex; i < series.length; i++) {
    const value = series[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return NaN;
  return max - min;
}

function estimatePeriod(series, startIndex, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return NaN;
  const peaks = [];
  for (let i = Math.max(startIndex + 1, 1); i < series.length - 1; i++) {
    const prev = series[i - 1];
    const current = series[i];
    const next = series[i + 1];
    if (current > prev && current >= next) peaks.push(i);
  }
  if (peaks.length < 2) return NaN;
  let sum = 0;
  for (let i = 1; i < peaks.length; i++) {
    sum += (peaks[i] - peaks[i - 1]);
  }
  if (!sum) return NaN;
  const meanStep = sum / (peaks.length - 1);
  return meanStep * dt;
}

function updateAnalysisPrefsFromSnapshot(rawPrefs) {
  const pref = rawPrefs?.simulator || {};
  const showBaseline = pref.showBaseline !== false;
  const showDelta = pref.showDelta !== false;
  const overlaysRaw = Array.isArray(pref.overlays) ? pref.overlays : [];
  const overlaysFiltered = [];
  const seen = new Set();
  overlaysRaw.forEach((id) => {
    if (!id || id === BASELINE_ID || !modificationsById.has(id) || seen.has(id)) return;
    seen.add(id);
    overlaysFiltered.push(id);
  });
  const changed =
    showBaseline !== analysisPrefs.showBaseline ||
    showDelta !== analysisPrefs.showDelta ||
    !arraysEqual(overlaysFiltered, analysisPrefs.overlays);
  if (changed) {
    analysisPrefs = { showBaseline, showDelta, overlays: overlaysFiltered };
    requestUpdate();
  }
  return changed;
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function setBusy(vis){ busy.style.display = vis ? 'inline-flex' : 'none'; }

async function animate(){
  if (needUpdate) {
    needUpdate = false;
    setBusy(true);
    const t0 = performance.now();
    const baseParams = getVals();
    const descriptors = buildSeriesDescriptors();
    const seriesResults = [];

    for (let i = 0; i < descriptors.length; i++) {
      const descriptor = descriptors[i];
      const params = applyEffectToParams(baseParams, descriptor.effect);
      const { N, P } = runSimulationPhysical(params);
      const Prey = N.map((v) => 400 - v);
      seriesResults.push({ ...descriptor, N, P, Prey });
    }

    drawTimeSeries(seriesResults);
    drawPhase(seriesResults);
    updateLegend(seriesResults);
    const t1 = performance.now();
    updateStatus(seriesResults, baseParams, t1 - t0);
    setBusy(false);
  }
  requestAnimationFrame(animate);
}

// ---------- Startup ----------
await Promise.all([initWasm(), initModificationStore()]);
modificationsById = new Map(listModifications().map((m) => [m.id, m]));
updateAnalysisPrefsFromSnapshot(getAnalysisPrefs());
updateModificationEffect(getActiveModification());
subscribeModificationStore((snapshot) => {
  modificationsById = new Map((snapshot.modifications || []).map((m) => [m.id, m]));
  const mod = modificationsById.get(snapshot.activeId) || null;
  updateModificationEffect(mod);
  const prefsChanged = updateAnalysisPrefsFromSnapshot(snapshot.analysisPrefs);
  if (!prefsChanged && analysisPrefs.overlays.length > 0) {
    requestUpdate();
  }
});
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
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>'"]/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return ch;
    }
  });
}
function formatSigned(value, digits = 2) {
  if (!Number.isFinite(value)) return '–';
  const prefix = value >= 0 ? '+' : '-';
  const abs = Math.abs(value);
  let decimals = digits;
  if (abs >= 100) decimals = 0;
  else if (abs >= 10) decimals = Math.min(decimals, 1);
  return `${prefix}${abs.toFixed(decimals)}`;
}
function byId(id){ return document.getElementById(id); }

function updateModificationEffect(mod){
  modificationEffect = computeEffectFromModification(mod);
  requestUpdate();
}
