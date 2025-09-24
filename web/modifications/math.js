export const GAS_CONSTANT_KCAL = 0.00198720425864083; // kcal·mol⁻¹·K⁻¹
export const ABSOLUTE_ZERO = 273.15;
export const EPS = 1e-12;

export function toKelvin(temperatureC) {
  return (Number.isFinite(temperatureC) ? temperatureC : 37) + ABSOLUTE_ZERO;
}

export function clampPositive(value, fallback = 1) {
  const v = Number.isFinite(value) && value > 0 ? value : fallback;
  return Math.max(EPS, v);
}

export function rAssocFromDelta(deltaDeltaGAssoc, temperatureC) {
  if (!Number.isFinite(deltaDeltaGAssoc)) return 1;
  return Math.exp(-deltaDeltaGAssoc / (GAS_CONSTANT_KCAL * toKelvin(temperatureC)));
}

export function deltaFromRAssoc(rAssoc, temperatureC) {
  const r = clampPositive(rAssoc, 1);
  return -Math.log(r) * GAS_CONSTANT_KCAL * toKelvin(temperatureC);
}

export function hairpinOpenFraction(deltaDeltaGFold, temperatureC) {
  const dg = Number.isFinite(deltaDeltaGFold) ? deltaDeltaGFold : 0;
  return 1 / (1 + Math.exp(dg / (GAS_CONSTANT_KCAL * toKelvin(temperatureC))));
}
