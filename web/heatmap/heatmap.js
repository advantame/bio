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

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d', { alpha:false });
const status = document.getElementById('status');
const runBtn = document.getElementById('runBtn');
const BASELINE_ID = 'mod-default';

const ids = [
  'xParam','xMin','xMax','xSteps',
  'yParam','yMin','yMax','ySteps',
  'metric','t_end','dt','tail',
  'pol','rec','G','k1','k2','kN','kP','b','KmP','N0','P0'
];
const el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
const presetSel = document.getElementById('preset');
const applyPresetBtn = document.getElementById('applyPreset');
const presetDesc = document.getElementById('presetDesc');

let modificationEffect = { ...DEFAULT_EFFECT };
let analysisPrefs = { showBaseline: true, showDelta: true, overlays: [] };
let modificationsById = new Map();

function num(id){ return parseFloat(el[id].value); }

function baseParams(){
  return {
    pol: num('pol'),
    rec: num('rec'),
    G: num('G'),
    k1: num('k1'),
    k2: num('k2'),
    kN: num('kN'),
    kP: num('kP'),
    b: num('b'),
    KmP: num('KmP'),
    N0: num('N0'),
    P0: num('P0'),
    t_end_min: num('t_end'),
    dt_min: num('dt'),
  };
}

runBtn.addEventListener('click', async () => {
  runBtn.disabled = true;
  const effectSummary = summarizeEffect(modificationEffect);
  const effectNote = effectSummary.replace(/^ \|?\s*/, '');
  status.textContent = `Running grid... ${effectNote}`;
  await initWasm();

  const xParam = el.xParam.value;
  const yParam = el.yParam.value;
  if (xParam === yParam){
    status.textContent = 'XとYのパラメータは別にしてください。';
    runBtn.disabled = false;
    return;
  }

  const xMin = num('xMin'), xMax = num('xMax');
  const yMin = num('yMin'), yMax = num('yMax');
  const nx = Math.max(2, Math.floor(num('xSteps')));
  const ny = Math.max(2, Math.floor(num('ySteps')));
  const metric = el.metric.value;
  const tailPct = Math.min(100, Math.max(1, Math.floor(num('tail'))));

  const cfg = {
    xParam,
    yParam,
    xMin,
    xMax,
    yMin,
    yMax,
    nx,
    ny,
    metric,
    tailFraction: tailPct / 100,
    baseParams: baseParams(),
  };

  const activeLabel = modificationEffect.id ? (modificationEffect.label || 'Active') : 'Baseline';
  const activeGrid = await computeGridForEffect(modificationEffect, activeLabel, cfg, effectNote);

  let baselineGrid = null;
  const hasSeparateBaseline = analysisPrefs.showBaseline && modificationEffect.id !== null;
  if (hasSeparateBaseline) {
    baselineGrid = await computeGridForEffect(DEFAULT_EFFECT, 'Baseline', cfg, effectNote);
  }

  const deltaEnabled = Boolean(hasSeparateBaseline && analysisPrefs.showDelta && baselineGrid);
  const renderGrid = deltaEnabled && baselineGrid
    ? computeDeltaGrid(activeGrid, baselineGrid)
    : activeGrid;

  const overlaySummaries = [];
  const referenceGrid = baselineGrid && analysisPrefs.showBaseline ? baselineGrid : activeGrid;
  const overlayReferenceLabel = baselineGrid && analysisPrefs.showBaseline ? 'baseline' : 'active';
  const overlayIds = analysisPrefs.overlays || [];
  for (let idx = 0; idx < overlayIds.length; idx++) {
    const id = overlayIds[idx];
    if (!id || id === modificationEffect.id) continue;
    const mod = modificationsById.get(id);
    if (!mod) continue;
    const effect = computeEffectFromModification(mod);
    const label = mod.label || id;
    const overlayGrid = await computeGridForEffect(effect, label, cfg, effectNote);
    const stats = summarizeGridDifference(overlayGrid, referenceGrid);
    overlaySummaries.push({ label, stats });
  }

  drawHeatmap(renderGrid, nx, ny, xMin, xMax, yMin, yMax, xParam, yParam, deltaEnabled ? `Δ ${metric}` : metric);

  const parts = [`Done. grid=${nx}x${ny}`, `metric=${metric}`, effectNote];
  if (hasSeparateBaseline) parts.push('baseline overlay');
  if (deltaEnabled) parts.push('render=Δ(active-baseline)');
  if (overlaySummaries.length) {
    const overlayText = overlaySummaries.map(({ label, stats }) => {
      const meanText = formatSigned(stats.mean, 2);
      const spanText = `${formatSigned(stats.min, 2)}…${formatSigned(stats.max, 2)}`;
      return `${label}: meanΔ=${meanText}, range=${spanText}`;
    }).join('; ');
    parts.push(`overlays vs ${overlayReferenceLabel}: ${overlayText}`);
  }
  status.textContent = parts.join(' | ');
  runBtn.disabled = false;
});

// ---------- Defaults & Presets ----------
function setVal(id, v){ const e=document.getElementById(id); if(e) e.value = String(v); }

function initDefaults(){
  // Base parameters (SI S5 PP1 optimized)
  setVal('pol', 3.7);
  setVal('rec', 32.5);
  setVal('G', 150);
  setVal('k1', 0.0020);
  setVal('k2', 0.0031);
  setVal('kN', 0.0210);
  setVal('kP', 0.0047);
  setVal('b',  0.000048);
  setVal('KmP', 34);
  setVal('N0', 10);
  setVal('P0', 10);

  // Reasonable simulation window
  setVal('t_end', 3000);
  setVal('dt', 0.5);
  setVal('tail', 60);

  // Default grid (G vs k1)
  setVal('xParam', 'G'); setVal('xMin', 80); setVal('xMax', 250); setVal('xSteps', 20);
  setVal('yParam', 'k1'); setVal('yMin', 0.0012); setVal('yMax', 0.0032); setVal('ySteps', 16);
  setVal('metric', 'period');
}

applyPresetBtn.addEventListener('click', () => {
  const v = presetSel.value;
  if (v === 'mod') {
    // アミノ酸修飾の影響（周期）
    initDefaults();
    presetDesc.innerHTML = 'Workbench で設計した修飾カードをオーバーレイし、k1 掃引と鋳型濃度 G の組み合わせが周波数にどう影響するかを比較するベース設定です。Δ表示を有効にすると基準条件との差分を即座に確認できます。';
  } else if (v === 'balance') {
    // 酵素バランスと安定性（振幅）
    // Base
    setVal('pol', 3.7); setVal('k1', 0.0020);
    setVal('rec', 32.5); setVal('G', 150);
    setVal('k2', 0.0031); setVal('kN', 0.0210); setVal('kP', 0.0047); setVal('b', 0.000048);
    setVal('KmP', 34); setVal('N0', 10); setVal('P0', 10);
    // Window
    setVal('t_end', 3000); setVal('dt', 0.5); setVal('tail', 50);
    // Grid: G vs rec, amplitude
    setVal('xParam', 'G'); setVal('xMin', 50); setVal('xMax', 300); setVal('xSteps', 20);
    setVal('yParam', 'rec'); setVal('yMin', 10); setVal('yMax', 50); setVal('ySteps', 15);
    setVal('metric', 'amplitude');
    presetDesc.innerHTML = '鋳型濃度 G と分解酵素 rec のバランスが振幅（=振動の有無）に与える影響を可視化します。';
  } else {
    presetDesc.textContent = '';
  }
});

await initModificationStore();
modificationsById = new Map(listModifications().map((m) => [m.id, m]));
updateAnalysisPrefsFromSnapshot(getAnalysisPrefs());
updateModificationEffect(getActiveModification());
subscribeModificationStore((snapshot) => {
  modificationsById = new Map((snapshot.modifications || []).map((m) => [m.id, m]));
  const mod = modificationsById.get(snapshot.activeId) || null;
  updateModificationEffect(mod);
  updateAnalysisPrefsFromSnapshot(snapshot.analysisPrefs);
});

initDefaults();

async function computeGridForEffect(effect, label, cfg, effectNote) {
  const {
    xParam, yParam,
    xMin, xMax,
    yMin, yMax,
    nx, ny,
    metric,
    tailFraction,
    baseParams,
  } = cfg;
  const grid = new Float32Array(nx * ny).fill(NaN);
  const xDenom = Math.max(nx - 1, 1);
  const yDenom = Math.max(ny - 1, 1);
  for (let j = 0; j < ny; j++) {
    const yVal = yMin + (yMax - yMin) * (j / yDenom);
    for (let i = 0; i < nx; i++) {
      const xVal = xMin + (xMax - xMin) * (i / xDenom);
      const paramsBase = { ...baseParams, [xParam]: xVal, [yParam]: yVal };
      const params = applyEffectToParams(paramsBase, effect);
      const { P } = runSimulationPhysical(params);
      const tailCount = Math.max(3, Math.floor(P.length * tailFraction));
      const val = evaluateMetric(P, metric, tailCount, baseParams.dt_min);
      grid[j * nx + i] = Number.isFinite(val) ? val : NaN;
    }
    if ((j % 2) === 0) {
      status.textContent = `Running grid (${label}) ${j + 1}/${ny} | ${effectNote}`;
      await new Promise((r) => setTimeout(r));
    }
  }
  return grid;
}

function evaluateMetric(series, metric, tailCount, dt) {
  if (!series || series.length === 0) return NaN;
  const start = Math.max(0, series.length - tailCount);
  if (metric === 'amplitude') {
    let min = Infinity;
    let max = -Infinity;
    for (let k = start; k < series.length; k++) {
      const v = series[k];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return NaN;
    return max - min;
  } else if (metric === 'period') {
    if (!Number.isFinite(dt) || dt <= 0) return NaN;
    const peaks = [];
    for (let k = Math.max(start + 1, 1); k < series.length - 1; k++) {
      const prev = series[k - 1];
      const curr = series[k];
      const next = series[k + 1];
      if (curr > prev && curr >= next) peaks.push(k);
    }
    if (peaks.length < 2) return NaN;
    let sum = 0;
    for (let i = 1; i < peaks.length; i++) sum += (peaks[i] - peaks[i - 1]);
    if (!sum) return NaN;
    const meanStep = sum / (peaks.length - 1);
    return meanStep * dt;
  }
  return NaN;
}

function computeDeltaGrid(active, baseline) {
  const out = new Float32Array(active.length);
  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    const b = baseline[i];
    out[i] = Number.isFinite(a) && Number.isFinite(b) ? a - b : NaN;
  }
  return out;
}

function summarizeGridDifference(grid, reference) {
  let sum = 0;
  let count = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < grid.length; i++) {
    const a = grid[i];
    const b = reference[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const diff = a - b;
    if (diff < min) min = diff;
    if (diff > max) max = diff;
    sum += diff;
    count++;
  }
  return {
    mean: count ? sum / count : NaN,
    min: count ? min : NaN,
    max: count ? max : NaN,
  };
}

function formatSigned(value, digits = 2) {
  if (!Number.isFinite(value)) return '–';
  const prefix = value >= 0 ? '+' : '-';
  const abs = Math.abs(value);
  let places = digits;
  if (abs >= 100) places = 0;
  else if (abs >= 10) places = Math.min(places, 1);
  return `${prefix}${abs.toFixed(places)}`;
}

function updateAnalysisPrefsFromSnapshot(rawPrefs) {
  const pref = rawPrefs?.heatmap || {};
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

function drawHeatmap(grid, nx, ny, xMin, xMax, yMin, yMax, xLabel, yLabel, metric){
  const W = cv.width, H = cv.height;
  const L = 80, R = 120, T = 50, B = 70; // leave room for legend on right
  ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,W,H); ctx.restore();

  // Compute data range ignoring NaN
  let dmin = +Infinity, dmax = -Infinity;
  for (let k=0;k<grid.length;k++){
    const v = grid[k];
    if (!Number.isFinite(v)) continue;
    if (v < dmin) dmin = v; if (v > dmax) dmax = v;
  }
  if (!Number.isFinite(dmin) || !Number.isFinite(dmax) || dmax === dmin){
    dmin = 0; dmax = 1;
  }

  // Axes mapping
  const xOf = (v) => L + ((v - xMin)/(xMax - xMin || 1)) * (W - L - R);
  const yOf = (v) => H - B - ((v - yMin)/(yMax - yMin || 1)) * (H - T - B);

  // Draw cells
  for (let j=0;j<ny;j++){
    const y0 = yOf(yMin + (yMax - yMin) * (j   /(ny - 1)));
    const y1 = yOf(yMin + (yMax - yMin) * ((j+1)/(ny - 1)));
    const h = (y1 - y0);
    for (let i=0;i<nx;i++){
      const x0 = xOf(xMin + (xMax - xMin) * (i   /(nx - 1)));
      const x1 = xOf(xMin + (xMax - xMin) * ((i+1)/(nx - 1)));
      const w = (x1 - x0);
      const v = grid[j*nx + i];
      if (Number.isFinite(v)){
        const t = (v - dmin) / (dmax - dmin || 1);
        const [r,g,b] = turbo(t);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
      } else {
        ctx.fillStyle = '#cbd5e1'; // NaN: light gray
      }
      ctx.fillRect(x0, Math.min(y0,y1), w, Math.abs(h));
    }
  }

  // Border
  ctx.strokeStyle = '#e5e7eb';
  ctx.strokeRect(L, T, W - L - R, H - T - B);

  // Legend (right)
  const lgX = W - R + 40, lgY = T + 10, lgW = 16, lgH = H - T - B - 40;
  for (let y=0;y<lgH;y++){
    const t = 1 - y/(lgH-1);
    const [r,g,b] = turbo(t);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(lgX, lgY + y, lgW, 1);
  }
  ctx.strokeStyle = '#334155'; ctx.strokeRect(lgX, lgY, lgW, lgH);
  ctx.fillStyle = '#0f172a'; ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(`${metric} max: ${roundSmart(dmax)}`, lgX + lgW + 8, lgY);
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${metric} min: ${roundSmart(dmin)}`, lgX + lgW + 8, lgY + lgH);

  // Axis ticks (simple)
  ctx.fillStyle = '#111827'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.font = '13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(`${xLabel}`, L + (W - L - R)/2, H - 8);
  ctx.save(); ctx.translate(16, T + (H - T - B)/2); ctx.rotate(-Math.PI/2);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(`${yLabel}`, 0, 0); ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('Parameter Heatmap', L + (W - L - R)/2, 12);
}

function roundSmart(v){ const a=Math.abs(v); if(a>=100) return Math.round(v); if(a>=10) return Math.round(v*10)/10; return Math.round(v*100)/100; }

// Turbo colormap approximation (0..1) -> [r,g,b] 0..255
function turbo(t){
  // From Google Turbo colormap polynomial approximation
  t = Math.min(1, Math.max(0, t));
  const r = Math.round(255 * (0.13572138 + 4.61539260*t - 42.66032258*t*t + 132.13108234*t*t*t - 152.94239396*t*t*t*t + 59.28637943*t*t*t*t*t));
  const g = Math.round(255 * (0.09140261 + 2.19418839*t + 4.84296658*t*t - 14.18503333*t*t*t + 14.13802336*t*t*t*t - 4.23619627*t*t*t*t*t));
  const b = Math.round(255 * (0.10667330 + 12.64194608*t - 60.58204836*t*t + 110.36276771*t*t*t - 89.97024368*t*t*t*t + 27.34829594*t*t*t*t*t));
  return [
    Math.min(255, Math.max(0, r)),
    Math.min(255, Math.max(0, g)),
    Math.min(255, Math.max(0, b)),
  ];
}

function summarizeEffect(effect){
  if (!effect || effect.id === null) return ` (mod: ${DEFAULT_EFFECT.label})`;
  const segments = [
    `k1${formatScale(effect.scaleK1)}`,
    `b${formatScale(effect.scaleB)}`,
  ];
  if (Math.abs(effect.hairpin - 1) > 1e-3) segments.push(`G${formatScale(effect.hairpin)}`);
  return ` (mod: ${effect.label || 'Modification'} — ${segments.join(', ')})`;
}

function formatScale(value){
  if (!Number.isFinite(value)) return '×–';
  return `×${value.toFixed(3)}`;
}

function updateModificationEffect(mod){
  modificationEffect = computeEffectFromModification(mod);
  if (!runBtn.disabled) {
    status.textContent = `Ready${summarizeEffect(modificationEffect)}`;
  }
}
