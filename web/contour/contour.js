import { initWasm, runSimulationAndEvaluate } from "../core.js";

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d', { alpha: false });
const status = document.getElementById('status');
const runBtn = document.getElementById('runBtn');
const exportPngBtn = document.getElementById('exportPngBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');

const ids = [
  'gMin', 'gMax', 'gSteps',
  'betaMin', 'betaMax', 'betaSteps',
  'contourLevels', 'autoLevels',
  'showScenarios', 'baseG', 'baseBeta',
  'pol', 'rec', 'G', 'k2', 'kN', 'kP', 'KmP', 'N0', 'P0',
  't_end', 'dt', 'tail'
];
const el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));

let gridData = null;
let contourData = null;

function num(id) { return parseFloat(el[id].value); }

// 周期評価はWASM側で最適化された実装を使用
// （evaluatePeriod関数は削除し、runSimulationAndEvaluateを使用）

// (g, β) → (k1, b) の逆算
function gbToK1B(g, beta, baseParams) {
  const { k2, KmP, G } = baseParams;
  const k1 = (g * k2 * KmP) / G;
  const b = (beta * k1) / (k2 * KmP * KmP);
  return { k1, b };
}

// グリッド生成とシミュレーション実行
async function generateContourData() {
  await initWasm();

  const gMin = num('gMin'), gMax = num('gMax'), gSteps = Math.max(2, Math.floor(num('gSteps')));
  const betaMin = num('betaMin'), betaMax = num('betaMax'), betaSteps = Math.max(2, Math.floor(num('betaSteps')));
  const t_end = num('t_end'), dt = num('dt'), tail = Math.min(100, Math.max(1, Math.floor(num('tail'))));

  const baseParams = {
    pol: num('pol'),
    rec: num('rec'),
    G: num('G'),
    k2: num('k2'),
    kN: num('kN'),
    kP: num('kP'),
    KmP: num('KmP'),
    N0: num('N0'),
    P0: num('P0'),
    t_end_min: t_end,
    dt_min: dt,
    mod_factor: 1.0
  };

  const grid = [];
  const totalCells = gSteps * betaSteps;
  let completed = 0;

  progressContainer.style.display = 'block';
  progressFill.style.width = '0%';

  const startTime = performance.now();

  for (let j = 0; j < betaSteps; j++) {
    const beta = betaMin + (betaMax - betaMin) * (j / (betaSteps - 1));

    for (let i = 0; i < gSteps; i++) {
      const g = gMin + (gMax - gMin) * (i / (gSteps - 1));

      // (g, β) → (k1, b) 逆算
      const { k1, b } = gbToK1B(g, beta, baseParams);

      const params = { ...baseParams, k1, b };

      try {
        // WASM最適化版の周期評価を使用
        const period = runSimulationAndEvaluate(params, 'period', tail);

        grid.push({ g, beta, k1, b, period: Number.isFinite(period) ? period : NaN });
      } catch (err) {
        console.error(`Error at (g=${g.toFixed(2)}, β=${beta.toFixed(2)}):`, err);
        grid.push({ g, beta, k1, b, period: NaN });
      }

      completed++;
      if (completed % 10 === 0 || completed === totalCells) {
        const progress = Math.floor((completed / totalCells) * 100);
        progressFill.style.width = `${progress}%`;
        status.textContent = `計算中... ${completed}/${totalCells} (${progress}%)`;
        await new Promise(r => setTimeout(r, 0)); // UI更新のため
      }
    }
  }

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ Contour grid completed in ${elapsed}s (${gSteps}×${betaSteps} = ${totalCells} cells)`);

  progressContainer.style.display = 'none';

  return { grid, gSteps, betaSteps, gMin, gMax, betaMin, betaMax };
}

// 等高線計算 (マーチングスクエア法のシンプル実装)
function computeContours(grid, gSteps, betaSteps, levels) {
  const contours = [];

  // 各等高線レベルについて
  for (const level of levels) {
    const segments = [];

    // 各セルをスキャン
    for (let j = 0; j < betaSteps - 1; j++) {
      for (let i = 0; i < gSteps - 1; i++) {
        const idx00 = j * gSteps + i;
        const idx10 = j * gSteps + (i + 1);
        const idx01 = (j + 1) * gSteps + i;
        const idx11 = (j + 1) * gSteps + (i + 1);

        const v00 = grid[idx00].period;
        const v10 = grid[idx10].period;
        const v01 = grid[idx01].period;
        const v11 = grid[idx11].period;

        // NaNスキップ
        if (!Number.isFinite(v00) || !Number.isFinite(v10) ||
            !Number.isFinite(v01) || !Number.isFinite(v11)) continue;

        // マーチングスクエアのケース判定
        let caseId = 0;
        if (v00 >= level) caseId |= 1;
        if (v10 >= level) caseId |= 2;
        if (v11 >= level) caseId |= 4;
        if (v01 >= level) caseId |= 8;

        if (caseId === 0 || caseId === 15) continue; // セル内に等高線なし

        const g0 = grid[idx00].g;
        const g1 = grid[idx10].g;
        const beta0 = grid[idx00].beta;
        const beta1 = grid[idx01].beta;

        // 線形補間で交点を計算
        const edges = [];

        // 下辺 (v00-v10)
        if ((v00 < level && v10 >= level) || (v00 >= level && v10 < level)) {
          const t = (level - v00) / (v10 - v00);
          edges.push({ g: g0 + t * (g1 - g0), beta: beta0 });
        }

        // 右辺 (v10-v11)
        if ((v10 < level && v11 >= level) || (v10 >= level && v11 < level)) {
          const t = (level - v10) / (v11 - v10);
          edges.push({ g: g1, beta: beta0 + t * (beta1 - beta0) });
        }

        // 上辺 (v01-v11)
        if ((v01 < level && v11 >= level) || (v01 >= level && v11 < level)) {
          const t = (level - v01) / (v11 - v01);
          edges.push({ g: g0 + t * (g1 - g0), beta: beta1 });
        }

        // 左辺 (v00-v01)
        if ((v00 < level && v01 >= level) || (v00 >= level && v01 < level)) {
          const t = (level - v00) / (v01 - v00);
          edges.push({ g: g0, beta: beta0 + t * (beta1 - beta0) });
        }

        // 線分として保存 (通常2点)
        if (edges.length >= 2) {
          segments.push({ p1: edges[0], p2: edges[1], level });
        }
      }
    }

    contours.push({ level, segments });
  }

  return contours;
}

// Canvas描画
function drawContourPlot(gridContext, contours) {
  const { grid, gSteps, betaSteps, gMin, gMax, betaMin, betaMax } = gridContext;

  const W = cv.width, H = cv.height;
  const L = 100, R = 150, T = 80, B = 100;

  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // 座標変換
  const xOf = (g) => L + ((g - gMin) / (gMax - gMin || 1)) * (W - L - R);
  const yOf = (beta) => H - B - ((beta - betaMin) / (betaMax - betaMin || 1)) * (H - T - B);

  // ヒートマップ背景 (オプション)
  const showHeatmap = true;
  if (showHeatmap) {
    let periodMin = Infinity, periodMax = -Infinity;
    for (const pt of grid) {
      if (Number.isFinite(pt.period)) {
        if (pt.period < periodMin) periodMin = pt.period;
        if (pt.period > periodMax) periodMax = pt.period;
      }
    }

    for (let j = 0; j < betaSteps - 1; j++) {
      for (let i = 0; i < gSteps - 1; i++) {
        const idx = j * gSteps + i;
        const pt = grid[idx];

        const x0 = xOf(pt.g);
        const x1 = xOf(grid[idx + 1].g);
        const y0 = yOf(pt.beta);
        const y1 = yOf(grid[idx + gSteps].beta);

        if (Number.isFinite(pt.period)) {
          const t = (pt.period - periodMin) / (periodMax - periodMin || 1);
          const [r, g, b] = turbo(t);
          ctx.fillStyle = `rgba(${r},${g},${b},0.3)`;
        } else {
          ctx.fillStyle = '#e5e7eb';
        }

        ctx.fillRect(x0, Math.min(y0, y1), x1 - x0, Math.abs(y1 - y0));
      }
    }
  }

  // 等高線を描画
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.5;

  for (const contour of contours) {
    ctx.beginPath();
    for (const seg of contour.segments) {
      ctx.moveTo(xOf(seg.p1.g), yOf(seg.p1.beta));
      ctx.lineTo(xOf(seg.p2.g), yOf(seg.p2.beta));
    }
    ctx.stroke();

    // ラベル (最初のセグメントに配置)
    if (contour.segments.length > 0) {
      const seg = contour.segments[Math.floor(contour.segments.length / 2)];
      const x = xOf((seg.p1.g + seg.p2.g) / 2);
      const y = yOf((seg.p1.beta + seg.p2.beta) / 2);

      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 18, y - 8, 36, 16);
      ctx.fillStyle = '#1e293b';
      ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${contour.level}`, x, y);
    }
  }

  // 軸と枠
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(L, T, W - L - R, H - T - B);

  // 軸ラベル
  ctx.fillStyle = '#111827';
  ctx.font = '14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('g (無次元)', L + (W - L - R) / 2, H - 30);

  ctx.save();
  ctx.translate(30, T + (H - T - B) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('β (無次元)', 0, 0);
  ctx.restore();

  // 軸目盛り
  const gTicks = niceAxis(gMin, gMax, 6);
  const betaTicks = niceAxis(betaMin, betaMax, 6);

  ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const g of gTicks.ticks) {
    ctx.fillText(g.toFixed(gTicks.decimals), xOf(g), H - B + 6);
  }

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const beta of betaTicks.ticks) {
    ctx.fillText(beta.toFixed(betaTicks.decimals), L - 6, yOf(beta));
  }

  // タイトル
  ctx.fillStyle = '#111827';
  ctx.font = '18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('(g, β) 空間における周期の等高線 [min]', W / 2, 20);

  // シナリオ矢印の描画
  if (el.showScenarios.checked) {
    drawScenarios(xOf, yOf, gMin, gMax, betaMin, betaMax);
  }

  // 凡例 (右側)
  const legendX = W - R + 20;
  let legendY = T + 20;

  ctx.fillStyle = '#111827';
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('等高線レベル:', legendX, legendY);
  legendY += 20;

  for (const contour of contours.slice(0, 8)) {
    ctx.fillStyle = '#1e293b';
    ctx.fillText(`${contour.level} min`, legendX, legendY);
    legendY += 18;
  }
}

// シナリオ矢印描画
function drawScenarios(xOf, yOf, gMin, gMax, betaMin, betaMax) {
  const baseG = num('baseG');
  const baseBeta = num('baseBeta');

  // 基準点が範囲外ならスキップ
  if (baseG < gMin || baseG > gMax || baseBeta < betaMin || baseBeta > betaMax) return;

  const scenarios = [
    { label: '軽度', r_assoc: 1.1, r_poly: 0.9, r_nick: 1.0, color: '#60a5fa' },
    { label: '中度', r_assoc: 1.2, r_poly: 0.8, r_nick: 1.0, color: '#3b82f6' },
    { label: '強度', r_assoc: 1.3, r_poly: 0.7, r_nick: 1.0, color: '#1e40af' }
  ];

  const x0 = xOf(baseG);
  const y0 = yOf(baseBeta);

  // 基準点を描画
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(x0, y0, 5, 0, 2 * Math.PI);
  ctx.fill();

  for (const s of scenarios) {
    // g' = g × (r_assoc × r_poly / r_nick)
    // β' = β × (1 / r_poly)
    const gNew = baseG * (s.r_assoc * s.r_poly / s.r_nick);
    const betaNew = baseBeta * (1 / s.r_poly);

    // 範囲チェック
    if (gNew < gMin || gNew > gMax || betaNew < betaMin || betaNew > betaMax) continue;

    const x1 = xOf(gNew);
    const y1 = yOf(betaNew);

    // 矢印を描画
    drawArrow(x0, y0, x1, y1, s.color, s.label);
  }
}

// 矢印描画ヘルパー
function drawArrow(x0, y0, x1, y1, color, label) {
  const headLen = 12;
  const angle = Math.atan2(y1 - y0, x1 - x0);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  // 線
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  // 矢頭
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - headLen * Math.cos(angle - Math.PI / 6), y1 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x1 - headLen * Math.cos(angle + Math.PI / 6), y1 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();

  // ラベル
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, (x0 + x1) / 2, (y0 + y1) / 2 - 5);
}

// 軸目盛り計算 (heatmap.jsから流用)
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

// Turbo colormap
function turbo(t) {
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

// イベントハンドラ
runBtn.addEventListener('click', async () => {
  runBtn.disabled = true;
  exportPngBtn.disabled = true;
  exportCsvBtn.disabled = true;
  status.textContent = 'グリッド計算を開始しています...';

  try {
    gridData = await generateContourData();

    // 等高線レベルを決定
    let levels;
    if (el.autoLevels.checked) {
      // 自動: データから適切なレベルを選択
      const periods = gridData.grid.map(pt => pt.period).filter(p => Number.isFinite(p));
      if (periods.length === 0) {
        status.textContent = 'エラー: 有効なデータがありません。';
        runBtn.disabled = false;
        return;
      }
      const minPeriod = Math.min(...periods);
      const maxPeriod = Math.max(...periods);
      const step = (maxPeriod - minPeriod) / 8;
      levels = [];
      for (let i = 1; i <= 8; i++) {
        levels.push(Math.round(minPeriod + i * step));
      }
    } else {
      // 手動入力
      levels = el.contourLevels.value.split(',').map(s => parseFloat(s.trim())).filter(v => Number.isFinite(v));
    }

    if (levels.length === 0) {
      status.textContent = 'エラー: 等高線レベルが無効です。';
      runBtn.disabled = false;
      return;
    }

    status.textContent = '等高線を計算中...';
    contourData = computeContours(gridData.grid, gridData.gSteps, gridData.betaSteps, levels);

    status.textContent = '描画中...';
    drawContourPlot(gridData, contourData);

    status.textContent = `完了！ (${gridData.gSteps}×${gridData.betaSteps}グリッド, ${levels.length}レベル)`;
    exportPngBtn.disabled = false;
    exportCsvBtn.disabled = false;
  } catch (err) {
    status.textContent = `エラー: ${err.message}`;
    console.error(err);
  } finally {
    runBtn.disabled = false;
  }
});

// PNG出力
exportPngBtn.addEventListener('click', () => {
  if (!gridData) return;
  const dataURL = cv.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = 'contour_g_beta_period.png';
  link.href = dataURL;
  link.click();
  status.textContent = 'PNG画像を保存しました。';
});

// CSV出力
exportCsvBtn.addEventListener('click', () => {
  if (!gridData) return;

  let csv = 'g,beta,k1,b,period_min\n';
  for (const pt of gridData.grid) {
    csv += `${pt.g},${pt.beta},${pt.k1},${pt.b},${Number.isFinite(pt.period) ? pt.period : 'NaN'}\n`;
  }

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = 'contour_data.csv';
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);

  status.textContent = 'CSVデータを保存しました。';
});
