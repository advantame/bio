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
  'pol','rec','G','k1','k2','kN','kP','b','KmP','N0','P0',
  'enableTimeAxis','tParam','tMin','tMax','tSteps','videoDuration'
];
const el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
const presetSel = document.getElementById('preset');
const applyPresetBtn = document.getElementById('applyPreset');
const presetDesc = document.getElementById('presetDesc');
const videoPlayer = document.getElementById('videoPlayer');
const shareBtn = document.getElementById('shareBtn');

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
  if (name === 'poly_r') {
    const rPoly = Math.max(value, 0.01);
    params.k1 *= rPoly;
    // b は不変
    return { rPoly };
  }
  if (name === 'nick_r') {
    const rNick = Math.max(value, 0.01);
    params.k1 /= rNick;
    params.b /= rNick;
    return { rNick };
  }
  params[name] = value;
  return {};
}

function axisLabel(name){
  switch (name) {
    case 'assoc_ddg': return 'ΔΔG_assoc [kcal/mol]';
    case 'assoc_r': return 'r_assoc';
    case 'poly_r': return 'r_poly';
    case 'nick_r': return 'r_nick';
    case 'k1': return 'k1';
    case 'N0': return 'N0 [nM]';
    case 'P0': return 'P0 [nM]';
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
  await initWasm();

  // Check if time axis mode is enabled
  if (el.enableTimeAxis.checked) {
    await runTimeAxisAnimation();
    runBtn.disabled = false;
    return;
  }

  status.textContent = 'Running grid...';

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

  // Parallel execution with Web Workers
  const USE_PARALLEL = true; // Set to false to use sequential execution
  const numWorkers = USE_PARALLEL ? (navigator.hardwareConcurrency || 4) : 1;

  if (USE_PARALLEL && numWorkers > 1) {
    // === PARALLEL EXECUTION ===
    await runHeatmapParallel(variantMap, variantStyles, previewVariants, bp, xParam, yParam, xMin, xMax, yMin, yMax, nx, ny, metric, tailPct, status);
  } else {
    // === SEQUENTIAL EXECUTION ===
    await runHeatmapSequential(variantMap, variantStyles, previewVariants, bp, xParam, yParam, xMin, xMax, yMin, yMax, nx, ny, metric, tailPct, status);
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
  console.log(`   Mode: ${USE_PARALLEL && numWorkers > 1 ? `Parallel (${numWorkers} workers)` : 'Sequential'}`);

  runBtn.disabled = false;
});

// Sequential execution function (original implementation)
async function runHeatmapSequential(variantMap, variantStyles, previewVariants, bp, xParam, yParam, xMin, xMax, yMin, yMax, nx, ny, metric, tailPct, status) {
  let overlayIdx = 0;
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
}

// Parallel execution function using Web Workers
async function runHeatmapParallel(variantMap, variantStyles, previewVariants, bp, xParam, yParam, xMin, xMax, yMin, yMax, nx, ny, metric, tailPct, status) {
  let overlayIdx = 0;

  // Build list of all cells to compute
  const allCells = [];
  for (let j=0; j<ny; j++){
    const yVal = yMin + (yMax - yMin) * (j / (ny - 1));
    for (let i=0; i<nx; i++){
      const xVal = xMin + (xMax - xMin) * (i / (nx - 1));
      const { params } = buildParamsForAxes(bp, { name: xParam, value: xVal }, { name: yParam, value: yVal });
      const variants = buildSimulationVariants(params);

      // Track variant styles
      for (const variant of variants){
        if (!variantStyles.has(variant.id)){
          variantStyles.set(variant.id, colorForVariant(variant, overlayIdx));
          if (variant.type === 'overlay') overlayIdx++;
        }

        // Initialize variant map entry
        if (!variantMap.has(variant.id)){
          variantMap.set(variant.id, {
            id: variant.id,
            label: variant.label,
            type: variant.type,
            color: variantStyles.get(variant.id),
            grid: new Float32Array(nx * ny).fill(NaN),
            derived: variant.derived,
          });
        }

        // Add cell to work queue
        allCells.push({
          i, j,
          variantId: variant.id,
          params: variant.params
        });
      }
    }
  }

  const totalCells = allCells.length;
  const numWorkers = navigator.hardwareConcurrency || 4;
  const workers = [];

  // Create workers
  for (let w = 0; w < numWorkers; w++) {
    workers.push(new Worker('./heatmap-worker.js', { type: 'module' }));
  }

  // Distribute cells across workers
  const cellsPerWorker = Math.ceil(totalCells / numWorkers);
  const promises = workers.map((worker, workerIdx) => {
    const start = workerIdx * cellsPerWorker;
    const end = Math.min(start + cellsPerWorker, totalCells);
    const workerCells = allCells.slice(start, end).map((cell, idx) => ({
      ...cell,
      cellIndex: start + idx  // Track original index in allCells
    }));

    return new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        const { workerId, results, error } = e.data;

        if (error) {
          reject(new Error(error));
          return;
        }

        // Fill grid with results
        for (const { i, j, value, cellIndex } of results) {
          // Match by cell index in allCells array
          const cellData = cellIndex !== undefined ? allCells[cellIndex] : allCells.find(c => c.i === i && c.j === j);
          if (cellData) {
            const entry = variantMap.get(cellData.variantId);
            if (entry) {
              entry.grid[j * nx + i] = Number.isFinite(value) ? value : NaN;
            }
          }
        }

        // Update progress counter in real-time
        completed += results.length;

        resolve(results.length);
      };

      worker.onerror = (err) => {
        reject(new Error(`Worker ${workerIdx} error: ${err.message}`));
      };

      // Send work to worker
      worker.postMessage({
        workerId: workerIdx,
        cells: workerCells,
        metric,
        tailPct
      });
    });
  });

  // Track progress
  let completed = 0;
  const updateInterval = setInterval(() => {
    const progress = Math.floor((completed / totalCells) * 100);
    status.textContent = `Running parallel grid... ${progress}% (${numWorkers} workers)`;
  }, 100);

  try {
    // Wait for all workers to complete
    await Promise.all(promises);
    clearInterval(updateInterval);
    status.textContent = `Parallel computation complete (${completed}/${totalCells} cells)`;
  } catch (error) {
    clearInterval(updateInterval);
    status.textContent = `Error: ${error.message}`;
    console.error('Parallel execution failed:', error);
  } finally {
    // Cleanup workers
    workers.forEach(w => w.terminate());
  }
}

// T-axis (3rd axis) animation function
async function runTimeAxisAnimation() {
  const xParam = el.xParam.value;
  const yParam = el.yParam.value;
  const tParam = el.tParam.value;

  // Validation
  if (xParam === yParam || xParam === tParam || yParam === tParam) {
    status.textContent = 'X、Y、Tのパラメータはすべて別にしてください。';
    return;
  }
  if (tParam === 'none') {
    status.textContent = 'T軸のパラメータを選択してください。';
    return;
  }

  const xMin = num('xMin'), xMax = num('xMax');
  const yMin = num('yMin'), yMax = num('yMax');
  const tMin = num('tMin'), tMax = num('tMax');
  const nx = Math.max(2, Math.floor(num('xSteps')));
  const ny = Math.max(2, Math.floor(num('ySteps')));
  const nt = Math.max(2, Math.floor(num('tSteps')));
  const metric = el.metric.value;
  const tailPct = Math.min(100, Math.max(1, Math.floor(num('tail'))));
  const videoDuration = Math.max(1, num('videoDuration'));

  const bp = baseParams();
  const totalSims = nx * ny * nt;

  status.textContent = `3D空間シミュレーション実行中... (${nx}×${ny}×${nt} = ${totalSims}回)`;

  // Performance timing
  const startTime = performance.now();

  // Use parallel execution
  const USE_PARALLEL = true;
  const numWorkers = USE_PARALLEL ? (navigator.hardwareConcurrency || 4) : 1;

  const frames = [];

  if (USE_PARALLEL && numWorkers > 1) {
    // === PARALLEL EXECUTION ===
    await run3DGridParallel(frames, bp, xParam, yParam, tParam, xMin, xMax, yMin, yMax, tMin, tMax, nx, ny, nt, metric, tailPct, status);
  } else {
    // === SEQUENTIAL EXECUTION ===
    await run3DGridSequential(frames, bp, xParam, yParam, tParam, xMin, xMax, yMin, yMax, tMin, tMax, nx, ny, nt, metric, tailPct, status);
  }

  // Report performance
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ 3D grid completed in ${elapsed}s (${nx}×${ny}×${nt} = ${totalSims} cells)`);
  console.log(`   Average: ${(parseFloat(elapsed) / totalSims * 1000).toFixed(2)}ms per cell`);
  console.log(`   Mode: ${USE_PARALLEL && numWorkers > 1 ? `Parallel (${numWorkers} workers)` : 'Sequential'}`);

  status.textContent = '動画生成中...';
  await generateVideoFrom3DGrid(frames, nx, ny, xMin, xMax, yMin, yMax,
    axisLabel(xParam), axisLabel(yParam), axisLabel(tParam), tMin, tMax, metric, videoDuration);
}

// Sequential execution for 3D grid
async function run3DGridSequential(frames, bp, xParam, yParam, tParam, xMin, xMax, yMin, yMax, tMin, tMax, nx, ny, nt, metric, tailPct, status) {
  for (let t = 0; t < nt; t++) {
    const tVal = tMin + (tMax - tMin) * (t / (nt - 1));
    const grid = new Float32Array(nx * ny);

    for (let j = 0; j < ny; j++) {
      const yVal = yMin + (yMax - yMin) * (j / (ny - 1));
      for (let i = 0; i < nx; i++) {
        const xVal = xMin + (xMax - xMin) * (i / (nx - 1));

        // Build params with all three axes
        const { params } = buildParamsForAxes(bp,
          { name: xParam, value: xVal },
          { name: yParam, value: yVal }
        );
        // Apply T-axis
        applyAxisValue(params, tParam, tVal);

        // Run simulation and evaluate metric
        const val = runSimulationAndEvaluate(params, metric, tailPct);
        grid[j * nx + i] = Number.isFinite(val) ? val : NaN;
      }
    }

    frames.push({ grid, tVal });

    if (t % Math.max(1, Math.floor(nt / 10)) === 0) {
      const progress = Math.floor((t / nt) * 100);
      status.textContent = `3D空間シミュレーション実行中... ${progress}% (${t * nx * ny}/${nx * ny * nt})`;
      await new Promise(r => setTimeout(r, 0));
    }
  }
}

// Parallel execution for 3D grid using Web Workers
async function run3DGridParallel(frames, bp, xParam, yParam, tParam, xMin, xMax, yMin, yMax, tMin, tMax, nx, ny, nt, metric, tailPct, status) {
  // Build list of all cells to compute
  const allCells = [];
  for (let t = 0; t < nt; t++) {
    const tVal = tMin + (tMax - tMin) * (t / (nt - 1));
    for (let j = 0; j < ny; j++) {
      const yVal = yMin + (yMax - yMin) * (j / (ny - 1));
      for (let i = 0; i < nx; i++) {
        const xVal = xMin + (xMax - xMin) * (i / (nx - 1));

        // Build params with all three axes
        const { params } = buildParamsForAxes(bp,
          { name: xParam, value: xVal },
          { name: yParam, value: yVal }
        );
        // Apply T-axis
        applyAxisValue(params, tParam, tVal);

        allCells.push({
          i, j, t, tVal,
          params
        });
      }
    }
  }

  const totalCells = allCells.length;
  const numWorkers = navigator.hardwareConcurrency || 4;
  const workers = [];

  // Create workers
  for (let w = 0; w < numWorkers; w++) {
    workers.push(new Worker('./heatmap-worker.js', { type: 'module' }));
  }

  // Initialize frame grids
  for (let t = 0; t < nt; t++) {
    const tVal = tMin + (tMax - tMin) * (t / (nt - 1));
    frames.push({ grid: new Float32Array(nx * ny).fill(NaN), tVal });
  }

  // Distribute cells across workers
  const cellsPerWorker = Math.ceil(totalCells / numWorkers);
  const promises = workers.map((worker, workerIdx) => {
    const start = workerIdx * cellsPerWorker;
    const end = Math.min(start + cellsPerWorker, totalCells);
    const workerCells = allCells.slice(start, end).map((cell, idx) => ({
      ...cell,
      cellIndex: start + idx
    }));

    return new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        const { workerId, results, error } = e.data;

        if (error) {
          reject(new Error(error));
          return;
        }

        // Fill grids with results
        for (const { i, j, value, cellIndex } of results) {
          const cellData = cellIndex !== undefined ? allCells[cellIndex] : null;
          if (cellData) {
            const { t } = cellData;
            frames[t].grid[j * nx + i] = Number.isFinite(value) ? value : NaN;
          }
        }

        // Update progress
        completed += results.length;

        resolve(results.length);
      };

      worker.onerror = (err) => {
        reject(new Error(`Worker ${workerIdx} error: ${err.message}`));
      };

      // Send work to worker
      worker.postMessage({
        workerId: workerIdx,
        cells: workerCells,
        metric,
        tailPct
      });
    });
  });

  // Track progress
  let completed = 0;
  const updateInterval = setInterval(() => {
    const progress = Math.floor((completed / totalCells) * 100);
    status.textContent = `3D空間シミュレーション実行中... ${progress}% (${numWorkers} workers)`;
  }, 100);

  try {
    await Promise.all(promises);
    clearInterval(updateInterval);
    status.textContent = `並列計算完了 (${completed}/${totalCells} cells)`;
  } catch (error) {
    clearInterval(updateInterval);
    status.textContent = `Error: ${error.message}`;
    console.error('Parallel execution failed:', error);
  } finally {
    workers.forEach(w => w.terminate());
  }
}

// Generate video from 3D grid data
async function generateVideoFrom3DGrid(frames, nx, ny, xMin, xMax, yMin, yMax,
  xLabel, yLabel, tLabel, tMin, tMax, metric, videoDuration) {

  // Compute global data range across all frames
  let globalMin = +Infinity, globalMax = -Infinity;
  for (const { grid } of frames) {
    for (const v of grid) {
      if (!Number.isFinite(v)) continue;
      if (v < globalMin) globalMin = v;
      if (v > globalMax) globalMax = v;
    }
  }
  if (!Number.isFinite(globalMin) || !Number.isFinite(globalMax) || globalMax === globalMin) {
    globalMin = 0; globalMax = 1;
  }

  // Setup MediaRecorder
  const targetFPS = 30;
  const stream = cv.captureStream(targetFPS);
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 5000000
  });

  const chunks = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    videoPlayer.src = url;
    videoPlayer.style.display = 'block';
    cv.style.display = 'none';
    status.textContent = `動画生成完了 (${frames.length} フレーム, ${videoDuration}秒)`;
  };

  mediaRecorder.start();

  // Calculate frame duration in milliseconds
  const frameDuration = (videoDuration * 1000) / frames.length;

  // Determine metric unit
  const metricUnit = metric === 'period' ? '[min]' : (metric === 'amplitude' ? '[nM]' : '');

  // Render each frame
  for (let i = 0; i < frames.length; i++) {
    const { grid, tVal } = frames[i];

    drawHeatmapFrame(grid, nx, ny, xMin, xMax, yMin, yMax, xLabel, yLabel,
      globalMin, globalMax, metricUnit, tLabel, tMin, tMax, tVal, i, frames.length);

    status.textContent = `動画エンコード中... ${i + 1}/${frames.length}`;
    await new Promise(r => setTimeout(r, frameDuration));
  }

  mediaRecorder.stop();
}

// Draw a single heatmap frame (for animation)
function drawHeatmapFrame(grid, nx, ny, xMin, xMax, yMin, yMax, xLabel, yLabel,
  dmin, dmax, metricUnit, tLabel, tMin, tMax, tVal, frameIdx, totalFrames) {
  const W = cv.width, H = cv.height;
  const L = 80, R = 120, T = 80, B = 70; // Increased top margin for timeline

  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  const xOf = (v) => L + ((v - xMin) / (xMax - xMin || 1)) * (W - L - R);
  const yOf = (v) => H - B - ((v - yMin) / (yMax - yMin || 1)) * (H - T - B);

  // Draw cells
  for (let j = 0; j < ny; j++) {
    const y0 = yOf(yMin + (yMax - yMin) * (j / (ny - 1)));
    const y1 = yOf(yMin + (yMax - yMin) * ((j + 1) / (ny - 1)));
    const h = y1 - y0;
    for (let i = 0; i < nx; i++) {
      const x0 = xOf(xMin + (xMax - xMin) * (i / (nx - 1)));
      const x1 = xOf(xMin + (xMax - xMin) * ((i + 1) / (nx - 1)));
      const w = x1 - x0;
      const v = grid[j * nx + i];
      if (Number.isFinite(v)) {
        const t = (v - dmin) / (dmax - dmin || 1);
        const [r, g, b] = turbo(t);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
      } else {
        ctx.fillStyle = '#cbd5e1';
      }
      ctx.fillRect(x0, Math.min(y0, y1), w, Math.abs(h));
    }
  }

  // Border
  ctx.strokeStyle = '#e5e7eb';
  ctx.strokeRect(L, T, W - L - R, H - T - B);

  // Legend (color bar)
  const lgX = W - R + 40, lgY = T + 10, lgW = 16, lgH = H - T - B - 40;
  for (let y = 0; y < lgH; y++) {
    const t = 1 - y / (lgH - 1);
    const [r, g, b] = turbo(t);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(lgX, lgY + y, lgW, 1);
  }
  ctx.strokeStyle = '#334155';
  ctx.strokeRect(lgX, lgY, lgW, lgH);

  // Legend labels (numbers and units only)
  ctx.fillStyle = '#0f172a';
  ctx.font = '12px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(roundSmart(dmax) + ' ' + metricUnit, lgX + lgW + 6, lgY);
  ctx.textBaseline = 'bottom';
  ctx.fillText(roundSmart(dmin) + ' ' + metricUnit, lgX + lgW + 6, lgY + lgH);

  // T-axis timeline at top
  const timelineY = 30;
  const timelineLeft = L + 60;
  const timelineRight = W - R - 60;
  const timelineWidth = timelineRight - timelineLeft;

  // Timeline background line
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(timelineLeft, timelineY);
  ctx.lineTo(timelineRight, timelineY);
  ctx.stroke();

  // Timeline ticks and labels
  ctx.fillStyle = '#64748b';
  ctx.font = '11px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  // Start tick
  ctx.beginPath();
  ctx.moveTo(timelineLeft, timelineY - 4);
  ctx.lineTo(timelineLeft, timelineY + 4);
  ctx.stroke();
  ctx.fillText(roundSmart(tMin), timelineLeft, timelineY - 6);

  // End tick
  ctx.beginPath();
  ctx.moveTo(timelineRight, timelineY - 4);
  ctx.lineTo(timelineRight, timelineY + 4);
  ctx.stroke();
  ctx.fillText(roundSmart(tMax), timelineRight, timelineY - 6);

  // Current position marker (triangle pointing down)
  const tProgress = (tVal - tMin) / (tMax - tMin || 1);
  const markerX = timelineLeft + tProgress * timelineWidth;

  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(markerX, timelineY + 10);
  ctx.lineTo(markerX - 6, timelineY + 2);
  ctx.lineTo(markerX + 6, timelineY + 2);
  ctx.closePath();
  ctx.fill();

  // Current value label
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 12px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`${tLabel} = ${roundSmart(tVal)}`, markerX, timelineY + 12);

  // Timeline label
  ctx.fillStyle = '#64748b';
  ctx.font = '11px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(tLabel, timelineLeft - 50, timelineY);

  // X-axis label
  ctx.fillStyle = '#111827';
  ctx.font = '13px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(xLabel, L + (W - L - R) / 2, H - 8);

  // Y-axis label
  ctx.save();
  ctx.translate(16, T + (H - T - B) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();

  // X-axis tick marks
  const xTicks = niceAxis(xMin, xMax, 6);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#64748b';
  ctx.font = '11px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const xv of xTicks.ticks) {
    const x = xOf(xv);
    ctx.beginPath();
    ctx.moveTo(x, H - B);
    ctx.lineTo(x, H - B + 5);
    ctx.stroke();
    ctx.fillText(xv.toFixed(xTicks.decimals), x, H - B + 7);
  }

  // Y-axis tick marks
  const yTicks = niceAxis(yMin, yMax, 6);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const yv of yTicks.ticks) {
    const y = yOf(yv);
    ctx.beginPath();
    ctx.moveTo(L - 5, y);
    ctx.lineTo(L, y);
    ctx.stroke();
    ctx.fillText(yv.toFixed(yTicks.decimals), L - 7, y);
  }
}

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

  // Load all heatmap and simulation parameters
  const allKeys = [
    'xParam','xMin','xMax','xSteps',
    'yParam','yMin','yMax','ySteps',
    'metric','t_end','dt','tail',
    'pol','rec','G','k1','k2','kN','kP','b','KmP','N0','P0'
  ];
  allKeys.forEach((key) => {
    if (params.has(key)) {
      const val = params.get(key);
      if (val !== null) setVal(key, val);
    }
  });

  // Load T-axis parameters if enabled
  if (params.get('enableTimeAxis') === 'true') {
    el.enableTimeAxis.checked = true;
    el.tParam.disabled = false;
    el.tMin.disabled = false;
    el.tMax.disabled = false;
    el.tSteps.disabled = false;
    el.videoDuration.disabled = false;

    if (params.has('tParam')) setVal('tParam', params.get('tParam'));
    if (params.has('tMin')) setVal('tMin', params.get('tMin'));
    if (params.has('tMax')) setVal('tMax', params.get('tMax'));
    if (params.has('tSteps')) setVal('tSteps', params.get('tSteps'));
    if (params.has('videoDuration')) setVal('videoDuration', params.get('videoDuration'));
  }

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
  updateParameterAvailability();
});

// Parameter grayout logic: disable base parameter fields when they are used as axes
function updateParameterAvailability(){
  const xParam = el.xParam.value;
  const yParam = el.yParam.value;
  const axisParams = new Set([xParam, yParam]);

  // Map axis parameter names to form field IDs
  const paramMap = {
    'pol': 'pol',
    'rec': 'rec',
    'G': 'G',
    'k1': 'k1',
    'KmP': 'KmP',
    'N0': 'N0',
    'P0': 'P0',
    // assoc_ddg and assoc_r affect k1 and b, so disable both
    'assoc_ddg': ['k1', 'b'],
    'assoc_r': ['k1', 'b'],
    // poly_r affects k1 only
    'poly_r': 'k1',
    // nick_r affects k1 and b
    'nick_r': ['k1', 'b'],
  };

  // Reset all base parameters to enabled
  ['pol', 'rec', 'G', 'k1', 'k2', 'kN', 'kP', 'b', 'KmP', 'N0', 'P0'].forEach(id => {
    const field = document.getElementById(id);
    if (field) field.disabled = false;
  });

  // Disable fields that are used as axes
  axisParams.forEach(param => {
    const fieldIds = paramMap[param];
    if (Array.isArray(fieldIds)) {
      fieldIds.forEach(id => {
        const field = document.getElementById(id);
        if (field) field.disabled = true;
      });
    } else if (fieldIds) {
      const field = document.getElementById(fieldIds);
      if (field) field.disabled = true;
    }
  });
}

el.xParam.addEventListener('change', updateParameterAvailability);
el.yParam.addEventListener('change', updateParameterAvailability);

// T-axis (3rd axis) checkbox handler
el.enableTimeAxis.addEventListener('change', () => {
  const enabled = el.enableTimeAxis.checked;
  el.tParam.disabled = !enabled;
  el.tMin.disabled = !enabled;
  el.tMax.disabled = !enabled;
  el.tSteps.disabled = !enabled;
  el.videoDuration.disabled = !enabled;
});

// Share button handler
shareBtn.addEventListener('click', async () => {
  const params = new URLSearchParams();

  // Heatmap parameters
  params.set('xParam', el.xParam.value);
  params.set('xMin', el.xMin.value);
  params.set('xMax', el.xMax.value);
  params.set('xSteps', el.xSteps.value);

  params.set('yParam', el.yParam.value);
  params.set('yMin', el.yMin.value);
  params.set('yMax', el.yMax.value);
  params.set('ySteps', el.ySteps.value);

  params.set('metric', el.metric.value);
  params.set('tail', el.tail.value);
  params.set('t_end', el.t_end.value);
  params.set('dt', el.dt.value);

  // T-axis parameters (if enabled)
  if (el.enableTimeAxis.checked) {
    params.set('enableTimeAxis', 'true');
    params.set('tParam', el.tParam.value);
    params.set('tMin', el.tMin.value);
    params.set('tMax', el.tMax.value);
    params.set('tSteps', el.tSteps.value);
    params.set('videoDuration', el.videoDuration.value);
  }

  // Base parameters
  params.set('pol', el.pol.value);
  params.set('rec', el.rec.value);
  params.set('G', el.G.value);
  params.set('k1', el.k1.value);
  params.set('k2', el.k2.value);
  params.set('kN', el.kN.value);
  params.set('kP', el.kP.value);
  params.set('b', el.b.value);
  params.set('KmP', el.KmP.value);
  params.set('N0', el.N0.value);
  params.set('P0', el.P0.value);

  // Generate URL
  const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;

  // Copy to clipboard
  try {
    await navigator.clipboard.writeText(url);
    const originalText = shareBtn.textContent;
    shareBtn.textContent = '✓ URLをコピーしました！';
    shareBtn.style.background = '#22c55e';
    setTimeout(() => {
      shareBtn.textContent = originalText;
      shareBtn.style.background = '';
    }, 2000);
  } catch (err) {
    alert('URLのコピーに失敗しました: ' + url);
    console.error('Failed to copy:', err);
  }
});

initDefaults();
applyPresetValue(presetSel.value);
applyQueryParams();
updateParameterAvailability();
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

  // Metric display label with units
  const metricUnit = metric === 'period' ? ' [min]' : (metric === 'amplitude' ? ' [nM]' : '');
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

  // Color bar value labels with units
  ctx.fillStyle = '#0f172a';
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(roundSmart(dmax) + metricUnit, lgX + lgW + 6, lgY);
  ctx.textBaseline = 'bottom';
  ctx.fillText(roundSmart(dmin) + metricUnit, lgX + lgW + 6, lgY + lgH);

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
// Official Google AI implementation by Anton Mikhailov
// https://gist.github.com/mikhailov-work/ee72ba4191942acecc03fe6da94fc73f
function turbo(t){
  t = Math.max(0, Math.min(1, t));
  const r = 34.61 + t * (1172.33 - t * (10793.56 - t * (33300.12 - t * (38394.49 - t * 14825.05))));
  const g = 23.31 + t * (557.33 + t * (1225.33 - t * (3574.96 - t * (1073.77 + t * 707.56))));
  const b = 27.2 + t * (3211.1 - t * (15327.97 - t * (27814 - t * (22569.18 - t * 6838.66))));
  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b))),
  ];
}
