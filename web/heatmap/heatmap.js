import { initWasm, runSimulationPhysical, runSimulationAndEvaluate } from "../core.js";
import {
  buildSimulationVariants,
  GAS_CONSTANT_KCAL,
  setActiveModificationId,
  setOverlayModificationIds,
  pruneOverlayIds,
  ensureActiveExists,
  getOverlayModificationIds,
} from "../modifications.js";

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d', { alpha:false });
const status = document.getElementById('status');
const runBtn = document.getElementById('runBtn');
const variantSelect = document.getElementById('variantSelect');
if (variantSelect) variantSelect.disabled = true;

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

const BASELINE_COLOR = '#1d4ed8';
const ACTIVE_COLOR = '#ef4444';
const OVERLAY_COLORS = ['#9333ea', '#22c55e', '#f97316', '#0ea5e9'];

let variantResults = [];
let gridContext = null;

const DEFAULT_TEMP_K = 37 + 273.15;

function ddgToRAssoc(ddg){
  return Math.exp(-ddg / (GAS_CONSTANT_KCAL * DEFAULT_TEMP_K));
}

function applyAxisValue(params, name, value){
  if (name === 'assoc_ddg') {
    const rAssoc = ddgToRAssoc(value);
    params.k1 *= rAssoc;
    params.b *= rAssoc;
    return { rAssoc };
  }
  if (name === 'assoc_r') {
    const rAssoc = Math.max(value, 0);
    params.k1 *= rAssoc;
    params.b *= rAssoc;
    return { rAssoc };
  }
  params[name] = value;
  return {};
}

function axisLabel(name){
  switch (name) {
    case 'assoc_ddg': return 'ΔΔG_assoc [kcal/mol]';
    case 'assoc_r': return 'r_assoc';
    case 'k1': return 'k1';
    default: return name;
  }
}

function buildParamsForAxes(base, xAxis, yAxis){
  const params = { ...base };
  const meta = {};
  if (xAxis) Object.assign(meta, applyAxisValue(params, xAxis.name, xAxis.value));
  if (yAxis) Object.assign(meta, applyAxisValue(params, yAxis.name, yAxis.value));
  return { params, meta };
}

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

function colorForVariant(variant, overlayIdx){
  if (variant.type === 'baseline') return BASELINE_COLOR;
  if (variant.type === 'active') return ACTIVE_COLOR;
  return OVERLAY_COLORS[overlayIdx % OVERLAY_COLORS.length];
}

runBtn.addEventListener('click', async () => {
  runBtn.disabled = true;
  variantSelect.disabled = true;
  variantSelect.innerHTML = '';
  variantResults = [];
  gridContext = null;
  status.textContent = 'Running grid...';
  await initWasm();

  // Performance timing
  const startTime = performance.now();

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

  const bp = baseParams();
  const preview = buildParamsForAxes(bp, { name: xParam, value: xMin }, { name: yParam, value: yMin });
  const previewVariants = buildSimulationVariants(preview.params);
  const variantStyles = new Map();
  let overlayIdx = 0;
  for (const variant of previewVariants){
    variantStyles.set(variant.id, colorForVariant(variant, overlayIdx));
    if (variant.type === 'overlay') overlayIdx++;
  }

  const variantMap = new Map();

  for (let j=0;j<ny;j++){
    const yVal = yMin + (yMax - yMin) * (j / (ny - 1));
    for (let i=0;i<nx;i++){
      const xVal = xMin + (xMax - xMin) * (i / (nx - 1));
      const { params } = buildParamsForAxes(bp, { name: xParam, value: xVal }, { name: yParam, value: yVal });
      const variants = buildSimulationVariants(params);
      for (const variant of variants){
        if (!variantStyles.has(variant.id)){
          variantStyles.set(variant.id, colorForVariant(variant, overlayIdx));
          if (variant.type === 'overlay') overlayIdx++;
        }
        let entry = variantMap.get(variant.id);
        if (!entry){
          entry = {
            id: variant.id,
            label: variant.label,
            type: variant.type,
            color: variantStyles.get(variant.id),
            grid: new Float32Array(nx * ny).fill(NaN),
            derived: variant.derived,
          };
          variantMap.set(variant.id, entry);
        }
        // Use optimized Rust implementation (eliminates data transfer overhead)
        const val = runSimulationAndEvaluate(variant.params, metric, tailPct);
        entry.grid[j*nx + i] = Number.isFinite(val) ? val : NaN;
      }
    }
    if ((j%2)===0) {
      status.textContent = `Running grid... ${j+1}/${ny}`;
      await new Promise((r) => setTimeout(r));
    }
  }

  const variants = Array.from(variantMap.values()).sort((a, b) => {
    if (a.type === b.type) return a.label.localeCompare(b.label);
    if (a.type === 'baseline') return -1;
    if (b.type === 'baseline') return 1;
    if (a.type === 'active') return -1;
    if (b.type === 'active') return 1;
    return a.label.localeCompare(b.label);
  });

  const baseline = variants.find((v) => v.type === 'baseline');
  if (baseline){
    for (const variant of variants){
      if (variant === baseline) continue;
      const delta = new Float32Array(nx * ny);
      for (let k=0;k<delta.length;k++){
        const val = variant.grid[k];
        const baseVal = baseline.grid[k];
        delta[k] = Number.isFinite(val) && Number.isFinite(baseVal) ? (val - baseVal) : NaN;
      }
      variant.deltaGrid = delta;
    }
  }

  variantResults = variants;
  gridContext = { nx, ny, xMin, xMax, yMin, yMax, xParam, yParam, metric };

  populateVariantSelect(variants);
  renderHeatmapSelection();

  // Report performance
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ Heatmap completed in ${elapsed}s (${nx}×${ny} = ${nx*ny} cells)`);
  console.log(`   Average: ${(parseFloat(elapsed) / (nx*ny) * 1000).toFixed(2)}ms per cell`);

  runBtn.disabled = false;
});

// Experimental: Use FFT for period detection (set to true to enable)
// Change in browser console: USE_FFT_PERIOD = true
let USE_FFT_PERIOD = false;

function evaluateMetric(series, startIdx, metric, dt){
  const len = series.length;
  if (len <= startIdx) return NaN;
  if (metric === 'amplitude'){
    let pmin = +Infinity, pmax = -Infinity;
    for (let i=startIdx;i<len;i++){
      const v = series[i];
      if (v < pmin) pmin = v;
      if (v > pmax) pmax = v;
    }
    return pmax - pmin;
  }
  if (metric === 'period'){
    // Choose between FFT and peak-counting methods
    if (USE_FFT_PERIOD) {
      return evaluatePeriodFFT(series, startIdx, dt);
    } else {
      return evaluatePeriodPeaks(series, startIdx, dt);
    }
  }
  return NaN;
}

// Original peak-counting method
function evaluatePeriodPeaks(series, startIdx, dt){
  const len = series.length;
  const peaks = [];
  for (let i=Math.max(startIdx+1,1); i<len-1; i++){
    const a = series[i-1], b = series[i], c = series[i+1];
    if (b > a && b > c) peaks.push(i);
  }
  if (peaks.length >= 2){
    let sum = 0;
    for (let i=1;i<peaks.length;i++) sum += (peaks[i] - peaks[i-1]);
    const meanStep = sum / (peaks.length - 1);
    return meanStep * (dt || 1);
  }
  return NaN;
}

// FFT-based period detection
function evaluatePeriodFFT(series, startIdx, dt){
  const len = series.length;
  const n = len - startIdx;
  if (n < 4) return NaN;

  // Extract analysis window
  const signal = new Array(n);
  let mean = 0;
  for (let i=0; i<n; i++){
    signal[i] = series[startIdx + i];
    mean += signal[i];
  }
  mean /= n;

  // Remove DC component (mean)
  for (let i=0; i<n; i++){
    signal[i] -= mean;
  }

  // Compute power spectrum using DFT
  // Only need first half (Nyquist frequency)
  const nHalf = Math.floor(n / 2);
  const power = new Array(nHalf);

  for (let k=1; k<nHalf; k++){ // Skip DC (k=0)
    let real = 0, imag = 0;
    const omega = 2 * Math.PI * k / n;
    for (let i=0; i<n; i++){
      const angle = omega * i;
      real += signal[i] * Math.cos(angle);
      imag += signal[i] * Math.sin(angle);
    }
    power[k] = real * real + imag * imag;
  }

  // Find dominant frequency (peak in power spectrum)
  let maxPower = 0;
  let maxK = 0;
  for (let k=1; k<nHalf; k++){
    if (power[k] > maxPower){
      maxPower = power[k];
      maxK = k;
    }
  }

  // Require significant oscillation (power above noise threshold)
  const avgPower = power.reduce((a,b) => a+b, 0) / power.length;
  if (maxPower < 3 * avgPower) return NaN; // No clear oscillation

  // Convert frequency bin to period
  // Frequency (Hz) = k / (n * dt)
  // Period (time) = 1 / frequency = (n * dt) / k
  const period = (n * (dt || 1)) / maxK;

  return period;
}

function populateVariantSelect(variants){
  if (!variantSelect) return;
  variantSelect.innerHTML = '';
  if (!variants.length){
    variantSelect.disabled = true;
    return;
  }
  const frag = document.createDocumentFragment();
  const activeVariant = variants.find((v) => v.type === 'active');
  let defaultValue = null;
  if (activeVariant && activeVariant.deltaGrid) defaultValue = `${activeVariant.id}::delta`;
  else if (activeVariant) defaultValue = `${activeVariant.id}::raw`;
  else defaultValue = `${variants[0].id}::raw`;

  for (const variant of variants){
    const rawValue = `${variant.id}::raw`;
    const opt = document.createElement('option');
    opt.value = rawValue;
    opt.textContent = `${variant.label} (${variant.type})`;
    frag.appendChild(opt);
    if (variant.deltaGrid){
      const deltaOpt = document.createElement('option');
      deltaOpt.value = `${variant.id}::delta`;
      deltaOpt.textContent = `${variant.label} Δ vs baseline`;
      frag.appendChild(deltaOpt);
    }
  }
  variantSelect.appendChild(frag);
  variantSelect.disabled = false;
  if (defaultValue) variantSelect.value = defaultValue;
  else variantSelect.selectedIndex = 0;
}

function renderHeatmapSelection(){
  if (!gridContext || !variantResults.length) return;
  const value = variantSelect.value || `${variantResults[0].id}::raw`;
  const [id, mode] = value.split('::');
  let variant = variantResults.find((v) => v.id === id);
  if (!variant) variant = variantResults[0];
  const useDelta = mode === 'delta' && variant.deltaGrid;
  const grid = useDelta ? variant.deltaGrid : variant.grid;
  const info = { label: variant.label, type: variant.type, mode: useDelta ? 'delta' : 'raw' };
  drawHeatmap(
    grid,
    gridContext.nx,
    gridContext.ny,
    gridContext.xMin,
    gridContext.xMax,
    gridContext.yMin,
    gridContext.yMax,
    axisLabel(gridContext.xParam),
    axisLabel(gridContext.yParam),
    gridContext.metric,
    info
  );
  status.textContent = `Displaying ${variant.label} (${variant.type}) ${useDelta ? 'Δ vs baseline' : gridContext.metric}.`;
}

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

  // Default grid (G vs ΔΔG_assoc)
  setVal('xParam', 'G'); setVal('xMin', 80); setVal('xMax', 250); setVal('xSteps', 20);
  setVal('yParam', 'assoc_ddg'); setVal('yMin', -5); setVal('yMax', 5); setVal('ySteps', 15);
  setVal('metric', 'period');
}

function applyPresetValue(value){
  if (value === 'mod_assoc') {
    // アミノ酸修飾（周期）
    initDefaults();
    presetDesc.innerHTML = 'ΔΔG_assoc を横軸、鋳型濃度 G を縦軸に取り、修飾の会合効果が周期に与える影響を可視化します。アクティブな修飾は自動で反映されます。';
    return;
  }
  if (value === 'balance') {
    setVal('pol', 3.7); setVal('k1', 0.0020);
    setVal('rec', 32.5); setVal('G', 150);
    setVal('k2', 0.0031); setVal('kN', 0.0210); setVal('kP', 0.0047); setVal('b', 0.000048);
    setVal('KmP', 34); setVal('N0', 10); setVal('P0', 10);
    setVal('t_end', 3000); setVal('dt', 0.5); setVal('tail', 50);
    setVal('xParam', 'G'); setVal('xMin', 50); setVal('xMax', 300); setVal('xSteps', 20);
    setVal('yParam', 'rec'); setVal('yMin', 10); setVal('yMax', 50); setVal('ySteps', 15);
    setVal('metric', 'amplitude');
    presetDesc.innerHTML = '鋳型濃度 G と分解酵素 rec のバランスが振幅（=振動の有無）に与える影響を可視化します。';
    return;
  }
  presetDesc.textContent = '';
}

function applyQueryParams(){
  const params = new URLSearchParams(window.location.search);
  if (!params || Array.from(params.keys()).length === 0) return;

  const presetKey = params.get('preset');
  if (presetKey === 'assoc_period') {
    presetSel.value = 'mod_assoc';
    applyPresetValue('mod_assoc');
  } else if (presetKey === 'rec_amp') {
    presetSel.value = 'balance';
    applyPresetValue('balance');
  }

  const numericKeys = ['xParam','xMin','xMax','xSteps','yParam','yMin','yMax','ySteps','metric','t_end','dt','tail'];
  numericKeys.forEach((key) => {
    if (params.has(key)) {
      const val = params.get(key);
      if (val !== null) setVal(key, val);
    }
  });

  const activeId = params.get('active');
  if (activeId) setActiveModificationId(activeId);

  if (params.has('overlays')) {
    const overlaysRaw = params.get('overlays') || '';
    const overlays = overlaysRaw.split(',').map((id) => id.trim()).filter(Boolean);
    const sanitized = pruneOverlayIds(overlays);
    setOverlayModificationIds(sanitized);
  } else {
    const overlays = pruneOverlayIds(getOverlayModificationIds());
    setOverlayModificationIds(overlays);
  }

  ensureActiveExists();
}

applyPresetBtn.addEventListener('click', () => {
  const v = presetSel.value;
  applyPresetValue(v);
});

initDefaults();
applyPresetValue(presetSel.value);
applyQueryParams();
if (variantSelect) variantSelect.addEventListener('change', renderHeatmapSelection);

function drawHeatmap(grid, nx, ny, xMin, xMax, yMin, yMax, xLabel, yLabel, metric, variantInfo){
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

  const metricLabel = variantInfo && variantInfo.mode === 'delta' ? `Δ${metric}` : metric;
  const titleLabel = variantInfo ? `${variantInfo.label} ${variantInfo.mode === 'delta' ? 'Δ vs baseline' : ''}`.trim() : 'Baseline';

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

  // Legend (right) - Color bar
  const lgX = W - R + 40, lgY = T + 10, lgW = 16, lgH = H - T - B - 40;
  for (let y=0;y<lgH;y++){
    const t = 1 - y/(lgH-1);
    const [r,g,b] = turbo(t);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(lgX, lgY + y, lgW, 1);
  }
  ctx.strokeStyle = '#334155'; ctx.strokeRect(lgX, lgY, lgW, lgH);

  // Color bar value labels - numbers only
  ctx.fillStyle = '#0f172a';
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(roundSmart(dmax), lgX + lgW + 6, lgY);
  ctx.textBaseline = 'bottom';
  ctx.fillText(roundSmart(dmin), lgX + lgW + 6, lgY + lgH);

  // Axis labels and ticks
  const xTicks = niceAxis(xMin, xMax, 6);
  const yTicks = niceAxis(yMin, yMax, 6);

  ctx.fillStyle = '#111827';
  ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

  // X-axis tick values
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const xv of xTicks.ticks) {
    ctx.fillText(xv.toFixed(xTicks.decimals), xOf(xv), H - B + 4);
  }

  // Y-axis tick values
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const yv of yTicks.ticks) {
    ctx.fillText(yv.toFixed(yTicks.decimals), L - 6, yOf(yv));
  }

  // X-axis label
  ctx.fillStyle = '#111827';
  ctx.font = '13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${xLabel}`, L + (W - L - R)/2, H - 8);

  // Y-axis label
  ctx.save();
  ctx.translate(16, T + (H - T - B)/2);
  ctx.rotate(-Math.PI/2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`${yLabel}`, 0, 0);
  ctx.restore();

  // Title
  ctx.fillStyle = '#111827';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(`Parameter Heatmap — ${titleLabel}`, L + (W - L - R)/2, 12);
}

function roundSmart(v){ const a=Math.abs(v); if(a>=100) return Math.round(v); if(a>=10) return Math.round(v*10)/10; return Math.round(v*100)/100; }

// Nice axis tick calculation (from step4.js)
function niceNum(range, round) {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3.0) niceFraction = 2;
    else if (fraction < 7.0) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1.0) niceFraction = 1;
    else if (fraction <= 2.0) niceFraction = 2;
    else if (fraction <= 5.0) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exponent);
}

function niceAxis(min, max, maxTicks = 6) {
  const range = niceNum(max - min || 1, false);
  const tickSpacing = niceNum(range / (maxTicks - 1), true);
  const niceMin = Math.floor(min / tickSpacing) * tickSpacing;
  const niceMax = Math.ceil(max / tickSpacing) * tickSpacing;
  const ticks = [];
  for (let tick = niceMin; tick <= niceMax + tickSpacing * 0.5; tick += tickSpacing) {
    if (tick >= min - tickSpacing * 0.01 && tick <= max + tickSpacing * 0.01) {
      ticks.push(Math.round(tick * 1e10) / 1e10);
    }
  }
  const decimals = Math.max(0, -Math.floor(Math.log10(tickSpacing)) + 1);
  return { ticks, decimals };
}

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
