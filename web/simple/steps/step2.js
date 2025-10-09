// Step 2: 即時予測 — Time Series & Quick Comparison

import { initWasm, runSimulationPhysical } from '../../core.js';
import {
  loadModifications,
  getActiveModificationId,
  getOverlayModificationIds,
  setOverlayModificationIds,
  buildSimulationVariants,
  computeEffectiveParameters,
} from '../../modifications.js';

import { STEP2_EXPLANATION, autoRenderMath } from '../mathExplainer.js';

// Baseline parameters (SI Table S5)
const BASELINE = {
  pol: 3.7,
  rec: 32.5,
  G: 150,
  k1: 0.0020,
  k2: 0.0031,
  kN: 0.0210,
  kP: 0.0047,
  b: 0.000048,
  KmP: 34,
  N0: 10,
  P0: 10,
  t_end_min: 2000,
  dt_min: 0.5,
};

// Color scheme
const BASELINE_COLORS = { prey: '#f97316', pred: '#2c7a7b', lineDash: [] };
const ACTIVE_COLORS = { prey: '#2563eb', pred: '#0ea5e9', lineDash: [] };
const OVERLAY_PALETTE = [
  { prey: '#9333ea', pred: '#c084fc', lineDash: [6, 4] },
  { prey: '#22c55e', pred: '#0f766e', lineDash: [6, 4] },
  { prey: '#f43f5e', pred: '#fb7185', lineDash: [4, 4] },
  { prey: '#14b8a6', pred: '#0ea5e9', lineDash: [4, 4] },
];

let cvTS, cvPH, ctxTS, ctxPH;
let needsUpdate = true;
let animationFrameId = null;

export async function render(container) {
  // Load CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './steps/step2.css';
  document.head.appendChild(link);

  // Build UI
  container.innerHTML = `
    <h1 class="simple-step-title">即時予測 — Time Series & Quick Comparison</h1>
    <p class="simple-step-description">
      時間波形・派生パラメータ・簡易比較
    </p>

    <div class="step2-layout">
      <!-- Left: Derived Metrics -->
      <div class="step2-left-panel">
        <h3>派生指標</h3>
        <div id="step2Metrics" class="step2-metrics"></div>
      </div>

      <!-- Center: Graphs -->
      <div class="step2-center-panel">
        <canvas id="step2CanvasTS" width="800" height="400"></canvas>
        <canvas id="step2CanvasPH" width="800" height="400"></canvas>
        <div id="step2Legend" class="step2-legend"></div>
      </div>

      <!-- Right: Overlay Manager -->
      <div class="step2-right-panel">
        <h3>オーバーレイ管理</h3>
        <div id="step2Overlays" class="step2-overlays"></div>

        <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #e5e7eb;">
          <h3>詳細な比較</h3>
          <p style="color: #64748b; font-size: 0.875rem; margin-bottom: 0.75rem;">
            分岐図とヒートマップはStep ④を使用してください
          </p>
          <a href="#/simple/4" class="step2-cta-btn">Step ④ へ →</a>
        </div>
      </div>
    </div>

    <!-- Explanation Section -->
    <div class="step2-explanation" style="margin-top: 2rem; padding: 1.5rem; background: #f8fafc; border-radius: 0.5rem; border: 1px solid #e2e8f0;">
      <div id="step2ExplanationContent">${STEP2_EXPLANATION}</div>
    </div>
  `;

  // Initialize canvas
  cvTS = document.getElementById('step2CanvasTS');
  cvPH = document.getElementById('step2CanvasPH');
  ctxTS = cvTS.getContext('2d', { alpha: false });
  ctxPH = cvPH.getContext('2d', { alpha: false });

  // Initialize WASM
  await initWasm();

  // Set up event listeners
  window.addEventListener('storage', handleStorageChange);
  window.addEventListener('focus', handleFocusChange);

  // Start animation loop
  needsUpdate = true;
  animate();

  // Render math in explanation
  setTimeout(() => {
    const explainer = document.getElementById('step2ExplanationContent');
    if (explainer) autoRenderMath(explainer);
  }, 150);
}

function handleStorageChange() {
  needsUpdate = true;
}

function handleFocusChange() {
  needsUpdate = true;
}

async function animate() {
  if (needsUpdate) {
    needsUpdate = false;
    await updateVisualization();
  }
  animationFrameId = requestAnimationFrame(animate);
}

async function updateVisualization() {
  const variants = buildSimulationVariants(BASELINE);

  // Run simulations
  const seriesList = [];
  let overlayIndex = 0;

  for (const variant of variants) {
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

  // Draw graphs
  drawTimeSeries(seriesList);
  drawPhase(seriesList);
  renderLegend(seriesList);
  renderMetrics(seriesList);
  renderOverlays();
}

function styleForVariant(variant, overlayIndex) {
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

function drawTimeSeries(seriesList) {
  const W = cvTS.width, H = cvTS.height;
  const L = 70, R = 30, T = 50, B = 60;

  ctxTS.save();
  ctxTS.fillStyle = '#fff';
  ctxTS.fillRect(0, 0, W, H);
  ctxTS.restore();

  if (!seriesList.length) return;

  let dataYmin = Infinity;
  let dataYmax = -Infinity;
  let nMax = 0;
  for (const series of seriesList) {
    nMax = Math.max(nMax, series.prey.length);
    for (const v of series.prey) { if (v < dataYmin) dataYmin = v; if (v > dataYmax) dataYmax = v; }
    for (const v of series.P) { if (v < dataYmin) dataYmin = v; if (v > dataYmax) dataYmax = v; }
  }
  const yPad = 0.05 * (dataYmax - dataYmin || 1);
  const yTicks = niceAxis(dataYmin - yPad, dataYmax + yPad, 6);
  const xTicks = niceAxis(0, Math.max(1, nMax - 1), 7);

  const axisWidth = Math.max(1, xTicks.max - xTicks.min);
  const axisHeight = Math.max(1, yTicks.max - yTicks.min);
  const xOf = (i) => L + ((i - xTicks.min) / axisWidth) * (W - L - R);
  const yOf = (v) => H - B - ((v - yTicks.min) / axisHeight) * (H - T - B);

  ctxTS.strokeStyle = '#eef2f7';
  ctxTS.lineWidth = 1;
  ctxTS.beginPath();
  for (const xv of xTicks.ticks) { const x = xOf(xv); ctxTS.moveTo(x, T); ctxTS.lineTo(x, H - B); }
  for (const yv of yTicks.ticks) { const y = yOf(yv); ctxTS.moveTo(L, y); ctxTS.lineTo(W - R, y); }
  ctxTS.stroke();

  ctxTS.strokeStyle = '#e5e7eb';
  ctxTS.strokeRect(L, T, W - L - R, H - T - B);

  for (const series of seriesList) {
    ctxTS.lineWidth = series.type === 'baseline' ? 2.4 : 1.9;
    ctxTS.setLineDash(series.lineDash || []);
    ctxTS.beginPath();
    const prey = series.prey;
    for (let i = 0; i < prey.length; i++) {
      const x = xOf(i);
      const y = yOf(prey[i]);
      if (i === 0) ctxTS.moveTo(x, y); else ctxTS.lineTo(x, y);
    }
    ctxTS.strokeStyle = series.colors.prey;
    ctxTS.stroke();

    ctxTS.beginPath();
    const P = series.P;
    for (let i = 0; i < P.length; i++) {
      const x = xOf(i);
      const y = yOf(P[i]);
      if (i === 0) ctxTS.moveTo(x, y); else ctxTS.lineTo(x, y);
    }
    ctxTS.strokeStyle = series.colors.pred;
    ctxTS.stroke();
  }

  ctxTS.setLineDash([]);
  ctxTS.fillStyle = '#0f172a';
  ctxTS.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxTS.textAlign = 'center'; ctxTS.textBaseline = 'top';
  for (const xv of xTicks.ticks) { const x = xOf(xv); ctxTS.fillText(String(Math.round(xv)), x, H - B + 6); }
  ctxTS.textAlign = 'right'; ctxTS.textBaseline = 'middle';
  const absRange = Math.abs(yTicks.max - yTicks.min);
  const digits = absRange >= 100 ? 0 : (absRange >= 10 ? 1 : 2);
  for (const yv of yTicks.ticks) { ctxTS.fillText(yv.toFixed(digits), L - 8, yOf(yv)); }
  ctxTS.fillStyle = '#111827';
  ctxTS.textAlign = 'center'; ctxTS.textBaseline = 'bottom';
  ctxTS.font = '13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxTS.fillText('time [min]', L + (W - L - R) / 2, H - 8);
  ctxTS.save();
  ctxTS.translate(16, T + (H - T - B) / 2); ctxTS.rotate(-Math.PI / 2);
  ctxTS.textAlign = 'center'; ctxTS.textBaseline = 'top';
  ctxTS.fillText('Concentration [nM]', 0, 0);
  ctxTS.restore();
  ctxTS.textAlign = 'center'; ctxTS.textBaseline = 'top';
  ctxTS.font = '16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxTS.fillText('Time Series (Prey vs Predator)', L + (W - L - R) / 2, 12);
}

function drawPhase(seriesList) {
  const W = cvPH.width, H = cvPH.height;
  const L = 70, R = 30, T = 50, B = 60;

  ctxPH.save(); ctxPH.fillStyle = '#fff'; ctxPH.fillRect(0, 0, W, H); ctxPH.restore();
  if (!seriesList.length) return;

  let xMin = Infinity, xMax = -Infinity;
  let yMin = Infinity, yMax = -Infinity;
  for (const series of seriesList) {
    for (const v of series.prey) { if (v < xMin) xMin = v; if (v > xMax) xMax = v; }
    for (const v of series.P) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; }
  }
  const xPad = 0.05 * (xMax - xMin || 1);
  const yPad = 0.05 * (yMax - yMin || 1);
  const xTicks = niceAxis(xMin - xPad, xMax + xPad, 6);
  const yTicks = niceAxis(yMin - yPad, yMax + yPad, 6);

  const xOf = (v) => L + ((v - xTicks.min) / (xTicks.max - xTicks.min || 1)) * (W - L - R);
  const yOf = (v) => H - B - ((v - yTicks.min) / (yTicks.max - yTicks.min || 1)) * (H - T - B);

  ctxPH.strokeStyle = '#eef2f7'; ctxPH.lineWidth = 1; ctxPH.beginPath();
  for (const xv of xTicks.ticks) { const x = xOf(xv); ctxPH.moveTo(x, T); ctxPH.lineTo(x, H - B); }
  for (const yv of yTicks.ticks) { const y = yOf(yv); ctxPH.moveTo(L, y); ctxPH.lineTo(W - R, y); }
  ctxPH.stroke();

  ctxPH.strokeStyle = '#e5e7eb';
  ctxPH.strokeRect(L, T, W - L - R, H - T - B);

  for (const series of seriesList) {
    ctxPH.lineWidth = series.type === 'baseline' ? 2.0 : 1.7;
    ctxPH.setLineDash(series.lineDash || []);
    ctxPH.beginPath();
    const prey = series.prey;
    const P = series.P;
    for (let i = 0; i < prey.length; i++) {
      const x = xOf(prey[i]);
      const y = yOf(P[i]);
      if (i === 0) ctxPH.moveTo(x, y); else ctxPH.lineTo(x, y);
    }
    ctxPH.strokeStyle = series.colors.pred;
    ctxPH.stroke();
  }

  ctxPH.setLineDash([]);

  ctxPH.fillStyle = '#0f172a';
  ctxPH.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxPH.textAlign = 'center'; ctxPH.textBaseline = 'top';
  for (const xv of xTicks.ticks) { const x = xOf(xv); ctxPH.fillText(String(roundSmart(xv)), x, H - B + 6); }
  ctxPH.textAlign = 'right'; ctxPH.textBaseline = 'middle';
  for (const yv of yTicks.ticks) { ctxPH.fillText(String(roundSmart(yv)), L - 8, yOf(yv)); }

  ctxPH.fillStyle = '#111827';
  ctxPH.textAlign = 'center'; ctxPH.textBaseline = 'bottom';
  ctxPH.font = '13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxPH.fillText('Prey [nM]', L + (W - L - R) / 2, H - 8);
  ctxPH.save();
  ctxPH.translate(16, T + (H - T - B) / 2); ctxPH.rotate(-Math.PI / 2);
  ctxPH.textAlign = 'center'; ctxPH.textBaseline = 'top';
  ctxPH.fillText('P [nM]', 0, 0);
  ctxPH.restore();
  ctxPH.textAlign = 'center'; ctxPH.textBaseline = 'top';
  ctxPH.font = '16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxPH.fillText('Phase Portrait (Prey vs P)', L + (W - L - R) / 2, 12);
}

function renderLegend(seriesList) {
  const legendEl = document.getElementById('step2Legend');
  if (!legendEl) return;
  legendEl.innerHTML = '';
  if (!seriesList.length) return;

  for (const series of seriesList) {
    const row = document.createElement('div');
    row.className = 'step2-legend-row';

    const swatches = document.createElement('div');
    swatches.className = 'step2-legend-swatches';
    const preySw = document.createElement('span');
    preySw.className = 'step2-swatch';
    preySw.style.background = series.colors.prey;
    const predSw = document.createElement('span');
    predSw.className = 'step2-swatch';
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

function renderMetrics(seriesList) {
  const metricsEl = document.getElementById('step2Metrics');
  if (!metricsEl) return;

  const baseline = seriesList.find((s) => s.type === 'baseline');
  const active = seriesList.find((s) => s.type === 'active');

  if (!baseline || !active) {
    metricsEl.innerHTML = '<p style="color: #94a3b8;">No active modification. Set one in Step ①.</p>';
    return;
  }

  const k1Ratio = (active.derived.k1Eff / baseline.derived.k1Eff - 1) * 100;
  const bRatio = (active.derived.bEff / baseline.derived.bEff - 1) * 100;
  const gRatio = (active.derived.gEff / baseline.derived.gEff - 1) * 100;
  const betaRatio = (active.derived.betaEff / baseline.derived.betaEff - 1) * 100;

  metricsEl.innerHTML = `
    <div class="step2-metric-item">
      <h4>k₁′</h4>
      <p>${formatScientific(active.derived.k1Eff)} nM⁻¹min⁻¹</p>
      <span class="step2-badge ${k1Ratio > 0 ? 'positive' : k1Ratio < 0 ? 'negative' : 'neutral'}">
        ${k1Ratio > 0 ? '+' : ''}${k1Ratio.toFixed(1)}%
      </span>
    </div>
    <div class="step2-metric-item">
      <h4>b′</h4>
      <p>${formatScientific(active.derived.bEff)} nM⁻¹</p>
      <span class="step2-badge ${bRatio > 0 ? 'positive' : bRatio < 0 ? 'negative' : 'neutral'}">
        ${bRatio > 0 ? '+' : ''}${bRatio.toFixed(1)}%
      </span>
    </div>
    <div class="step2-metric-item">
      <h4>g′</h4>
      <p>${active.derived.gEff.toFixed(3)}</p>
      <span class="step2-badge ${gRatio > 0 ? 'positive' : gRatio < 0 ? 'negative' : 'neutral'}">
        ${gRatio > 0 ? '+' : ''}${gRatio.toFixed(1)}%
      </span>
    </div>
    <div class="step2-metric-item">
      <h4>β′</h4>
      <p>${active.derived.betaEff.toFixed(3)}</p>
      <span class="step2-badge ${betaRatio > 0 ? 'positive' : betaRatio < 0 ? 'negative' : 'neutral'}">
        ${betaRatio > 0 ? '+' : ''}${betaRatio.toFixed(1)}%
      </span>
    </div>
  `;
}

function renderOverlays() {
  const overlaysEl = document.getElementById('step2Overlays');
  if (!overlaysEl) return;

  const mods = loadModifications();
  const activeId = getActiveModificationId();
  const selectedOverlayIds = getOverlayModificationIds();

  const availableMods = mods.filter((m) => m.id !== activeId);

  if (availableMods.length === 0) {
    overlaysEl.innerHTML = '<p style="color: #94a3b8; font-size: 0.875rem;">No additional modifications available.</p>';
    return;
  }

  overlaysEl.innerHTML = '<p style="color: #64748b; font-size: 0.875rem; margin-bottom: 0.75rem;">Select modifications to overlay:</p>';

  availableMods.forEach((mod) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'step2-overlay-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `overlay-${mod.id}`;
    checkbox.checked = selectedOverlayIds.includes(mod.id);
    checkbox.addEventListener('change', () => {
      handleOverlayToggle(mod.id, checkbox.checked);
    });

    const label = document.createElement('label');
    label.htmlFor = `overlay-${mod.id}`;
    label.textContent = mod.label || 'Untitled';

    wrapper.appendChild(checkbox);
    wrapper.appendChild(label);
    overlaysEl.appendChild(wrapper);
  });
}

function handleOverlayToggle(modId, checked) {
  let overlayIds = getOverlayModificationIds();

  if (checked) {
    if (!overlayIds.includes(modId)) {
      overlayIds.push(modId);
    }
  } else {
    overlayIds = overlayIds.filter((id) => id !== modId);
  }

  setOverlayModificationIds(overlayIds);
  needsUpdate = true;
}

// Helper functions
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
  const step = niceNum(range / (maxTicks - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + 0.5 * step; v += step) ticks.push(v);
  return { min: niceMin, max: niceMax, step, ticks };
}

function roundSmart(v) {
  const a = Math.abs(v);
  if (a >= 100) return Math.round(v);
  if (a >= 10) return Math.round(v * 10) / 10;
  return Math.round(v * 100) / 100;
}

function formatScientific(num) {
  if (num >= 0.01) return num.toFixed(4);
  return num.toExponential(2);
}
