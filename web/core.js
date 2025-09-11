// Core utilities for running physical-parameter simulations via WASM
// Exposes a small wrapper so multiple pages can share the same interface.

import init, { simulate_physical } from "./pkg/pp_osc_wasm.js";

let wasmReady = false;

export async function initWasm() {
  if (!wasmReady) {
    await init();
    wasmReady = true;
  }
}

/**
 * Run simulation with physical parameters (SI S3 Eq. 3,4) and mod_factor.
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

