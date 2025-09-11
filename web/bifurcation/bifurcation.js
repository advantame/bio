import { initWasm, runSimulationPhysical } from "../core.js";

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d', { alpha:false });
const status = document.getElementById('status');
const runBtn = document.getElementById('runBtn');

const ids = [
  'param','pmin','pmax','steps','t_end','dt','tail',
  'pol','rec','G','k1','k2','kN','kP','b','KmP','N0','P0','mod_factor'
];
const el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
const presetSel = document.getElementById('preset');
const applyPresetBtn = document.getElementById('applyPreset');
const presetDesc = document.getElementById('presetDesc');

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
    mod_factor: valNum('mod_factor'),
    t_end_min: valNum('t_end'),
    dt_min: valNum('dt'),
  };
}

runBtn.addEventListener('click', async () => {
  runBtn.disabled = true;
  status.textContent = 'Running sweep...';
  await initWasm();

  const pname = el.param.value; // swept parameter
  const pmin = valNum('pmin');
  const pmax = valNum('pmax');
  const steps = Math.max(1, Math.floor(valNum('steps')));
  const tailPct = Math.min(100, Math.max(1, Math.floor(valNum('tail'))));

  const xs = [];
  const yMin = [];
  const yMax = [];

  const bp = baseParams();
  const nSteps = steps;
  for (let i=0; i<nSteps; i++){
    const t0 = performance.now();
    const x = pmin + (pmax - pmin) * (i / (nSteps - 1 || 1));
    const params = { ...bp, [pname]: x };
    const { P } = runSimulationPhysical(params);
    const tail = Math.max(1, Math.floor(P.length * (tailPct/100)));
    let pminTail = +Infinity, pmaxTail = -Infinity;
    for (let j=P.length - tail; j<P.length; j++){
      const v = P[j];
      if (v < pminTail) pminTail = v;
      if (v > pmaxTail) pmaxTail = v;
    }
    xs.push(x);
    yMin.push(pminTail);
    yMax.push(pmaxTail);
    const t1 = performance.now();
    if ((i%5)===0) status.textContent = `Running sweep... ${i+1}/${nSteps} | last ${(t1-t0).toFixed(1)} ms`;
    await new Promise(r => setTimeout(r)); // yield UI
  }

  drawBifurcation(xs, yMin, yMax, pname);
  status.textContent = `Done. points=${xs.length}`;
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

function drawBifurcation(xs, yMin, yMax, pname){
  const W = cv.width, H = cv.height;
  const L = 70, R = 30, T = 50, B = 60;
  ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,W,H); ctx.restore();

  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yAll = yMin.concat(yMax);
  const yMinV = Math.min(...yAll), yMaxV = Math.max(...yAll);
  const xPadding = 0.02*(xMax - xMin || 1);
  const yPadding = 0.05*(yMaxV - yMinV || 1);
  const xTicks = niceAxis(xMin - xPadding, xMax + xPadding, 6);
  const yTicks = niceAxis(yMinV - yPadding, yMaxV + yPadding, 6);

  const xOf = (v) => L + ((v - xTicks.min)/(xTicks.max - xTicks.min)) * (W - L - R);
  const yOf = (v) => H - B - ((v - yTicks.min)/(yTicks.max - yTicks.min)) * (H - T - B);

  // Grid
  ctx.strokeStyle = '#eef2f7'; ctx.lineWidth = 1; ctx.beginPath();
  for (const xv of xTicks.ticks){ const x = xOf(xv); ctx.moveTo(x,T); ctx.lineTo(x,H-B);} 
  for (const yv of yTicks.ticks){ const y = yOf(yv); ctx.moveTo(L,y); ctx.lineTo(W-R,y);} 
  ctx.stroke();
  ctx.strokeStyle = '#e5e7eb'; ctx.strokeRect(L, T, W - L - R, H - T - B);

  // Points: maxima and minima
  ctx.fillStyle = '#1d4ed8';
  for (let i=0;i<xs.length;i++){ const x = xOf(xs[i]); const y = yOf(yMax[i]); dot(ctx, x, y, 2); }
  ctx.fillStyle = '#ef4444';
  for (let i=0;i<xs.length;i++){ const x = xOf(xs[i]); const y = yOf(yMin[i]); dot(ctx, x, y, 2); }

  // Axes labels
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
