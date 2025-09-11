import { initWasm, runSimulationPhysical } from "../core.js";

const cvTS = document.getElementById('cv_ts');
const cvPH = document.getElementById('cv_phase');
const ctxTS = cvTS.getContext('2d', { alpha: false });
const ctxPH = cvPH.getContext('2d', { alpha: false });
const status = byId('status');
const busy = byId('busy');
const resetBtn = byId('resetBtn');

const s = bindSliders([
  'pol','rec','G','k1','k2','kN','kP','b','KmP','N0','P0','mod','t_end','dt'
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
  mod: 1.0,
  t_end: 2000,
  dt: 0.5,
};

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
function drawTimeSeries(N, P){
  const W = cvTS.width, H = cvTS.height;
  const L = 70, R = 30, T = 50, B = 60;
  const n = N.length;

  ctxTS.save();
  ctxTS.fillStyle = '#fff';
  ctxTS.fillRect(0,0,W,H);
  ctxTS.restore();

  const dataYmin = Math.min(...N, ...P);
  const dataYmax = Math.max(...N, ...P);
  const yPad = 0.05 * (dataYmax - dataYmin || 1);
  const yTicks  = niceAxis(dataYmin - yPad, dataYmax + yPad, 6);
  const xTicks  = niceAxis(0, n-1, 7);

  const xOf = (i) => L + ((i - 0)/(xTicks.max - 0)) * (W - L - R);
  const yOf = (v) => H - B - ((v - yTicks.min)/(yTicks.max - yTicks.min)) * (H - T - B);

  // Grid
  ctxTS.strokeStyle = '#eef2f7';
  ctxTS.lineWidth = 1;
  ctxTS.beginPath();
  for (const xv of xTicks.ticks){ const x = xOf(xv); ctxTS.moveTo(x,T); ctxTS.lineTo(x,H-B);}
  for (const yv of yTicks.ticks){ const y = yOf(yv); ctxTS.moveTo(L,y); ctxTS.lineTo(W-R,y);} 
  ctxTS.stroke();

  // Border
  ctxTS.strokeStyle = '#e5e7eb';
  ctxTS.strokeRect(L, T, W - L - R, H - T - B);

  // Lines
  ctxTS.lineWidth = 2;
  ctxTS.beginPath();
  for (let i=0;i<n;i++){ const x = xOf(i); const y = yOf(N[i]); (i?ctxTS.lineTo(x,y):ctxTS.moveTo(x,y)); }
  ctxTS.strokeStyle = '#f28c28';
  ctxTS.stroke();

  ctxTS.beginPath();
  for (let i=0;i<n;i++){ const x = xOf(i); const y = yOf(P[i]); (i?ctxTS.lineTo(x,y):ctxTS.moveTo(x,y)); }
  ctxTS.strokeStyle = '#2c7a7b';
  ctxTS.stroke();

  // Labels
  ctxTS.fillStyle = '#0f172a';
  ctxTS.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxTS.textAlign = 'center'; ctxTS.textBaseline = 'top';
  for (const xv of xTicks.ticks){ const x = xOf(xv); ctxTS.fillText(String(Math.round(xv)), x, H - B + 6); }
  ctxTS.textAlign = 'right'; ctxTS.textBaseline = 'middle';
  for (const yv of yTicks.ticks){
    const absRange = Math.abs(yTicks.max - yTicks.min);
    const digits = absRange >= 100 ? 0 : (absRange >= 10 ? 1 : 2);
    ctxTS.fillText(yv.toFixed(digits), L - 8, yOf(yv));
  }
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
  ctxTS.fillText('Time Series (N, P)', L + (W - L - R)/2, 12);
}

function drawPhase(N, P){
  const W = cvPH.width, H = cvPH.height;
  const L = 70, R = 30, T = 50, B = 60;
  const n = N.length;

  ctxPH.save(); ctxPH.fillStyle = '#fff'; ctxPH.fillRect(0,0,W,H); ctxPH.restore();

  const xMin = Math.min(...N), xMax = Math.max(...N);
  const yMin = Math.min(...P), yMax = Math.max(...P);
  const xPad = 0.05 * (xMax - xMin || 1); const yPad = 0.05 * (yMax - yMin || 1);
  const xTicks = niceAxis(xMin - xPad, xMax + xPad, 6);
  const yTicks = niceAxis(yMin - yPad, yMax + yPad, 6);

  const xOf = (v) => L + ((v - xTicks.min)/(xTicks.max - xTicks.min)) * (W - L - R);
  const yOf = (v) => H - B - ((v - yTicks.min)/(yTicks.max - yTicks.min)) * (H - T - B);

  ctxPH.strokeStyle = '#eef2f7'; ctxPH.lineWidth = 1; ctxPH.beginPath();
  for (const xv of xTicks.ticks){ const x = xOf(xv); ctxPH.moveTo(x,T); ctxPH.lineTo(x,H-B);} 
  for (const yv of yTicks.ticks){ const y = yOf(yv); ctxPH.moveTo(L,y); ctxPH.lineTo(W-R,y);} 
  ctxPH.stroke();

  ctxPH.strokeStyle = '#e5e7eb';
  ctxPH.strokeRect(L, T, W - L - R, H - T - B);

  // Trajectory N(t),P(t)
  ctxPH.lineWidth = 2; ctxPH.beginPath();
  for (let i=0;i<n;i++){ const x = xOf(N[i]); const y = yOf(P[i]); (i?ctxPH.lineTo(x,y):ctxPH.moveTo(x,y)); }
  ctxPH.strokeStyle = '#334155'; ctxPH.stroke();

  // Labels
  ctxPH.fillStyle = '#0f172a';
  ctxPH.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxPH.textAlign = 'center'; ctxPH.textBaseline = 'top';
  for (const xv of xTicks.ticks){ const x = xOf(xv); ctxPH.fillText(String(roundSmart(xv)), x, H - B + 6); }
  ctxPH.textAlign = 'right'; ctxPH.textBaseline = 'middle';
  for (const yv of yTicks.ticks){ ctxPH.fillText(String(roundSmart(yv)), L - 8, yOf(yv)); }

  ctxPH.fillStyle = '#111827';
  ctxPH.textAlign = 'center'; ctxPH.textBaseline = 'bottom';
  ctxPH.font = '13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxPH.fillText('N [nM]', L + (W - L - R)/2, H - 8);
  ctxPH.save();
  ctxPH.translate(16, T + (H - T - B)/2); ctxPH.rotate(-Math.PI/2);
  ctxPH.textAlign = 'center'; ctxPH.textBaseline = 'top';
  ctxPH.fillText('P [nM]', 0, 0);
  ctxPH.restore();
  ctxPH.textAlign = 'center'; ctxPH.textBaseline = 'top';
  ctxPH.font = '16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctxPH.fillText('Phase Portrait (N vs P)', L + (W - L - R)/2, 12);
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
    N0: gNum('N0'), P0: gNum('P0'), mod_factor: gNum('mod'),
    t_end_min: gNum('t_end'), dt_min: gNum('dt')
  };
}

function setBusy(vis){ busy.style.display = vis ? 'inline-flex' : 'none'; }

async function animate(){
  if (needUpdate) {
    needUpdate = false; setBusy(true);
    const t0 = performance.now();
    const params = getVals();
    const { N, P } = runSimulationPhysical(params);
    drawTimeSeries(N, P);
    drawPhase(N, P);
    const t1 = performance.now();
    status.textContent = `calc+draw: ${(t1 - t0).toFixed(1)} ms | points: ${N.length}`;
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
