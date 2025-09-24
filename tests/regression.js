// Minimal regression/performance harness for the PP-oscillation simulator.
// Usage: node tests/regression.js

const GAS_CONSTANT_KCAL = 0.00198720425864083;
const DEFAULT_TEMP_K = 37 + 273.15;

const BASE_PARAMS = {
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

const BIFURCATION_PRESET = {
  param: 'G',
  pmin: 50,
  pmax: 300,
  steps: 60,
  tailPct: 50,
};

const HEATMAP_PRESET = {
  xParam: 'G',
  xMin: 80,
  xMax: 250,
  xSteps: 20,
  yParam: 'assoc_ddg',
  yMin: -5,
  yMax: 5,
  ySteps: 15,
  metric: 'period',
  tailPct: 60,
};

function evaluateAmplitude(series) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of series) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}

async function loadCore() {
  if (globalThis.__pp_core) return globalThis.__pp_core;
  try {
    const core = await import('../web/core.js');
    globalThis.__pp_core = core;
    return core;
  } catch (err) {
    throw new Error('Failed to load web/core.js. Run "wasm-pack build --target web --release --out-dir web/pkg" first. Original error: ' + err.message);
  }
}

async function regressionOscillation() {
  const core = await loadCore();
  await core.initWasm();
  const { P } = core.runSimulationPhysical(BASE_PARAMS);
  const amplitude = evaluateAmplitude(P);
  const oscillatory = amplitude > 5;
  return { amplitude, oscillatory, points: P.length };
}

async function invariantChecks(){
  const core = await loadCore();
  await core.initWasm();
  const base = BASE_PARAMS;
  const rAssoc = 2;
  const rPoly = 0.5;
  const rNick = 1.5;
  const mod = { rAssoc, rPoly, rNick };
  const { computeEffectiveParameters } = await import('../web/modifications.js');
  const derived = computeEffectiveParameters(base, mod);
  const tolerance = 1e-6;
  const baseBeta = (base.b * base.k2 * base.KmP * base.KmP) / base.k1;
  const expectedBeta = baseBeta / rPoly;
  const betaOk = Math.abs(derived.betaEff - expectedBeta) < tolerance;
  const gOk = Math.abs((derived.gEff / ((base.k1 * base.G)/(base.k2 * base.KmP))) - (rAssoc * rPoly / rNick)) < 1e-6;
  return { betaOk, gOk, derivedBeta: derived.betaEff, expectedBeta, derivedFactor: derived.gEff, mod }; 
}

async function sweepBifurcation() {
  const core = await loadCore();
  await core.initWasm();
  const start = performance.now();
  const xs = [];
  const { param, pmin, pmax, steps, tailPct } = BIFURCATION_PRESET;
  for (let i = 0; i < steps; i += 1) {
    const value = pmin + (pmax - pmin) * (i / (steps - 1));
    const params = { ...BASE_PARAMS, [param]: value };
    const { P } = core.runSimulationPhysical(params);
    const tail = Math.max(1, Math.floor(P.length * (tailPct / 100)));
    xs.push(evaluateAmplitude(P.slice(-tail)));
  }
  const duration = performance.now() - start;
  return { durationMs: duration, samples: steps, maxAmplitude: Math.max(...xs) };
}

function applyAssocAxis(params, axisName, value) {
  if (axisName === 'assoc_ddg') {
    const r = Math.exp(-value / (GAS_CONSTANT_KCAL * DEFAULT_TEMP_K));
    params.k1 *= r;
    params.b *= r;
  } else if (axisName === 'assoc_r') {
    const r = Math.max(value, 0);
    params.k1 *= r;
    params.b *= r;
  } else {
    params[axisName] = value;
  }
}

async function sweepHeatmap() {
  const core = await loadCore();
  await core.initWasm();
  const start = performance.now();
  const metrics = [];
  const { xParam, xMin, xMax, xSteps, yParam, yMin, yMax, ySteps, metric, tailPct } = HEATMAP_PRESET;
  for (let j = 0; j < ySteps; j += 1) {
    const yVal = yMin + (yMax - yMin) * (j / (ySteps - 1));
    for (let i = 0; i < xSteps; i += 1) {
      const xVal = xMin + (xMax - xMin) * (i / (xSteps - 1));
      const params = { ...BASE_PARAMS };
      applyAssocAxis(params, xParam, xVal);
      applyAssocAxis(params, yParam, yVal);
      const { P } = core.runSimulationPhysical(params);
      const tail = Math.max(3, Math.floor(P.length * (tailPct / 100)));
      const tailSeries = P.slice(-tail);
      if (metric === 'amplitude') metrics.push(evaluateAmplitude(tailSeries));
      else metrics.push(0);
    }
  }
  const duration = performance.now() - start;
  return { durationMs: duration, grid: `${xSteps}x${ySteps}`, metric, sampleCount: metrics.length };
}

function formatResult(title, result) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  try {
    const osc = await regressionOscillation();
    formatResult('Oscillation baseline', osc);
    const inv = await invariantChecks();
    formatResult('Invariant checks', inv);
    const bif = await sweepBifurcation();
    formatResult('Bifurcation sweep (performance)', bif);
    const heat = await sweepHeatmap();
    formatResult('Heatmap sweep (performance)', heat);
  } catch (err) {
    console.error('Regression harness failed:', err.message);
    process.exitCode = 1;
  }
}

main();
