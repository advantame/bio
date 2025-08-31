/**
 * PP-oscillation (Rust + WASM + Canvas)
 *
 * ▼ この版の「計算仕様」と Python 版との差分の注釈
 *  1) 積分器
 *     - 本実装：Rust 側で「固定刻み RK4」。時刻は τ=t/2.6、等間隔（Δτ=1/2.6）で 0..2600 の 2601 点を積分。
 *     - Python (SciPyなし) 版：同じく固定刻み RK4（実質同等）。差は float 型と誤差桁（こちらは Rust→JS 受け渡しで f32）。
 *     - Python (SciPy版)：solve_ivp(LSODA) による「可変刻み・自動剛性」統合。局所誤差制御が効くため
 *       剛性点や急峻変化に対してより安定＆高精度になり得る一方、PyScript版や本WASM版より
 *       ランタイムや初回ロードが重くなることがある。
 *
 *  2) 浮動小数点精度
 *     - Rust 側内部は f64 で積分 → 返却時に f32 バッファへ詰め替え（JS 側への転送量削減のため）。
 *       これによりプロット上の差異は通常 1e-5〜1e-4 程度（nMスケールでは視認不可）に収まる設計。
 *     - Python/NumPy 版：デフォルト float64（f64）で完結。
 *
 *  3) 物理量・スケール
 *     - ODE は n, p（無次元）。初期条件は N₀/Kmp, P₀/Kmp（Kmp=34）、g=G/53。
 *     - 表示変換は MATLAB と合わせて Prey = 400 - n*Kmp、Predator = p*Kmp。
 *     - 横軸は τ=t/2.6 を使うが、ラベル表記は minutes（t）で行う。
 *
 *  4) 描画パイプライン
 *     - 本実装：WASM で数値計算 → JS Canvas で「直接ライン描画」。
 *       PNG生成やDOM画像差し替えをしないため、スライダー操作時の再描画は数ms〜十数msに収まりやすい。
 *     - PyScript 版：Matplotlib で PNG 化 → <img> 差し替え。手軽だがコストが高く、連続操作で重くなりやすい。
 *
 *  5) UI 応答
 *     - スライダーイベントは requestAnimationFrame ループ内で「最新値のみ」処理（イベント嵐を合流）。
 *     - 目盛は「ナイススケール」関数で動的に計算。X軸は minutes（0..2600）で表記。
 */

import init, { simulate } from "./pkg/pp_osc_wasm.js";

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d', { alpha: false }); // 背景黒化を防ぐ
const status = byId("status");
const busy = byId("busy");
const resetBtn = byId("resetBtn");

const s = {
  beta: byId("beta"),   beta_n: byId("beta_n"),
  delta:byId("delta"),  delta_n:byId("delta_n"),
  lam:  byId("lam"),    lam_n:  byId("lam_n"),
  N:    byId("N"),      N_n:    byId("N_n"),
  P:    byId("P"),      P_n:    byId("P_n"),
  G:    byId("G"),      G_n:    byId("G_n"),
};

const DEFAULTS = { beta:0.087, delta:0.39, lam:4.5, N:10, P:10, G:160 };

// スライダー双方向連動
for (const key of ["beta","delta","lam","N","P","G"]) {
  const r = s[key], n = s[key + "_n"];
  r.addEventListener("input", () => { n.value = r.value; requestUpdate(); });
  n.addEventListener("input", () => { r.value = n.value; requestUpdate(); });
}
resetBtn.addEventListener("click", () => {
  for (const k of Object.keys(DEFAULTS)) {
    s[k].value = DEFAULTS[k];
    s[k + "_n"].value = DEFAULTS[k];
  }
  requestUpdate();
});

// 必要ならDPR対応の内部解像度調整も可能（コメントアウト解除）
/*
function resizeCanvas() {
  const rect = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(800, Math.floor(rect.width * dpr));
  cv.height = Math.floor(520 * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  requestUpdate();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
*/

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

/* ---------- 目盛生成（ナイススケール） ---------- */
function niceNum(range, round) {
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
function niceAxis(min, max, maxTicks=6) {
  const range = niceNum(max - min || 1, false);
  const step  = niceNum(range / (maxTicks - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil (max / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + 0.5*step; v += step) ticks.push(v);
  return {min: niceMin, max: niceMax, step, ticks};
}

/* ---------- 描画 ---------- */
function draw(prey, pred) {
  const W = cv.width, H = cv.height;

  // 背景
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0,0,W,H);
  ctx.restore();

  // 余白（title/labels/ticks用）
  const L = 70, R = 30, T = 50, B = 60;

  // データ範囲（yはデータから、xは minutes=0..2600 固定）
  const n = prey.length;
  const dataYmin = Math.min(...prey, ...pred);
  const dataYmax = Math.max(...prey, ...pred);
  const yPad = 0.05 * (dataYmax - dataYmin || 1);
  const yMin = dataYmin - yPad, yMax = dataYmax + yPad;

  // 軸スケール
  const xMinMin = 0, xMaxMin = 2600; // minutes
  const xTicks  = niceAxis(xMinMin, xMaxMin, 7); // だいたい 0, 500, ... を狙う
  const yTicks  = niceAxis(yMin, yMax, 6);

  // 座標変換
  const xOfMin = (m) => L + ((m - xMinMin)/(xTicks.max - xMinMin)) * (W - L - R);
  const yOf    = (v) => H - B - ((v - yTicks.min)/(yTicks.max - yTicks.min)) * (H - T - B);

  // グリッド
  ctx.strokeStyle = "#eef2f7";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const xv of xTicks.ticks) {
    const x = xOfMin(xv);
    ctx.moveTo(x, T);
    ctx.lineTo(x, H - B);
  }
  for (const yv of yTicks.ticks) {
    const y = yOf(yv);
    ctx.moveTo(L, y);
    ctx.lineTo(W - R, y);
  }
  ctx.stroke();

  // 外枠
  ctx.strokeStyle = "#e5e7eb";
  ctx.strokeRect(L, T, W - L - R, H - T - B);

  // データ線
  // Xは等間隔：インデックス→minutes に写像してから xOfMin で座標化
  ctx.lineWidth = 2;

  // Prey
  ctx.beginPath();
  for (let i=0;i<n;i++){
    const minutes = i; // サンプル数は t=0..2600 と一致（τ=t/2.6だが表示は minutes）
    const x = xOfMin(minutes);
    const y = yOf(prey[i]);
    (i?ctx.lineTo(x,y):ctx.moveTo(x,y));
  }
  ctx.strokeStyle = "#f28c28";
  ctx.stroke();

  // Predator
  ctx.beginPath();
  for (let i=0;i<n;i++){
    const minutes = i;
    const x = xOfMin(minutes);
    const y = yOf(pred[i]);
    (i?ctx.lineTo(x,y):ctx.moveTo(x,y));
  }
  ctx.strokeStyle = "#2c7a7b";
  ctx.stroke();

  // 目盛ラベル
  ctx.fillStyle = "#0f172a";
  ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const xv of xTicks.ticks) {
    const x = xOfMin(xv);
    ctx.fillText(String(Math.round(xv)), x, H - B + 6);
  }
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const yv of yTicks.ticks) {
    const y = yOf(yv);
    // 小数桁は動的に（範囲が大きい時は整数、小さい時は1〜2桁）
    const absRange = Math.abs(yTicks.max - yTicks.min);
    const digits = absRange >= 100 ? 0 : (absRange >= 10 ? 1 : 2);
    ctx.fillText(yv.toFixed(digits), L - 8, y);
  }

  // 軸ラベル
  ctx.fillStyle = "#111827";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.font = "13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("time [min]", L + (W - L - R)/2, H - 8);

  ctx.save();
  ctx.translate(16, T + (H - T - B)/2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Concentration [nM]", 0, 0);
  ctx.restore();

  // タイトル
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("PP-oscillation (Rust + WASM)", L + (W - L - R)/2, 12);
}

/* ---------- 実行ループ ---------- */
function setBusy(vis){ busy.style.display = vis ? "inline-flex" : "none"; }

function animate(){
  if (wasmReady && needUpdate) {
    needUpdate = false;
    setBusy(true);
    const t0 = performance.now();

    const v = getVals();
    // Rustから [prey..., pred...] の Float32Array を受け取る
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

/* ---------- 起動 ---------- */
await init();           // pkg/pp_osc_wasm_bg.wasm をロード
wasmReady = true;
requestUpdate();
animate();

/* ---------- ユーティリティ ---------- */
function byId(id){ return document.getElementById(id); }
