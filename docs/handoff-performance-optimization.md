# Handoff: Performance Optimization Task

## Quick Start

You are tasked with optimizing heatmap and bifurcation diagram computation performance.

**Current Performance**: 0.3-15s for 20×15 grid (300 cells)
**Target Performance**: <1s for 20×15 grid, <10s for 100×100 grid

**Full Plan**: See `docs/performance-optimization-plan.md`

---

## Task: Implement Phase 1 (Rust Integration)

### Goal
Move period/amplitude detection from JavaScript to Rust to eliminate data transfer overhead and leverage Rust's performance.

**Expected Speedup**: 5-10x

### Steps

#### 1. Add Rust Function

Edit `crate/src/lib.rs`, add after `simulate_physical`:

```rust
#[wasm_bindgen]
pub fn simulate_and_evaluate(
    pol: f64, rec: f64, g: f64, k1: f64, k2: f64,
    k_n: f64, k_p: f64, b: f64, km_p: f64,
    n0: f64, p0: f64, mod_factor: f64,
    t_end_min: f64, dt_min: f64,
    metric: &str,        // "period", "amplitude"
    tail_pct: f64,       // 0-100
) -> f64 {
    // Reuse simulate_physical logic, but don't export arrays
    // Just return the metric value directly

    // TODO: Implement simulate_physical_internal that returns (Vec<f32>, Vec<f32>)
    // TODO: Call evaluate_amplitude or evaluate_period_peaks on P series
    // TODO: Return f64 result
}

fn evaluate_amplitude(series: &[f32], start_idx: usize) -> f64 {
    // TODO: Find min/max in series[start_idx..]
    // TODO: Return (max - min) as f64
}

fn evaluate_period_peaks(series: &[f32], start_idx: usize, dt: f64) -> f64 {
    // TODO: Find peaks using 3-point comparison
    // TODO: Calculate mean interval between peaks
    // TODO: Return period * dt
}
```

**Hints**:
- Refactor `simulate_physical` to extract core logic into `simulate_physical_internal`
- Peak detection: `series[i] > series[i-1] && series[i] > series[i+1]`
- Return `f64::NAN` if no oscillation detected

#### 2. Add FFT Support (Optional Enhancement)

Edit `crate/Cargo.toml`:

```toml
[dependencies]
wasm-bindgen = "0.2"
rustfft = "6.1"
num-complex = "0.4"
```

Add to `crate/src/lib.rs`:

```rust
fn evaluate_period_fft(series: &[f32], start_idx: usize, dt: f64) -> f64 {
    use rustfft::{FftPlanner, num_complex::Complex};

    // TODO: Remove DC component (subtract mean)
    // TODO: Run FFT
    // TODO: Find peak in power spectrum
    // TODO: Apply noise threshold (3× avg power)
    // TODO: Convert frequency bin to period
}
```

Modify `simulate_and_evaluate` to support `"period_fft"` metric.

#### 3. Update JavaScript Wrapper

Edit `web/core.js`:

```javascript
import init, { simulate_physical, simulate_and_evaluate } from "./pkg/pp_osc_wasm.js";

// Add new export
export function runSimulationAndEvaluate(params, metric, tailPct) {
  if (!wasmReady) throw new Error("WASM not initialized");

  const {
    pol = 3.7, rec = 32.5, G = 150,
    k1 = 0.002, k2 = 0.0031,
    kN = 0.021, kP = 0.0047,
    b = 0.000048, KmP = 34,
    N0 = 10, P0 = 10,
    mod_factor = 1.0,
    t_end_min = 3000, dt_min = 0.5,
  } = params || {};

  return simulate_and_evaluate(
    pol, rec, G, k1, k2, kN, kP, b, KmP, N0, P0,
    mod_factor, t_end_min, dt_min,
    metric, tailPct
  );
}
```

#### 4. Update Heatmap

Edit `web/heatmap/heatmap.js`:

Find this code (around line 162):
```javascript
const { P } = runSimulationPhysical(variant.params);
const tail = Math.max(3, Math.floor(P.length * (tailPct/100)));
const start = P.length - tail;
const val = evaluateMetric(P, start, metric, variant.params.dt_min);
```

Replace with:
```javascript
import { runSimulationAndEvaluate } from '../core.js';

// ...

const val = runSimulationAndEvaluate(variant.params, metric, tailPct);
```

#### 5. Build and Test

```bash
# Rebuild WASM
wasm-pack build --target web --release --out-dir web/pkg crate/

# Start dev server
python3 -m http.server --directory web 8080

# Test heatmap
# Open http://localhost:8080/heatmap/
# Run a 20×15 grid with metric="period"
# Verify: results match old implementation, but faster
```

#### 6. Benchmark

Add console timing:

```javascript
console.time('heatmap');
await runHeatmap();
console.timeEnd('heatmap');
```

**Success Criteria**:
- 20×15 grid completes in <3s (vs 3-15s before)
- Results match old implementation (±5% tolerance)
- No regression in accuracy

---

## Optional: Phase 2A (Web Workers)

If Phase 1 is successful, add parallelization with Web Workers.

### Steps

1. Create `web/heatmap/heatmap-worker.js`:

```javascript
import { initWasm, runSimulationAndEvaluate } from '../core.js';

self.onmessage = async function(e) {
  const { cells, metric, tailPct } = e.data;
  await initWasm();

  const results = cells.map(({ i, j, params }) => ({
    i, j,
    value: runSimulationAndEvaluate(params, metric, tailPct)
  }));

  self.postMessage({ results });
};
```

2. Add parallel runner to `web/heatmap/heatmap.js`:

```javascript
async function runHeatmapParallel() {
  const numWorkers = navigator.hardwareConcurrency || 4;
  const workers = Array.from({ length: numWorkers }, () =>
    new Worker('heatmap-worker.js', { type: 'module' })
  );

  // TODO: Distribute nx × ny cells across workers
  // TODO: Collect results
  // TODO: Fill grid
  // TODO: Cleanup workers
}
```

**Expected Speedup**: Additional 3-4x (total: 15-40x vs original)

---

## Troubleshooting

### WASM Build Errors

```bash
# Install wasm-pack if missing
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Clean rebuild
rm -rf crate/target crate/Cargo.lock
wasm-pack build --target web --release --out-dir web/pkg crate/
```

### Import Errors

Check `web/pkg/pp_osc_wasm.js` exports:
```javascript
export { simulate_physical, simulate_and_evaluate };
```

### Performance Not Improving

- Verify old code path is removed (no `evaluateMetric` call)
- Check browser DevTools Performance tab
- Ensure WASM is built in `--release` mode

### FFT Issues

If `rustfft` causes problems, skip FFT and use peak detection only.

---

## Testing Checklist

- [ ] WASM builds without errors
- [ ] `simulate_and_evaluate` callable from JavaScript
- [ ] Heatmap with metric="amplitude" works
- [ ] Heatmap with metric="period" works
- [ ] Results match old implementation (visual comparison)
- [ ] Performance improvement measured (console.time)
- [ ] Works on Chrome, Firefox, Safari
- [ ] No memory leaks (run 5+ times)

---

## Deliverables

1. **Code**: Modified Rust + JavaScript files
2. **Benchmark**: Console timing results (before/after)
3. **Commit**: Descriptive message with performance numbers

Example commit message:
```
Optimize heatmap with Rust-integrated metric evaluation

Moved period/amplitude detection from JavaScript to Rust to eliminate
data transfer overhead and leverage Rust's performance.

Performance (20×15 grid):
- Before: 3-15s (JS peak detection + FFT)
- After: 0.5-2s (Rust peak detection)
- Speedup: 6-10x

Implementation:
- Added simulate_and_evaluate() in crate/src/lib.rs
- Refactored simulate_physical to share core logic
- Updated web/core.js with runSimulationAndEvaluate
- Modified web/heatmap/heatmap.js to use new function

FFT support:
- Added rustfft dependency for evaluate_period_fft
- Metric "period_fft" available (optional)

Testing:
- ✅ Results match old implementation
- ✅ Works on Chrome, Firefox, Safari
- ✅ No memory leaks observed

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Questions?

- See `docs/performance-optimization-plan.md` for full context
- Check `docs/fft-period-detection.md` for FFT algorithm details
- Review `crate/src/lib.rs` for existing `simulate_physical` implementation

## Next Steps After Phase 1

If successful, consider:
- Phase 2A: Web Workers parallelization (easier)
- Phase 2B: WASM Threads with rayon (harder, requires server config)
- Phase 3: WebGPU compute shaders (experimental, Chrome only)

Good luck! 🚀
