// Prey-only parameter estimation utilities for the Modification Workbench Fit flow.
// Implements the closed-form relationship from spec §8.1:
//   t = (1/(k1 * pol)) * [ (1/G) ln(N/N0) + b (N - N0) ]
// We recast this as a linear model t = alpha * X + beta * Y, where
//   alpha = 1/(k1 * pol) and beta = b/(k1 * pol).
// This allows efficient and numerically stable fitting with optional Huber
// robustification and straightforward propagation of confidence intervals.

const Z95 = 1.96; // 95% CI under large-sample normal approximation
const EPS = 1e-12;

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? 0.5 * (sorted[mid - 1] + sorted[mid])
    : sorted[mid];
}

function mad(residuals) {
  if (!residuals.length) return 0;
  const med = median(residuals.map((r) => Math.abs(r)));
  return 1.4826 * med + EPS;
}

function solveNormalEquations(sumXX, sumXY, sumYY, sumXT, sumYT) {
  const det = sumXX * sumYY - sumXY * sumXY;
  if (Math.abs(det) < EPS) {
    throw new Error('Design matrix is singular; cannot solve for parameters');
  }
  const alpha = (sumYY * sumXT - sumXY * sumYT) / det;
  const beta = (sumXX * sumYT - sumXY * sumXT) / det;
  return { alpha, beta, det };
}

function accumulateSums(X, Y, T, weights) {
  let sumXX = 0;
  let sumXY = 0;
  let sumYY = 0;
  let sumXT = 0;
  let sumYT = 0;
  for (let i = 0; i < X.length; i += 1) {
    const w = weights ? weights[i] : 1;
    const x = X[i];
    const y = Y[i];
    const t = T[i];
    sumXX += w * x * x;
    sumXY += w * x * y;
    sumYY += w * y * y;
    sumXT += w * x * t;
    sumYT += w * y * t;
  }
  return { sumXX, sumXY, sumYY, sumXT, sumYT };
}

function regressionStep(X, Y, T, weights) {
  const { sumXX, sumXY, sumYY, sumXT, sumYT } = accumulateSums(X, Y, T, weights);
  return solveNormalEquations(sumXX, sumXY, sumYY, sumXT, sumYT);
}

function computeResiduals(alpha, beta, X, Y, T) {
  const res = new Array(T.length);
  for (let i = 0; i < T.length; i += 1) {
    res[i] = T[i] - (alpha * X[i] + beta * Y[i]);
  }
  return res;
}

function updateHuberWeights(residuals, delta) {
  const scale = mad(residuals) || 1;
  const threshold = delta * scale;
  return residuals.map((r) => {
    const abs = Math.abs(r);
    if (abs <= threshold) return 1;
    return threshold / abs;
  });
}

function weightedMean(values, weights) {
  let sumW = 0;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const w = weights ? weights[i] : 1;
    sumW += w;
    sum += w * values[i];
  }
  return sumW > 0 ? sum / sumW : 0;
}

function computeDiagnostics(alpha, beta, X, Y, T, weights) {
  const residuals = computeResiduals(alpha, beta, X, Y, T);
  const n = T.length;
  const p = 2;
  const meanT = weightedMean(T, weights);
  let sse = 0;
  let sst = 0;
  let sumWeights = 0;
  for (let i = 0; i < n; i += 1) {
    const w = weights ? weights[i] : 1;
    const r = residuals[i];
    sse += w * r * r;
    const diff = T[i] - meanT;
    sst += w * diff * diff;
    sumWeights += w;
  }
  const dof = Math.max(1, sumWeights - p);
  const sigma2 = sse / dof;
  const r2 = sst > 0 ? 1 - (sse / sst) : 0;
  return { residuals, sigma2, r2, sse, dof };
}

function covarianceMatrix(alpha, X, Y, weights, sigma2) {
  const { sumXX, sumXY, sumYY } = accumulateSums(X, Y, new Array(X.length).fill(0), weights);
  const det = sumXX * sumYY - sumXY * sumXY;
  if (Math.abs(det) < EPS) {
    return [[Infinity, 0], [0, Infinity]]; // fallback to avoid crash
  }
  const inv = [[sumYY / det, -sumXY / det], [-sumXY / det, sumXX / det]];
  return [
    [inv[0][0] * sigma2, inv[0][1] * sigma2],
    [inv[1][0] * sigma2, inv[1][1] * sigma2],
  ];
}

function propagateK1(alpha, cov, pol) {
  const dAlpha = -1 / (pol * alpha * alpha);
  const varK1 = dAlpha * dAlpha * cov[0][0];
  const k1 = 1 / (alpha * pol);
  return { estimate: k1, variance: Math.max(0, varK1) };
}

function propagateB(alpha, beta, cov) {
  const dAlpha = -beta / (alpha * alpha);
  const dBeta = 1 / alpha;
  const varB = dAlpha * dAlpha * cov[0][0]
    + dBeta * dBeta * cov[1][1]
    + 2 * dAlpha * dBeta * cov[0][1];
  const b = beta / alpha;
  return { estimate: b, variance: Math.max(0, varB) };
}

function confidenceInterval(estimate, variance) {
  const sigma = Math.sqrt(Math.max(variance, 0));
  return [estimate - Z95 * sigma, estimate + Z95 * sigma];
}

/**
 * Fit prey-only data to recover k1' and b'.
 * @param {{ time: ArrayLike<number>, concentration: ArrayLike<number> }} data
 * @param {{ pol: number, G: number, N0?: number, loss?: 'ols'|'huber', huberDelta?: number }} params
 */
export function fitPreyDataset(data, params) {
  const { time, concentration } = data;
  if (!time || !concentration || time.length !== concentration.length) {
    throw new Error('time and concentration arrays must be the same length');
  }
  if (time.length < 3) {
    throw new Error('Need at least 3 data points for fitting');
  }
  const pol = params?.pol ?? 1;
  const G = params?.G ?? 1;
  if (pol <= 0 || G <= 0) {
    throw new Error('pol and G must be positive');
  }
  const N0 = params?.N0 ?? concentration[0];
  if (N0 <= 0) {
    throw new Error('Initial concentration N0 must be positive');
  }

  const X = [];
  const Y = [];
  const T = [];
  const skipped = [];
  for (let i = 0; i < time.length; i += 1) {
    const N = concentration[i];
    const t = time[i];
    if (N <= 0 || !Number.isFinite(N) || !Number.isFinite(t)) {
      skipped.push(i);
      continue;
    }
    const ratio = N / N0;
    if (ratio <= 0) {
      skipped.push(i);
      continue;
    }
    const Xi = (Math.log(ratio)) / G;
    const Yi = N - N0;
    X.push(Xi);
    Y.push(Yi);
    T.push(t);
  }

  if (X.length < 3) {
    throw new Error('Too few valid data points after filtering non-positive concentrations');
  }

  let weights = new Array(X.length).fill(1);
  const useHuber = params?.loss === 'huber';
  const huberDelta = params?.huberDelta ?? 1.5;
  let alpha = 0;
  let beta = 0;

  for (let iter = 0; iter < (useHuber ? 8 : 1); iter += 1) {
    const step = regressionStep(X, Y, T, weights);
    alpha = step.alpha;
    beta = step.beta;
    const residuals = computeResiduals(alpha, beta, X, Y, T);
    if (!useHuber) break;
    const newWeights = updateHuberWeights(residuals, huberDelta);
    let maxDiff = 0;
    for (let i = 0; i < weights.length; i += 1) {
      maxDiff = Math.max(maxDiff, Math.abs(weights[i] - newWeights[i]));
      weights[i] = newWeights[i];
    }
    if (maxDiff < 1e-3) break;
  }

  const diagnostics = computeDiagnostics(alpha, beta, X, Y, T, useHuber ? weights : null);
  const cov = covarianceMatrix(alpha, X, Y, useHuber ? weights : null, diagnostics.sigma2);
  const k1Info = propagateK1(alpha, cov, pol);
  const bInfo = propagateB(alpha, beta, cov);

  const result = {
    alpha,
    beta,
    k1: k1Info.estimate,
    k1CI: confidenceInterval(k1Info.estimate, k1Info.variance),
    b: bInfo.estimate,
    bCI: confidenceInterval(bInfo.estimate, bInfo.variance),
    diagnostics: {
      residuals: diagnostics.residuals,
      r2: diagnostics.r2,
      sigma: Math.sqrt(Math.max(diagnostics.sigma2, 0)),
      sse: diagnostics.sse,
      dof: diagnostics.dof,
      skipped,
    },
    weights: useHuber ? weights : null,
  };
  return result;
}

/**
 * Given baseline (unmodified) and fitted (modified) parameter pairs, compute
 * r_poly and r_nick according to spec §4.
 * @param {{ k1: number, b: number }} baseline
 * @param {{ k1: number, b: number }} fitted
 * @param {{ rAssoc?: number }} modifiers - optional r_assoc when already known
 */
export function deriveModificationFactors(baseline, fitted, modifiers = {}) {
  const { rAssoc = 1 } = modifiers;
  if (!baseline || !fitted) throw new Error('baseline and fitted parameters are required');
  if (baseline.k1 <= 0 || baseline.b <= 0 || fitted.k1 <= 0 || fitted.b <= 0) {
    throw new Error('k1 and b must be positive to derive factors');
  }
  const ratioK1 = fitted.k1 / baseline.k1;
  const ratioB = fitted.b / baseline.b;
  const rPoly = ratioB === 0 ? Infinity : (ratioK1 / ratioB);
  const rNick = ratioB === 0 ? Infinity : (rAssoc / ratioB);
  return { rPoly, rNick, ratioK1, ratioB };
}

export default fitPreyDataset;
