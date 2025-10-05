// Step 4: 比較 — Bifurcation & Heatmap

import { initWasm, runSimulationPhysical } from '../../core.js';
import {
  buildSimulationVariants,
  loadModifications,
  getActiveModificationId,
  getOverlayModificationIds,
  GAS_CONSTANT_KCAL,
} from '../../modifications.js';

import { STEP4_EXPLANATION, autoRenderMath } from '../mathExplainer.js';

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
const BASELINE_COLOR = '#1d4ed8';
const ACTIVE_COLOR = '#ef4444';
const OVERLAY_COLORS = ['#9333ea', '#22c55e', '#f97316', '#0ea5e9'];

let activeTab = 'bifurcation';
let cvBif, ctxBif, cvHeat, ctxHeat;

export async function render(container) {
  // Load CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './steps/step4.css';
  document.head.appendChild(link);

  // Build UI
  container.innerHTML = `
    <h1 class="simple-step-title">比較 — Bifurcation & Heatmap</h1>
    <p class="simple-step-description">
      分岐図 / ヒートマップ / オーバーレイ管理
    </p>

    <div class="step4-tabs">
      <button class="step4-tab active" data-tab="bifurcation">Bifurcation</button>
      <button class="step4-tab" data-tab="heatmap">Heatmap</button>
    </div>

    <div class="step4-content">
      <!-- Bifurcation Tab -->
      <div id="step4BifurcationTab" class="step4-tab-content active">
        <div class="step4-controls">
          <h3>Bifurcation Parameters</h3>
          <div class="step4-form">
            <label>
              Sweep Parameter
              <select id="step4BifParam">
                <option value="pol">pol (ETSSB)</option>
                <option value="rec">rec (Nb.BbvCI)</option>
                <option value="G" selected>G (substrate)</option>
                <option value="k1">k1</option>
                <option value="b">b</option>
              </select>
            </label>
            <label>
              Min
              <input type="number" id="step4BifMin" value="50" step="1">
            </label>
            <label>
              Max
              <input type="number" id="step4BifMax" value="250" step="1">
            </label>
            <label>
              Steps
              <input type="number" id="step4BifSteps" value="50" min="10" max="200">
            </label>
            <label>
              Tail %
              <input type="number" id="step4BifTail" value="20" min="1" max="100">
            </label>
          </div>
          <button id="step4BifRun" class="step4-btn-primary">Run Bifurcation</button>
          <div id="step4BifStatus" class="step4-status"></div>
        </div>
        <canvas id="step4CanvasBif" width="900" height="500"></canvas>
        <div id="step4BifLegend" class="step4-legend"></div>
      </div>

      <!-- Heatmap Tab -->
      <div id="step4HeatmapTab" class="step4-tab-content">
        <div class="step4-controls">
          <h3>Heatmap Parameters</h3>
          <div class="step4-form-grid">
            <div>
              <h4>X Axis</h4>
              <label>
                Parameter
                <select id="step4HeatXParam">
                  <option value="pol">pol</option>
                  <option value="rec" selected>rec</option>
                  <option value="G">G</option>
                  <option value="k1">k1</option>
                </select>
              </label>
              <label>
                Min
                <input type="number" id="step4HeatXMin" value="10" step="1">
              </label>
              <label>
                Max
                <input type="number" id="step4HeatXMax" value="100" step="1">
              </label>
              <label>
                Steps
                <input type="number" id="step4HeatXSteps" value="30" min="5" max="100">
              </label>
            </div>
            <div>
              <h4>Y Axis</h4>
              <label>
                Parameter
                <select id="step4HeatYParam">
                  <option value="pol" selected>pol</option>
                  <option value="rec">rec</option>
                  <option value="G">G</option>
                  <option value="k1">k1</option>
                </select>
              </label>
              <label>
                Min
                <input type="number" id="step4HeatYMin" value="1" step="0.1">
              </label>
              <label>
                Max
                <input type="number" id="step4HeatYMax" value="10" step="0.1">
              </label>
              <label>
                Steps
                <input type="number" id="step4HeatYSteps" value="30" min="5" max="100">
              </label>
            </div>
          </div>
          <div class="step4-form">
            <label>
              Metric
              <select id="step4HeatMetric">
                <option value="max" selected>Max P</option>
                <option value="min">Min P</option>
                <option value="mean">Mean P</option>
                <option value="amp">Amplitude</option>
              </select>
            </label>
            <label>
              Tail %
              <input type="number" id="step4HeatTail" value="20" min="1" max="100">
            </label>
          </div>
          <button id="step4HeatRun" class="step4-btn-primary">Run Heatmap</button>
          <div id="step4HeatStatus" class="step4-status"></div>
        </div>
        <canvas id="step4CanvasHeat" width="800" height="600"></canvas>
        <div id="step4HeatLegend" class="step4-legend"></div>
      </div>
    </div>

    <!-- Overlay Summary -->
    <div class="step4-footer">
      <h3>アクティブなオーバーレイ</h3>
      <div id="step4OverlaySummary" class="step4-overlay-summary"></div>
      <p style="color: #64748b; font-size: 0.875rem; margin-top: 1rem;">
        オーバーレイの管理は <a href="#/simple/2" class="step4-link">Step ②</a> で、詳細は
        <a href="../detail/" class="step4-link">Detail View</a> で確認できます。
      </p>
    </div>

    <!-- Explanation Section -->
    <div class="step4-explanation" style="margin-top: 2rem; padding: 1.5rem; background: #f8fafc; border-radius: 0.5rem; border: 1px solid #e2e8f0;">
      <div id="step4ExplanationContent">${STEP4_EXPLANATION}</div>
    </div>
  `;

  // Initialize canvases
  cvBif = document.getElementById('step4CanvasBif');
  ctxBif = cvBif.getContext('2d', { alpha: false });
  cvHeat = document.getElementById('step4CanvasHeat');
  ctxHeat = cvHeat.getContext('2d', { alpha: false });

  // Initialize WASM
  await initWasm();

  // Set up event listeners
  setupTabs();
  setupBifurcation();
  setupHeatmap();
  renderOverlaySummary();

  // Render math in explanation
  setTimeout(() => {
    const explainer = document.getElementById('step4ExplanationContent');
    if (explainer) autoRenderMath(explainer);
  }, 150);
}

function setupTabs() {
  document.querySelectorAll('.step4-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      activeTab = tabName;

      // Update tab buttons
      document.querySelectorAll('.step4-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      // Update tab content
      document.querySelectorAll('.step4-tab-content').forEach((c) => c.classList.remove('active'));
      document.getElementById(`step4${capitalize(tabName)}Tab`).classList.add('active');
    });
  });
}

function setupBifurcation() {
  const runBtn = document.getElementById('step4BifRun');
  runBtn.addEventListener('click', runBifurcation);
}

function setupHeatmap() {
  const runBtn = document.getElementById('step4HeatRun');
  runBtn.addEventListener('click', runHeatmap);
}

async function runBifurcation() {
  const runBtn = document.getElementById('step4BifRun');
  const statusEl = document.getElementById('step4BifStatus');

  runBtn.disabled = true;
  statusEl.textContent = 'Running sweep...';

  const pname = document.getElementById('step4BifParam').value;
  const pmin = parseFloat(document.getElementById('step4BifMin').value);
  const pmax = parseFloat(document.getElementById('step4BifMax').value);
  const steps = Math.max(10, parseInt(document.getElementById('step4BifSteps').value));
  const tailPct = parseInt(document.getElementById('step4BifTail').value);

  const bp = { ...BASELINE };
  const previewParams = { ...bp, [pname]: pmin };
  const previewVariants = buildSimulationVariants(previewParams);

  const variantStyles = new Map();
  let overlayIdx = 0;
  for (const variant of previewVariants) {
    const color = colorForVariant(variant, overlayIdx);
    variantStyles.set(variant.id, color);
    if (variant.type === 'overlay') overlayIdx++;
  }

  const seriesMap = new Map();

  for (let i = 0; i < steps; i++) {
    const x = pmin + (pmax - pmin) * (i / (steps - 1 || 1));
    const paramsBase = { ...bp, [pname]: x };
    const variants = buildSimulationVariants(paramsBase);

    for (const variant of variants) {
      const { P } = runSimulationPhysical(variant.params);
      const tail = Math.max(1, Math.floor(P.length * (tailPct / 100)));
      let pminTail = +Infinity, pmaxTail = -Infinity;
      for (let j = P.length - tail; j < P.length; j++) {
        const v = P[j];
        if (v < pminTail) pminTail = v;
        if (v > pmaxTail) pmaxTail = v;
      }

      let entry = seriesMap.get(variant.id);
      if (!entry) {
        if (!variantStyles.has(variant.id)) {
          const color = colorForVariant(variant, overlayIdx);
          variantStyles.set(variant.id, color);
          if (variant.type === 'overlay') overlayIdx++;
        }
        entry = {
          id: variant.id,
          label: variant.label,
          type: variant.type,
          color: variantStyles.get(variant.id),
          lineDash: variant.type === 'overlay' ? [4, 4] : [],
          xs: [],
          yMin: [],
          yMax: [],
        };
        seriesMap.set(variant.id, entry);
      }
      entry.xs.push(x);
      entry.yMin.push(pminTail);
      entry.yMax.push(pmaxTail);
    }

    if ((i % 5) === 0) {
      statusEl.textContent = `Running sweep... ${i + 1}/${steps}`;
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const seriesList = Array.from(seriesMap.values()).sort((a, b) => {
    if (a.type === b.type) return a.label.localeCompare(b.label);
    if (a.type === 'baseline') return -1;
    if (b.type === 'baseline') return 1;
    if (a.type === 'active') return -1;
    if (b.type === 'active') return 1;
    return a.label.localeCompare(b.label);
  });

  drawBifurcation(seriesList, pname);
  renderBifurcationLegend(seriesList);
  statusEl.textContent = `Done. ${seriesList.length} series, ${seriesList[0]?.xs.length || 0} points each`;
  runBtn.disabled = false;
}

async function runHeatmap() {
  const runBtn = document.getElementById('step4HeatRun');
  const statusEl = document.getElementById('step4HeatStatus');

  runBtn.disabled = true;
  statusEl.textContent = 'Running grid...';

  const xParam = document.getElementById('step4HeatXParam').value;
  const yParam = document.getElementById('step4HeatYParam').value;

  if (xParam === yParam) {
    statusEl.textContent = 'X and Y parameters must be different';
    runBtn.disabled = false;
    return;
  }

  const xMin = parseFloat(document.getElementById('step4HeatXMin').value);
  const xMax = parseFloat(document.getElementById('step4HeatXMax').value);
  const yMin = parseFloat(document.getElementById('step4HeatYMin').value);
  const yMax = parseFloat(document.getElementById('step4HeatYMax').value);
  const nx = Math.max(5, parseInt(document.getElementById('step4HeatXSteps').value));
  const ny = Math.max(5, parseInt(document.getElementById('step4HeatYSteps').value));
  const metric = document.getElementById('step4HeatMetric').value;
  const tailPct = parseInt(document.getElementById('step4HeatTail').value);

  const bp = { ...BASELINE };

  // Only run for active variant (simplified)
  const activeId = getActiveModificationId();
  const variants = buildSimulationVariants(bp);
  const activeVariant = activeId ? variants.find((v) => v.id === activeId) : variants[0];

  if (!activeVariant) {
    statusEl.textContent = 'No active variant found';
    runBtn.disabled = false;
    return;
  }

  const grid = [];
  for (let j = 0; j < ny; j++) {
    const row = [];
    for (let i = 0; i < nx; i++) {
      row.push(0);
    }
    grid.push(row);
  }

  for (let j = 0; j < ny; j++) {
    const yVal = yMin + (yMax - yMin) * (j / (ny - 1));
    for (let i = 0; i < nx; i++) {
      const xVal = xMin + (xMax - xMin) * (i / (nx - 1));
      const params = { ...activeVariant.params, [xParam]: xVal, [yParam]: yVal };
      const { P } = runSimulationPhysical(params);
      const tail = Math.max(1, Math.floor(P.length * (tailPct / 100)));
      const tailData = P.slice(P.length - tail);

      let value = 0;
      if (metric === 'max') value = Math.max(...tailData);
      else if (metric === 'min') value = Math.min(...tailData);
      else if (metric === 'mean') value = tailData.reduce((a, b) => a + b, 0) / tailData.length;
      else if (metric === 'amp') value = Math.max(...tailData) - Math.min(...tailData);

      grid[j][i] = value;
    }

    if ((j % 2) === 0) {
      statusEl.textContent = `Running grid... row ${j + 1}/${ny}`;
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  drawHeatmap(grid, xParam, yParam, xMin, xMax, yMin, yMax, metric);
  statusEl.textContent = `Done. ${nx}×${ny} grid`;
  runBtn.disabled = false;
}

function drawBifurcation(seriesList, pname) {
  const W = cvBif.width, H = cvBif.height;
  const L = 80, R = 30, T = 50, B = 60;

  ctxBif.fillStyle = '#fff';
  ctxBif.fillRect(0, 0, W, H);

  if (!seriesList.length) return;

  let xMin = Infinity, xMax = -Infinity;
  let yMin = Infinity, yMax = -Infinity;

  for (const series of seriesList) {
    for (const x of series.xs) {
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
    }
    for (const y of series.yMin) {
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
    for (const y of series.yMax) {
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  }

  const xTicks = niceAxis(xMin, xMax, 6);
  const yTicks = niceAxis(yMin, yMax, 6);

  const xOf = (v) => L + ((v - xTicks.min) / (xTicks.max - xTicks.min || 1)) * (W - L - R);
  const yOf = (v) => H - B - ((v - yTicks.min) / (yTicks.max - yTicks.min || 1)) * (H - T - B);

  // Grid
  ctxBif.strokeStyle = '#eef2f7';
  ctxBif.lineWidth = 1;
  ctxBif.beginPath();
  for (const xv of xTicks.ticks) { const x = xOf(xv); ctxBif.moveTo(x, T); ctxBif.lineTo(x, H - B); }
  for (const yv of yTicks.ticks) { const y = yOf(yv); ctxBif.moveTo(L, y); ctxBif.lineTo(W - R, y); }
  ctxBif.stroke();

  ctxBif.strokeStyle = '#e5e7eb';
  ctxBif.strokeRect(L, T, W - L - R, H - T - B);

  // Plot series
  for (const series of seriesList) {
    ctxBif.strokeStyle = series.color;
    ctxBif.lineWidth = series.type === 'baseline' ? 2.5 : 2;
    ctxBif.setLineDash(series.lineDash || []);

    for (let i = 0; i < series.xs.length; i++) {
      const x = xOf(series.xs[i]);
      const yMinPx = yOf(series.yMin[i]);
      const yMaxPx = yOf(series.yMax[i]);

      ctxBif.beginPath();
      ctxBif.moveTo(x, yMinPx);
      ctxBif.lineTo(x, yMaxPx);
      ctxBif.stroke();
    }
  }

  ctxBif.setLineDash([]);

  // Axes
  ctxBif.fillStyle = '#0f172a';
  ctxBif.font = '12px system-ui';
  ctxBif.textAlign = 'center';
  ctxBif.textBaseline = 'top';
  for (const xv of xTicks.ticks) { ctxBif.fillText(xv.toFixed(1), xOf(xv), H - B + 6); }
  ctxBif.textAlign = 'right';
  ctxBif.textBaseline = 'middle';
  for (const yv of yTicks.ticks) { ctxBif.fillText(yv.toFixed(1), L - 8, yOf(yv)); }

  ctxBif.fillStyle = '#111827';
  ctxBif.textAlign = 'center';
  ctxBif.textBaseline = 'bottom';
  ctxBif.font = '14px system-ui';
  ctxBif.fillText(pname, L + (W - L - R) / 2, H - 8);
  ctxBif.save();
  ctxBif.translate(16, T + (H - T - B) / 2);
  ctxBif.rotate(-Math.PI / 2);
  ctxBif.textAlign = 'center';
  ctxBif.textBaseline = 'top';
  ctxBif.fillText('P [nM]', 0, 0);
  ctxBif.restore();
  ctxBif.textAlign = 'center';
  ctxBif.textBaseline = 'top';
  ctxBif.font = '16px system-ui';
  ctxBif.fillText('Bifurcation Diagram', L + (W - L - R) / 2, 12);
}

function drawHeatmap(grid, xParam, yParam, xMin, xMax, yMin, yMax, metric) {
  const W = cvHeat.width, H = cvHeat.height;
  const L = 80, R = 100, T = 50, B = 60;

  ctxHeat.fillStyle = '#fff';
  ctxHeat.fillRect(0, 0, W, H);

  const ny = grid.length;
  const nx = grid[0]?.length || 0;
  if (nx === 0 || ny === 0) return;

  // Find min/max for color scale
  let vMin = Infinity, vMax = -Infinity;
  for (const row of grid) {
    for (const v of row) {
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
  }

  const cellW = (W - L - R) / nx;
  const cellH = (H - T - B) / ny;

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const value = grid[j][i];
      const norm = (vMax - vMin) > 0 ? (value - vMin) / (vMax - vMin) : 0;
      const color = interpolateColor('#dbeafe', '#1d4ed8', norm);

      const x = L + i * cellW;
      const y = H - B - (j + 1) * cellH;

      ctxHeat.fillStyle = color;
      ctxHeat.fillRect(x, y, cellW, cellH);
    }
  }

  // Axes
  const xTicks = niceAxis(xMin, xMax, 6);
  const yTicks = niceAxis(yMin, yMax, 6);

  ctxHeat.strokeStyle = '#e5e7eb';
  ctxHeat.strokeRect(L, T, W - L - R, H - T - B);

  ctxHeat.fillStyle = '#0f172a';
  ctxHeat.font = '12px system-ui';
  ctxHeat.textAlign = 'center';
  ctxHeat.textBaseline = 'top';
  const xOf = (v) => L + ((v - xMin) / (xMax - xMin || 1)) * (W - L - R);
  for (const xv of xTicks.ticks) { ctxHeat.fillText(xv.toFixed(1), xOf(xv), H - B + 6); }
  ctxHeat.textAlign = 'right';
  ctxHeat.textBaseline = 'middle';
  const yOf = (v) => H - B - ((v - yMin) / (yMax - yMin || 1)) * (H - T - B);
  for (const yv of yTicks.ticks) { ctxHeat.fillText(yv.toFixed(1), L - 8, yOf(yv)); }

  ctxHeat.fillStyle = '#111827';
  ctxHeat.textAlign = 'center';
  ctxHeat.textBaseline = 'bottom';
  ctxHeat.font = '14px system-ui';
  ctxHeat.fillText(xParam, L + (W - L - R) / 2, H - 8);
  ctxHeat.save();
  ctxHeat.translate(16, T + (H - T - B) / 2);
  ctxHeat.rotate(-Math.PI / 2);
  ctxHeat.textAlign = 'center';
  ctxHeat.textBaseline = 'top';
  ctxHeat.fillText(yParam, 0, 0);
  ctxHeat.restore();
  ctxHeat.textAlign = 'center';
  ctxHeat.textBaseline = 'top';
  ctxHeat.font = '16px system-ui';
  ctxHeat.fillText(`Heatmap (${metric})`, L + (W - L - R) / 2, 12);

  // Color bar
  drawColorBar(ctxHeat, W - R + 10, T, 30, H - T - B, vMin, vMax);
}

function drawColorBar(ctx, x, y, w, h, vMin, vMax) {
  const steps = 100;
  const stepH = h / steps;

  for (let i = 0; i < steps; i++) {
    const norm = i / (steps - 1);
    const color = interpolateColor('#dbeafe', '#1d4ed8', norm);
    ctx.fillStyle = color;
    ctx.fillRect(x, y + h - (i + 1) * stepH, w, stepH);
  }

  ctx.strokeStyle = '#e5e7eb';
  ctx.strokeRect(x, y, w, h);

  ctx.fillStyle = '#0f172a';
  ctx.font = '11px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(vMax.toFixed(1), x + w + 4, y);
  ctx.textBaseline = 'bottom';
  ctx.fillText(vMin.toFixed(1), x + w + 4, y + h);
}

function renderBifurcationLegend(seriesList) {
  const legendEl = document.getElementById('step4BifLegend');
  legendEl.innerHTML = '';

  for (const series of seriesList) {
    const item = document.createElement('div');
    item.className = 'step4-legend-item';
    item.innerHTML = `
      <span class="step4-legend-color" style="background: ${series.color};"></span>
      <span>${series.label} (${series.type})</span>
    `;
    legendEl.appendChild(item);
  }
}

function renderOverlaySummary() {
  const summaryEl = document.getElementById('step4OverlaySummary');
  const mods = loadModifications();
  const activeId = getActiveModificationId();
  const overlayIds = getOverlayModificationIds();

  const active = mods.find((m) => m.id === activeId);
  const overlays = overlayIds.map((id) => mods.find((m) => m.id === id)).filter(Boolean);

  summaryEl.innerHTML = '';

  if (active) {
    const item = document.createElement('div');
    item.className = 'step4-overlay-item';
    item.innerHTML = `
      <span style="color: ${ACTIVE_COLOR}; font-weight: 600;">●</span>
      <span><strong>${active.label}</strong> (Active)</span>
    `;
    summaryEl.appendChild(item);
  }

  overlays.forEach((mod, idx) => {
    const item = document.createElement('div');
    item.className = 'step4-overlay-item';
    item.innerHTML = `
      <span style="color: ${OVERLAY_COLORS[idx % OVERLAY_COLORS.length]}; font-weight: 600;">●</span>
      <span>${mod.label} (Overlay)</span>
    `;
    summaryEl.appendChild(item);
  });

  if (!active && overlays.length === 0) {
    summaryEl.innerHTML = '<p style="color: #94a3b8;">No overlays selected. Configure in Step ②.</p>';
  }
}

// Helpers
function colorForVariant(variant, overlayIdx) {
  if (variant.type === 'baseline') return BASELINE_COLOR;
  if (variant.type === 'active') return ACTIVE_COLOR;
  return OVERLAY_COLORS[overlayIdx % OVERLAY_COLORS.length];
}

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

function interpolateColor(color1, color2, t) {
  const hex = (c) => parseInt(c.slice(1), 16);
  const c1 = hex(color1);
  const c2 = hex(color2);
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
