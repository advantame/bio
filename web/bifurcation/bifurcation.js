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
const legendEl = document.getElementById('legend');
const BASELINE_ID = 'mod-default';
const ACTIVE_STYLE = Object.freeze({ maxColor: '#1d4ed8', minColor: '#ef4444', radius: 2.2 });
const BASELINE_STYLE = Object.freeze({ maxColor: '#60a5fa', minColor: '#fca5a5', radius: 2.0 });
const OVERLAY_STYLES = Object.freeze([
  { maxColor: '#6366f1', minColor: '#c4b5fd', radius: 1.9 },
  { maxColor: '#22c55e', minColor: '#bbf7d0', radius: 1.9 },
  { maxColor: '#f97316', minColor: '#fed7aa', radius: 1.9 },
  { maxColor: '#a855f7', minColor: '#e9d5ff', radius: 1.9 },
]);

const ids = [
  'param','pmin','pmax','steps','t_end','dt','tail',
  'pol','rec','G','k1','k2','kN','kP','b','KmP','N0','P0'
];
const el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
const presetSel = document.getElementById('preset');
const applyPresetBtn = document.getElementById('applyPreset');
const presetDesc = document.getElementById('presetDesc');

let modificationEffect = { ...DEFAULT_EFFECT };
let analysisPrefs = { showBaseline: true, overlays: [] };
let modificationsById = new Map();

function valNum(id){ return parseFloat(el[id].value); }
function baseParams(){
  return {
    pol: valNum('pol'),
    rec: valNum('rec'),
    G: valNum('G'),
    k1: valNum('k1'),
    k2: valNum('k2'),
    kN: valNum('kN'),
    kP: valNum('kP'),
    b: valNum('b'),
    KmP: valNum('KmP'),
    N0: valNum('N0'),
    P0: valNum('P0'),
    t_end_min: valNum('t_end'),
    dt_min: valNum('dt'),
  };
}

runBtn.addEventListener('click', async () => {
  runBtn.disabled = true;
  const effectSummary = summarizeEffect(modificationEffect);
  status.textContent = `Running sweeps...${effectSummary}`;
  await initWasm();

  const pname = el.param.value;
  const pmin = valNum('pmin');
  const pmax = valNum('pmax');
  const steps = Math.max(1, Math.floor(valNum('steps')));
  const tailPct = Math.min(100, Math.max(1, Math.floor(valNum('tail'))));
  const denom = Math.max(steps - 1, 1);
  const xValues = Array.from({ length: steps }, (_, i) => pmin + (pmax - pmin) * (i / denom));
  const configs = buildSeriesConfigs();
  const bp = baseParams();
  const seriesResults = [];

  for (let sIndex = 0; sIndex < configs.length; sIndex++) {
    const cfg = configs[sIndex];
    const yMinSeries = [];
    const yMaxSeries = [];
    for (let i = 0; i < xValues.length; i++) {
      const x = xValues[i];
      const paramsBase = { ...bp, [pname]: x };
      const params = applyEffectToParams(paramsBase, cfg.effect);
      const { P } = runSimulationPhysical(params);
      const tail = Math.max(1, Math.floor(P.length * (tailPct / 100)));
      let pminTail = +Infinity;
      let pmaxTail = -Infinity;
      for (let j = P.length - tail; j < P.length; j++) {
        const v = P[j];
        if (v < pminTail) pminTail = v;
        if (v > pmaxTail) pmaxTail = v;
      }
      yMinSeries.push(pminTail);
      yMaxSeries.push(pmaxTail);
      if ((i % 5) === 0) {
        status.textContent = `Running sweep (${cfg.label}) ${i + 1}/${xValues.length}${effectSummary}`;
        await new Promise((r) => setTimeout(r));
      }
    }
    seriesResults.push({ ...cfg, xs: xValues, yMin: yMinSeries, yMax: yMaxSeries });
  }

  drawBifurcation(seriesResults, pname);
  updateLegend(seriesResults);
  const overlayLabels = seriesResults.filter((s) => s.role === 'overlay').map((s) => s.label);
  const effectNote = effectSummary.trim();
  const parts = [`Done. series=${seriesResults.length}, steps=${xValues.length}`];
  if (effectNote) parts.push(effectNote);
  if (seriesResults.some((s) => s.role === 'baseline')) parts.push('baseline overlay');
  if (overlayLabels.length) parts.push(`overlays: ${overlayLabels.join(', ')}`);
  status.textContent = parts.filter(Boolean).join(' | ');
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
  setVal('tail', 50);

  // Sweep defaults (G sweep)
  setVal('param', 'G');
  setVal('pmin', 50);
  setVal('pmax', 300);
  setVal('steps', 100);
}

applyPresetBtn.addEventListener('click', () => {
  const v = presetSel.value;
  if (v === 'birth') {
    // 振動の誕生（G掃引）— 図S11cの再現
    initDefaults();
    presetDesc.innerHTML = '鋳型DNA濃度 G を掃引し、どこから振動が始まるか（ホップ分岐）を可視化します。SI 図S11cの再現です。';
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

function drawBifurcation(seriesList, pname){
  const W = cv.width, H = cv.height;
  const L = 70, R = 30, T = 50, B = 60;
  ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,W,H); ctx.restore();

  if (!seriesList.length) return;

  let xMin = Infinity, xMax = -Infinity;
  let yMin = Infinity, yMax = -Infinity;
  for (const series of seriesList) {
    for (const x of series.xs) {
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
    }
    for (const v of series.yMin) {
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
    }
    for (const v of series.yMax) {
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
    }
  }
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) { xMin = 0; xMax = 1; }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) { yMin = 0; yMax = 1; }

  const xPadding = 0.02 * (xMax - xMin || 1);
  const yPadding = 0.05 * (yMax - yMin || 1);
  const xTicks = niceAxis(xMin - xPadding, xMax + xPadding, 6);
  const yTicks = niceAxis(yMin - yPadding, yMax + yPadding, 6);

  const xRange = xTicks.max - xTicks.min || 1;
  const yRange = yTicks.max - yTicks.min || 1;
  const xOf = (v) => L + ((v - xTicks.min)/xRange) * (W - L - R);
  const yOf = (v) => H - B - ((v - yTicks.min)/yRange) * (H - T - B);

  ctx.strokeStyle = '#eef2f7'; ctx.lineWidth = 1; ctx.beginPath();
  for (const xv of xTicks.ticks){ const x = xOf(xv); ctx.moveTo(x,T); ctx.lineTo(x,H-B);} 
  for (const yv of yTicks.ticks){ const y = yOf(yv); ctx.moveTo(L,y); ctx.lineTo(W-R,y);} 
  ctx.stroke();
  ctx.strokeStyle = '#e5e7eb'; ctx.strokeRect(L, T, W - L - R, H - T - B);

  for (const series of seriesList) {
    const radius = series.style.radius || 2;
    ctx.fillStyle = series.style.maxColor;
    for (let i = 0; i < series.xs.length; i++) {
      const x = xOf(series.xs[i]);
      const y = yOf(series.yMax[i]);
      dot(ctx, x, y, radius);
    }
    ctx.fillStyle = series.style.minColor;
    for (let i = 0; i < series.xs.length; i++) {
      const x = xOf(series.xs[i]);
      const y = yOf(series.yMin[i]);
      dot(ctx, x, y, radius);
    }
  }

  ctx.fillStyle = '#111827';
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const xv of xTicks.ticks){ const x = xOf(xv); ctx.fillText(String(roundSmart(xv)), x, H - B + 6); }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const yv of yTicks.ticks){ ctx.fillText(String(roundSmart(yv)), L - 8, yOf(yv)); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.font = '13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(`${pname}`, L + (W - L - R)/2, H - 8);
  ctx.save(); ctx.translate(16, T + (H - T - B)/2); ctx.rotate(-Math.PI/2);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('P [nM]', 0, 0); ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('Bifurcation (P max/min vs parameter)', L + (W - L - R)/2, 12);
}

function dot(ctx, x, y, r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }
function roundSmart(v){ const a=Math.abs(v); if(a>=100) return Math.round(v); if(a>=10) return Math.round(v*10)/10; return Math.round(v*100)/100; }

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

function buildSeriesConfigs() {
  const configs = [];
  const activeLabel = modificationEffect.id
    ? (modificationEffect.label || 'Active modification')
    : 'Baseline';
  configs.push({
    id: modificationEffect.id ?? 'active',
    label: activeLabel,
    effect: modificationEffect,
    style: ACTIVE_STYLE,
    role: 'active',
  });

  if (analysisPrefs.showBaseline && modificationEffect.id !== null) {
    configs.push({
      id: BASELINE_ID,
      label: 'Baseline',
      effect: DEFAULT_EFFECT,
      style: BASELINE_STYLE,
      role: 'baseline',
    });
  }

  const overlays = analysisPrefs.overlays || [];
  overlays.forEach((id, idx) => {
    if (!id || id === modificationEffect.id) return;
    const mod = modificationsById.get(id);
    if (!mod) return;
    const effect = computeEffectFromModification(mod);
    configs.push({
      id,
      label: mod.label || id,
      effect,
      style: getOverlayStyle(idx),
      role: 'overlay',
    });
  });

  return configs;
}

function getOverlayStyle(index) {
  const base = OVERLAY_STYLES[index % OVERLAY_STYLES.length];
  return {
    maxColor: base.maxColor,
    minColor: base.minColor,
    radius: base.radius || 1.8,
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
        <span class="legend-mode"><span class="swatch" style="background:${series.style.maxColor}"></span>max(P)</span>
        <span class="legend-mode"><span class="swatch" style="background:${series.style.minColor}"></span>min(P)</span>
      </span>
    `;
  }).join('');
  legendEl.innerHTML = html;
}

function updateAnalysisPrefsFromSnapshot(rawPrefs) {
  const pref = rawPrefs?.bifurcation || {};
  const showBaseline = pref.showBaseline !== false;
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
    !arraysEqual(overlaysFiltered, analysisPrefs.overlays);
  if (changed) {
    analysisPrefs = { showBaseline, overlays: overlaysFiltered };
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

function updateModificationEffect(mod){
  modificationEffect = computeEffectFromModification(mod);
  if (!runBtn.disabled) {
    status.textContent = `Ready${summarizeEffect(modificationEffect)}`;
  }
}
