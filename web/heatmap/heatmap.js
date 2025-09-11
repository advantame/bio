import { initWasm, runSimulationPhysical } from "../core.js";

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d', { alpha:false });
const status = document.getElementById('status');
const runBtn = document.getElementById('runBtn');

const ids = [
  'xParam','xMin','xMax','xSteps',
  'yParam','yMin','yMax','ySteps',
  'metric','t_end','dt','tail',
  'pol','rec','G','k1','k2','kN','kP','b','KmP','N0','P0','mod_factor'
];
const el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
const presetSel = document.getElementById('preset');
const applyPresetBtn = document.getElementById('applyPreset');
const presetDesc = document.getElementById('presetDesc');

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
    mod_factor: num('mod_factor'),
    t_end_min: num('t_end'),
    dt_min: num('dt'),
  };
}

runBtn.addEventListener('click', async () => {
  runBtn.disabled = true;
  status.textContent = 'Running grid...';
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
  const metric = el.metric.value; // 'amplitude' | 'period'
  const tailPct = Math.min(100, Math.max(1, Math.floor(num('tail'))));

  const grid = new Float32Array(nx * ny).fill(NaN);
  const bp = baseParams();

  for (let j=0;j<ny;j++){
    const yVal = yMin + (yMax - yMin) * (j / (ny - 1));
    for (let i=0;i<nx;i++){
      const xVal = xMin + (xMax - xMin) * (i / (nx - 1));
      const params = { ...bp, [xParam]: xVal, [yParam]: yVal };
      const { P } = runSimulationPhysical(params);
      const tail = Math.max(3, Math.floor(P.length * (tailPct/100)));
      const start = P.length - tail;
      let val = NaN;
      if (metric === 'amplitude'){
        let pmin = +Infinity, pmax = -Infinity;
        for (let k=start;k<P.length;k++){ const v=P[k]; if(v<pmin) pmin=v; if(v>pmax) pmax=v; }
        val = pmax - pmin;
      } else if (metric === 'period') {
        const peaks = [];
        // simple peak detection
        for (let k=start+1;k<P.length-1;k++){
          const a=P[k-1], b=P[k], c=P[k+1];
          if (b>a && b>c) peaks.push(k);
        }
        if (peaks.length >= 2){
          let sum = 0;
          for (let m=1;m<peaks.length;m++) sum += (peaks[m] - peaks[m-1]);
          const meanStep = sum / (peaks.length - 1);
          val = meanStep * bp.dt_min; // minutes
        }
      }
      grid[j*nx + i] = isFinite(val) ? val : NaN;
    }
    if ((j%2)===0) {
      status.textContent = `Running grid... ${j+1}/${ny}`;
      await new Promise(r => setTimeout(r));
    }
  }

  drawHeatmap(grid, nx, ny, xMin, xMax, yMin, yMax, xParam, yParam, metric);
  status.textContent = `Done. grid=${nx}x${ny}`;
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
  setVal('mod_factor', 1.0);

  // Reasonable simulation window
  setVal('t_end', 3000);
  setVal('dt', 0.5);
  setVal('tail', 60);

  // Default grid (G vs k1)
  setVal('xParam', 'G'); setVal('xMin', 80); setVal('xMax', 250); setVal('xSteps', 20);
  setVal('yParam', 'mod_factor'); setVal('yMin', 0.4); setVal('yMax', 1.0); setVal('ySteps', 15);
  setVal('metric', 'period');
}

applyPresetBtn.addEventListener('click', () => {
  const v = presetSel.value;
  if (v === 'mod') {
    // アミノ酸修飾の影響（周期）
    initDefaults();
    presetDesc.innerHTML = 'アミノ酸修飾（mod\_factor）と鋳型濃度 G の関係で、周期（Pピーク間平均）の変化を可視化します。';
  } else if (v === 'balance') {
    // 酵素バランスと安定性（振幅）
    // Base
    setVal('pol', 3.7); setVal('k1', 0.0020);
    setVal('rec', 32.5); setVal('G', 150);
    setVal('k2', 0.0031); setVal('kN', 0.0210); setVal('kP', 0.0047); setVal('b', 0.000048);
    setVal('KmP', 34); setVal('N0', 10); setVal('P0', 10); setVal('mod_factor', 1.0);
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

initDefaults();

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
