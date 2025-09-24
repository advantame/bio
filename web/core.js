// Core utilities for running physical-parameter simulations via WASM
// Exposes a small wrapper so multiple pages can share the same interface.

import init, {
  simulate_physical,
  map_modification,
  ModificationParams,
} from "./pkg/pp_osc_wasm.js";

let wasmReady = false;

export async function initWasm() {
  if (!wasmReady) {
    await init();
    wasmReady = true;
  }
}

/**
 * Run simulation with physical parameters (SI S3 Eq. 3,4) and optional `mod_factor`.
 * (UI no longer surfaces `mod_factor`; Workbench modifiers map to effective k1/b/G values.)
 * Returns { N: Float32Array, P: Float32Array } in nM units.
 */
export function runSimulationPhysical(params) {
  if (!wasmReady) throw new Error("WASM not initialized. Call initWasm() first.");

  const {
    pol = 1.0,
    rec = 1.0,
    G = 160.0,
    k1 = 1.0,
    k2 = 1.0,
    kN = 1.0,
    kP = 1.0,
    b = 0.0,
    KmP = 34.0,
    N0 = 10.0,
    P0 = 10.0,
    mod_factor = 1.0,
    t_end_min = 2600.0,
    dt_min = 1.0,
  } = params || {};

  const arr = simulate_physical(
    pol, rec, G, k1, k2, kN, kP, b, KmP, N0, P0, mod_factor, t_end_min, dt_min
  );

  const len = arr.length / 2 | 0;
  const N = arr.slice(0, len);
  const P = arr.slice(len);
  return { N, P };
}

/**
 * Compute k1' and b' given base {k1, b} and modification ratios.
 * `mod` fields: rAssoc, rPoly, rNick, useHairpin, deltaDeltaGFold.
 */
export function computeEffectiveParams(base, mod) {
  if (!wasmReady) throw new Error("WASM not initialized. Call initWasm() first.");
  const {
    rAssoc = 1.0,
    rPoly = 1.0,
    rNick = 1.0,
    useHairpin = false,
    deltaDeltaGFold = 0.0,
  } = mod || {};

  const params = new ModificationParams(rAssoc, rPoly, rNick);
  params.set_use_hairpin(Boolean(useHairpin));
  params.set_ddelta_g_fold(deltaDeltaGFold);

  const eff = map_modification(base.k1, base.b, params);
  const result = {
    k1Eff: eff.k1_eff,
    bEff: eff.b_eff,
  };
  eff.free();
  params.free();
  return result;
}
