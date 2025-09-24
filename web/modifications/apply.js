import { clampPositive, hairpinOpenFraction } from "./math.js";

export const DEFAULT_EFFECT = Object.freeze({
  id: null,
  label: "No modification",
  scaleK1: 1,
  scaleB: 1,
  hairpin: 1,
});

export function computeEffectFromModification(mod) {
  if (!mod) return { ...DEFAULT_EFFECT };
  const rAssoc = clampPositive(mod.rAssoc, 1);
  const rPoly = clampPositive(mod.rPoly, 1);
  const rNick = clampPositive(mod.rNick, 1);
  const denom = clampPositive(rNick, 1);
  const scaleK1 = (rAssoc * rPoly) / denom;
  const scaleB = rAssoc / denom;
  const hairpin = mod.useHairpin
    ? Number.isFinite(mod.hairpinOpen)
      ? mod.hairpinOpen
      : hairpinOpenFraction(mod.deltaDeltaGFold ?? 0, mod.temperatureC ?? 37)
    : 1;
  return {
    id: mod.id,
    label: mod.label || "Modification",
    scaleK1,
    scaleB,
    hairpin,
    rAssoc,
    rPoly,
    rNick,
  };
}

export function applyEffectToParams(baseParams, effect) {
  const eff = effect || DEFAULT_EFFECT;
  const out = { ...baseParams };
  if (typeof out.k1 === "number") out.k1 = out.k1 * eff.scaleK1;
  if (typeof out.b === "number") out.b = out.b * eff.scaleB;
  if (typeof out.G === "number" && eff.hairpin !== 1) out.G = out.G * eff.hairpin;
  return out;
}
