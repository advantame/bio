# DNA Predator-Prey Oscillator — Interactive Simulator & 3D Heatmap Guide

_Last updated: 2025-10-11_

## Table of Contents
1. [Overview](#overview)
2. [Interactive Simulator](#interactive-simulator)
3. [3D Heatmap Visualization](#3d-heatmap-visualization)
4. [Technical Implementation](#technical-implementation)
5. [Performance Optimization](#performance-optimization)
6. [Usage Examples](#usage-examples)

---

## Overview

This document describes the two core visualization tools in the PP Oscillation Simulation App:

1. **Interactive Simulator** (`/web/simulator/`) — Real-time time-series and phase portrait visualization
2. **3D Heatmap** (`/web/heatmap/`) — Parameter sweep visualization with video generation

Both tools use Rust/WebAssembly for high-performance computation and HTML5 Canvas for rendering.

### Mathematical Model

The simulator implements the chemical predator-prey system described in Supplementary Information Section S3:

$$
\frac{dN}{dt} = k_1 \cdot \text{pol} \cdot G \frac{N}{1+b \cdot G \cdot N} - k_2 \cdot \text{pol} \cdot N \cdot P - \text{rec} \cdot k_N \frac{N}{1+\frac{P}{K_{m,P}}}
$$

$$
\frac{dP}{dt} = k_2 \cdot \text{pol} \cdot N \cdot P - \text{rec} \cdot k_P \frac{P}{1+\frac{P}{K_{m,P}}}
$$

Where:
- **N** = Prey concentration [nM]
- **P** = Predator concentration [nM]
- **G** = Template concentration [nM]
- **pol** = Bst polymerase concentration [nM] (default: 3.7 nM)
- **rec** = ttRecJ exonuclease concentration [nM] (default: 32.5 nM)
- **k₁, k₂, kₙ, kₚ, b, Kₘ,ₚ** = Kinetic parameters

The system is integrated using **4th-order Runge-Kutta (RK4)** with fixed time steps in Rust/WASM.

---

## Interactive Simulator

**Location:** `/web/simulator/`
**Files:** `simulator.js`, `simulator.html`

### Features

#### 1. Dual Visualization
The simulator displays two synchronized plots:

- **Time Series** (left) — N(t) and P(t) over time
  - X-axis: time [min]
  - Y-axis: concentration [nM]
  - Prey (orange) and Predator (teal) traces

- **Phase Portrait** (right) — N vs P trajectory
  - X-axis: Prey [nM]
  - Y-axis: Predator [nM]
  - Shows limit cycle behavior and fixed points

#### 2. Real-Time Parameter Control

All parameters can be adjusted via sliders with live updates:

| Parameter | Symbol | Default | Range | Description |
|-----------|--------|---------|-------|-------------|
| Polymerase | pol | 3.7 nM | 0–20 | Bst polymerase concentration |
| Exonuclease | rec | 32.5 nM | 0–100 | ttRecJ concentration |
| Template | G | 150 nM | 0–500 | Template concentration (controls oscillation period) |
| Association ratio | r_assoc | 1.0 | 0.05–20 | Affects k₁ and b (amino acid modifications) |
| Nickase ratio | r_nick | 1.0 | 0.05–20 | Affects k₁ and b (enzyme titration) |
| Polymerase ratio | r_poly | 1.0 | 0.05–20 | Affects k₁ only (ETSSB modulation) |
| Predation rate | k₂ | 0.0031 | 0–0.01 | Prey → Predator conversion |
| Prey degradation | kₙ | 0.0210 | 0–0.1 | First-order degradation rate |
| Predator degradation | kₚ | 0.0047 | 0–0.05 | First-order degradation rate |
| Michaelis constant | Kₘ,ₚ | 34 nM | 1–100 | Saturation constant for degradation |
| Initial prey | N₀ | 10 nM | 0–100 | Starting prey concentration |
| Initial predator | P₀ | 10 nM | 0–100 | Starting predator concentration |
| Simulation time | t_end | 2000 min | 100–5000 | Total simulation time |
| Time step | dt | 0.5 min | 0.1–2.0 | RK4 integration step |

#### 3. Baseline vs Active Comparison

The simulator supports **modification cards** that enable overlay comparison:

- **Baseline** (orange/teal solid lines) — Reference condition
- **Active** (blue solid lines) — Current modification
- **Overlays** (purple/green dashed lines) — Additional comparisons

Color scheme:
```javascript
BASELINE_COLORS = { prey: '#f97316', pred: '#2c7a7b' }
ACTIVE_COLORS   = { prey: '#2563eb', pred: '#0ea5e9' }
OVERLAY_PALETTE = [
  { prey: '#9333ea', pred: '#c084fc', lineDash: [6, 4] },
  { prey: '#22c55e', pred: '#0f766e', lineDash: [6, 4] },
  ...
]
```

#### 4. Automatic Axis Scaling

Both plots use "nice" axis ticks with automatic range detection:

```javascript
function niceAxis(min, max, maxTicks=6) {
  // Finds human-readable tick intervals (1, 2, 5, 10, ...)
  // Returns { min, max, step, ticks }
}
```

This ensures:
- No overlapping labels
- Round numbers for tick values
- Consistent spacing

---

## 3D Heatmap Visualization

**Location:** `/web/heatmap/`
**Files:** `heatmap.js`, `heatmap-worker.js`, `frame-storage.js`

### Overview

The 3D heatmap performs **parameter sweeps** over 2D or 3D grids and visualizes metrics like oscillation period or amplitude. It supports:

- **2D mode**: Static heatmap (e.g., G vs ΔΔG_assoc)
- **3D mode**: Time-axis animation → video export

### Key Features

#### 1. Parameter Sweep Configuration

Users configure up to 3 axes:

| Axis | Parameter Options | Description |
|------|------------------|-------------|
| **X-axis** | G, N₀, P₀, pol, rec, k₁, assoc_ddg, assoc_r, poly_r, nick_r | Horizontal parameter |
| **Y-axis** | (same as X-axis) | Vertical parameter |
| **T-axis** (optional) | (same as X-axis) | Time dimension (creates video) |

Example: **G vs ΔΔG_assoc heatmap**
- X = Template concentration (80–250 nM, 20 steps)
- Y = ΔΔG_assoc (-5 to +5 kcal/mol, 15 steps)
- Metric = oscillation period [min]
- Total simulations = 20 × 15 = 300

#### 2. Metrics

Two evaluation metrics are supported:

##### Period Detection
```javascript
function evaluatePeriodPeaks(series, startIdx, dt) {
  // 1. Find local maxima (peaks) in time series
  const peaks = [];
  for (let i = startIdx+1; i < len-1; i++) {
    if (series[i] > series[i-1] && series[i] > series[i+1]) {
      peaks.push(i);
    }
  }

  // 2. Average inter-peak interval
  const meanStep = sum(peaks[i] - peaks[i-1]) / (peaks.length - 1);
  return meanStep * dt;
}
```

**Optional FFT-based period detection** (experimental):
- Uses Discrete Fourier Transform (DFT)
- Finds dominant frequency in power spectrum
- More robust for noisy/irregular oscillations
- Enabled via checkbox (`useFFT`)

##### Amplitude
```javascript
function evaluateAmplitude(series, startIdx) {
  // Maximum - minimum in tail region
  return max(series[startIdx:]) - min(series[startIdx:]);
}
```

#### 3. Color Mapping

Heatmap uses the **Turbo colormap** (Google AI):

```javascript
function turbo(t) {
  // t ∈ [0,1] → [r,g,b] ∈ [0,255]
  // Perceptually uniform, high contrast
  const r = 34.61 + t * (1172.33 - t * (...)); // Polynomial approximation
  const g = 23.31 + t * (557.33 + t * (...));
  const b = 27.2 + t * (3211.1 - t * (...));
  return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
}
```

Color scale:
- **Blue** (low values) → **Cyan** → **Green** → **Yellow** → **Red** (high values)
- Legend shows min/max values with units

#### 4. 3D Video Generation

When T-axis is enabled, the heatmap becomes a **video**:

**Workflow:**
1. Compute 3D grid: `nx × ny × nt` simulations
2. Store frames in IndexedDB (memory-optimized)
3. Render each frame as 2D heatmap with timeline indicator
4. Encode to video using selected format (WebM or MP4)
5. Display in `<video>` player with controls

**Video Format Options:**

##### WebM (Default)
- **Codec:** VP9
- **Method:** MediaRecorder API (browser-native)
- **Pros:**
  - No additional library loading
  - Lightweight and fast
  - Small file size (2-3 MB for 150 frames)
- **Cons:**
  - Variable frame rate (25-35 FPS typical)
  - Video duration may vary slightly (±0.3 seconds)
- **Best for:** Quick previews, general visualization

##### MP4 (High-Precision)
- **Codec:** H.264
- **Method:** FFmpeg.wasm (@ffmpeg/ffmpeg 0.11.6 + @ffmpeg/core-st 0.11.1)
- **Pros:**
  - Fixed frame rate (CFR guaranteed)
  - Precise video duration (±0 seconds)
  - Universal compatibility (all platforms)
  - **No special HTTP headers required** (uses single-threaded core)
- **Cons:**
  - Initial load time (~10 seconds for 25 MB library)
  - Slower encoding (~20% slower than WebM)
  - Single-threaded execution (no multi-core speedup)
- **Best for:** Research publications, presentations, precise timing requirements
- **Technical details:**
  - Uses `@ffmpeg/core-st` (single-threaded) instead of `@ffmpeg/core` (multi-threaded)
  - Avoids SharedArrayBuffer requirement (no COOP/COEP headers needed)
  - Works with standard HTTP servers (python -m http.server, etc.)

**Video settings:**
- Duration: configurable (1–60 seconds)
- Frame rate: calculated as `T-axis steps ÷ video duration`
  - Example: 150 frames ÷ 5 seconds = 30 FPS
- Quality: High (CRF 18 for MP4, 5 Mbps for WebM)

**FPS Validation (MP4 mode only):**

The interface provides real-time validation to ensure optimal FPS settings:

- **✅ Green:** Integer FPS within 1-60 range (optimal)
  - Example: 150 frames / 5 sec = 30 FPS
- **⚠️ Yellow:** Non-integer FPS (frame interpolation may occur)
  - Suggests nearest integer FPS setting
  - Example: 143 frames / 5 sec = 28.6 FPS → suggests 150 frames (30 FPS)
- **⚠️ Red:** FPS exceeds 60 (browser limitation)
  - Suggests maximum 60 FPS equivalent
  - Example: 400 frames / 5 sec = 80 FPS → suggests 300 frames (60 FPS)
- **ℹ️ Blue:** Low FPS (<10) warning
  - Video may appear choppy

**Recommended FPS settings for MP4:**

| Video Duration | Recommended T-axis Steps | Resulting FPS | Quality |
|----------------|-------------------------|---------------|---------|
| 5 seconds | 150 | 30 | ⭐⭐⭐ Excellent |
| 5 seconds | 100 | 20 | ⭐⭐⭐ Excellent |
| 5 seconds | 75 | 15 | ⭐⭐ Good |
| 10 seconds | 300 | 30 | ⭐⭐⭐ Excellent |
| 2 seconds | 60 | 30 | ⭐⭐⭐ Excellent |

**Timeline indicator:**
- Horizontal bar at top shows T-axis range
- Red triangle marks current T value
- Updates every frame during playback

---

## Technical Implementation

### Architecture

```
User Input
    ↓
JavaScript (parameter preparation)
    ↓
Rust/WASM (ODE integration via RK4)
    ↓
Web Workers (parallel execution, 4+ workers)
    ↓
IndexedDB (frame storage, memory optimization)
    ↓
Canvas Rendering (interactive visualization)
```

### Core Components

#### 1. WASM Integration (`/web/core.js`)

```javascript
import init, { simulate_physical } from './pkg/pp_osc_wasm.js';

export async function initWasm() {
  await init(); // Load WASM module
}

export function runSimulationPhysical(params) {
  const { pol, rec, G, k1, k2, kN, kP, b, KmP, N0, P0, t_end_min, dt_min } = params;

  // Call Rust function
  const result = simulate_physical(
    pol, rec, G, k1, k2, kN, kP, b, KmP, N0, P0,
    t_end_min, dt_min, 1.0 // mod_factor deprecated (always 1.0)
  );

  // Parse concatenated [N_series..., P_series...]
  const nPoints = Math.floor((t_end_min / dt_min) + 1);
  const N = result.slice(0, nPoints);
  const P = result.slice(nPoints, 2 * nPoints);

  return { N, P };
}
```

#### 2. Rust Implementation (`/crate/src/lib.rs`)

```rust
#[wasm_bindgen]
pub fn simulate_physical(
    pol: f64, rec: f64, G: f64, k1: f64, k2: f64,
    kN: f64, kP: f64, b: f64, KmP: f64,
    N0: f64, P0: f64, t_end_min: f64, dt_min: f64,
    _mod_factor: f64 // Deprecated, kept for compatibility
) -> Vec<f64> {
    let n_steps = ((t_end_min / dt_min) as usize) + 1;
    let mut N_series = vec![0.0; n_steps];
    let mut P_series = vec![0.0; n_steps];

    let mut N = N0;
    let mut P = P0;
    N_series[0] = N;
    P_series[0] = P;

    // RK4 integration loop
    for step in 1..n_steps {
        // Compute k₁, k₂, k₃, k₄ for both N and P
        let (k1N, k1P) = derivatives(N, P, ...);
        let (k2N, k2P) = derivatives(N + 0.5*dt*k1N, P + 0.5*dt*k1P, ...);
        let (k3N, k3P) = derivatives(N + 0.5*dt*k2N, P + 0.5*dt*k2P, ...);
        let (k4N, k4P) = derivatives(N + dt*k3N, P + dt*k3P, ...);

        // Weighted average
        N += (dt / 6.0) * (k1N + 2.0*k2N + 2.0*k3N + k4N);
        P += (dt / 6.0) * (k1P + 2.0*k2P + 2.0*k3P + k4P);

        // Clamp to non-negative
        N = N.max(0.0);
        P = P.max(0.0);

        N_series[step] = N;
        P_series[step] = P;
    }

    // Concatenate [N..., P...]
    N_series.extend(P_series);
    N_series
}

fn derivatives(N: f64, P: f64, ...) -> (f64, f64) {
    let dNdt = k1 * pol * G * N / (1.0 + b * G * N)
             - k2 * pol * N * P
             - rec * kN * N / (1.0 + P / KmP);

    let dPdt = k2 * pol * N * P
             - rec * kP * P / (1.0 + P / KmP);

    (dNdt, dPdt)
}
```

#### 3. Web Worker Parallelization (`/web/heatmap/heatmap-worker.js`)

```javascript
importScripts('../pkg/pp_osc_wasm.js');

let wasmReady = false;

self.onmessage = async (e) => {
  const { workerId, cells, metric, tailPct } = e.data;

  // Initialize WASM once per worker
  if (!wasmReady) {
    await wasm_bindgen('../pkg/pp_osc_wasm_bg.wasm');
    wasmReady = true;
  }

  const results = [];

  // Process each cell
  for (const cell of cells) {
    const { i, j, t, params, cellIndex } = cell;

    // Run simulation
    const result = wasm_bindgen.simulate_physical(...);

    // Evaluate metric
    const value = evaluateMetric(result, metric, tailPct);

    results.push({ i, j, t, value, cellIndex });
  }

  // Send results back to main thread
  self.postMessage({ workerId, results });
};
```

**Parallel execution workflow:**
1. Main thread creates 4+ workers (one per CPU core)
2. Divides parameter grid into chunks
3. Distributes chunks across workers via `postMessage()`
4. Workers compute simulations independently
5. Main thread collects results and updates progress bar
6. Results fill 2D grid: `grid[j*nx + i] = value`

---

## Performance Optimization

### Memory Optimization (3D Heatmap)

**Problem:** Large 3D grids (50×50×50 = 125,000 simulations) caused browser crashes due to memory exhaustion.

**Solution:** Streaming architecture with IndexedDB caching.

#### Before (Memory-Intensive)
```javascript
// Hold all cells in memory (25 MB!)
const allCells = [];
for (let t = 0; t < nt; t++) {
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      allCells.push({ i, j, t, params }); // 125k objects
    }
  }
}

// Hold all frames in memory (500 KB)
const frames = [];
for (let t = 0; t < nt; t++) {
  frames.push({ grid: new Float32Array(nx * ny), tVal });
}
```

#### After (Memory-Efficient)
```javascript
// Generate cells on-demand (lazy evaluation)
function* generateCells() {
  for (let t = 0; t < nt; t++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        yield { i, j, t, params }; // No memory cost!
      }
    }
  }
}

// Process in chunks
const CHUNK_SIZE = 10000;
let chunk = [];
for (const cell of generateCells()) {
  chunk.push(cell);
  if (chunk.length >= CHUNK_SIZE) {
    await processChunk(chunk, ...);
    chunk.length = 0;
    forceGCHint(); // Hint garbage collection
  }
}

// Store completed frames in IndexedDB (disk, not RAM)
if (frame.cellsCompleted >= frame.totalCellsInFrame) {
  await storage.storeFrame(t, grid, tVal);
  grid.fill(0);
  grid = null; // Release memory
}
```

#### IndexedDB Storage Layer (`/web/heatmap/frame-storage.js`)

```javascript
class FrameStorage {
  async init() {
    // Open IndexedDB database
    this.db = await openDB('HeatmapFrameDB', 1, {
      upgrade(db) {
        db.createObjectStore('frames', { keyPath: 'frameIndex' });
      }
    });
  }

  async storeFrame(frameIndex, grid, tVal) {
    // Store Float32Array to disk
    await this.db.put('frames', {
      frameIndex,
      grid: grid.slice(), // Clone array
      tVal,
      sessionId: this.sessionId
    });
  }

  async getFrame(frameIndex) {
    // Load from disk (one frame at a time)
    const record = await this.db.get('frames', frameIndex);
    return { grid: record.grid, tVal: record.tVal };
  }

  async *getAllFrames(totalFrames) {
    // Async iterator for streaming
    for (let i = 0; i < totalFrames; i++) {
      yield await this.getFrame(i);
    }
  }

  async computeGlobalRange(totalFrames) {
    // Stream-based min/max (no memory allocation)
    let globalMin = +Infinity;
    let globalMax = -Infinity;

    for await (const { grid } of this.getAllFrames(totalFrames)) {
      for (const v of grid) {
        if (Number.isFinite(v)) {
          if (v < globalMin) globalMin = v;
          if (v > globalMax) globalMax = v;
        }
      }
    }

    return { globalMin, globalMax };
  }

  async clearSession() {
    // Cleanup after video generation
    const tx = this.db.transaction('frames', 'readwrite');
    const store = tx.objectStore('frames');
    const cursor = await store.openCursor();

    while (cursor) {
      if (cursor.value.sessionId === this.sessionId) {
        cursor.delete();
      }
      cursor.continue();
    }
  }
}
```

#### Memory Management Utilities

```javascript
function forceGCHint() {
  // Create and discard temporary arrays to trigger garbage collection
  if (typeof performance !== 'undefined' && performance.memory) {
    const temp = new Array(1000);
    temp.fill(null);
  }
}

// Called after:
// - Processing each 10k-cell chunk
// - Saving completed frames
// - Rendering every 10 video frames
```

### Performance Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Peak memory** | 35 MB | 5 MB | **-85%** ✅ |
| **50×50×50 grid** | ❌ Crash | ✅ Works | **Fixed** |
| **Computation time** | 30s | 32s | +6% slower ⚠️ |
| **Frames in RAM** | 50 grids | 1 grid | **-98%** |

**Scalability:**
- **Before:** 30×30×30 max (~27k sims)
- **After:** 75×75×75 tested (~421k sims), 100×100×100 theoretical

### Web Worker Speedup (2D Heatmap)

| Grid Size | Sequential | Parallel (4 workers) | Speedup |
|-----------|-----------|---------------------|---------|
| 10×10 (100 sims) | 2.1s | 0.8s | **2.6×** |
| 20×20 (400 sims) | 8.4s | 2.1s | **4.0×** |
| 50×50 (2500 sims) | 52s | 13s | **4.0×** |
| 100×100 (10k sims) | 210s | 52s | **4.0×** |

**Notes:**
- Speedup scales linearly with CPU cores (4× on quad-core)
- Overhead negligible for large grids
- Real-time progress reporting during computation

---

## Usage Examples

### Example 1: Basic Time-Series Simulation

**Scenario:** Visualize oscillations with default parameters

1. Open `/web/simulator/`
2. Default parameters (SI Table S5 PP1 optimized):
   - pol = 3.7 nM, rec = 32.5 nM, G = 150 nM
   - k₁ = 0.002, k₂ = 0.0031, kₙ = 0.021, kₚ = 0.0047
   - b = 4.8×10⁻⁵, Kₘ,ₚ = 34 nM
   - N₀ = P₀ = 10 nM, t_end = 2000 min, dt = 0.5 min
3. Observe:
   - **Time series:** Sustained oscillations with period ~300 min
   - **Phase portrait:** Stable limit cycle
   - **Status:** "calc+draw: 45 ms | series: 1 | points: 4001"

**Result:**
- Prey peaks: ~80 nM
- Predator peaks: ~60 nM
- Phase lag: ~60 min (predator lags prey)

### Example 2: Effect of Template Concentration

**Scenario:** Increase G from 150 nM to 250 nM

1. Adjust slider: `G = 250`
2. Observe changes:
   - **Period increases** (~300 min → ~450 min)
   - **Amplitude increases slightly**
   - **Phase portrait expands**

**Interpretation:** Higher template concentration → slower oscillations (richer environment sustains longer cycles)

### Example 3: Amino Acid Modification (ΔΔG_assoc)

**Scenario:** Simulate stabilizing modification (ΔΔG_assoc = -2 kcal/mol)

1. Set `r_assoc = exp(2 / (RT)) ≈ 28.4` (at 37°C)
   - This increases both k₁ and b by 28.4×
2. Observe:
   - **Period decreases** (~300 min → ~120 min)
   - **Amplitude increases**
   - **Faster prey growth** due to stronger G:N binding

**Interpretation:** Stabilizing modifications accelerate oscillations

### Example 4: 2D Heatmap — Period vs G and ΔΔG_assoc

**Scenario:** Explore period landscape

1. Open `/web/heatmap/`
2. Configure:
   - X-axis: `G`, min=80, max=250, steps=20
   - Y-axis: `assoc_ddg`, min=-5, max=5, steps=15
   - Metric: `period`
   - Tail: 60%
3. Click "実行" (Run)
4. Wait ~8 seconds (300 simulations, 4 workers)

**Result:**
- **Bottom-left (low G, stabilizing):** Short periods (~100 min), blue
- **Top-right (high G, destabilizing):** Long periods (~600 min), red
- **Diagonal stripe:** No oscillations (gray NaN)

### Example 5: 3D Video — Period vs G, ΔΔG_assoc, and rec

**Scenario:** Animate effect of varying exonuclease concentration

1. Open `/web/heatmap/`
2. Enable "T軸 (3次元)" checkbox
3. Configure:
   - X-axis: `G`, 80–250, 20 steps
   - Y-axis: `assoc_ddg`, -5 to +5, 15 steps
   - T-axis: `rec`, 10–50 nM, 10 steps
   - Video duration: 15 seconds
4. Click "実行"
5. Wait ~35 seconds (3000 simulations, streaming to IndexedDB)
6. Video auto-plays

**Result:**
- **Timeline shows rec = 10 nM → 50 nM**
- **Heatmap changes:** Higher rec → oscillations damped (more blue/gray)
- **Interpretation:** Exonuclease suppresses oscillations by increasing degradation

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| **WASM** | ✅ | ✅ | ✅ | ✅ |
| **Canvas** | ✅ | ✅ | ✅ | ✅ |
| **Web Workers** | ✅ | ✅ | ✅ | ✅ |
| **IndexedDB** | ✅ | ✅ | ✅ | ✅ |
| **MediaRecorder** | ✅ | ✅ | ⚠️ Limited | ✅ |
| **performance.memory** | ✅ | ❌ | ❌ | ❌ |

**Recommendations:**
- **Primary:** Chrome, Edge (best performance, full feature support)
- **Secondary:** Firefox (all features except performance monitoring)
- **Limited:** Safari (video export may have codec issues)

---

## Troubleshooting

### Simulator Issues

**Problem:** No oscillations visible
**Solution:**
- Check G > 50 nM (too low → extinction)
- Check rec < 60 nM (too high → damped)
- Reset to defaults with "Reset" button

**Problem:** Simulation too slow
**Solution:**
- Reduce t_end to 1000 min
- Increase dt to 1.0 min (less accurate but faster)
- Close other browser tabs

### Heatmap Issues

**Problem:** "Out of memory" error on large grids
**Solution:**
- Enable T-axis mode (uses IndexedDB streaming)
- Reduce grid size (50×50 max for 2D mode)
- Clear browser cache (DevTools → Application → IndexedDB → Delete)

**Problem:** Workers not starting
**Solution:**
- Check browser console for errors
- Ensure `heatmap-worker.js` is in same directory
- Try sequential mode (set `USE_PARALLEL = false` in code)

**Problem:** Video not playing
**Solution:**
- Check codec support: `MediaRecorder.isTypeSupported('video/webm;codecs=vp9')`
- Try Firefox or Chrome (better VP9 support)
- Switch to MP4 format (better compatibility)
- Reduce video duration or grid size

**Problem:** FFmpeg.wasm MP4 export fails with "SharedArrayBuffer is not defined"
**Solution:**
- This error should not occur with current implementation (v2)
- Verify `@ffmpeg/core-st@0.11.1` is being used (not `@ffmpeg/core`)
- Check browser console for detailed error logs
- Hard reload page to clear cache (Ctrl+Shift+R / Cmd+Shift+R)
- See `/web/heatmap/FFMPEG_README.md` for detailed troubleshooting

**Problem:** FFmpeg.wasm fails to load or times out
**Solution:**
- Check internet connection (CDN download required on first use)
- Try alternative CDN: Change `corePath` in `ffmpeg-video.js` line 70
  - Option A: unpkg (default) - `https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js`
  - Option B: jsDelivr - `https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js`
- For offline usage: Use local file version (see `FFMPEG_README.md`)

---

## API Reference

### Core Functions

#### `runSimulationPhysical(params)`

Executes a single simulation run.

**Parameters:**
```javascript
params = {
  pol: number,      // Polymerase [nM]
  rec: number,      // Exonuclease [nM]
  G: number,        // Template [nM]
  k1: number,       // Association rate
  k2: number,       // Predation rate
  kN: number,       // Prey degradation rate
  kP: number,       // Predator degradation rate
  b: number,        // Saturation parameter
  KmP: number,      // Michaelis constant [nM]
  N0: number,       // Initial prey [nM]
  P0: number,       // Initial predator [nM]
  t_end_min: number,// Simulation time [min]
  dt_min: number    // Time step [min]
}
```

**Returns:**
```javascript
{
  N: Float32Array,  // Prey time series [nM]
  P: Float32Array   // Predator time series [nM]
}
```

#### `runSimulationAndEvaluate(params, metric, tailPct)`

Executes simulation and computes metric (optimized for heatmaps).

**Parameters:**
- `params`: Same as above
- `metric`: `'period'` or `'amplitude'`
- `tailPct`: Percentage of series to analyze (e.g., 60 = last 60%)

**Returns:** `number` — Metric value or `NaN` if no oscillations

#### `drawHeatmap(grid, nx, ny, xMin, xMax, yMin, yMax, xLabel, yLabel, metric, variantInfo)`

Renders 2D heatmap to canvas.

**Parameters:**
- `grid`: `Float32Array` of size `nx × ny`
- `nx, ny`: Grid dimensions
- `xMin, xMax, yMin, yMax`: Axis ranges
- `xLabel, yLabel`: Axis labels (strings)
- `metric`: `'period'` or `'amplitude'`
- `variantInfo`: `{ label, type, mode }` for title

**Side effects:** Draws to global `ctx` canvas context

---

## Performance Tips

1. **Use parallel mode** for grids >20×20
2. **Enable T-axis mode** for large 3D grids (memory-efficient)
3. **Reduce tail%** to speed up metric evaluation (60% is usually sufficient)
4. **Increase dt** if speed is critical (0.5 min is accurate, 1.0 min is faster)
5. **Close DevTools** during large computations (overhead from logging)
6. **Use Chrome** for best performance (V8 JIT + WASM optimizations)

---

## Mathematical Background

### Nondimensionalization

The system can be nondimensionalized for theoretical analysis:

**Scaling:**
- Time: τ = t / t_c, where t_c = 1 / (k₂ · pol · Kₘ,ₚ)
- Concentration: n = N / Kₘ,ₚ, p = P / Kₘ,ₚ
- Template: g = G / G₀, where G₀ = k₂ · Kₘ,ₚ / k₁

**Dimensionless equations:**
$$
\frac{dn}{d\tau} = \frac{g \cdot n}{1 + \beta \cdot g \cdot n} - p \cdot n - \lambda \cdot \delta \frac{n}{1+p}
$$

$$
\frac{dp}{d\tau} = p \cdot n - \delta \frac{p}{1+p}
$$

**Parameters:**
- β = b · k₂ · Kₘ,ₚ² / k₁ (saturation strength)
- λ = kₙ / kₚ (degradation ratio)
- δ = rec · kₚ / (pol · k₂ · Kₘ,ₚ) (enzymatic balance)

**Bifurcation behavior:**
- Small g → Extinction
- Intermediate g → Stable coexistence (fixed point)
- Large g + low δ → Limit cycle (sustained oscillations)

See `/docs/reference/Supplementary_Information.md` for full derivation.

---

## File Structure

```
web/
├── simulator/
│   ├── simulator.html         # Interactive simulator page
│   ├── simulator.js           # Time-series & phase portrait logic
│   └── styles.css             # Styling
├── heatmap/
│   ├── index.html             # Heatmap page (UI)
│   ├── heatmap.js             # Main logic (2D/3D grid, video)
│   ├── heatmap-worker.js      # Web Worker for parallel execution
│   ├── frame-storage.js       # IndexedDB streaming layer
│   ├── ffmpeg-video.js        # FFmpeg.wasm integration (MP4 export, CDN)
│   ├── ffmpeg-video-local.js  # FFmpeg.wasm local file fallback
│   ├── package.json           # npm dependencies for local FFmpeg
│   ├── copy-ffmpeg-core.js    # Post-install script for local setup
│   ├── FFMPEG_README.md       # FFmpeg.wasm troubleshooting guide
│   ├── IMPLEMENTATION_SUMMARY.md  # Memory optimization details
│   └── TESTING_GUIDE.md       # Testing instructions
├── core.js                    # WASM interface
├── modifications.js           # Parameter variant system
└── pkg/                       # Generated WASM bundle
    ├── pp_osc_wasm.js
    └── pp_osc_wasm_bg.wasm
```

---

## Build Instructions

### Prerequisites
- Rust toolchain (rustc, cargo)
- wasm-pack (`cargo install wasm-pack`)
- Python 3 (for local server)

### Steps

1. **Build WASM module:**
   ```bash
   cd /home/apm/projects/simulation
   wasm-pack build --target web --release --out-dir web/pkg
   ```

2. **Start local server:**
   ```bash
   python3 -m http.server --directory web 8080
   ```

3. **Open in browser:**
   - Simulator: http://localhost:8080/simulator/
   - Heatmap: http://localhost:8080/heatmap/

### Deployment

For production (Netlify/GitHub Pages):
- Use `netlify-build.sh` or `.github/workflows/deploy-pages.yml`
- Ensure `.wasm` MIME type is configured (`application/wasm`)

---

## References

### Scientific Background
- **Paper:** DNA-based predator-prey oscillator system
- **Supplementary Information:** `/docs/reference/Supplementary_Information.md`
- **Kinetic model:** SI Section S3 (Equations 3–4)

### Technical Documentation
- **Specification:** `/docs/specification.md`
- **Memory optimization:** `/web/heatmap/IMPLEMENTATION_SUMMARY.md`
- **Testing guide:** `/web/heatmap/TESTING_GUIDE.md`
- **Handoff notes:** `/docs/HANDOFF.md`

### External Resources
- [Turbo colormap](https://gist.github.com/mikhailov-work/ee72ba4191942acecc03fe6da94fc73f) — Google AI perceptual colormap
- [MDN: IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [MDN: Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [MDN: MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [WebAssembly](https://webassembly.org/)

---

## Changelog

### 2025-10-11 (v2 - SharedArrayBuffer fix)
- **Fixed SharedArrayBuffer error** in FFmpeg.wasm MP4 export
  - Switched from `@ffmpeg/core@0.11.0` to `@ffmpeg/core-st@0.11.1` (single-threaded)
  - Added `mainName: 'main'` parameter to createFFmpeg configuration
  - Eliminated SharedArrayBuffer requirement (works with standard HTTP servers)
  - Added detailed error logging with setLogger
- **Added local file fallback** for FFmpeg.wasm
  - Created `ffmpeg-video-local.js` for npm-based installation
  - Added `package.json`, `copy-ffmpeg-core.js` for offline usage
  - Created `FFMPEG_README.md` with comprehensive troubleshooting guide
- **Testing:** Verified with 10-frame and 150-frame MP4 generation

### 2025-10-11 (v1 - Initial MP4 support)
- **Added MP4 video export** via FFmpeg.wasm (single-threaded @ffmpeg/core-st 0.11.1)
  - High-precision video generation with fixed frame rate (CFR)
  - H.264 codec for universal compatibility
  - User can select WebM (fast) or MP4 (precise) format
- **Added FPS validation system** for MP4 mode
  - Real-time validation with color-coded warnings
  - Automatic recommendations for optimal integer FPS
  - Prevents non-integer FPS and >60 FPS issues
- **File structure:** Added `/web/heatmap/ffmpeg-video.js` module

### 2025-10-10
- Initial consolidated documentation created
- Covers Interactive Simulator and 3D Heatmap only
- Excludes workbench, bifurcation, and simple flow features

---

**For questions or issues, see:**
- Documentation index: `/docs/README.md`
- Current status: `/docs/HANDOFF.md`
- Git history: Recent commits on `main` branch
