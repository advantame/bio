# Performance Optimization Plan: Heatmap & Bifurcation

## Current State Analysis

### Performance Bottleneck

**Heatmap Grid Computation** (20×15 = 300 cells):
```
for each cell (i, j):
  1. Run ODE simulation (Rust/WASM) ← 既に高速
  2. Evaluate metric (JS)            ← ボトルネック
```

**Current Performance**:
- Peak counting: ~0.3s for 300 cells (~1ms/cell)
- FFT method: ~3-15s for 300 cells (~10-50ms/cell)

**Bottleneck**:
- データ転送オーバーヘッド (WASM ↔ JS)
- 周期検出がJavaScript実装
- 逐次処理（並列化なし）

### Architecture

```
JavaScript (UI)
    ↓ runSimulationPhysical(params)
Rust/WASM (simulate_physical)
    → Returns Float32Array [N..., P...]
    ↓
JavaScript (evaluateMetric)
    → Peak detection or FFT
    → Returns period/amplitude
```

## Phase 1: Rust Integration (Medium Term)

### Goal
周期検出をRustに統合し、データ転送を削減

### Implementation

#### 1.1 Add Metric Evaluation to Rust

**File**: `crate/src/lib.rs`

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn simulate_and_evaluate(
    pol: f64,
    rec: f64,
    g: f64,
    k1: f64,
    k2: f64,
    k_n: f64,
    k_p: f64,
    b: f64,
    km_p: f64,
    n0: f64,
    p0: f64,
    mod_factor: f64,
    t_end_min: f64,
    dt_min: f64,
    metric: &str,        // "period", "amplitude"
    tail_pct: f64,       // 0-100
) -> f64 {
    // Run simulation (reuse existing code)
    let (n_series, p_series) = simulate_physical_internal(
        pol, rec, g, k1, k2, k_n, k_p, b, km_p, n0, p0, mod_factor, t_end_min, dt_min
    );

    // Evaluate metric on P series
    let start_idx = ((p_series.len() as f64) * (1.0 - tail_pct / 100.0)) as usize;

    match metric {
        "amplitude" => evaluate_amplitude(&p_series, start_idx),
        "period" => evaluate_period_peaks(&p_series, start_idx, dt_min),
        "period_fft" => evaluate_period_fft(&p_series, start_idx, dt_min),
        _ => f64::NAN,
    }
}

fn evaluate_amplitude(series: &[f32], start_idx: usize) -> f64 {
    let mut min = f32::INFINITY;
    let mut max = f32::NEG_INFINITY;
    for &v in &series[start_idx..] {
        if v < min { min = v; }
        if v > max { max = v; }
    }
    (max - min) as f64
}

fn evaluate_period_peaks(series: &[f32], start_idx: usize, dt: f64) -> f64 {
    let mut peaks = Vec::new();
    for i in (start_idx + 1)..(series.len() - 1) {
        if series[i] > series[i - 1] && series[i] > series[i + 1] {
            peaks.push(i);
        }
    }

    if peaks.len() < 2 {
        return f64::NAN;
    }

    let sum: usize = peaks.windows(2).map(|w| w[1] - w[0]).sum();
    let mean_step = sum as f64 / (peaks.len() - 1) as f64;
    mean_step * dt
}

fn evaluate_period_fft(series: &[f32], start_idx: usize, dt: f64) -> f64 {
    // Use rustfft crate for efficient FFT
    use rustfft::{FftPlanner, num_complex::Complex};

    let n = series.len() - start_idx;
    if n < 4 { return f64::NAN; }

    // Remove mean
    let mean: f32 = series[start_idx..].iter().sum::<f32>() / n as f32;
    let mut signal: Vec<Complex<f32>> = series[start_idx..]
        .iter()
        .map(|&v| Complex::new(v - mean, 0.0))
        .collect();

    // FFT
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(n);
    fft.process(&mut signal);

    // Power spectrum
    let power: Vec<f32> = signal[1..n/2]
        .iter()
        .map(|c| c.norm_sqr())
        .collect();

    // Find peak
    let max_k = power.iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
        .map(|(k, _)| k + 1)
        .unwrap_or(1);

    // Noise threshold
    let avg_power: f32 = power.iter().sum::<f32>() / power.len() as f32;
    if power[max_k - 1] < 3.0 * avg_power {
        return f64::NAN;
    }

    // Convert to period
    (n as f64 * dt) / max_k as f64
}
```

#### 1.2 Add rustfft Dependency

**File**: `crate/Cargo.toml`

```toml
[dependencies]
wasm-bindgen = "0.2"
rustfft = "6.1"
num-complex = "0.4"
```

#### 1.3 Update JavaScript Wrapper

**File**: `web/core.js`

```javascript
import init, { simulate_physical, simulate_and_evaluate } from "./pkg/pp_osc_wasm.js";

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

#### 1.4 Update Heatmap to Use New Function

**File**: `web/heatmap/heatmap.js`

```javascript
// Before
const { P } = runSimulationPhysical(variant.params);
const tail = Math.max(3, Math.floor(P.length * (tailPct/100)));
const start = P.length - tail;
const val = evaluateMetric(P, start, metric, variant.params.dt_min);

// After
const val = runSimulationAndEvaluate(variant.params, metric, tailPct);
```

**Expected Speedup**: 5-10x (eliminates data transfer, uses optimized Rust)

---

## Phase 2: Rust Parallel Execution (Advanced)

### Goal
並列計算でヒートマップグリッド全体を高速化

### Option A: Web Workers (Easier)

**File**: `web/heatmap/heatmap-worker.js`

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

**File**: `web/heatmap/heatmap.js`

```javascript
async function runHeatmapParallel() {
  const numWorkers = navigator.hardwareConcurrency || 4;
  const workers = Array.from({ length: numWorkers }, () =>
    new Worker('heatmap-worker.js', { type: 'module' })
  );

  // Distribute cells across workers
  const cellsPerWorker = Math.ceil((nx * ny) / numWorkers);
  const promises = workers.map((worker, idx) => {
    const start = idx * cellsPerWorker;
    const end = Math.min(start + cellsPerWorker, nx * ny);
    const cells = [];

    for (let k = start; k < end; k++) {
      const i = k % nx;
      const j = Math.floor(k / nx);
      const xVal = xMin + (xMax - xMin) * (i / (nx - 1));
      const yVal = yMin + (yMax - yMin) * (j / (ny - 1));
      const params = buildParams(xVal, yVal);
      cells.push({ i, j, params });
    }

    return new Promise((resolve) => {
      worker.onmessage = (e) => resolve(e.data.results);
      worker.postMessage({ cells, metric, tailPct });
    });
  });

  const results = (await Promise.all(promises)).flat();

  // Fill grid
  for (const { i, j, value } of results) {
    grid[j * nx + i] = value;
  }

  // Cleanup
  workers.forEach(w => w.terminate());
}
```

**Expected Speedup**: 3-4x on quad-core CPU (total: 15-40x vs current)

### Option B: Rayon (WASM Threads, Harder)

**Requirements**:
- `wasm-bindgen-rayon` for thread support
- Browser must support SharedArrayBuffer
- Requires specific HTTP headers:
  ```
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```

**File**: `crate/Cargo.toml`

```toml
[dependencies]
wasm-bindgen = "0.2"
wasm-bindgen-rayon = "1.0"
rayon = "1.7"
rustfft = "6.1"
```

**File**: `crate/src/lib.rs`

```rust
use rayon::prelude::*;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn compute_heatmap_grid(
    params_json: &str,  // JSON with base params
    x_param: &str,
    x_min: f64, x_max: f64, nx: usize,
    y_param: &str,
    y_min: f64, y_max: f64, ny: usize,
    metric: &str,
    tail_pct: f64,
) -> Vec<f64> {
    // Parse base params
    let base_params: Params = serde_json::from_str(params_json).unwrap();

    // Parallel grid computation
    (0..ny).into_par_iter()
        .flat_map(|j| {
            let y_val = y_min + (y_max - y_min) * (j as f64 / (ny - 1) as f64);

            (0..nx).into_par_iter().map(move |i| {
                let x_val = x_min + (x_max - x_min) * (i as f64 / (nx - 1) as f64);
                let mut params = base_params.clone();
                set_param(&mut params, x_param, x_val);
                set_param(&mut params, y_param, y_val);

                simulate_and_evaluate_params(&params, metric, tail_pct)
            }).collect::<Vec<_>>()
        })
        .collect()
}
```

**Expected Speedup**: 6-8x on quad-core CPU (total: 30-80x vs current)

**Deployment Note**: Requires server configuration changes

---

## Phase 3: WebGPU Parallel Computation (Experimental)

### Goal
GPU並列実行で大規模グリッド（100×100）を高速化

### Browser Support
- ✅ Chrome 113+ (May 2023)
- ✅ Edge 113+
- 🚧 Firefox (behind flag)
- ❌ Safari (in development)

### Architecture

```
CPU (JavaScript)
  → Generate grid parameters
  → Upload to GPU
GPU (Compute Shader)
  → Run 10,000 parallel ODE simulations
  → Detect peaks/calculate metrics
  → Write results to buffer
CPU (JavaScript)
  → Download results
  → Render heatmap
```

### Implementation

#### 3.1 GPU Compute Shader (WGSL)

**File**: `web/gpu/heatmap-shader.wgsl`

```wgsl
// Heatmap compute shader (RK4 + period detection)
struct Params {
    pol: f32,
    rec: f32,
    G: f32,
    k1: f32,
    k2: f32,
    kN: f32,
    kP: f32,
    b: f32,
    KmP: f32,
    N0: f32,
    P0: f32,
    dt: f32,
    steps: u32,
    tail_pct: f32,
}

@group(0) @binding(0) var<storage, read> params: array<Params>;
@group(0) @binding(1) var<storage, read_write> results: array<f32>;

// RK4 ODE right-hand side
fn rhs_physical(n: f32, p: f32, params: Params) -> vec2<f32> {
    let growth = params.k1 * params.pol * params.G * (n / (1.0 + params.b * params.G * n));
    let predation = params.k2 * params.pol * n * p;
    let deg_n = params.rec * params.kN * (n / (1.0 + p / params.KmP));
    let deg_p = params.rec * params.kP * (p / (1.0 + p / params.KmP));

    return vec2<f32>(
        growth - predation - deg_n,
        predation - deg_p
    );
}

// RK4 step
fn rk4_step(n: f32, p: f32, dt: f32, params: Params) -> vec2<f32> {
    let k1 = rhs_physical(n, p, params);
    let k2 = rhs_physical(n + 0.5 * dt * k1.x, p + 0.5 * dt * k1.y, params);
    let k3 = rhs_physical(n + 0.5 * dt * k2.x, p + 0.5 * dt * k2.y, params);
    let k4 = rhs_physical(n + dt * k3.x, p + dt * k3.y, params);

    return vec2<f32>(
        n + (dt / 6.0) * (k1.x + 2.0 * k2.x + 2.0 * k3.x + k4.x),
        p + (dt / 6.0) * (k1.y + 2.0 * k2.y + 2.0 * k3.y + k4.y)
    );
}

// Peak detection and period calculation
fn detect_period(p_series: array<f32, 6000>, n: u32, start_idx: u32, dt: f32) -> f32 {
    var peaks: array<u32, 100>;
    var num_peaks: u32 = 0u;

    for (var i = start_idx + 1u; i < n - 1u; i = i + 1u) {
        if (p_series[i] > p_series[i - 1u] && p_series[i] > p_series[i + 1u]) {
            if (num_peaks < 100u) {
                peaks[num_peaks] = i;
                num_peaks = num_peaks + 1u;
            }
        }
    }

    if (num_peaks < 2u) {
        return 0.0; // NaN equivalent
    }

    var sum: u32 = 0u;
    for (var i = 1u; i < num_peaks; i = i + 1u) {
        sum = sum + (peaks[i] - peaks[i - 1u]);
    }

    let mean_step = f32(sum) / f32(num_peaks - 1u);
    return mean_step * dt;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= arrayLength(&params)) {
        return;
    }

    let p = params[idx];
    var n = p.N0;
    var pred = p.P0;

    // Preallocate P series (max 6000 steps)
    var p_series: array<f32, 6000>;

    // Run simulation
    for (var i = 0u; i < p.steps; i = i + 1u) {
        let next = rk4_step(n, pred, p.dt, p);
        n = max(next.x, 0.0);
        pred = max(next.y, 0.0);

        if (i < 6000u) {
            p_series[i] = pred;
        }
    }

    // Evaluate metric
    let start_idx = u32(f32(p.steps) * (1.0 - p.tail_pct / 100.0));
    let period = detect_period(p_series, p.steps, start_idx, p.dt);

    results[idx] = period;
}
```

#### 3.2 JavaScript WebGPU Wrapper

**File**: `web/gpu/heatmap-gpu.js`

```javascript
export class HeatmapGPU {
  constructor() {
    this.device = null;
    this.pipeline = null;
  }

  async init() {
    if (!navigator.gpu) {
      throw new Error('WebGPU not supported');
    }

    const adapter = await navigator.gpu.requestAdapter();
    this.device = await adapter.requestDevice();

    // Load shader
    const shaderCode = await fetch('gpu/heatmap-shader.wgsl').then(r => r.text());
    const shaderModule = this.device.createShaderModule({ code: shaderCode });

    // Create compute pipeline
    this.pipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });
  }

  async computeHeatmap(gridParams, baseParams, metric, tailPct) {
    const { nx, ny, xMin, xMax, yMin, yMax, xParam, yParam } = gridParams;
    const numCells = nx * ny;

    // Build parameter array
    const params = new Float32Array(numCells * 16); // 16 floats per Params struct
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        const xVal = xMin + (xMax - xMin) * (i / (nx - 1));
        const yVal = yMin + (yMax - yMin) * (j / (ny - 1));

        const cellParams = { ...baseParams };
        cellParams[xParam] = xVal;
        cellParams[yParam] = yVal;

        // Pack into Float32Array (struct layout)
        const offset = idx * 16;
        params[offset + 0] = cellParams.pol;
        params[offset + 1] = cellParams.rec;
        params[offset + 2] = cellParams.G;
        params[offset + 3] = cellParams.k1;
        params[offset + 4] = cellParams.k2;
        params[offset + 5] = cellParams.kN;
        params[offset + 6] = cellParams.kP;
        params[offset + 7] = cellParams.b;
        params[offset + 8] = cellParams.KmP;
        params[offset + 9] = cellParams.N0;
        params[offset + 10] = cellParams.P0;
        params[offset + 11] = cellParams.dt_min;
        params[offset + 12] = cellParams.t_end_min / cellParams.dt_min; // steps
        params[offset + 13] = tailPct;
      }
    }

    // Create GPU buffers
    const paramsBuffer = this.device.createBuffer({
      size: params.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(paramsBuffer, 0, params);

    const resultsBuffer = this.device.createBuffer({
      size: numCells * 4, // 4 bytes per f32
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: resultsBuffer } },
      ],
    });

    // Submit compute pass
    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(numCells / 64));
    passEncoder.end();

    // Copy results to readable buffer
    const readBuffer = this.device.createBuffer({
      size: numCells * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    commandEncoder.copyBufferToBuffer(resultsBuffer, 0, readBuffer, 0, numCells * 4);

    this.device.queue.submit([commandEncoder.finish()]);

    // Read results
    await readBuffer.mapAsync(GPUMapMode.READ);
    const results = new Float32Array(readBuffer.getMappedRange()).slice();
    readBuffer.unmap();

    // Cleanup
    paramsBuffer.destroy();
    resultsBuffer.destroy();
    readBuffer.destroy();

    return results;
  }
}
```

#### 3.3 Integration

**File**: `web/heatmap/heatmap.js`

```javascript
import { HeatmapGPU } from '../gpu/heatmap-gpu.js';

let gpuCompute = null;

async function runHeatmapGPU() {
  if (!gpuCompute) {
    gpuCompute = new HeatmapGPU();
    await gpuCompute.init();
  }

  const results = await gpuCompute.computeHeatmap(
    { nx, ny, xMin, xMax, yMin, yMax, xParam, yParam },
    baseParams,
    metric,
    tailPct
  );

  // Fill grid from flat array
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      grid[j * nx + i] = results[j * nx + i];
    }
  }
}
```

**Expected Performance**:
- 100×100 grid (10,000 cells): 5-10 seconds
- 50×50 grid (2,500 cells): 1-2 seconds
- **Speedup**: 50-100x vs current implementation

### Limitations

1. **Browser Support**: Chrome 113+ only
2. **Shader Complexity**: WGSL is low-level, debugging difficult
3. **Memory Limits**: GPU buffer size constraints
4. **Precision**: GPU uses f32 (vs f64 in CPU)
5. **Deployment**: Requires HTTPS

---

## Performance Comparison Summary

| Method | 20×15 Grid | 100×100 Grid | Complexity | Browser Support |
|--------|-----------|--------------|------------|-----------------|
| **Current (JS)** | 0.3-15s | 80-400s | Simple | All |
| **Rust Integration** | 0.05-1.5s | 15-40s | Medium | All |
| **Rust + Web Workers** | 0.015-0.4s | 4-10s | Medium | All |
| **Rust + WASM Threads** | 0.01-0.2s | 2-5s | Hard | Most (SharedArrayBuffer) |
| **WebGPU** | 0.05-0.1s | 5-10s | Very Hard | Chrome 113+ |

---

## Recommended Roadmap

### Immediate (Phase 1)
**Rust Integration**: 5-10x speedup, works everywhere
- Add `simulate_and_evaluate` to Rust
- Use `rustfft` for FFT
- Update heatmap.js to call new function

### Short Term (Phase 2A)
**Web Workers**: Additional 3-4x speedup (total: 15-40x)
- Simple implementation
- No special browser requirements
- Good parallelization on multi-core CPUs

### Long Term (Phase 3)
**WebGPU**: 50-100x speedup for large grids
- Experimental feature
- Limited browser support
- Best for 100×100+ grids
- Requires HTTPS deployment

### Alternative (Phase 2B)
**WASM Threads**: 30-80x speedup
- Best performance on all browsers that support it
- Requires server configuration (HTTP headers)
- Good middle ground between Web Workers and WebGPU

---

## Risk Assessment

| Phase | Risk | Mitigation |
|-------|------|------------|
| Rust Integration | Compilation errors | Test incrementally, reuse existing code |
| Web Workers | Complexity | Start with simple implementation |
| WASM Threads | Browser compatibility | Feature detection, fallback to Web Workers |
| WebGPU | Limited browser support | Progressive enhancement, CPU fallback |

---

## Testing Strategy

1. **Unit Tests**: Test Rust functions independently
2. **Benchmark**: Compare each phase vs baseline
3. **Accuracy**: Verify results match current implementation
4. **Browser Tests**: Test on Chrome, Firefox, Safari, Edge
5. **Grid Sizes**: Test 10×10, 20×15, 50×50, 100×100

---

## File Modifications Summary

### Phase 1 (Rust Integration)
- `crate/Cargo.toml`: Add rustfft dependency
- `crate/src/lib.rs`: Add `simulate_and_evaluate`, `evaluate_period_*`
- `web/core.js`: Export `runSimulationAndEvaluate`
- `web/heatmap/heatmap.js`: Replace `evaluateMetric` call

### Phase 2A (Web Workers)
- `web/heatmap/heatmap-worker.js`: NEW worker script
- `web/heatmap/heatmap.js`: Add `runHeatmapParallel`

### Phase 2B (WASM Threads)
- `crate/Cargo.toml`: Add rayon, wasm-bindgen-rayon
- `crate/src/lib.rs`: Add `compute_heatmap_grid`
- Server config: Add CORS headers

### Phase 3 (WebGPU)
- `web/gpu/heatmap-shader.wgsl`: NEW compute shader
- `web/gpu/heatmap-gpu.js`: NEW WebGPU wrapper
- `web/heatmap/heatmap.js`: Add `runHeatmapGPU`

---

## Success Criteria

- ✅ Heatmap computation completes in <1s for 20×15 grid
- ✅ No accuracy regression vs current implementation
- ✅ Works on Chrome, Firefox, Safari, Edge (Phase 1 & 2A)
- ✅ Graceful degradation for unsupported browsers
- ✅ Code is maintainable and well-documented
