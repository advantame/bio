# Regression & Performance Harness

A minimal Node-based harness lives in `tests/regression.js`. It exercises the following scenarios:

1. **Oscillation baseline** — runs `runSimulationPhysical` with SI defaults and computes the predator amplitude to confirm oscillations are present.
2. **Bifurcation sweep timing** — sweeps `G` across 60 samples using the “Birth of oscillations” preset and reports elapsed time plus peak amplitude.
3. **Heatmap sweep timing** — evaluates a `G × ΔΔG_assoc` grid (20×15) and records the runtime.

## Prerequisites

- Build the WASM bundle before running the harness:
  ```bash
  wasm-pack build --target web --release --out-dir web/pkg
  ```
- Node.js ≥ 18 (verified with v20.19). The script uses dynamic `import()` to load `web/core.js`.

## Running

```bash
node tests/regression.js
```

On success, JSON summaries are printed for each scenario. On failure (e.g., missing WASM bundle), the script reports the error so the harness can be wired into future CI workflows.

> **Note (2025-09-26):** When executed under the current Node-only environment the dynamic `import()` path fails with `fetch failed`. A lightweight `fetch` shim (or running under a bundler/`node --experimental-fetch`) is required before wiring into CI.

## Next Steps

- Extend the heatmap metric to compute period via peak detection (currently placeholder for perf check).
- Integrate into automated CI once a headless fetch shim for `core.js` is standardised.
