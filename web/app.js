import init, { simulate } from "./pkg/pp_osc_wasm.js";

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d', { alpha: false });

const s = {
  beta:   byId("beta"),   beta_n:   byId("beta_n"),
  delta:  byId("delta"),  delta_n:  byId("delta_n"),
  lam:    byId("lam"),    lam_n:    byId("lam_n"),
  N:      byId("N"),      N_n:      byId("N_n"),
  P:      byId("P"),      P_n:      byId("P_n"),
  G:      byId("G"),      G_n:      byId("G_n")
};
const status = byId("status");
const busy = byId("busy");

for (const key of ["beta","delta","lam","N","P","G"]) {
  const r = s[key], n = s[key + "_n"];
  r.addEventListener("input", () => { n.value = r.value; requestUpdate(); });
  n.addEventListener("input", () => { r.value = n.value; requestUpdate(); });
}

function byId(id){ return document.getElementById(id); }

let needUpdate = true;
let wasmReady = false;

function requestUpdate(){ needUpdate = true; }

function getVals() {
  return {
    beta: parseFloat(s.beta.value),
    delta: parseFloat(s.delta.value),
    lam: parseFloat(s.lam.value),
    N: parseFloat(s.N.value),
    P: parseFloat(s.P.value),
    G: parseFloat(s.G.value)
  };
}

function draw(prey, pred) {
  const W = cv.width, H = cv.height;
  ctx.clearRect(0,0,W,H);

  const n = prey.length;
  const maxY = Math.max(...prey, ...pred);
  const minY = Math.min(...prey, ...pred);
  const pad = 0.05 * (maxY - minY || 1);
  const y0 = minY - pad, y1 = maxY + pad;

  const xOf = i => (i/(n-1))*(W-60) + 30;
  const yOf = v => H - ((v - y0)/(y1 - y0))*(H-60) - 30;

  // axis (軽量)
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W-1, H-1);

  // prey
  ctx.beginPath(); ctx.lineWidth = 2;
  for (let i=0;i<n;i++){ const x=xOf(i), y=yOf(prey[i]); (i?ctx.lineTo(x,y):ctx.moveTo(x,y)); }
  ctx.strokeStyle = "#f28c28"; ctx.stroke();

  // predator
  ctx.beginPath(); ctx.lineWidth = 2;
  for (let i=0;i<n;i++){ const x=xOf(i), y=yOf(pred[i]); (i?ctx.lineTo(x,y):ctx.moveTo(x,y)); }
  ctx.strokeStyle = "#2c7a7b"; ctx.stroke();
}

function setBusy(vis){ busy.style.display = vis ? "inline-flex" : "none"; }

function animate(){
  if (wasmReady && needUpdate) {
    needUpdate = false;
    setBusy(true);
    const t0 = performance.now();

    const v = getVals();
    // Rustから [prey..., pred...] の Float32Array が来る
    const arr = simulate(v.beta, v.delta, v.lam, v.N, v.P, v.G);
    const n = (arr.length/2)|0;
    const prey = arr.slice(0, n);
    const pred = arr.slice(n);

    draw(prey, pred);
    const t1 = performance.now();
    status.textContent = `calc+draw: ${(t1 - t0).toFixed(1)} ms`;
    setBusy(false);
  }
  requestAnimationFrame(animate);
}

await init(); // pkg/pp_osc_wasm_bg.wasm をロード
wasmReady = true;
requestUpdate();
animate();
