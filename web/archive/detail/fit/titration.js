// G:N titration fitting utilities. Model: F(N) = F0 + ΔF * θ(N)
// where θ(N) = (Ka * N) / (1 + Ka * N). Ka is the association constant.
// We estimate Ka via 1D search while solving for F0 and ΔF analytically
// (linear regression) for each candidate Ka.

const SEARCH_STEPS = 60;
const REFINEMENTS = 3;
const Z95 = 1.96;
const EPS = 1e-12;

function weightedSums(theta, response, weights) {
  let sumTT = 0;
  let sumTR = 0;
  let sumRR = 0;
  let sumT = 0;
  let sumR = 0;
  let sumW = 0;
  for (let i = 0; i < theta.length; i += 1) {
    const w = weights ? weights[i] : 1;
    const t = theta[i];
    const r = response[i];
    sumTT += w * t * t;
    sumTR += w * t * r;
    sumRR += w * r * r;
    sumT += w * t;
    sumR += w * r;
    sumW += w;
  }
  return { sumTT, sumTR, sumRR, sumT, sumR, sumW };
}

function solveLinear(theta, response) {
  const sums = weightedSums(theta, response);
  const { sumTT, sumTR, sumT, sumR, sumW } = sums;
  const denom = (sumW * sumTT) - (sumT * sumT);
  if (Math.abs(denom) < EPS) {
    return { F0: 0, dF: 0, warnings: ['Singular system while fitting F0 and ΔF.'] };
  }
  const F0 = ((sumTT * sumR) - (sumT * sumTR)) / denom;
  const dF = (sumW * sumTR - sumT * sumR) / denom;
  return { F0, dF, warnings: [] };
}

function computeResiduals(theta, response, F0, dF) {
  const residuals = new Array(theta.length);
  let sse = 0;
  for (let i = 0; i < theta.length; i += 1) {
    const pred = F0 + dF * theta[i];
    const res = response[i] - pred;
    residuals[i] = res;
    sse += res * res;
  }
  return { residuals, sse };
}

function evaluateKa(logKa, ligand, response) {
  const Ka = Math.pow(10, logKa);
  const theta = ligand.map((n) => {
    const denom = 1 + Ka * n;
    return denom > 0 ? (Ka * n) / denom : 0;
  });
  const { F0, dF, warnings } = solveLinear(theta, response);
  const { residuals, sse } = computeResiduals(theta, response, F0, dF);
  return { logKa, Ka, F0, dF, residuals, sse, warnings, theta };
}

function refineKa(ligand, response, logMin = -8, logMax = 8) {
  let best = null;
  let minLog = logMin;
  let maxLog = logMax;
  for (let iter = 0; iter < REFINEMENTS; iter += 1) {
    const step = (maxLog - minLog) / SEARCH_STEPS;
    for (let i = 0; i <= SEARCH_STEPS; i += 1) {
      const logKa = minLog + i * step;
      const evalResult = evaluateKa(logKa, ligand, response);
      if (!best || evalResult.sse < best.sse) {
        best = evalResult;
      }
    }
    const span = Math.max(0.5, (maxLog - minLog) / 4);
    minLog = best.logKa - span;
    maxLog = best.logKa + span;
    if (maxLog - minLog < 1e-3) break;
  }
  return best;
}

function estimateVariance(result, ligand, response) {
  const { residuals, theta } = result;
  const n = residuals.length;
  if (n <= 3) return { sigma2: 0, varF0: Infinity, varDF: Infinity, varLogKa: Infinity };
  const meanResidual = residuals.reduce((a, b) => a + b, 0) / n;
  let sse = 0;
  for (const r of residuals) sse += (r - meanResidual) * (r - meanResidual);
  const sigma2 = sse / (n - 3);

  const sums = weightedSums(theta, residuals); // reuse for covariances (approx)
  const denom = (sums.sumW * sums.sumTT) - (sums.sumT * sums.sumT);
  const varF0 = denom !== 0 ? (sigma2 * sums.sumTT) / denom : Infinity;
  const varDF = denom !== 0 ? (sigma2 * sums.sumW) / denom : Infinity;

  // Approximate var(logKa) via curvature of SSE around optimum
  const delta = 0.1;
  const left = evaluateKa(result.logKa - delta, ligand, response);
  const right = evaluateKa(result.logKa + delta, ligand, response);
  const secondDeriv = (left.sse + right.sse - 2 * result.sse) / (delta * delta);
  const varLogKa = secondDeriv > EPS ? (2 * sigma2) / secondDeriv : Infinity;

  return { sigma2, varF0, varDF, varLogKa };
}

export function fitTitrationDataset(dataset, options = {}) {
  const ligandArr = Array.from(dataset.ligand);
  const responseArr = Array.from(dataset.response);
  const best = refineKa(
    ligandArr,
    responseArr,
    Number.isFinite(options.logKaMin) ? options.logKaMin : -8,
    Number.isFinite(options.logKaMax) ? options.logKaMax : 8
  );
  const stats = estimateVariance(best, ligandArr, responseArr);
  const r2 = (() => {
    const mean = responseArr.reduce((a, b) => a + b, 0) / responseArr.length;
    let sst = 0;
    for (const val of responseArr) {
      const diff = val - mean;
      sst += diff * diff;
    }
    return sst > 0 ? 1 - (best.sse / sst) : 0;
  })();

  const KaCI = (() => {
    if (!Number.isFinite(stats.varLogKa)) return [best.Ka, best.Ka];
    const sigmaLog = Math.sqrt(Math.max(stats.varLogKa, 0));
    const lower = Math.pow(10, best.logKa - Z95 * sigmaLog);
    const upper = Math.pow(10, best.logKa + Z95 * sigmaLog);
    return [lower, upper];
  })();

  return {
    Ka: best.Ka,
    KaCI,
    logKa: best.logKa,
    F0: best.F0,
    dF: best.dF,
    residuals: best.residuals,
    sigma: Math.sqrt(Math.max(stats.sigma2, 0)),
    r2,
    warnings: best.warnings,
  };
}

export function deriveRAssoc(KaMeasured, KaReference) {
  if (!Number.isFinite(KaMeasured) || KaMeasured <= 0) return NaN;
  const reference = Number.isFinite(KaReference) && KaReference > 0 ? KaReference : 1;
  return KaMeasured / reference;
}

export default fitTitrationDataset;
